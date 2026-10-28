import { initTheme }  from './lib/theme.js';
import { initA11y }   from './lib/a11y.js';
import { initNav }    from './lib/nav.js';
import { initDeviceAdaptation } from './features/device.js';
import { initBgfx } from './features/bgfx.js';
import {
  initProgress, initBackToTop, initShare, initPrint,
  initPwa, initWebP, initBotDetect, initSpeculationRules,
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
initSkeletons();
idle(initBackToTop);

initLazyImages(Math.round(window.innerHeight * 0.8));

idle(() => {
  initShare();
  initPrint();
  initPwa();
  initBotDetect();
  initSpeculationRules();
  initBgfx();
});

const searchToggle = document.getElementById('searchToggle');
if (searchToggle) {
  let searchApi = null;
  const loadSearch = () => {
    if (searchApi) return Promise.resolve(searchApi);
    return import('./features/search.js')
      .then(m => (searchApi = m.initSearch(navState)))
      .catch(() => null);
  };
  searchToggle.addEventListener('mouseenter', loadSearch, { once: true });
  searchToggle.addEventListener('touchstart',  loadSearch, { once: true, passive: true });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
    // First Ctrl+K lazy-loads search.js, which registers its own keydown
    // listener for every press after this one — but that registration
    // happens asynchronously, after this exact keypress has already
    // finished propagating, so without an explicit .open() call here the
    // very first press loads the module silently and shows nothing; the
    // user has to press Ctrl+K a second time before anything visibly opens.
    e.preventDefault();
    loadSearch().then(api => api?.open());
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
