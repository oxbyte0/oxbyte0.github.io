export function initNav() {
  const toggle  = document.getElementById('navToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('navOverlay');
  if (!toggle || !sidebar || !overlay) return { isOpen: () => false, closeNav: () => {} };

  const mobileQuery = window.matchMedia('(max-width: 900px)');

  /* ── iOS Safari scroll-lock ──────────────────────────────────────────────
   * overflow:hidden on body doesn't stop scroll on iOS Safari.
   * position:fixed + top:-scrollY freezes the page correctly.
   */
  function lockScroll() {
    const y = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${y}px`;
    document.body.style.width    = '100%';
    document.body.style.overflow = 'hidden';
    document.body.dataset.scrollY = String(y);
  }

  function unlockScroll() {
    const y = parseFloat(document.body.dataset.scrollY || '0');
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.width    = '';
    document.body.style.overflow = '';
    delete document.body.dataset.scrollY;
    window.scrollTo(0, y);
  }

  function openNav() {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    lockScroll();
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close navigation');
    toggle.querySelector('use')?.setAttribute('href', '#icon-xmark');
  }

  function closeNav() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    unlockScroll();
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.querySelector('use')?.setAttribute('href', '#icon-list');
  }

  const isOpen = () => sidebar.classList.contains('open');

  toggle.addEventListener('click', () => isOpen() ? closeNav() : openNav());
  overlay.addEventListener('click', closeNav);

  sidebar.addEventListener('click', e => {
    if (mobileQuery.matches && e.target.closest('a')) closeNav();
  });

  mobileQuery.addEventListener('change', e => {
    if (!e.matches && isOpen()) closeNav();
  });

  /* Platform shortcut labels */
  const ua    = navigator.userAgentData?.platform ?? navigator.userAgent ?? '';
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
