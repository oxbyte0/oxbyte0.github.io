import { escHtml, debounce } from '../lib/utils.js';

export function initSearch(navState) {
  const toggleBtn   = document.getElementById('searchToggle');
  const overlay     = document.getElementById('searchOverlay');
  const input       = document.getElementById('searchInput');
  const resultsList = document.getElementById('searchResults');
  if (!toggleBtn || !overlay) return;

  if (resultsList) resultsList.setAttribute('aria-live', 'polite');

  let fuse        = null;
  let fuseLoading = false;
  let focusIdx    = -1;

  function openSearch() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (fuse)        { input.focus(); return; }
    if (fuseLoading) return;
    fuseLoading = true;
    input.placeholder = 'loading…';

    fetch('/search.json')
      .then(r => r.json())
      .then(posts => {
        posts = posts.filter(p => p.url && !p.url.includes('/c4n4ry'));
        const s = document.createElement('script');
        s.src         = 'https://cdn.jsdelivr.net/npm/fuse.js@7.2.0/dist/fuse.min.js';
        s.integrity   = 'sha384-fjX7DeaZ/XFhVUVbuJ4tJCCRWoC6LtyhHqvsNRsJBcfs1VksovPjnUUGM3+Ii9st';
        s.crossOrigin = 'anonymous';
        s.async       = true;
        s.onload = () => {
          try {
            fuse = new window.Fuse(posts, {
              keys: [{ name: 'title', weight: 3 }, { name: 'description', weight: 2 }, { name: 'tags', weight: 1 }],
              threshold: 0.35, includeMatches: true, minMatchCharLength: 2
            });
            input.placeholder = 'search posts…';
            input.focus();
          } catch {
            fuseLoading = false;
            input.placeholder = 'search unavailable';
          }
        };
        s.onerror = () => { fuseLoading = false; input.placeholder = 'search posts…'; };
        document.head.appendChild(s);
      })
      .catch(() => { fuseLoading = false; input.placeholder = 'search posts…'; });
  }

  function closeSearch() {
    overlay.hidden = true;
    if (!navState?.isOpen?.()) document.body.style.overflow = '';
    input.value   = '';
    resultsList.hidden = true;
    resultsList.innerHTML = '';
    focusIdx = -1;
  }

  function highlightMatch(str, indices) {
    if (!indices?.length) return escHtml(str);
    let out = '', last = 0;
    indices.forEach(([from, to]) => {
      out += escHtml(str.slice(last, from));
      out += `<em>${escHtml(str.slice(from, to + 1))}</em>`;
      last = to + 1;
    });
    return out + escHtml(str.slice(last));
  }

  function renderResults(q) {
    resultsList.innerHTML = '';
    if (!fuse || !q) { resultsList.hidden = true; return; }
    const res = fuse.search(q, { limit: 8 });
    if (!res.length) { resultsList.hidden = true; return; }
    const frag = document.createDocumentFragment();
    res.forEach(r => {
      const titleMatch = r.matches?.find(m => m.key === 'title');
      const li = document.createElement('li');
      const a  = document.createElement('a');
      a.href      = r.item.url;
      a.innerHTML = titleMatch ? highlightMatch(r.item.title, titleMatch.indices) : escHtml(r.item.title);
      const sm = document.createElement('small');
      sm.textContent = (r.item.category || '') + (r.item.date ? ' · ' + r.item.date : '');
      a.appendChild(sm);
      a.addEventListener('click', closeSearch);
      li.appendChild(a);
      frag.appendChild(li);
    });
    resultsList.appendChild(frag);
    resultsList.hidden = false;
    focusIdx = -1;
  }

  toggleBtn.addEventListener('click', openSearch);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSearch(); });

  input.addEventListener('input', debounce(() => renderResults(input.value.trim()), 120));

  input.addEventListener('keydown', e => {
    const items = [...resultsList.querySelectorAll('a')];
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx + 1, items.length - 1); items.forEach((a, i) => a.classList.toggle('focused', i === focusIdx)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); focusIdx = Math.max(focusIdx - 1, -1); items.forEach((a, i) => a.classList.toggle('focused', i === focusIdx)); }
    if (e.key === 'Enter' && focusIdx >= 0) items[focusIdx]?.click();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) { closeSearch(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay.hidden ? openSearch() : closeSearch(); }
  });
}
