import { safeStorage } from './utils.js';

export function initA11y() {
  const html  = document.documentElement;
  const modes = ['reduce-motion', 'high-contrast', 'focus-mode', 'dyslexia-mode'];

  function save() {
    safeStorage('a11y', modes.filter(m => html.classList.contains(m)).join(' '));
  }

  if (safeStorage('a11y') === null) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      html.classList.add('reduce-motion');
    if (window.matchMedia('(prefers-contrast: more)').matches)
      html.classList.add('high-contrast');
  }

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
    if (safeStorage('a11y') !== null) return;
    html.classList.toggle('reduce-motion', e.matches);
  });
  window.matchMedia('(prefers-contrast: more)').addEventListener('change', e => {
    if (safeStorage('a11y') !== null) return;
    html.classList.toggle('high-contrast', e.matches);
  });

  document.querySelectorAll('[data-a11y]').forEach(btn => {
    const mode   = btn.dataset.a11y;
    const active = html.classList.contains(mode);
    if (active) btn.classList.add('active');
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('role', 'switch');

    btn.addEventListener('click', () => {
      html.classList.toggle(mode);
      const on = html.classList.contains(mode);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      save();
    });
  });
}
