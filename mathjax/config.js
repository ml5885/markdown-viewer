window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    processEnvironments: true,
    packages: { '[+]': ['ams', 'boldsymbol', 'configmacros', 'newcommand', 'physics'] },
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  },
  svg: {
    fontCache: 'none',
  },
  startup: {
    typeset: false,
  },
};
