import { debounce } from '../lib/utils.js';

/* ── Lazy image preloader — starts fetching 600px before viewport ──────────
 * Native loading="lazy" fires too late (image enters viewport → visible gap).
 * This observer triggers a hidden Image() preload 600px before the real img
 * enters view, so by the time it's visible the data is already cached.
 */
export function initLazyImages(preloadPx = 600) {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      /* Use getAttribute not .src — .src always returns a resolved URL even on src-less elements */
      const src = img.getAttribute('src') || img.dataset.src;
      if (!src || src.startsWith('data:')) { observer.unobserve(img); return; }
      const pre = new Image();
      pre.src = src;
      pre.decode().catch(() => {});
      observer.unobserve(img);
    });
  }, { rootMargin: `${preloadPx}px 0px`, threshold: 0 });

  document.querySelectorAll('img[loading="lazy"]').forEach(img => observer.observe(img));
}

/* ── Skeleton: stop thumbnail shimmer when image loads ── */
export function initSkeletons() {
  document.querySelectorAll('.post-card-thumb').forEach(thumb => {
    const img = thumb.querySelector('img');
    if (!img) { thumb.classList.add('loaded'); return; }

    function done() {
      img.setAttribute('data-loaded', ''); /* CSS :has(img[data-loaded]) selector */
      thumb.classList.add('loaded');       /* JS class-based selector */
    }

    /* Already cached / synchronously loaded */
    if (img.complete && img.naturalWidth > 0) {
      done();
      return;
    }

    /* Lazy-loaded: fire when img finishes (or errors) */
    img.addEventListener('load',  done, { once: true, passive: true });
    img.addEventListener('error', done, { once: true, passive: true });
  });
}

/* ── Reading progress bar ── */
export function initProgress() {
  if (CSS.supports('animation-timeline', 'scroll()')) return; // CSS handles it natively
  const bar = document.getElementById('progress');
  if (!bar) return;
  let raf = 0;
  function update() {
    raf = 0;
    const d = document.documentElement;
    const t = d.scrollHeight - d.clientHeight;
    bar.style.width = t > 0 ? (((d.scrollTop || document.body.scrollTop) / t) * 100) + '%' : '0%';
  }
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

/* ── Back-to-top ── */
export function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  let raf = 0;
  window.addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(() => {
      btn.hidden = (document.documentElement.scrollTop || document.body.scrollTop) < 300;
      raf = 0;
    });
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ── Share buttons ── */
export function initShare() {
  document.querySelectorAll('[data-share="copy"]').forEach(btn => {
    const sp = btn.querySelector('span');
    btn.addEventListener('click', () => {
      const url = btn.dataset.url || location.href;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          if (sp) { sp.textContent = 'copied!'; setTimeout(() => { sp.textContent = 'copy link'; }, 2000); }
        }).catch(() => {});
      }
    });
  });
}

/* ── Print button ── */
export function initPrint() {
  document.getElementById('print-btn')?.addEventListener('click', () => window.print());
}

/* ── Giscus theme sync ── */
export function initGiscus() {
  document.addEventListener('theme-changed', e => {
    const frame = document.querySelector('iframe.giscus-frame');
    if (!frame) return;
    const theme = e.detail.light
      ? `${window.location.origin}/assets/css/giscus-light.css`
      : `${window.location.origin}/assets/css/giscus.css`;
    frame.contentWindow.postMessage({ giscus: { setConfig: { theme } } }, 'https://giscus.app');
  });
}

/* ── PWA install prompt ── */
export function initPwa() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    const nb = document.querySelector('.nav-bottom');
    if (!nb) return;
    const btn = document.createElement('button');
    btn.className = 'install-btn';
    btn.textContent = '⊕ install app';
    btn.addEventListener('click', () => {
      if (!deferred) return;
      const d = deferred; deferred = null;
      d.prompt();
      d.userChoice.then(r => { if (r.outcome === 'accepted') btn.remove(); });
    });
    nb.appendChild(btn);
  });
}

/* ── WebP progressive enhancement ── */
export function initWebP() {
  document.querySelectorAll('.post-body img[src]').forEach(img => {
    const src = img.getAttribute('src');
    if (!src || !/\/assets\/img\/.+\.(png|jpe?g)$/i.test(src)) return;
    if (img.parentNode?.nodeName === 'PICTURE') return;
    const webp = src.replace(/\.(png|jpe?g)$/i, '.webp');
    const pic  = document.createElement('picture');
    const src2 = document.createElement('source');
    src2.srcset = webp; src2.type = 'image/webp';
    img.parentNode.insertBefore(pic, img);
    pic.appendChild(src2); pic.appendChild(img);
  });
}

/* ── Bot signal collector ── */
export function initBotDetect() {
  let s = 0;
  if (navigator.webdriver) s++;
  if (/Chrome\//.test(navigator.userAgent) && !window.chrome) s++;
  if (/Chrome\//.test(navigator.userAgent) && navigator.plugins?.length === 0) s++;
  if (!navigator.languages?.length) s++;
  if (typeof Notification === 'undefined') s++;
  if (s >= 3 && window._goatcounter) {
    window._goatcounter.count({ path: '/bot-signal', event: true });
  }
}

/* ── View Transitions ── */
export function initViewTransitions(navState) {
  if (!document.startViewTransition) return;
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    let href;
    try { href = new URL(a.href, location); } catch { return; }
    if (href.origin !== location.origin) return;
    if (href.hash && href.pathname === location.pathname) return;

    /* Bug fix: skip view transition if nav is open — nav has CSS close transition
       that would race with the view transition capture, causing visual artifacts */
    if (navState?.isOpen?.()) {
      navState.closeNav();
      /* Let nav close animation finish (t-slow ≈ 280ms) before navigating */
      e.preventDefault();
      const raw   = getComputedStyle(document.documentElement).getPropertyValue('--t-slow').trim();
    const tSlow = raw.endsWith('ms') ? parseFloat(raw)
                : raw.endsWith('s')  ? parseFloat(raw) * 1000
                : parseFloat(raw) || 280;
      setTimeout(() => {
        document.startViewTransition(() => { location.href = href.toString(); });
      }, tSlow);
      return;
    }

    e.preventDefault();
    document.startViewTransition(() => { location.href = href.toString(); });
  });
}

/* ── Speculation Rules (prerender next pages) ── */
export function initSpeculationRules() {
  if (!('speculationrules' in HTMLScriptElement.prototype)) return;
  if (document.querySelector('script[type="speculationrules"]')) return;
  const s = document.createElement('script');
  s.type = 'speculationrules';
  s.textContent = JSON.stringify({
    prerender: [{ where: { selector_matches: '.nav-htb-list a' }, eagerness: 'moderate' }],
    prefetch:  [{ where: { selector_matches: '.post-card-title a, .archive-item a' }, eagerness: 'conservative' }]
  });
  document.head.appendChild(s);
}
