// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = [
  ['home', '/'],
  ['archive', '/archive/'],
  ['post', '/VariaType/'],
];

// animations: 'disabled' freezes the bgfx drift keyframe (and everything
// else) before the screenshot so the capture is deterministic — otherwise
// a time-based CSS animation would diff against itself run to run.
const SHOT_OPTS = { fullPage: true, maxDiffPixelRatio: 0.02, animations: 'disabled' };

for (const [name, path] of PAGES) {
  test(`visual: ${name} (dark)`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(`${name}-dark.png`, SHOT_OPTS);
  });

  test(`visual: ${name} (light)`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot(`${name}-light.png`, SHOT_OPTS);
  });
}
