import { safeStorage } from './utils.js';

export function initTheme() {
  const html  = document.documentElement;
  const btn   = document.getElementById('themeToggle');
  if (!btn) return null;

  const icon  = btn.querySelector('.theme-icon');
  const label = btn.querySelector('.theme-label');
  const tc    = document.getElementById('themeColor');

  function sync() {
    const light = html.style.colorScheme === 'light';
    if (icon)  icon.textContent  = light ? '☽' : '☀';
    if (label) label.textContent = light ? 'dark mode' : 'light mode';
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    if (tc) tc.setAttribute('content', light ? '#f6f6f6' : '#060606');
  }

  sync();

  btn.addEventListener('click', () => {
    const light = html.style.colorScheme === 'light';
    html.style.colorScheme = light ? 'dark' : 'light';
    safeStorage('theme', light ? 'dark' : 'light');
    sync();
    /* Notify giscus of theme change */
    document.dispatchEvent(new CustomEvent('theme-changed', { detail: { light: !light } }));
  });

  return { isLight: () => html.style.colorScheme === 'light' };
}
