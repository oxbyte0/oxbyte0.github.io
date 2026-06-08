import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.esm.min.mjs';
// integrity="sha384-yZWNsk5z9bx9EvlwQD4KlZVm61Q2nI6tUxRpkBSslKIGzs48C2QIyYJqRAPKroQs"
mermaid.initialize({
  startOnLoad: true,
  theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark'
});
