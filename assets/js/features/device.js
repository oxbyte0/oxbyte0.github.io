import { debounce } from '../lib/utils.js';

export function initDeviceAdaptation() {
  const html = document.documentElement;

  /* ── Pointer type: coarse=touch, fine=mouse ── */
  const coarseQ = window.matchMedia('(pointer: coarse)');
  const hoverQ  = window.matchMedia('(hover: hover)');

  function applyPointer() {
    html.dataset.pointer = coarseQ.matches ? 'touch' : 'mouse';
    html.dataset.hover   = hoverQ.matches  ? '1'     : '0';
  }
  applyPointer();
  coarseQ.addEventListener('change', applyPointer);
  hoverQ.addEventListener('change',  applyPointer);

  /* ── Dynamic viewport units ── */
  /* --dvh: actual visible height (excludes browser chrome on mobile)
     Fixes 100vh = wrong height on iOS Safari when address bar visible */
  function setViewportVars() {
    const vvp = window.visualViewport;
    const dvh = (vvp ? vvp.height : window.innerHeight) / 100;
    const vw  = window.innerWidth / 100;
    html.style.setProperty('--dvh', `${dvh}px`);
    html.style.setProperty('--vw',  `${vw}px`);
    html.style.setProperty('--viewport-w', `${window.innerWidth}px`);
  }
  setViewportVars();
  window.addEventListener('resize', debounce(setViewportVars, 80), { passive: true });
  window.visualViewport?.addEventListener('resize', debounce(setViewportVars, 40));

  /* ── Network tier: affects image preload aggressiveness ── */
  const conn = navigator.connection || navigator.mozConnection;
  if (conn) {
    function applyNetwork() {
      const t = conn.effectiveType;
      html.dataset.network = (t === '4g' && conn.downlink > 4) ? 'fast'
                           : (t === '4g' || t === '3g')        ? 'medium'
                           :                                      'slow';
    }
    applyNetwork();
    conn.addEventListener('change', applyNetwork);
  }
}
