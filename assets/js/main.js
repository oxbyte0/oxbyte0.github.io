/* Entry point — static imports for always-needed modules, dynamic for page-specific features */
import { initTheme }  from './lib/theme.js';
import { initA11y }   from './lib/a11y.js';
import { initNav }    from './lib/nav.js';
import {
  initProgress, initBackToTop, initShare, initGiscus,
  initPwa, initWebP, initBotDetect, initViewTransitions, initSpeculationRules,
  initSkeletons, initLazyImages
} from './features/misc.js';

/* ── Scheduling helper ──────────────────────────────────────────────────────
 * Critical: runs synchronously — must complete before first paint
 * Deferred: runs in idle time via requestIdleCallback (or setTimeout fallback)
 * Lazy:     dynamic import — only loads the module if needed on this page
 */
const idle = window.requestIdleCallback
  ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
  : (fn) => setTimeout(fn, 0);

/* ── Critical path (sync) ── */
const theme    = initTheme();
const navState = initNav();
initA11y();
initProgress();
initViewTransitions();  /* must register click handler early */
initSkeletons();        /* stop thumbnail shimmer as images load — must be early */
initLazyImages();       /* preload lazy images 600px before viewport */

/* ── Deferred (idle time, non-blocking) ── */
idle(() => {
  initBackToTop();
  initShare();
  initGiscus();
  initPwa();
  initBotDetect();
  initSpeculationRules();
});

/* ── Lazy page-specific features (dynamic import) ── */
if (document.getElementById('searchToggle')) {
  /* Search: import on first hover of toggle for fastest perceived load */
  const toggle = document.getElementById('searchToggle');
  const loadSearch = () => {
    import('./features/search.js').then(m => m.initSearch(navState));
    toggle.removeEventListener('mouseenter', loadSearch);
    toggle.removeEventListener('touchstart', loadSearch);
  };
  toggle.addEventListener('mouseenter', loadSearch, { once: true });
  toggle.addEventListener('touchstart',  loadSearch, { once: true, passive: true });
  /* Also load on keyboard shortcut */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') loadSearch();
  }, { once: true });
}
if (document.querySelector('.post-body')) {
  import('./features/toc.js').then(m => m.initToc());
  idle(initWebP);
}
if (document.querySelector('pre.highlight')) {
  import('./features/code.js').then(m => m.initCode());
}
if (document.getElementById('htbList')) {
  import('./features/htb-filter.js').then(m => m.initHtbFilter());
}

/* Service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

/* Lazy mermaid: only if page has diagrams */
if (document.querySelector('.mermaid, .language-mermaid, pre.mermaid')) {
  const s = document.createElement('script');
  s.type = 'module';
  s.src  = document.querySelector('meta[name="sw-version"]')?.content
    ? `/assets/js/mermaid.js?v=${document.querySelector('meta[name="sw-version"]').content}`
    : '/assets/js/mermaid.js';
  document.head.appendChild(s);
}
