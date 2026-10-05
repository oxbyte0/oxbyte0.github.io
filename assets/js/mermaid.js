// Self-hosted (was cdn.jsdelivr.net/npm/mermaid@10.9.3) — static ES module
// imports have no integrity attribute, so a CDN fetch here was unverifiable
// at the browser level; vendoring also drops the exact-version CDN URL that
// fingerprinting tools (Wappalyzer etc.) read straight out of page source.
import mermaid from './vendor/mermaid/mermaid.esm.min.mjs';
mermaid.initialize({
  startOnLoad: false,
  theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark'
});

/* Explicit run (not startOnLoad) so we have a promise handle on completion —
   initPrint() awaits this before calling window.print(), otherwise a diagram
   mid-render at click time prints as raw mermaid syntax instead of an SVG. */
window.__mermaidReady = mermaid.run().catch(() => {});
