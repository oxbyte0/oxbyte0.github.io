'use strict';

function debounce(fn, ms) {
  var t;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

function safeStorage(key, val) {
  try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) {}
  return null;
}

(function () {
  var html  = document.documentElement;
  var btn   = document.getElementById('themeToggle');
  if (!btn) return;
  var icon  = btn.querySelector('.theme-icon');
  var label = btn.querySelector('.theme-label');
  var tc    = document.getElementById('themeColor');

  function sync() {
    var light = html.style.colorScheme === 'light';
    if (icon)  icon.textContent  = light ? '☽' : '☀';
    if (label) label.textContent = light ? 'dark mode' : 'light mode';
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    if (tc) tc.setAttribute('content', light ? '#f6f6f6' : '#060606');
  }

  sync();
  btn.addEventListener('click', function () {
    var light = html.style.colorScheme === 'light';
    html.style.colorScheme = light ? 'dark' : 'light';
    safeStorage('theme', light ? 'dark' : 'light');
    sync();
  });
}());

(function () {
  var html  = document.documentElement;
  var modes = ['reduce-motion', 'high-contrast', 'focus-mode', 'dyslexia-mode'];

  function save() {
    safeStorage('a11y', modes.filter(function (m) { return html.classList.contains(m); }).join(' '));
  }

  
  if (!safeStorage('a11y')) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      html.classList.add('reduce-motion');
    if (window.matchMedia('(prefers-contrast: more)').matches)
      html.classList.add('high-contrast');
  }

  
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    if (e.matches) html.classList.add('reduce-motion');
  });
  window.matchMedia('(prefers-contrast: more)').addEventListener('change', function (e) {
    if (e.matches) html.classList.add('high-contrast');
  });

  document.querySelectorAll('[data-a11y]').forEach(function (btn) {
    var mode = btn.dataset.a11y;
    var active = html.classList.contains(mode);
    if (active) btn.classList.add('active');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('role', 'switch');

    btn.addEventListener('click', function () {
      html.classList.toggle(mode);
      var on = html.classList.contains(mode);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      save();
    });
  });
}());

(function () {
  var isMac = /mac/i.test(navigator.platform || '');
  document.querySelectorAll('.search-shortcut').forEach(function (kbd) {
    kbd.textContent = isMac ? '⌘K' : 'Ctrl+K';
  });
}());

(function () {
  var cur = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-pages a, details.nav-htb a').forEach(function (a) {
    try {
      if (new URL(a.href).pathname.replace(/\/$/, '') === cur) a.classList.add('active-page');
    } catch (e) {}
  });
}());

(function () {
  var details = document.querySelector('details.nav-htb');
  if (!details) return;
  var cur = window.location.pathname;
  details.querySelectorAll('a').forEach(function (a) {
    try {
      if (new URL(a.href).pathname === cur) a.classList.add('active-page');
    } catch (e) {}
  });
}());

(function () {
  var list    = document.getElementById('htbList');
  var counter = document.getElementById('htbCount');
  if (!list) return;

  var items      = Array.from(list.querySelectorAll('li'));
  var sortMode   = 'alpha';
  var diffFilter = '';
  var typeFilter = '';

  function apply() {
    items.sort(function (a, b) {
      if (sortMode === 'date-new') return parseInt(b.dataset.date, 10) - parseInt(a.dataset.date, 10);
      if (sortMode === 'date-old') return parseInt(a.dataset.date, 10) - parseInt(b.dataset.date, 10);
      return a.dataset.title.localeCompare(b.dataset.title);
    });

    var frag    = document.createDocumentFragment();
    var visible = 0;
    items.forEach(function (li) {
      var hide = (diffFilter && li.dataset.diff !== diffFilter) ||
                 (typeFilter && li.dataset.type !== typeFilter);
      li.style.display = hide ? 'none' : '';
      frag.appendChild(li);
      if (!hide) visible++;
    });
    list.appendChild(frag);
    if (counter) counter.textContent = visible;
  }

  apply();

  
  var container = list.closest('details');
  if (!container) return;

  container.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sort],[data-diff],[data-type]');
    if (!btn) return;

    if (btn.dataset.sort !== undefined) {
      container.querySelectorAll('.htb-sort').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      sortMode = btn.dataset.sort;

    } else if (btn.dataset.diff !== undefined) {
      var dv = btn.dataset.diff;
      if (diffFilter === dv) { diffFilter = ''; btn.classList.remove('active'); }
      else {
        container.querySelectorAll('.htb-diff').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        diffFilter = dv;
      }

    } else if (btn.dataset.type !== undefined) {
      container.querySelectorAll('.htb-type').forEach(function (b) {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      typeFilter = btn.dataset.type;
    }

    apply();
  });
}());

if (!CSS.supports('animation-timeline', 'scroll()')) {
  (function () {
    var bar = document.getElementById('progress');
    if (!bar) return;
    var raf = 0;
    function update() {
      raf = 0;
      var d = document.documentElement;
      var t = d.scrollHeight - d.clientHeight;
      bar.style.width = t > 0 ? ((d.scrollTop || document.body.scrollTop) / t * 100) + '%' : '0%';
    }
    window.addEventListener('scroll', function () {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
    update();
  }());
}

(function () {
  var navToc  = document.querySelector('nav ul.nav-toc');
  var divider = document.getElementById('tocDivider');
  if (!navToc) return;
  var body = document.querySelector('.post-body');
  if (!body) return;
  var headings = Array.from(body.querySelectorAll('h1, h2, h3'));
  if (!headings.length) return;

  if (divider) divider.style.display = '';

  var slugCount = {};
  var frag = document.createDocumentFragment();

  headings.forEach(function (h) {
    var text = h.textContent.trim();
    var base = text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
    if (/^\d/.test(base)) base = 'h' + base;
    slugCount[base] = (slugCount[base] || 0) + 1;
    var slug = slugCount[base] > 1 ? base + '-' + slugCount[base] : base;
    h.id = slug;
    var li = document.createElement('li');
    li.className = 'tag-' + h.nodeName.toLowerCase();
    var a = document.createElement('a');
    a.href = '#' + slug;
    a.textContent = text;
    li.appendChild(a);
    frag.appendChild(li);
  });
  navToc.appendChild(frag);

  var links = Array.from(navToc.querySelectorAll('a'));
  if (links.length) links[0].classList.add('active');

  
  if ('IntersectionObserver' in window) {
    var visible = [];
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          if (visible.indexOf(entry.target) === -1) visible.push(entry.target);
        } else {
          visible = visible.filter(function (h) { return h !== entry.target; });
        }
      });
      
      var top = null;
      headings.forEach(function (h) {
        if (visible.indexOf(h) !== -1 && !top) top = h;
      });
      if (top) {
        links.forEach(function (l) { l.classList.remove('active'); });
        var hit = navToc.querySelector('a[href="#' + top.id + '"]');
        if (hit) hit.classList.add('active');
      }
    }, { rootMargin: '-8% 0px -80% 0px', threshold: 0 });

    headings.forEach(function (h) { observer.observe(h); });
  }

  navToc.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 24, behavior: 'smooth' });
    links.forEach(function (l) { l.classList.remove('active'); });
    a.classList.add('active');
  });
}());

(function () {
  document.querySelectorAll('pre.highlight').forEach(function (pre) {
    
    pre.addEventListener('click', function (e) {
      if (e.clientY - pre.getBoundingClientRect().top <= 24) pre.classList.toggle('collapsed');
    });

    
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
    pre.appendChild(btn);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      
      var src  = pre.querySelector('td.rouge-code pre') || pre.querySelector('code') || pre;
      var text = src.innerText;

      function ok() {
        btn.innerHTML = '<i class="fa-solid fa-check"></i>';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
          btn.classList.remove('copied');
        }, 2000);
      }

      function fail() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); ok(); }
        catch (err) { btn.textContent = '!'; setTimeout(function () { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500); }
        document.body.removeChild(ta);
      }

      navigator.clipboard ? navigator.clipboard.writeText(text).then(ok).catch(fail) : fail();
    });
  });
}());

(function () {
  document.querySelectorAll('[data-share="copy"]').forEach(function (btn) {
    var sp = btn.querySelector('span');
    btn.addEventListener('click', function () {
      var url = btn.dataset.url || window.location.href;
      function ok() {
        if (sp) { sp.textContent = 'copied!'; setTimeout(function () { sp.textContent = 'copy link'; }, 2000); }
      }
      navigator.clipboard ? navigator.clipboard.writeText(url).then(ok).catch(ok) : ok();
    });
  });
}());

(function () {
  var toggle  = document.getElementById('navToggle');
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('navOverlay');
  if (!toggle || !sidebar || !overlay) return;

  var isOpen = false;

  function openNav() {
    isOpen = true;
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  }
  function closeNav() {
    isOpen = false;
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<i class="fa-solid fa-list"></i>';
  }

  toggle.addEventListener('click', function () { isOpen ? closeNav() : openNav(); });
  overlay.addEventListener('click', closeNav);

  
  sidebar.addEventListener('click', function (e) {
    if (window.innerWidth <= 900 && e.target.closest('a')) closeNav();
  });

  window.addEventListener('resize', debounce(function () {
    if (window.innerWidth > 900 && isOpen) closeNav();
  }, 150));
}());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}

(function () {
  var toggleBtn = document.getElementById('searchToggle');
  var overlay   = document.getElementById('searchOverlay');
  var input     = document.getElementById('searchInput');
  var resultsList = document.getElementById('searchResults');
  if (!toggleBtn || !overlay) return;

  var fuse = null;
  var focusIdx = -1;

  function openSearch() {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (fuse) { input.focus(); return; }
    fetch('/search.json')
      .then(function (r) { return r.json(); })
      .then(function (posts) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js';
        s.onload = function () {
          fuse = new window.Fuse(posts, {
            keys: [
              { name: 'title',       weight: 3 },
              { name: 'description', weight: 2 },
              { name: 'tags',        weight: 1 }
            ],
            threshold: 0.35,
            includeMatches: true,
            minMatchCharLength: 2
          });
          input.focus();
        };
        document.head.appendChild(s);
      }).catch(function () {});
  }

  function closeSearch() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    input.value = '';
    resultsList.hidden = true;
    resultsList.innerHTML = '';
    focusIdx = -1;
  }

  function highlightMatch(str, indices) {
    if (!indices || !indices.length) return str;
    var out = '', last = 0;
    indices.forEach(function (pair) {
      out += str.slice(last, pair[0]);
      out += '<em>' + str.slice(pair[0], pair[1] + 1) + '</em>';
      last = pair[1] + 1;
    });
    out += str.slice(last);
    return out;
  }

  function renderResults(q) {
    resultsList.innerHTML = '';
    if (!fuse || !q) { resultsList.hidden = true; return; }
    var res = fuse.search(q, { limit: 8 });
    if (!res.length) { resultsList.hidden = true; return; }
    var frag = document.createDocumentFragment();
    res.forEach(function (r, i) {
      var titleMatch = (r.matches || []).find(function (m) { return m.key === 'title'; });
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href = r.item.url;
      a.innerHTML = titleMatch
        ? highlightMatch(r.item.title, titleMatch.indices)
        : r.item.title;
      var sm = document.createElement('small');
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
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });

  input.addEventListener('input', debounce(function () {
    renderResults(input.value.trim());
  }, 120));

  input.addEventListener('keydown', function (e) {
    var items = Array.from(resultsList.querySelectorAll('a'));
    if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx + 1, items.length - 1); items.forEach(function (a, i) { a.classList.toggle('focused', i === focusIdx); }); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); focusIdx = Math.max(focusIdx - 1, 0);               items.forEach(function (a, i) { a.classList.toggle('focused', i === focusIdx); }); }
    if (e.key === 'Enter' && focusIdx >= 0 && items[focusIdx]) { items[focusIdx].click(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.hidden) { closeSearch(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay.hidden ? openSearch() : closeSearch(); }
  });
}());

(function () {
  var btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', debounce(function () {
    btn.hidden = (document.documentElement.scrollTop || document.body.scrollTop) < 300;
  }, 100), { passive: true });
  btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
}());

(function () {
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var nb = document.querySelector('.nav-bottom');
    if (!nb) return;
    var btn = document.createElement('button');
    btn.className = 'install-btn';
    btn.textContent = '⊕ install app';
    btn.addEventListener('click', function () {
      deferred.prompt();
      deferred.userChoice.then(function (r) {
        if (r.outcome === 'accepted') btn.remove();
        deferred = null;
      });
    });
    nb.appendChild(btn);
  });
}());
