export function initToc() {
  const navToc  = document.querySelector('nav ul.nav-toc');
  const divider = document.getElementById('tocDivider');
  if (!navToc) return;
  const body = document.querySelector('.post-body');
  if (!body) return;
  const headings = [...body.querySelectorAll('h1, h2, h3')];
  if (!headings.length) return;

  if (divider) divider.style.display = '';

  const slugCount = {};
  const frag = document.createDocumentFragment();

  headings.forEach(h => {
    const text = h.textContent.trim();

    /* Use existing Kramdown-generated id if present — avoids mismatch with
       external deep-links which use Kramdown's 1-based suffix scheme */
    let slug = h.id;
    if (!slug) {
      let base = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-') || 'heading';
      if (/^\d/.test(base)) base = 'h' + base;
      slugCount[base] = (slugCount[base] || 0) + 1;
      /* Match Kramdown: first = 'base', second = 'base-1', third = 'base-2' */
      slug = slugCount[base] === 1 ? base : `${base}-${slugCount[base] - 1}`;
      h.id = slug;
    }

    const li = document.createElement('li');
    li.className = 'tag-' + h.nodeName.toLowerCase();
    const a = document.createElement('a');
    a.href = '#' + slug;
    a.textContent = text;
    li.appendChild(a);
    frag.appendChild(li);
  });
  navToc.appendChild(frag);

  const links = [...navToc.querySelectorAll('a')];
  if (links.length) links[0].classList.add('active');

  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      });
      const top = headings.find(h => visible.has(h));
      links.forEach(l => l.classList.remove('active'));
      if (top) navToc.querySelector(`a[href="#${top.id}"]`)?.classList.add('active');
    }, { rootMargin: '-8% 0px -80% 0px', threshold: 0 });
    headings.forEach(h => observer.observe(h));
  }

  navToc.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
    links.forEach(l => l.classList.remove('active'));
    a.classList.add('active');
  });
}
