# oxbyte.blog

HackTheBox writeups, CTF solutions, and offensive security research.
Live at **[oxbyte.blog](https://oxbyte.blog)**

---

## Overview

Static blog built with Jekyll and hosted on GitHub Pages. The pipeline auto-fetches HTB machine metadata, converts images to WebP/AVIF, purges unused CSS, subsets and self-hosts fonts, then deploys through a 5-stage CI pipeline. No CDN dependencies at runtime except Giscus (comments) and GoatCounter (analytics) — both optional.

---

## Features

| Feature | Detail |
|---|---|
| HTB metadata fetch | `make htb` queries the HTB API for title, OS, difficulty, creator, release date, avatar image |
| AI draft | `make draft` sends notes + 3 style examples to Claude and streams a full writeup body |
| Client-side search | Fuse.js fuzzy search (SRI-pinned, loaded on demand). Keyboard shortcut `Ctrl+K` / `⌘K` |
| Table of contents | Auto-generated from post headings, scroll-driven active highlight |
| Mermaid diagrams | Rendered client-side via ES module lazy import |
| Syntax highlighting | Rouge server-side, collapsible code blocks with one-click copy |
| Service worker | Stale-while-revalidate for assets; network-first for HTML/JSON; offline fallback page |
| View Transitions | Page navigation animated via View Transitions API with graceful fallback |
| Image pipeline | CI converts PNG/JPG → WebP + AVIF, compresses originals, serves `<picture>` with fallback |
| Font pipeline | CI downloads Google Fonts, subsets to latin, self-hosts with MD5-named files. `make fonts` mirrors this locally |
| PurgeCSS | CI strips unused CSS selectors from the built `style.css` |
| Giscus comments | GitHub Discussions-based comments, lazy-loaded when post scrolls into view |
| GoatCounter analytics | Privacy-respecting, cookie-free. Disabled when not configured |
| Print / PDF export | Post layout has a hidden print header/footer; "export pdf" button triggers `window.print()` |
| Accessibility | Reduce-motion, high-contrast toggles; WCAG touch targets on mobile; `aria-*` throughout |
| Light/dark theme | System preference detected at paint time (before CSS loads) to prevent flash |

---

## Architecture

```
Jekyll (Ruby 3.3)
├── _layouts/
│   ├── compress.html   — Liquid HTML minifier (layout wrapper)
│   ├── template.html   — Shell: nav, search overlay, SVG sprite, progress bar
│   ├── default.html    — Used by non-post pages (index, archive)
│   └── post.html       — Post body: meta, tags, share buttons, related posts, comments
├── _includes/
│   ├── head-custom.html          — Security headers, preloads, preconnects, analytics
│   ├── seo-extra.html            — OG tags, JSON-LD BreadcrumbList + BlogPosting / WebSite
│   └── head-custom-google-analytics.html
├── _sass/                        — SCSS @layer architecture (no class name leakage)
│   ├── _tokens.scss              — CSS custom properties (colors, spacing, radii, transitions)
│   ├── _base.scss                — Reset, typography, scrollbar, selection
│   ├── _layout.scss              — Wrapper, main, cards, archive, post body
│   ├── _nav.scss                 — Sidebar, TOC, HTB filter buttons
│   ├── _code.scss                — Highlight.js / Rouge, copy button, collapse, Mermaid
│   ├── _components.scss          — Badges, share buttons, search overlay, back-to-top, etc.
│   ├── _animations.scss          — @keyframes, scroll-driven animations, View Transitions
│   ├── _skeleton.scss            — Card entry shine, @starting-style for section headings
│   ├── _search.scss              — Search overlay layout
│   ├── _a11y.scss                — reduce-motion, high-contrast overrides
│   └── _print.scss               — Print styles, PDF export
└── assets/js/                    — ES modules, no bundler
    ├── main.js                   — Entry point: orchestrates all feature modules
    ├── mermaid.js                — Mermaid lazy loader
    ├── lib/
    │   ├── theme.js              — Theme init / toggle / persistence
    │   ├── nav.js                — Sidebar open/close, iOS scroll-lock, active page highlight
    │   ├── a11y.js               — Accessibility toggles (reduce-motion, high-contrast)
    │   └── utils.js              — escHtml, debounce
    └── features/
        ├── search.js             — Fuse.js search, keyboard nav, highlight matches
        ├── toc.js                — TOC build + IntersectionObserver active tracking
        ├── code.js               — Copy button, collapsible blocks
        ├── htb-filter.js         — HTB sidebar sort / type / difficulty filter
        ├── misc.js               — Back-to-top, reading progress bar, share button, Mermaid trigger
        └── device.js             — Install prompt (PWA)
```

---

## Prerequisites

```
Ruby 3.3.x     → rbenv or rvm
Bundler        → gem install bundler
Node (optional)→ only needed if you patch npm tools manually
cwebp          → sudo apt install webp          (local image conversion)
ImageMagick    → sudo apt install imagemagick   (AVIF fallback)
Python 3.8+    → scripts/ai_draft.py, scripts/validate_posts.py
anthropic      → pip3 install anthropic         (only for make draft)
dialog         → sudo apt install dialog        (TUI menus in scripts/blog)
```

Check Ruby version matches `.ruby-version`:

```bash
ruby -v           # must be 3.3.x
cat .ruby-version # 3.3.8
```

---

## Quick start

```bash
git clone https://github.com/oxbyte0/oxbyte.github.io
cd oxbyte.github.io
gem install bundler
bundle install
make serve        # converts images → downloads fonts → jekyll serve --livereload
# → http://localhost:4000
```

---

## Make commands

| Command | What it does |
|---|---|
| `make menu` | Interactive TUI menu (wraps all commands below) |
| `make serve` | Convert images to WebP, download fonts, start Jekyll with livereload |
| `make htb` | Fetch HTB machine metadata via API, create draft post, open in `$EDITOR` |
| `make new` | Create a blank post with frontmatter prompts |
| `make draft` | AI-assisted writeup via Claude API (requires `ANTHROPIC_API_KEY` in `.env`) |
| `make write` | Open an existing post for editing |
| `make list` | List all posts |
| `make import FILE=path` | Import a markdown file as a new post |
| `make batch-import` | Bulk import from a directory |
| `make convert` | Convert PNG/JPG in `assets/img/` to WebP using `cwebp` or ImageMagick |
| `make fonts` | Download and self-host Google Fonts to `assets/fonts/` |
| `make open` | Open the live site in a browser |
| `make deploy` | Interactive commit message prompt → `git add -A` (excl `.env`) → commit → push |
| `make deploy MSG="message"` | Non-interactive deploy with a fixed commit message |
| `make setup` | Run `scripts/setup.sh` — installs hooks and checks deps |

---

## Writing posts

### HTB machine (recommended)

```bash
make htb
# prompts: machine ID or name → fetches title, OS, diff, creators, release date, image
# creates: _posts/YYYY-MM-DD-MachineName.md with full frontmatter pre-filled
# opens:   $EDITOR
```

### AI-assisted draft

```bash
# 1. Set API key
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 2. Run
make draft
# prompts: title, OS, difficulty, release date, description
# opens:   $EDITOR — write bullet-point notes, save, quit
# Claude streams a full writeup body to _drafts/, then opens it for review
```

The model is `claude-sonnet-4-6` by default. Override:

```bash
CLAUDE_MODEL=claude-opus-5 make draft
```

### Manual post

```bash
make new
```

---

## Post frontmatter reference

```yaml
---
title: MachineName                     # required
layout: post                           # required; always "post"
released: 2025-01-15                   # HTB retirement date (YYYY-MM-DD)
creators: AuthorHandle                 # HTB machine creator
pwned: true                            # shows ✓ badge in sidebar
tags:
  - boxes                              # required for HTB posts
  - os/linux                           # os/linux · os/windows · os/freebsd · os/other
  - diff/medium                        # diff/easy · diff/medium · diff/hard · diff/insane
  - type/machine                       # type/machine · type/sherlock · type/challenge
                                       # type/prolab · type/miniprolab · type/fortress
category:
  - HTB                                # HTB · Work
description: "One sentence attack chain summary."   # required; shown in OG/SEO
image: https://htb-mp-prod-public-storage.s3.eu-central-1.amazonaws.com/avatars/HASH.png
cssclasses:
  - custom_htb                         # injects HTB-specific CSS (optional)
---

![HTB](/assets/img/img_machinename/machinename.png)

<!-- Post body starts here -->
```

### Tag reference

```
os/linux · os/windows · os/freebsd · os/other
diff/easy · diff/medium · diff/hard · diff/insane
type/machine · type/sherlock · type/challenge · type/prolab · type/miniprolab · type/fortress
```

Tags drive the HTB sidebar filter (sort, type tab, difficulty button) and the `og:article:tag` meta output.

---

## Images

Store screenshots under `assets/img/img_MACHINENAME/`. Name convention: `MACHINENAME-TIMESTAMP.png` where TIMESTAMP is a 13-digit Unix ms timestamp (use as placeholder in AI drafts — you replace them with real screenshots later).

```markdown
![Description](/assets/img/img_machinename/machinename-1234567890123.png)
```

CI converts all PNG/JPG to WebP and AVIF, then wraps them in `<picture>` elements at build time. Run `make convert` locally to preview.

---

## Project structure

```
.
├── _config.yml              — site config (see Configuration section)
├── _drafts/                 — unpublished posts (not deployed)
├── _posts/                  — published posts (YYYY-MM-DD-Title.md)
├── _layouts/                — Liquid page templates
├── _includes/               — Liquid partials
├── _sass/                   — SCSS source files
├── assets/
│   ├── css/style.css        — compiled by Jekyll (import entrypoint)
│   ├── fonts/               — self-hosted woff2 files + fonts.css (gitignored)
│   ├── img/                 — post screenshots, organized per machine
│   └── js/                  — ES modules
├── scripts/
│   ├── blog                 — main bash CLI (all make targets call this)
│   ├── ai_draft.py          — Claude API draft generator
│   ├── validate_posts.py    — frontmatter linter (run by CI + pre-commit hook)
│   ├── pre-commit.hook      — installs as .git/hooks/pre-commit via make setup
│   └── setup.sh             — dev environment bootstrap
├── .github/workflows/
│   ├── deploy.yml           — main 5-stage CI/CD pipeline (see CI section)
│   ├── staging.yml          — PR preview builds
│   ├── validate.yml         — post frontmatter validation on PR
│   ├── audit.yml            — security/config audit
│   └── lighthouse.yml       — Lighthouse performance checks
├── sw.js                    — Service Worker (stale-while-revalidate)
├── manifest.json            — PWA manifest
├── offline.html             — offline fallback page
├── search.json              — Liquid-generated search index
├── feed.xml                 — RSS feed
├── Gemfile                  — Ruby deps (jekyll, jekyll-seo-tag, rouge)
├── Makefile                 — developer shortcuts
├── .env                     — local secrets (never committed)
└── CNAME                    — custom domain: oxbyte.blog
```

---

## Configuration

### `_config.yml` — full key reference

```yaml
# ── Core ──────────────────────────────────────────────────────────────────
title: oxbyte
description: "..."
url: "https://oxbyte.blog"
lang: en-US
timezone: UTC

# ── Analytics / comments ──────────────────────────────────────────────────
# Injected by CI (deploy.yml) — leave blank here; set in repo secrets
google_analytics:          # GA4 measurement ID (G-XXXXXXX)
goatcounter:               # GoatCounter subdomain (e.g. oxbyte → oxbyte.goatcounter.com)

author: "oxbyte"
social:
  name: oxbyte
  links:
    - https://github.com/oxbyte0

permalink: "/:title/"

# ── Plugins ───────────────────────────────────────────────────────────────
plugins:
  - jekyll-seo-tag
  - jekyll-feed
  - jekyll-sitemap

# ── Giscus comments ───────────────────────────────────────────────────────
# Enable GitHub Discussions on this repo, then go to https://giscus.app
# and fill in the values it gives you.
giscus:
  repo: "oxbyte0/oxbyte.github.io"
  repo_id: "..."          # from giscus.app
  category: "Announcements"
  category_id: "..."      # from giscus.app
  mapping: pathname
  strict: "1"
  reactions: "1"
  emit_metadata: "0"
  input_position: top
  theme: noborder_dark

# ── Jekyll build ──────────────────────────────────────────────────────────
markdown: kramdown
kramdown:
  input: GFM
  syntax_highlighter: rouge
  syntax_highlighter_opts:
    css_class: highlight
    block:
      line_numbers: true

sass:
  sass_dir: _sass
  style: compressed

exclude:
  - Gemfile
  - Gemfile.lock
  - Makefile
  - scripts/
  - .env
  - vendor/
```

### `.env` — local secrets (never commit)

```bash
ANTHROPIC_API_KEY=sk-ant-...   # required for make draft
CLAUDE_MODEL=claude-sonnet-4-6 # optional; overrides model used by ai_draft.py
```

---

## CI/CD pipeline (`deploy.yml`)

Triggered on push to `main`. 5 stages run in order:

```
Stage 1 (parallel): lint-frontmatter · check-links · lint-config · lint-fingerprint
         ↓
Stage 2: build  (timeout: 20m)
         - cache: fonts, converted images, npm tools
         - font download + subsetting (latin only)
         - image compression (oxipng) + WebP + AVIF conversion
         - Jekyll build
         - HTML validation (html-proofer)
         - PurgeCSS (strips unused selectors)
         - Terser (minifies JS)
         ↓
Stage 3: smoke-test
         - curl checks: homepage, /archive/, /search.json, /feed.xml, /sitemap.xml
         ↓
Stage 4: deploy
         - GitHub Pages deployment via actions/deploy-pages
         ↓
Stage 5: verify
         - curl live URLs, check HTTP 200
```

Other workflows:
- `staging.yml` — builds PRs to a staging URL for review
- `validate.yml` — runs `scripts/validate_posts.py` on every PR that touches `_posts/`
- `audit.yml` — config/security audit (checks for CDN references, missing security headers, etc.)
- `lighthouse.yml` — Lighthouse CI scores for performance, accessibility, SEO

---

## Deployment

```bash
make deploy
# prompts for commit message
# runs: git add -A -- ':!.env' ':!.env.*' ':!*.key'
# then: git commit → git push origin main
# GitHub Actions takes it from there (build → smoke-test → deploy → verify)
```

Non-interactive:

```bash
make deploy MSG="post: added Keeper writeup"
```

CI secrets required in repo settings (`Settings → Secrets and variables → Actions`):

| Secret | Purpose |
|---|---|
| `GOOGLE_ANALYTICS_ID` | Injected into `_config.yml` at build time |
| `GOATCOUNTER_CODE` | Injected into `_config.yml` at build time |
| `GISCUS_REPO_ID` | Injected into `_config.yml` at build time |
| `GISCUS_CATEGORY_ID` | Injected into `_config.yml` at build time |

---

## SCSS layer order

Styles use CSS `@layer` to enforce cascade order and prevent specificity wars:

```
tokens → base → layout → nav → code → components → animations → skeleton → a11y → print
```

Each file maps to one layer. Adding a rule to the wrong layer (e.g., `display:block` on a nav link inside `@layer animations`) will have no effect if the same property is set in a higher-priority layer — intentional.

---

## JS module map

All modules are ES modules loaded dynamically from `main.js`. Nothing is bundled.

```
main.js
├── lib/theme.js          — loaded synchronously at top (sets data-theme before paint)
├── lib/nav.js            — sidebar, scroll-lock, active page
├── lib/a11y.js           — accessibility toggles
├── features/misc.js      — back-to-top, reading progress, share, mermaid trigger
├── features/device.js    — PWA install prompt
├── features/toc.js       — table of contents (lazy: only on post pages)
├── features/code.js      — copy button, collapse (lazy: only on post pages)
├── features/htb-filter.js— HTB sidebar filter (lazy: only when sidebar has HTB list)
└── features/search.js    — Fuse.js search (lazy: on hover or Ctrl+K)
    └── cdn: fuse.min.js  — loaded on demand (SRI-pinned, crossorigin)
```

---

## Pre-commit hook

```bash
make setup    # installs scripts/pre-commit.hook → .git/hooks/pre-commit
```

The hook runs `scripts/validate_posts.py` before every commit and blocks if any post has missing required frontmatter fields or malformed filenames.

---

## Stack

| Layer | Tech |
|---|---|
| Generator | Jekyll 4.x |
| Hosting | GitHub Pages |
| Ruby | 3.3.8 |
| Syntax highlighting | Rouge (server-side) |
| Search | Fuse.js 7.x (client-side, SRI-pinned) |
| Comments | Giscus (GitHub Discussions) |
| Analytics | GoatCounter |
| CSS architecture | SCSS + CSS @layer |
| JS | Vanilla ES modules (no bundler) |
| Fonts | Self-hosted (Martian Mono, Onest) — no Google Fonts CDN at runtime |
| Image formats | WebP + AVIF (CI-generated) |
| Service worker | Stale-while-revalidate (assets) + network-first (HTML/JSON) |
| Diagrams | Mermaid.js (lazy-loaded ES module) |
| AI drafts | Claude API (claude-sonnet-4-6) |
