import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.esm.min.mjs';
// integrity="sha384-yZWNsk5z9bx9EvlwQD4KlZVm61Q2nI6tUxRpkBSslKIGzs48C2QIyYJqRAPKroQs"
mermaid.initialize({
  startOnLoad: false,
  theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark'
});

/* Explicit run (not startOnLoad) so we have a promise handle on completion —
   initPrint() awaits this before calling window.print(), otherwise a diagram
   mid-render at click time prints as raw mermaid syntax instead of an SVG. */
window.__mermaidReady = mermaid.run().catch(() => {});
