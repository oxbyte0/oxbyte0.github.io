# oxbyte.blog

> HackTheBox machine writeups, CTF solutions, and offensive security research.

**Live:** [oxbyte.blog](https://oxbyte.blog)

---

## Stack

Jekyll · GitHub Pages · Rouge syntax highlighting · Vanilla JS · Custom SCSS

---

## Local development

```bash
# Prerequisites: Ruby, Bundler
gem install bundler

# Install dependencies
bundle install

# Run local server
make serve
# → http://localhost:4000
```

---

## Writing workflow

### New HTB machine (auto-fetches metadata)
```bash
make htb
# Wizard: enter machine name → fetches title, OS, difficulty, image from HTB API
```

### New post (manual)
```bash
make new
# Wizard: title, category, OS, difficulty, description
```

### Import existing writeup notes
```bash
make import FILE=~/path/to/writeup.md
# Copies file, adds frontmatter if missing, opens in Obsidian
```

### Import all unimported writeups
```bash
make batch-import
# Scans ~/work/ctf/htb for writeup.md files not yet in _posts/
```

### AI-assisted draft (Claude API)
```bash
make draft
# Enter notes → Claude generates full writeup body
# Requires ANTHROPIC_API_KEY in .env
```

---

## Post frontmatter

```yaml
---
title: MachineName
layout: post
released: YYYY-MM-DD
creators: AuthorName
pwned: true
tags:
  - boxes
  - os/linux          # os/linux · os/windows · os/freebsd
  - diff/medium       # diff/easy · diff/medium · diff/hard · diff/insane
  - type/machine      # type/machine · type/sherlock · type/challenge · type/prolab · type/fortress
category:
  - HTB               # HTB · Work
description: "One-line summary of the attack chain."
image: https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/avatars/HASH.png
---
```

---

## Deploy

```bash
make deploy
# Prompts for commit message → builds → pushes to GitHub
# GitHub Actions deploys to oxbyte.blog automatically
```

---

## Move to a new machine

```bash
# On new machine — clone
git clone git@github.com:oxbyte0/oxbyte0.github.io.git

# Copy SSH key
scp old-machine:~/.ssh/github_oxbyte0 ~/.ssh/
scp old-machine:~/.ssh/github_oxbyte0.pub ~/.ssh/
chmod 600 ~/.ssh/github_oxbyte0

# Add to ~/.ssh/config
echo "Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_oxbyte0
  IdentitiesOnly yes" >> ~/.ssh/config

# Install dependencies
bundle install
```

---

## Configuration

| File | Purpose |
|------|---------|
| `_config.yml` | Site title, URL, GoatCounter analytics ID, Giscus comments |
| `.env` | `ANTHROPIC_API_KEY` for AI drafting |
| `CNAME` | Custom domain (`oxbyte.blog`) |
| `_posts/` | All writeups — filename format `YYYY-MM-DD-Title.md` |
| `assets/img/img_MACHINENAME/` | Per-post screenshots |

### Analytics (GoatCounter)

Set `goatcounter: YOUR_CODE` in `_config.yml`.
Dashboard at `https://YOUR_CODE.goatcounter.com` (login required).

### Comments (Giscus)

1. Enable Discussions on the GitHub repo
2. Visit [giscus.app](https://giscus.app), paste repo details
3. Fill `giscus.repo`, `giscus.repo_id`, `giscus.category_id` in `_config.yml`

---

## Accessibility modes

Nav sidebar → bottom buttons:

| Button | Effect |
|--------|--------|
| `no motion` | Disables all animations (epilepsy / motion sensitivity) |
| `contrast` | High contrast black/white mode (low vision) |
| `focus` | Larger text + wider spacing (ADHD) |
| `dyslexia` | Atkinson Hyperlegible / Lexend font (dyslexia) |

Preferences persist across sessions via `localStorage`.

---

## CI / GitHub Actions

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy.yml` | Push to `main` | Build Jekyll + deploy to GitHub Pages |
| `validate.yml` | Push to `_posts/` | Validate post frontmatter |
| `lighthouse.yml` | After deploy | Lighthouse performance/a11y/SEO audit |
