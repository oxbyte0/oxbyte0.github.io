// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const PAGES = ['/', '/archive/', '/VariaType/'];

// Fails only on serious/critical violations per the brief — moderate/minor
// still get reported (not swallowed) but don't break the build.
const FAIL_ON = ['critical', 'serious'];

for (const path of PAGES) {
  test(`axe: ${path} (dark, default theme)`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => FAIL_ON.includes(v.impact));
    expect(blocking, summarize(blocking)).toEqual([]);
  });

  test(`axe: ${path} (light theme)`, async ({ page }) => {
    await page.goto(path);
    await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });
    await page.waitForTimeout(50);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => FAIL_ON.includes(v.impact));
    expect(blocking, summarize(blocking)).toEqual([]);
  });
}

test('axe: high-contrast mode', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.locator('#navToggle').click(); // a11y controls are in the off-canvas drawer
  await page.locator('[data-a11y="high-contrast"]').click();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => FAIL_ON.includes(v.impact));
  expect(blocking, summarize(blocking)).toEqual([]);
});

test('skip link is the first focusable element and targets #main-content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const el = page.locator(':focus');
  await expect(el).toHaveClass(/skip-link/);
  await expect(el).toHaveAttribute('href', '#main-content');
});

test('background effects are hidden from the accessibility tree', async ({ page }) => {
  await page.goto('/');
  const bgfx = page.locator('#bgfx');
  await expect(bgfx).toHaveAttribute('aria-hidden', 'true');
});

function summarize(violations) {
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.helpUrl}`)
    .join('\n');
}
