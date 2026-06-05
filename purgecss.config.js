module.exports = {
  content: ['_site/**/*.html', '_site/**/*.js'],
  css:     ['_site/assets/css/style.css'],
  output:  '_site/assets/css/',
  variables: true,
  safelist: {
    standard: [
      'light', 'dark',
      'reduce-motion', 'high-contrast',
      'nav-open', 'search-open', 'active', 'active-page', 'focused', 'copied', 'on', 'open',
      'htb-type', 'htb-sort', 'htb-diff', 'htb-os', 'current', 'show', 'hidden',
      'badge-easy', 'badge-medium', 'badge-hard', 'badge-insane', 'badge-os', 'badge-critical',
      'collapsed', 'install-btn', 'loaded',
    ],
    deep: [
      /^rouge-/, /^highlight/, /^language-/, /^lineno/,
      /^badge-/, /^a11y/, /^nav-/, /^post-/, /^tag-h/,
      /^sk-/, /^editor-/, /^search-/, /^htb-/, /^page-/,
    ],
    greedy: [
      /^data-/,
    ],
  },
};
