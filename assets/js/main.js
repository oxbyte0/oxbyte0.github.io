import { initTheme }  from './lib/theme.js';
import { initA11y }   from './lib/a11y.js';
import { initNav }    from './lib/nav.js';
import { initDeviceAdaptation } from './features/device.js';
import {
  initProgress, initBackToTop, initShare, initGiscus, initGiscusLoader, initPrint,
  initPwa, initWebP, initBotDetect, initViewTransitions, initSpeculationRules,
  initSkeletons, initLazyImages
} from './features/misc.js';

const idle = window.requestIdleCallback
  ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
  : (fn) => setTimeout(fn, 0);

initDeviceAdaptation();
initTheme();
const navState = initNav();
initA11y();
initProgress();
initViewTransitions(navState);
initSkeletons();
idle(initBackToTop);

initLazyImages(Math.round(window.innerHeight * 0.8));

idle(() => {
  initShare();
  initPrint();
  initGiscus();
  initGiscusLoader();
  initPwa();
  initBotDetect();
  initSpeculationRules();
});

const searchToggle = document.getElementById('searchToggle');
if (searchToggle) {
  let searchLoaded = false;
  const loadSearch = () => {
    if (searchLoaded) return;
    searchLoaded = true;
    import('./features/search.js').then(m => m.initSearch(navState)).catch(() => {});
  };
  searchToggle.addEventListener('mouseenter', loadSearch, { once: true });
  searchToggle.addEventListener('touchstart',  loadSearch, { once: true, passive: true });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') loadSearch();
  }, { once: true });
}

if (document.querySelector('.post-body')) {
  import('./features/toc.js').then(m => m.initToc()).catch(() => {});
  idle(initWebP);
}
if (document.querySelector('pre.highlight')) {
  import('./features/code.js').then(m => m.initCode()).catch(() => {});
}
if (document.getElementById('htbList')) {
  import('./features/htb-filter.js').then(m => m.initHtbFilter()).catch(() => {});
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
