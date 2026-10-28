// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Target the live site by default (this is a static Jekyll/GH Pages site —
// there's no local server to boot). Override with QA_BASE_URL for a local
// `bundle exec jekyll serve` build.
const BASE_URL = process.env.QA_BASE_URL || 'https://oxbyte.blog';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['json', { outputFile: 'reports/playwright-results.json' }],
  ],
  outputDir: 'reports/playwright-artifacts',
  snapshotPathTemplate: '{testDir}/../screenshots/{testFilePath}/{projectName}/{arg}{ext}',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // System Google Chrome, not Playwright's bundled Chromium build —
      // avoids needing `playwright install-deps`, which ships Ubuntu/Debian
      // package names (libicu74, libjpeg-turbo8, ...) that don't resolve on
      // Kali's rolling repos. This project's actual GitHub Actions runners
      // are Ubuntu, where `install-deps` works natively; swap `channel` back
      // to the default there if you want Playwright's own Chromium build.
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
    {
      // Dark is the real default (color-scheme: dark at :root); this
      // project asserts the explicit light override via data-theme instead
      // of relying on a second OS-level color-scheme emulation axis.
      name: 'chromium-reduced-motion',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', reducedMotion: 'reduce' },
    },
  ],
});
