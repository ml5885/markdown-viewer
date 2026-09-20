(async () => {
  const url = location.pathname;
  if (!url.match(/\.(md|markdown)$/i)) throw new Error('Not a markdown file');

  const body = document.body;
  const isPlainText =
    (body.children.length === 1 && body.children[0].tagName === 'PRE') ||
    (body.children.length === 0 && body.innerText === body.innerHTML);

  if (!isPlainText) throw new Error('Page already has HTML structure');

  const raw = body.innerText;

  document.title = decodeURIComponent(url.split('/').pop());

  const THEME_STORAGE_KEY = 'markdown-viewer-theme';
  let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  const applyTheme = (theme) => {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    body.classList.toggle('markdown-dark', currentTheme === 'dark');
    body.style.colorScheme = currentTheme;
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  };
  applyTheme(currentTheme);

  const renderMathPlaceholder = (text, displayMode) => [
    '<span class="markdown-math-placeholder"',
    ` data-display="${displayMode ? 'true' : 'false'}"`,
    ` data-math="${encodeURIComponent(text)}"></span>`,
  ].join('');

  const revealMathSource = (node, math, displayMode) => {
    node.classList.add('markdown-math-error');
    node.textContent = displayMode ? `$$${math}$$` : `$${math}$`;
  };

  const renderMathPlaceholders = async (root) => {
    const placeholders = [...root.querySelectorAll('.markdown-math-placeholder')];
    if (!placeholders.length) return;

    if (!window.MathJax?.tex2svgPromise) {
      for (const node of placeholders) {
        revealMathSource(
          node,
          decodeURIComponent(node.dataset.math || ''),
          node.dataset.display === 'true',
        );
      }
      return;
    }

    await MathJax.startup.promise;

    for (const node of placeholders) {
      const math = decodeURIComponent(node.dataset.math || '');
      const displayMode = node.dataset.display === 'true';

      try {
        const rendered = await MathJax.tex2svgPromise(math, { display: displayMode });
        rendered.classList.add(displayMode ? 'markdown-math-display' : 'markdown-math-inline');
        node.replaceWith(rendered);
      } catch (error) {
        console.error('MathJax render failed', error);
        revealMathSource(node, math, displayMode);
      }
    }
  };

  marked.use({
    extensions: [
      {
        name: 'blockMath',
        level: 'block',
        start(src) { return src.indexOf('$$'); },
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$/.exec(src);
          if (match) return { type: 'blockMath', raw: match[0], text: match[1].trim() };
        },
        renderer(token) { return renderMathPlaceholder(token.text, true); },
      },
      {
        name: 'blockMathBrackets',
        level: 'block',
        start(src) { return src.indexOf('\\['); },
        tokenizer(src) {
          const match = /^\\\[([\s\S]+?)\\\]/.exec(src);
          if (match) return { type: 'blockMathBrackets', raw: match[0], text: match[1].trim() };
        },
        renderer(token) { return renderMathPlaceholder(token.text, true); },
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start(src) { return src.indexOf('$'); },
        tokenizer(src) {
          const match = /^\$(?!\s)((?:\\.|[^$])+?)(?<!\s)\$(?!\d)/.exec(src);
          if (match && !/\n[ \t]*\n/.test(match[1])) {
            return { type: 'inlineMath', raw: match[0], text: match[1] };
          }
        },
        renderer(token) { return renderMathPlaceholder(token.text, false); },
      },
      {
        name: 'inlineMathParens',
        level: 'inline',
        start(src) { return src.indexOf('\\('); },
        tokenizer(src) {
          const match = /^\\\(([\s\S]+?)\\\)/.exec(src);
          if (match && !/\n[ \t]*\n/.test(match[1])) {
            return { type: 'inlineMathParens', raw: match[0], text: match[1] };
          }
        },
        renderer(token) { return renderMathPlaceholder(token.text, false); },
      },
    ],
  });

  const wrapper = document.createElement('article');
  wrapper.className = 'markdown-body';
  wrapper.innerHTML = marked.parse(raw);
  await renderMathPlaceholders(wrapper);

  const slugify = (text) => {
    const base = text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    let slug = base;
    let n = 1;
    while (document.getElementById(slug)) slug = `${base}-${n++}`;
    return slug;
  };

  const headings = [...wrapper.querySelectorAll('h1, h2, h3')];
  for (const h of headings) {
    if (!h.id) h.id = slugify(h.textContent);
  }

  const scrollToHeading = (heading, behavior = 'smooth') => {
    const top = Math.max(0, window.scrollY + heading.getBoundingClientRect().top - 24);
    window.scrollTo({ top, behavior });
  };

  const toc = document.createElement('nav');
  toc.className = 'markdown-toc';
  const tocLinks = [];
  if (headings.length >= 2) {
    const minLevel = Math.min(...headings.map(h => Number(h.tagName[1])));
    const list = document.createElement('ul');
    for (const h of headings) {
      const li = document.createElement('li');
      li.className = `markdown-toc-l${Number(h.tagName[1]) - minLevel}`;
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToHeading(h);
        history.replaceState(null, '', `#${h.id}`);
      });
      li.appendChild(a);
      list.appendChild(li);
      tocLinks.push({ link: a, heading: h });
    }
    toc.appendChild(list);
  }

  const rawView = document.createElement('pre');
  rawView.className = 'markdown-raw';
  rawView.textContent = raw;
  rawView.style.display = 'none';

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'markdown-controls';

  const toggle = document.createElement('button');
  toggle.className = 'markdown-toggle';
  toggle.textContent = 'Raw';
  let showingRendered = true;
  toggle.addEventListener('click', () => {
    showingRendered = !showingRendered;
    wrapper.style.display = showingRendered ? '' : 'none';
    rawView.style.display = showingRendered ? 'none' : '';
    toc.style.display = showingRendered ? '' : 'none';
    toggle.textContent = showingRendered ? 'Raw' : 'Rendered';
  });

  const themeToggle = document.createElement('button');
  themeToggle.className = 'markdown-toggle';
  const syncThemeToggle = () => {
    themeToggle.textContent = currentTheme === 'dark' ? 'Light' : 'Dark';
    themeToggle.setAttribute('aria-label', `Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`);
    themeToggle.setAttribute('aria-pressed', String(currentTheme === 'dark'));
  };
  syncThemeToggle();
  themeToggle.addEventListener('click', () => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    syncThemeToggle();
  });

  // Font picker
  const fonts = [
    "System Default",
    "Apercu", "Avenir", "Avenir Next", "Baskerville", "Berkeley Mono",
    "Charter", "Cochin", "CommitMono", "Courier New", "Dante MT",
    "Departure Mono", "Didot", "DIN Alternate", "DM Mono", "EB Garamond",
    "Fira Code", "Futura", "Galvji", "Geneva", "Georgia", "Gill Sans",
    "GT America Trial", "GT Sectra Trial", "GT Walsheim Trial",
    "Helvetica", "Helvetica Neue", "Hoefler Text", "Kefa",
    "Lucida Grande", "Menlo", "Monaco", "Neue Montreal", "Noto Serif",
    "Optima", "Palatino", "PP Editorial New", "PP Neue Montreal Mono",
    "PT Sans", "PT Serif", "Rockwell", "Roslindale Text", "Satoshi",
    "Sentient", "SF Mono", "Space Grotesk", "Tahoma", "Test Söhne",
    "Times New Roman", "Trebuchet MS", "Verdana",
  ];

  const fontSelect = document.createElement('select');
  fontSelect.className = 'markdown-font-select';

  for (const family of fonts) {
    const opt = document.createElement('option');
    opt.value = family === 'System Default' ? '' : family;
    opt.textContent = family;
    fontSelect.appendChild(opt);
  }

  const applyFont = (family) => {
    wrapper.style.fontFamily = family || '';
    toc.style.fontFamily = family || '';
  };

  const saved = localStorage.getItem('markdown-viewer-font');
  if (saved) {
    fontSelect.value = saved;
    applyFont(saved);
  }

  fontSelect.addEventListener('change', () => {
    applyFont(fontSelect.value);
    localStorage.setItem('markdown-viewer-font', fontSelect.value);
  });

  controls.appendChild(fontSelect);
  controls.appendChild(themeToggle);
  controls.appendChild(toggle);

  // Focus mode: hides the TOC and controls
  const FOCUS_STORAGE_KEY = 'markdown-viewer-focus';
  const focusToggle = document.createElement('button');
  focusToggle.className = 'markdown-focus-toggle';
  const applyFocus = (on) => {
    body.classList.toggle('markdown-focus', on);
    focusToggle.textContent = on ? 'Show controls' : 'No distractions';
    localStorage.setItem(FOCUS_STORAGE_KEY, on ? 'true' : 'false');
  };
  applyFocus(localStorage.getItem(FOCUS_STORAGE_KEY) === 'true');
  focusToggle.addEventListener('click', () => {
    applyFocus(!body.classList.contains('markdown-focus'));
  });

  body.innerHTML = '';
  body.appendChild(controls);
  body.appendChild(focusToggle);
  if (tocLinks.length) body.appendChild(toc);
  body.appendChild(wrapper);
  body.appendChild(rawView);

  if (location.hash) {
    const hashId = decodeURIComponent(location.hash.slice(1));
    const hashTarget = document.getElementById(hashId);
    if (hashTarget) {
      requestAnimationFrame(() => {
        scrollToHeading(hashTarget, 'auto');
      });
    }
  }

  window.addEventListener('hashchange', () => {
    const hashId = decodeURIComponent(location.hash.slice(1));
    const hashTarget = document.getElementById(hashId);
    if (hashTarget) scrollToHeading(hashTarget);
  });

  if (tocLinks.length) {
    const setActive = () => {
      if (!showingRendered) return;
      const scrollY = window.scrollY + 100;
      let activeIdx = 0;
      for (let i = 0; i < tocLinks.length; i++) {
        if (tocLinks[i].heading.offsetTop <= scrollY) activeIdx = i;
        else break;
      }
      for (let i = 0; i < tocLinks.length; i++) {
        tocLinks[i].link.classList.toggle('active', i === activeIdx);
      }
    };
    setActive();
    window.addEventListener('scroll', setActive, { passive: true });
  }
})();
