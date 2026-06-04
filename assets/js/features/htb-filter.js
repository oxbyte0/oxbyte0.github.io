export function initHtbFilter() {
  const list    = document.getElementById('htbList');
  const counter = document.getElementById('htbCount');
  if (!list) return;

  const items      = [...list.querySelectorAll('li')];
  let sortMode     = 'alpha';
  let diffFilter   = '';
  let typeFilter   = '';

  function apply() {
    items.sort((a, b) => {
      if (sortMode === 'date-new') return parseInt(b.dataset.date, 10) - parseInt(a.dataset.date, 10);
      if (sortMode === 'date-old') return parseInt(a.dataset.date, 10) - parseInt(b.dataset.date, 10);
      return (a.dataset.title || '').localeCompare(b.dataset.title || '');
    });
    const frag = document.createDocumentFragment();
    let visible = 0;
    items.forEach(li => {
      const hide = (diffFilter && li.dataset.diff !== diffFilter) || (typeFilter && li.dataset.type !== typeFilter);
      li.style.display = hide ? 'none' : '';
      frag.appendChild(li);
      if (!hide) visible++;
    });
    list.appendChild(frag);
    if (counter) counter.textContent = visible;
  }

  apply();

  const container = list.closest('details');
  if (!container) return;

  /* Arrow-key navigation for tab buttons */
  const tablist = container.querySelector('[role="tablist"]');
  if (tablist) {
    tablist.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const idx  = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      tabs[(e.key === 'ArrowRight' ? idx + 1 : idx - 1 + tabs.length) % tabs.length].focus();
    });
  }

  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-sort],[data-diff],[data-type]');
    if (!btn) return;
    if (btn.dataset.sort !== undefined) {
      container.querySelectorAll('.htb-sort').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); sortMode = btn.dataset.sort;
    } else if (btn.dataset.diff !== undefined) {
      const dv = btn.dataset.diff;
      if (diffFilter === dv) { diffFilter = ''; btn.classList.remove('active'); }
      else { container.querySelectorAll('.htb-diff').forEach(b => b.classList.remove('active')); btn.classList.add('active'); diffFilter = dv; }
    } else if (btn.dataset.type !== undefined) {
      container.querySelectorAll('.htb-type').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); typeFilter = btn.dataset.type;
    }
    apply();
  });
}
