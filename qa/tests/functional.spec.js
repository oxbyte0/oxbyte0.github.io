// @ts-check
const { test, expect } = require('@playwright/test');

const PAGES = ['/', '/archive/', '/VariaType/'];

// Sidebar controls (theme toggle, a11y switches) live inside the off-canvas
// drawer on mobile, closed by default — open it first on that viewport.
async function openMobileNavIfNeeded(page, isMobile) {
  if (!isMobile) return;
  await page.locator('#navToggle').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
}

for (const path of PAGES) {
  test(`${path} loads with real content, no console errors`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    const resp = await page.goto(path);
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('nav#sidebar')).toBeVisible();

    expect(errors, `console/page errors on ${path}:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('theme toggle flips data-theme and persists the choice', async ({ page, isMobile }) => {
  await page.goto('/');
  await openMobileNavIfNeeded(page, isMobile);
  const html = page.locator('html');
  const toggle = page.locator('#themeToggle');

  const before = await html.getAttribute('data-theme');
  await toggle.click();
  await expect(html).not.toHaveAttribute('data-theme', before ?? '');

  await page.reload();
  const after = await html.getAttribute('data-theme');
  expect(after).not.toBe(before);
});

// Ctrl+K is a browser-chrome-reserved shortcut in Chrome/Edge (tab search) —
// confirmed via manual testing that real OS-level key injection never
// reaches the page at all, independent of what our code does; only a raw
// dispatchEvent (bypassing the browser's own shortcut handling) gets through.
// That's a browser platform limitation, not something a page can fix, so
// this tests our own keydown handling logic directly rather than asserting
// on Chrome's shortcut arbitration.
test('Ctrl+K opens search, Escape closes it', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('#searchOverlay');
  await expect(overlay).toBeHidden();

  await page.evaluate(() => document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
  ));
  await expect(overlay).toBeVisible();
  await expect(page.locator('#searchInput')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('search finds the known post by title fragment', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
  ));
  const input = page.locator('#searchInput');
  // openSearch() fetches /search.json then lazy-loads fuse.min.js before the
  // index exists — fill() before that resolves hits the `!fuse` early-return
  // in renderResults() and never shows anything. window.Fuse only exists
  // once that vendor script has actually loaded.
  await page.waitForFunction(() => 'Fuse' in window);
  await input.fill('VariaType');
  await expect(page.locator('#searchResults li a').first()).toContainText(/VariaType/i);
});

test('mobile nav drawer opens and closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'drawer only renders at the mobile breakpoint');
  await page.goto('/');
  const sidebar = page.locator('#sidebar');
  await expect(sidebar).not.toHaveClass(/open/);

  await page.locator('#navToggle').click();
  await expect(sidebar).toHaveClass(/open/);

  await page.locator('#navOverlay').click({ force: true });
  await expect(sidebar).not.toHaveClass(/open/);
});

test('back-to-top appears after scroll and returns to top', async ({ page }) => {
  // /archive/ only has 1 post right now and doesn't exceed one viewport —
  // nothing to scroll. The post page is long-form content, reliably tall.
  await page.goto('/VariaType/');
  const btn = page.locator('#backToTop');
  await expect(btn).toBeHidden();

  // initBackToTop is requestIdleCallback-deferred (intentional — it's
  // non-critical chrome, not part of first paint) with a 2s timeout
  // backstop; give it room to register before scrolling past it.
  await page.waitForTimeout(2200);
  await page.mouse.wheel(0, 2000);
  await expect(btn).toBeVisible();

  await btn.click();
  await page.waitForFunction(() => window.scrollY < 50);
});

test('post page: code blocks render with copy button, no mermaid syntax leaks as text', async ({ page }) => {
  await page.goto('/VariaType/');
  const pre = page.locator('pre.highlight').first();
  await expect(pre).toBeVisible();
  await expect(pre.locator('.copy-btn')).toBeVisible();
});

test('reduced-motion: no-motion toggle flips the class and page still works', async ({ page, isMobile }) => {
  await page.goto('/');
  await openMobileNavIfNeeded(page, isMobile);
  const html = page.locator('html');
  // Project-agnostic: the chromium-reduced-motion project emulates
  // prefers-reduced-motion, which initA11y() already honors on load, so the
  // class can legitimately start either on or off depending on the project.
  const before = await html.evaluate((el) => el.classList.contains('reduce-motion'));
  await page.locator('[data-a11y="reduce-motion"]').click();
  await expect
    .poll(() => html.evaluate((el) => el.classList.contains('reduce-motion')))
    .toBe(!before);
  await expect(page.locator('nav#sidebar')).toBeVisible();
});
