QA harness for oxbyte.blog — runs against the live production URL (`https://oxbyte.blog`), since this is a static Jekyll/GitHub Pages site with no server to boot locally. Override `QA_BASE_URL` in `playwright.config.js`'s consumers to point at a local `bundle exec jekyll serve` build instead.

## Setup

```
cd qa
npm install
npx playwright install ffmpeg   # video recording on failure; the browser itself uses system Chrome, see below
```

Browsers: Playwright is configured to launch **system Google Chrome** (`channel: 'chrome'`) rather than downloading its own Chromium/Firefox/WebKit builds. `playwright install-deps` ships Ubuntu/Debian package names (`libicu74`, `libjpeg-turbo8`, ...) that don't resolve on Kali's rolling repos — this project's actual CI runners are Ubuntu, where `install-deps` works natively, so switch the `channel` option back off there if you want Playwright's own browser builds for true cross-engine (Firefox/WebKit) coverage. Locally, Chromium-only via system Chrome is what actually runs.

## Running each tool

| Command | What it does |
|---|---|
| `npm test` | Playwright: functional + axe-core accessibility, 3 projects (desktop, mobile, reduced-motion) |
| `npm run test:ui` | Same, interactive UI mode |
| `npx playwright test tests/visual.spec.js` | Visual regression against the committed baselines in `screenshots/` |
| `npx playwright test tests/visual.spec.js --update-snapshots` | Re-baseline after an intentional visual change |
| `npm run pa11y` | Pa11y-CI, WCAG2AA, against `/`, `/archive/`, `/VariaType/`, `/about/` |
| `npm run lhci` | Lighthouse CI, desktop, 3 runs/page, median-asserted |
| `npx lhci autorun --config=lighthouserc.mobile.json` | Same, mobile throttling profile |
| `npm run headers` | `@trustyourwebsite/security-headers` against the live origin |
| `npm run sitespeed` | sitespeed.io via Docker (`sitespeedio/sitespeed.io:latest` — always current, no local Node deps) |
| `npm run qa:all` | lhci + playwright + pa11y + headers in sequence |

Reports land in `qa/reports/` (gitignored — regenerate, don't commit). Visual baselines in `qa/screenshots/` ARE committed; a failing visual diff writes `*-actual.png`/`*-diff.png` next to the baseline for review.

## Scope and known environment limits

- **Firefox/WebKit**: not run locally (see browser note above). `playwright.config.js` only defines Chromium projects for that reason — add Firefox/WebKit projects back once running in CI (Ubuntu) or once `install-deps`' package names are sorted out for this environment.
- **sitespeed.io**: requires Docker (already available here). First run pulls the image, which is large (~2GB with both browsers) — expect several minutes on a cold cache.
- **Security headers grade**: this site is on GitHub Pages, which does not support custom HTTP response headers at all — full stop, not a config option. `security-headers` will always show HSTS/COOP/CORP/COEP as missing and grade accordingly low; that's a hosting-platform ceiling, not a site defect. CSP and Referrer-Policy are real here, just delivered as `<meta>` tags (the only two CSP-adjacent mechanisms a browser honors that way) and so don't show up in a headers-only scan. Don't chase this grade on this host — it requires fronting through something like Cloudflare, which is a DNS/account decision outside what this harness (or an agent) should do unilaterally.
- **pa11y-ci's own dependency tree** pulls an older transitive Puppeteer with known advisories (`npm audit`). This is dev-tooling scoped to `qa/node_modules`, never shipped to production — it doesn't affect the live site's security posture. Not chasing `npm audit fix --force` on QA tooling; the breaking-change risk isn't worth it for an isolated dev dependency.
