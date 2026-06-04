import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.esm.min.mjs';
mermaid.initialize({
  startOnLoad: true,
  theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark'
});
