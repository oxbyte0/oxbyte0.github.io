/* ── Cursor spotlight — two CSS vars only, all visuals live in _bgfx.scss ── */
export function initBgfx() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(hover: none), (pointer: coarse)').matches) return; /* touch: no cursor to track */
  const spot = document.querySelector('.bgfx-spot');
  if (!spot) return;

  const root = document.documentElement;
  let raf = 0, x = 0, y = 0;

  function apply() {
    raf = 0;
    root.style.setProperty('--mx', x + 'px');
    root.style.setProperty('--my', y + 'px');
  }

  function onMove(e) {
    if (document.hidden) return;
    x = e.clientX; y = e.clientY;
    spot.classList.add('active');
    if (!raf) raf = requestAnimationFrame(apply);
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('mouseleave', () => spot.classList.remove('active'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) spot.classList.remove('active');
  });
}
