# oxbyte.blog

HackTheBox writeups, CTF solutions, and offensive security research.
Live at **[oxbyte.blog](https://oxbyte.blog)**

---

## Quick start

```bash
gem install bundler
bundle install
make serve        # → http://localhost:4000
```

---

## Writing a new post

| What | Command |
|------|---------|
| New HTB machine (auto-fetches metadata) | `make htb` |
| New post (manual) | `make new` |
| Import existing notes | `make import FILE=path/to/notes.md` |
| AI-assisted draft (needs `ANTHROPIC_API_KEY` in `.env`) | `make draft` |

### Post frontmatter

```yaml
---
title: MachineName
layout: post
released: YYYY-MM-DD
creators: AuthorName
pwned: true
tags:
  - boxes
  - os/linux        # os/linux · os/windows · os/freebsd
  - diff/medium     # diff/easy · diff/medium · diff/hard · diff/insane
  - type/machine    # type/machine · type/sherlock · type/challenge · type/prolab · type/fortress
category:
  - HTB             # HTB · Work
description: "One sentence on the attack chain."
image: https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/avatars/HASH.png
---
```

---

## Deploy

```bash
make deploy
# Enter a commit message → builds → pushes → GitHub Actions takes it from there
```

---

## Configuration

| File | What it does |
|------|--------------|
| `_config.yml` | Site title, URL, GoatCounter analytics code, Giscus comment IDs |
| `.env` | `ANTHROPIC_API_KEY` for `make draft` — never committed |
| `CNAME` | Custom domain (`oxbyte.blog`) |
| `_posts/` | All writeups — filename format `YYYY-MM-DD-Title.md` |
| `assets/img/img_MACHINENAME/` | Screenshots for a specific post |

**Analytics** — set `goatcounter: YOUR_CODE` in `_config.yml`.

**Comments (Giscus)** — enable Discussions on this repo, go to [giscus.app](https://giscus.app), paste the repo details, then fill `giscus.repo`, `giscus.repo_id`, `giscus.category_id` in `_config.yml`.

---

## Stack

Jekyll · GitHub Pages · Rouge · Vanilla JS · Custom SCSS
