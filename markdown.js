// Minimal Markdown parser — handles the most common constructs.
// Intentionally small so the extension stays lightweight.

function parseMarkdown(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\S*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = esc(fenceMatch[2]);
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        code.push(esc(lines[i]));
        i++;
      }
      i++; // skip closing fence
      const langAttr = lang ? ` class="language-${lang}"` : '';
      out.push(`<pre><code${langAttr}>${code.join('\n')}</code></pre>`);
      continue;
    }

    // Blank line
    if (line.trim() === '') { i++; continue; }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const id = headingMatch[2].toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, '');
      out.push(`<h${level} id="${id}">${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ') || line === '>') {
      const bqLines = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      i = parseList(lines, i, out, 'ul');
      continue;
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      i = parseList(lines, i, out, 'ol');
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      const alignLine = splitTableRow(lines[i + 1]);
      const aligns = alignLine.map(cell => {
        const t = cell.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
      });
      i += 2;
      let table = '<table><thead><tr>';
      headerCells.forEach((cell, ci) => {
        table += `<th align="${aligns[ci] || 'left'}">${inline(cell.trim())}</th>`;
      });
      table += '</tr></thead><tbody>';
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        const cells = splitTableRow(lines[i]);
        table += '<tr>';
        cells.forEach((cell, ci) => {
          table += `<td align="${aligns[ci] || 'left'}">${inline(cell.trim())}</td>`;
        });
        table += '</tr>';
        i++;
      }
      table += '</tbody></table>';
      out.push(table);
      continue;
    }

    // Paragraph — collect consecutive non-blank lines
    const pLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length) {
      out.push(`<p>${inline(pLines.join('\n'))}</p>`);
    }
  }

  return out.join('\n');
}

function isBlockStart(line) {
  return /^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s|`{3,}|~{3,}|(-{3,}|\*{3,}|_{3,})\s*$)/.test(line)
    || (line.includes('|') && line.trim().startsWith('|'));
}

function parseList(lines, i, out, tag) {
  const items = [];
  const listIndent = lines[i].match(/^(\s*)/)[1].length;
  const marker = tag === 'ul' ? /^(\s*)[-*+]\s(.*)/ : /^(\s*)\d+\.\s(.*)/;

  while (i < lines.length) {
    const m = lines[i].match(marker);
    if (!m || m[1].length !== listIndent) break;

    let content = m[2];
    i++;
    // Continuation lines (indented deeper or sub-lists)
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(new RegExp(`^\\s{0,${listIndent}}[-*+\\d]`))) {
      if (/^[\s]*[-*+]\s/.test(lines[i]) || /^[\s]*\d+\.\s/.test(lines[i])) break;
      content += ' ' + lines[i].trim();
      i++;
    }

    // Check for checkbox
    const checkbox = content.match(/^\[([ xX])\]\s*(.*)/);
    if (checkbox) {
      const checked = checkbox[1] !== ' ' ? ' checked disabled' : ' disabled';
      items.push(`<li class="task-list-item"><input type="checkbox"${checked}> ${inline(checkbox[2])}</li>`);
    } else {
      items.push(`<li>${inline(content)}</li>`);
    }
  }

  out.push(`<${tag}>${items.join('')}</${tag}>`);
  return i;
}

function splitTableRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|');
}

// Inline formatting
function inline(text) {
  return text
    // Images (before links so ![...](...) isn't caught by link regex)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Autolinks
    .replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>')
    // Bold+italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/  \n/g, '<br>');
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Export for content script
if (typeof window !== 'undefined') window.parseMarkdown = parseMarkdown;
