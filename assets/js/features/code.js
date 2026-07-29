export function initCode() {
  document.querySelectorAll('pre.highlight').forEach(pre => {
    pre.setAttribute('tabindex', '0');
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-expanded', 'true');

    function handleCollapse(e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'click' && e.clientY - pre.getBoundingClientRect().top > 24) return;
      e.preventDefault();
      pre.classList.toggle('collapsed');
      pre.setAttribute('aria-expanded', String(!pre.classList.contains('collapsed')));
    }

    pre.addEventListener('click',   handleCollapse);
    pre.addEventListener('keydown', handleCollapse);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16"><use href="#icon-copy"></use></svg>';
    pre.appendChild(btn);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const src  = pre.querySelector('td.rouge-code pre') || pre.querySelector('code') || pre;
      const text = src.textContent || '';

      function showOk() {
        btn.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16"><use href="#icon-check"></use></svg>';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16"><use href="#icon-copy"></use></svg>';
          btn.classList.remove('copied');
        }, 2000);
      }

      function fallback() {
        btn.textContent = '✗';
        setTimeout(() => {
          btn.innerHTML = '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16"><use href="#icon-copy"></use></svg>';
        }, 1500);
      }

      navigator.clipboard ? navigator.clipboard.writeText(text).then(showOk).catch(fallback) : fallback();
    });
  });
}
