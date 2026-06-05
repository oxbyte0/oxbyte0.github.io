import { initTheme }  from './lib/theme.js';
import { initA11y }   from './lib/a11y.js';
import { initNav }    from './lib/nav.js';
import { initDeviceAdaptation } from './features/device.js';
import {
  initProgress, initBackToTop, initShare, initGiscus,
  initPwa, initWebP, initBotDetect, initViewTransitions, initSpeculationRules,
  initSkeletons, initLazyImages
} from './features/misc.js';

const idle = window.requestIdleCallback
  ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
  : (fn) => setTimeout(fn, 0);

/* ── Critical path (sync) ── */
initDeviceAdaptation();  /* sets --dvh, --vw, data-pointer, data-network */
const theme    = initTheme();
const navState = initNav();
initA11y();
initProgress();
initViewTransitions(navState); /* pass navState so it can skip transition when nav open */
initSkeletons();
idle(initBackToTop);  /* JS always handles back-to-top — CSS scroll-driven caused permanent hide bug */

/* ── Dynamic rootMargin: 80% of viewport height ── */
initLazyImages(Math.round(window.innerHeight * 0.8));

/* ── Deferred (idle time) ── */
idle(() => {
  initShare();
  initGiscus();
  initPwa();
  initBotDetect();
  initSpeculationRules();
});

/* ── Lazy page-specific (dynamic import) ── */
if (document.getElementById('searchToggle')) {
  const toggle = document.getElementById('searchToggle');
  const loadSearch = () => {
    import('./features/search.js').then(m => m.initSearch(navState));
    toggle.removeEventListener('mouseenter', loadSearch);
    toggle.removeEventListener('touchstart',  loadSearch);
  };
  toggle.addEventListener('mouseenter', loadSearch, { once: true });
  toggle.addEventListener('touchstart',  loadSearch, { once: true, passive: true });
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

if (document.querySelector('.mermaid, .language-mermaid, pre.mermaid')) {
  const s = document.createElement('script');
  s.type = 'module';
  s.src  = '/assets/js/mermaid.js';
  document.head.appendChild(s);
}
