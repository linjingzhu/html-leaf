(() => {
  'use strict';

  const TYPE_CLASS_PREFIX = 'leaf-syntax-type-';
  const REFRESH_MS = 300;
  let overlay = null;
  let code = null;
  let lastText = null;
  let lastType = null;
  let frameHandle = 0;
  let refreshTimer = 0;
  let viewMode = '';

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function span(className, value) {
    return `<span class="leaf-token ${className}">${value}</span>`;
  }

  function codeArea() {
    return document.querySelector('#codeArea');
  }

  function sourceEditor() {
    return document.querySelector('#sourceEditor');
  }

  function codePageSelect() {
    return document.querySelector('#codePageSelect');
  }

  function activeMode() {
    return document.querySelector('#viewSeg button.active[data-mode]')?.dataset.mode || '';
  }

  function selectedLabel() {
    const select = codePageSelect();
    return select?.selectedOptions?.[0]?.textContent || '';
  }

  function detectType() {
    const label = selectedLabel();
    const editor = sourceEditor();
    if (editor?.readOnly || /\[PDF\]/i.test(label)) return 'plain';
    if (/\[JSON\]/i.test(label) || /\.json(?:\s|$)/i.test(label)) return 'json';
    if (/\[MARKDOWN\]|\[MD\]/i.test(label) || /\.(md|markdown)(?:\s|$)/i.test(label)) return 'markdown';
    return 'html';
  }

  function highlightJson(text) {
    const pattern = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\],:]/g;
    let output = '';
    let index = 0;
    let match;
    while ((match = pattern.exec(text))) {
      output += esc(text.slice(index, match.index));
      const token = match[0];
      const after = text.slice(pattern.lastIndex);
      if (token.startsWith('"')) {
        output += span(/^\s*:/.test(after) ? 'key' : 'string', esc(token));
      } else if (/^-?\d/.test(token)) {
        output += span('number', esc(token));
      } else if (/^(true|false|null)$/.test(token)) {
        output += span('literal', esc(token));
      } else {
        output += span('punctuation', esc(token));
      }
      index = pattern.lastIndex;
    }
    return output + esc(text.slice(index));
  }

  function highlightHtmlAttributes(raw) {
    const pattern = /([:@A-Za-z_][\w:.-]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
    let output = '';
    let index = 0;
    let match;
    while ((match = pattern.exec(raw))) {
      output += esc(raw.slice(index, match.index));
      output += span('attribute', esc(match[1]));
      output += span('operator', esc(match[2]));
      output += span('string', esc(match[3]));
      index = pattern.lastIndex;
    }
    return output + esc(raw.slice(index));
  }

  function highlightHtmlTag(raw) {
    const tag = raw.match(/^<\/?\s*([A-Za-z][\w:-]*)/);
    if (!tag) return span('tag', esc(raw));
    const beforeName = raw.slice(0, tag.index + tag[0].lastIndexOf(tag[1]));
    const name = tag[1];
    const afterName = raw.slice(beforeName.length + name.length);
    const closeMatch = afterName.match(/(\s*\/?>)$/);
    const attrs = closeMatch ? afterName.slice(0, -closeMatch[1].length) : afterName;
    const closing = closeMatch ? closeMatch[1] : '';
    return [
      span('punctuation', esc(beforeName)),
      span('tag-name', esc(name)),
      highlightHtmlAttributes(attrs),
      span('punctuation', esc(closing))
    ].join('');
  }

  function highlightHtml(text) {
    const pattern = /<!--[\s\S]*?-->|<!doctype[\s\S]*?>|<\/?[A-Za-z][^>]*>/gi;
    let output = '';
    let index = 0;
    let match;
    while ((match = pattern.exec(text))) {
      output += esc(text.slice(index, match.index));
      const token = match[0];
      if (token.startsWith('<!--')) output += span('comment', esc(token));
      else if (/^<!doctype/i.test(token)) output += span('doctype', esc(token));
      else output += highlightHtmlTag(token);
      index = pattern.lastIndex;
    }
    return output + esc(text.slice(index));
  }

  function highlightMarkdownInline(raw) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
    let output = '';
    let index = 0;
    let match;
    while ((match = pattern.exec(raw))) {
      output += esc(raw.slice(index, match.index));
      const token = match[0];
      if (token.startsWith('`')) output += span('code', esc(token));
      else if (token.startsWith('[')) output += span('link', esc(token));
      else output += span('emphasis', esc(token));
      index = pattern.lastIndex;
    }
    return output + esc(raw.slice(index));
  }

  function highlightMarkdown(text) {
    const lines = text.split('\n');
    let fenced = false;
    return lines.map(line => {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        return span('code-fence', esc(line));
      }
      if (fenced) return span('code', esc(line));
      const heading = line.match(/^(#{1,6})(\s+.*)?$/);
      if (heading) return `${span('heading-mark', esc(heading[1]))}${span('heading', esc(heading[2] || ''))}`;
      const quote = line.match(/^(\s*>+\s?)(.*)$/);
      if (quote) return `${span('quote-mark', esc(quote[1]))}${span('quote', highlightMarkdownInline(quote[2]))}`;
      const list = line.match(/^(\s*(?:[-+*]|\d+\.)\s+)(.*)$/);
      if (list) return `${span('list-mark', esc(list[1]))}${highlightMarkdownInline(list[2])}`;
      return highlightMarkdownInline(line);
    }).join('\n');
  }

  function highlighted(text, type) {
    if (type === 'json') return highlightJson(text);
    if (type === 'markdown') return highlightMarkdown(text);
    if (type === 'html') return highlightHtml(text);
    return esc(text);
  }

  function ensureStyle() {
    if (document.querySelector('style[data-leaf-code-syntax]')) return;
    const style = document.createElement('style');
    style.dataset.leafCodeSyntax = 'true';
    style.textContent = `
      .code-area.leaf-code-syntax{position:relative}
      .leaf-code-highlight{
        position:absolute;
        inset:0;
        z-index:1;
        margin:0;
        padding:10px 12px 28px 48px;
        overflow:hidden;
        white-space:pre;
        tab-size:2;
        pointer-events:none;
        color:var(--editor-foreground);
        font:12px/1.55 "SFMono-Regular",Consolas,"Liberation Mono",monospace;
      }
      .leaf-code-highlight code{font:inherit;white-space:inherit}
      .code-area.leaf-code-syntax textarea{
        position:relative;
        z-index:3;
        background:transparent!important;
        color:transparent!important;
        -webkit-text-fill-color:transparent;
        caret-color:var(--foreground);
      }
      .code-area.leaf-code-syntax textarea::selection{
        background:color-mix(in srgb,var(--selection) 42%,transparent);
      }
      .leaf-code-syntax .line-rail{z-index:4}
      .leaf-token.comment{color:var(--syntax-comment)}
      .leaf-token.doctype,.leaf-token.punctuation{color:var(--syntax-punctuation)}
      .leaf-token.tag-name{color:var(--syntax-tag)}
      .leaf-token.attribute,.leaf-token.key{color:var(--syntax-attribute)}
      .leaf-token.operator{color:var(--syntax-punctuation)}
      .leaf-token.string{color:var(--syntax-string)}
      .leaf-token.number{color:var(--syntax-number)}
      .leaf-token.literal{color:var(--syntax-tag)}
      .leaf-token.heading,.leaf-token.heading-mark{color:var(--syntax-heading);font-weight:700}
      .leaf-token.quote,.leaf-token.quote-mark{color:var(--syntax-punctuation)}
      .leaf-token.list-mark{color:var(--syntax-number)}
      .leaf-token.link{color:var(--syntax-link)}
      .leaf-token.emphasis{color:var(--syntax-emphasis)}
      .leaf-token.code,.leaf-token.code-fence{color:var(--syntax-string)}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    const area = codeArea();
    const editor = sourceEditor();
    if (!area || !editor) return false;
    ensureStyle();
    if (!overlay || !area.contains(overlay)) {
      overlay = document.createElement('pre');
      overlay.className = 'leaf-code-highlight';
      overlay.setAttribute('aria-hidden', 'true');
      code = document.createElement('code');
      overlay.appendChild(code);
      area.insertBefore(overlay, editor);
    }
    area.classList.add('leaf-code-syntax');
    return true;
  }

  function syncScroll() {
    const editor = sourceEditor();
    if (!editor || !overlay) return;
    overlay.scrollTop = editor.scrollTop;
    overlay.scrollLeft = editor.scrollLeft;
  }

  function updateHighlight() {
    if (!ensureOverlay()) return;
    const editor = sourceEditor();
    const type = detectType();
    const text = editor?.value || '';
    if (text !== lastText || type !== lastType) {
      code.innerHTML = highlighted(text || ' ', type);
      overlay.className = `leaf-code-highlight ${TYPE_CLASS_PREFIX}${type}`;
      lastText = text;
      lastType = type;
    }
    syncScroll();
  }

  function scheduleHighlight() {
    if (viewMode !== 'code') return;
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0;
      updateHighlight();
    });
  }

  function setViewMode(mode) {
    viewMode = mode || '';
    if (viewMode === 'code') {
      // The renderer writes #sourceEditor.value directly from inspector and
      // preview-frame edits (loadCodePage) with no lifecycle event to observe,
      // so a low-rate refresh is needed while the Code view is on screen.
      if (!refreshTimer) refreshTimer = setInterval(scheduleHighlight, REFRESH_MS);
      scheduleHighlight();
      return;
    }
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = 0;
    }
    if (frameHandle) {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }
  }

  function install() {
    const editor = sourceEditor();
    if (!editor) return;
    if (editor.dataset.leafCodeSyntax !== 'true') {
      editor.dataset.leafCodeSyntax = 'true';
      editor.addEventListener('input', scheduleHighlight);
      editor.addEventListener('scroll', syncScroll, { passive: true });
      codePageSelect()?.addEventListener('change', scheduleHighlight);
    }
    setViewMode(activeMode());
  }

  document.addEventListener('leaf-view-mode-changed', event => setViewMode(event.detail?.mode));
  document.addEventListener('leaf-page-selects-rendered', scheduleHighlight);
  document.addEventListener('leaf-renderer-ready', install);

  if (document.documentElement.dataset.leafReady === 'true') install();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
