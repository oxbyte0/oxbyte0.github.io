import { debounce } from './utils.js';

export function initNav() {
  const toggle  = document.getElementById('navToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('navOverlay');
  if (!toggle || !sidebar || !overlay) return { isOpen: () => false };

  /* matchMedia matches CSS @media exactly — innerWidth misses scrollbar width */
  const mobileQuery = window.matchMedia('(max-width: 900px)');

  function openNav() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation');
    toggle.querySelector('use')?.setAttribute('href', '#icon-xmark');
  }

  function closeNav() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.querySelector('use')?.setAttribute('href', '#icon-list');
  }

  const isOpen = () => sidebar.classList.contains('open');

  toggle.addEventListener('click', () => isOpen() ? closeNav() : openNav());
  overlay.addEventListener('click', closeNav);

  /* Close on nav link click — only in mobile drawer mode */
  sidebar.addEventListener('click', e => {
    if (mobileQuery.matches && e.target.closest('a')) closeNav();
  });

  /* Close when viewport grows past breakpoint */
  window.addEventListener('resize', debounce(() => {
    if (!mobileQuery.matches && isOpen()) closeNav();
  }, 150));

  /* Platform shortcut labels — drop navigator.platform (deprecated) */
  const ua  = navigator.userAgentData?.platform ?? navigator.userAgent ?? '';
  const isMac = /mac|iphone|ipad/i.test(ua);
  document.querySelectorAll('.search-shortcut').forEach(kbd => {
    kbd.textContent = isMac ? '⌘K' : 'Ctrl+K';
  });

  /* Active page highlighting */
  const cur = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-pages a, details.nav-htb a').forEach(a => {
    try {
      if (new URL(a.href).pathname.replace(/\/$/, '') === cur) a.classList.add('active-page');
    } catch {}
  });

  return { isOpen, closeNav };
}
