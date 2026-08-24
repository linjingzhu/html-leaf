(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const SUPPORTED_VISUAL_TYPES = new Set(['markdown', 'json']);
  const INSTALL_DELAYS = [40, 120, 260, 520];

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function pageById(pageId) {
    const state = readState();
    for (const document of state?.documents || []) {
      const page = (document.nodes || []).find(node => node.id === pageId && node.type === 'page');
      if (page) return page;
    }
    return null;
  }

  function pageForSlot(slot) {
    const state = readState();
    const pageId = state?.views?.[slot];
    return pageById(pageId);
  }

  function frameForSlot(slot) {
    if (slot === 'single') return document.getElementById('singleFrame');
    if (slot === 'left') return document.getElementById('leftFrame');
    if (slot === 'right') return document.getElementById('rightFrame');
    if (slot === 'codePreview') return document.getElementById('codePreviewFrame');
    return null;
  }

  function setToast(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(setToast.timer);
    setToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function injectShellStyle() {
    if (document.getElementById('leaf-preview-universal-edit-style')) return;
    const style = document.createElement('style');
    style.id = 'leaf-preview-universal-edit-style';
    style.textContent = `
      .view-pane.visual-preview-edit-active .viewport-edit-toggle.active::after{
        content:"Visual";
        margin-left:6px;
        padding:1px 5px;
        border-radius:4px;
        background:color-mix(in srgb,var(--accent,#5b7fff) 18%,transparent);
        color:var(--accent,#5b7fff);
        font-size:10px;
        font-weight:700;
      }
    `;
    document.head.appendChild(style);
  }

  function sanitizeVisualHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script,iframe,object,embed,base,meta,link[rel="preload"],link[rel="modulepreload"]').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attr => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '');
        if (name.startsWith('on')) node.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(value)) node.removeAttribute(attr.name);
        if (name.startsWith('data-editor-')) node.removeAttribute(attr.name);
      });
    });
    return template.innerHTML;
  }

  function simpleMarkdownToHtml(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = null;
    let code = null;

    const inline = text => esc(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const flushParagraph = () => {
      if (!paragraph.length) return;
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list) return;
      out.push(`<${list.type}>${list.items.map(item => `<li>${inline(item)}</li>`).join('')}</${list.type}>`);
      list = null;
    };

    for (const line of lines) {
      const fence = line.match(/^```(.*)$/);
      if (fence && !code) {
        flushParagraph();
        flushList();
        code = [];
        continue;
      }
      if (fence && code) {
        out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
        continue;
      }
      if (code) {
        code.push(line);
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
        continue;
      }
      const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (bullet || ordered) {
        flushParagraph();
        const type = ordered ? 'ol' : 'ul';
        if (!list || list.type !== type) flushList();
        if (!list) list = { type, items: [] };
        list.items.push((bullet || ordered)[1]);
        continue;
      }
      const quote = line.match(/^>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
        continue;
      }
      paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    return out.join('\n') || '<p></p>';
  }

  function markdownToHtml(source) {
    try {
      if (window.JiraExport?.markdownToRichHtml) return window.JiraExport.markdownToRichHtml(String(source || ''));
    } catch {}
    return simpleMarkdownToHtml(source);
  }

  function visualEditorRuntime(config) {
    const post = (kind, extra = {}) => {
      parent.postMessage({ __leafDirectSourceEdit: true, token: config.token, kind, ...extra }, '*');
    };
    const shellPost = (kind, extra = {}) => {
      parent.postMessage({ __leafVisualPreviewEdit: true, token: config.token, kind, ...extra }, '*');
    };
    const editor = document.getElementById('leafVisualEditor');
    const status = document.getElementById('leafVisualStatus');
    const selectedLabel = document.getElementById('leafSelectedLabel');

    const text = node => String(node?.textContent || '').replace(/\u00a0/g, ' ');
    const clean = value => String(value || '').replace(/\n{3,}/g, '\n\n').trim();

    function inlineMarkdown(node) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const content = [...node.childNodes].map(inlineMarkdown).join('');
      if (tag === 'strong' || tag === 'b') return `**${content}**`;
      if (tag === 'em' || tag === 'i') return `*${content}*`;
      if (tag === 'code') return `\`${content.replaceAll('`', '\\`')}\``;
      if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
      if (tag === 'br') return '  \n';
      return content;
    }

    function blockMarkdown(node, depth = 0) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${inlineMarkdown(node).trim()}`;
      if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
        const childBlocks = [...node.children].filter(child => /^(h[1-6]|p|ul|ol|blockquote|pre|table|hr)$/i.test(child.tagName));
        if (childBlocks.length) return [...node.childNodes].map(child => child.nodeType === Node.ELEMENT_NODE ? blockMarkdown(child, depth) : text(child).trim()).filter(Boolean).join('\n\n');
        return inlineMarkdown(node).trim();
      }
      if (tag === 'blockquote') return inlineMarkdown(node).split('\n').map(line => `> ${line}`).join('\n');
      if (tag === 'pre') return `\`\`\`\n${text(node).replace(/\n$/, '')}\n\`\`\``;
      if (tag === 'ul' || tag === 'ol') {
        return [...node.children].filter(child => child.tagName === 'LI').map((li, index) => {
          const marker = tag === 'ol' ? `${index + 1}.` : '-';
          return `${'  '.repeat(depth)}${marker} ${inlineMarkdown(li).trim()}`;
        }).join('\n');
      }
      if (tag === 'table') {
        const rows = [...node.querySelectorAll('tr')].map(row => [...row.children].map(cell => inlineMarkdown(cell).trim()));
        if (!rows.length) return '';
        const width = Math.max(...rows.map(row => row.length));
        const normalized = rows.map(row => Array.from({ length: width }, (_, index) => row[index] || ''));
        const header = normalized[0];
        const divider = Array.from({ length: width }, () => '---');
        return [header, divider, ...normalized.slice(1)].map(row => `| ${row.join(' | ')} |`).join('\n');
      }
      if (tag === 'hr') return '---';
      return inlineMarkdown(node).trim();
    }

    function serializeMarkdown() {
      return clean([...editor.children].map(node => blockMarkdown(node)).filter(Boolean).join('\n\n'));
    }

    function serializeJson() {
      const pre = document.getElementById('leafJsonEditor');
      return pre ? pre.innerText.trim() : editor.innerText.trim();
    }

    let pending = 0;
    function commitSoon() {
      clearTimeout(pending);
      pending = setTimeout(() => {
        const source = config.type === 'json' ? serializeJson() : serializeMarkdown();
        post('input', { source });
        status.textContent = 'Saved to document state';
      }, 180);
    }

    document.querySelectorAll('[data-command]').forEach(button => {
      button.addEventListener('click', () => {
        const command = button.dataset.command;
        if (command === 'heading') document.execCommand('formatBlock', false, 'h2');
        else if (command === 'paragraph') document.execCommand('formatBlock', false, 'p');
        else if (command === 'link') {
          const href = prompt('Link URL');
          if (href) document.execCommand('createLink', false, href);
        } else document.execCommand(command, false, null);
        editor.focus();
        commitSoon();
      });
    });

    editor.addEventListener('pointerdown', () => post('activate'), true);
    editor.addEventListener('input', commitSoon);
    editor.addEventListener('click', event => {
      const target = event.target.closest('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,a,strong,em,code') || editor;
      document.querySelectorAll('.leaf-selected-node').forEach(node => node.classList.remove('leaf-selected-node'));
      if (target !== editor) target.classList.add('leaf-selected-node');
      selectedLabel.textContent = target === editor ? 'Document' : target.tagName.toLowerCase();
      shellPost('select', { label: selectedLabel.textContent });
    });
    editor.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        commitSoon();
        post('save');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        post('exit');
      }
    });

    status.textContent = config.type === 'json' ? 'Structured JSON Preview Edit' : 'Markdown Visual Edit';
    setTimeout(() => {
      editor.focus();
      post('activate');
      post('ready');
    }, 0);
  }

  function visualEditorSource(page, token) {
    const type = page.documentType;
    const title = esc(page.name || page.fileName || 'Document');
    let body = '';
    if (type === 'json') {
      let formatted = String(page.source || '');
      try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch {}
      body = `<pre id="leafJsonEditor" contenteditable="true" spellcheck="false">${esc(formatted)}</pre>`;
    } else {
      body = sanitizeVisualHtml(markdownToHtml(page.source || ''));
    }
    const scriptConfig = JSON.stringify({ token, type }).replaceAll('<', '\\u003c');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
html{color-scheme:light;background:#fff}
body{margin:0;background:#fff;color:#20242a;font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
.leaf-visual-head{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;height:38px;padding:0 10px;border-bottom:1px solid #d9dde3;background:#f8fafc;color:#344054}
.leaf-visual-head strong{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#172033}
.leaf-visual-head button{height:24px;border:1px solid #cfd5df;border-radius:4px;background:#fff;color:#172033;font:12px system-ui;cursor:pointer}
.leaf-visual-head button:hover{background:#eef3fb}
#leafVisualEditor{max-width:920px;margin:0 auto;padding:34px 46px;outline:0;min-height:calc(100vh - 39px)}
#leafVisualEditor:focus{box-shadow:inset 0 0 0 2px rgba(66,104,214,.22)}
#leafVisualEditor img{max-width:100%}
#leafVisualEditor pre{overflow:auto;padding:14px;background:#f4f5f7;border-radius:6px}
#leafVisualEditor code{font-family:Consolas,monospace}
#leafVisualEditor table{border-collapse:collapse}
#leafVisualEditor th,#leafVisualEditor td{border:1px solid #d9dde3;padding:7px 9px}
#leafJsonEditor{margin:0;min-height:calc(100vh - 108px);outline:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 Consolas,monospace}
.leaf-selected-node{outline:2px solid #ff3f46;outline-offset:2px;border-radius:2px}
.leaf-status{margin-left:auto;color:#667085;font-size:12px}
.leaf-selected{color:#4268d6;font-size:12px}
</style>
</head>
<body>
<div class="leaf-visual-head">
<strong>${title}</strong>
<button type="button" data-command="heading">H2</button>
<button type="button" data-command="paragraph">P</button>
<button type="button" data-command="bold">B</button>
<button type="button" data-command="italic">I</button>
<button type="button" data-command="insertUnorderedList">List</button>
<button type="button" data-command="link">Link</button>
<span class="leaf-selected">Selected: <span id="leafSelectedLabel">Document</span></span>
<span class="leaf-status" id="leafVisualStatus"></span>
</div>
<main id="leafVisualEditor" contenteditable="true" spellcheck="true">${body}</main>
<script>(${visualEditorRuntime.toString()})(${scriptConfig});<\/script>
</body>
</html>`;
  }

  function installVisualAdapter(slot) {
    const frame = frameForSlot(slot);
    if (!frame || frame.dataset.previewRuntime !== 'direct-source-editor') return false;
    const token = frame.dataset.directSourceToken;
    const pageId = frame.dataset.directSourcePageId;
    const page = pageById(pageId);
    if (!token || !page || !SUPPORTED_VISUAL_TYPES.has(page.documentType)) return false;
    if (frame.dataset.leafVisualEditToken === token) return true;

    frame.dataset.leafVisualEditToken = token;
    frame.dataset.previewRuntime = 'visual-preview-editor';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = visualEditorSource(page, token);
    frame.closest('.view-pane')?.classList.add('visual-preview-edit-active');
    setToast(`${page.documentType.toUpperCase()} Visual Edit enabled`);
    return true;
  }

  function scheduleVisualAdapter(slot) {
    INSTALL_DELAYS.forEach(delay => setTimeout(() => installVisualAdapter(slot), delay));
  }

  function keepEditButtonsAvailable() {
    document.querySelectorAll('[data-edit-slot]').forEach(button => {
      const slot = button.dataset.editSlot;
      const page = pageForSlot(slot);
      if (!page || page.isEmpty) return;
      if (['html', 'markdown', 'json', 'pdf'].includes(page.documentType)) {
        button.disabled = false;
        if (SUPPORTED_VISUAL_TYPES.has(page.documentType)) {
          button.title = `Enable visual ${page.documentType.toUpperCase()} editing in this View`;
        }
      }
    });
  }

  function install() {
    injectShellStyle();
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-edit-slot]');
      if (!button) return;
      scheduleVisualAdapter(button.dataset.editSlot);
    }, true);

    [document.getElementById('singleFrame'), document.getElementById('leftFrame'), document.getElementById('rightFrame'), document.getElementById('codePreviewFrame')]
      .filter(Boolean)
      .forEach(frame => frame.addEventListener('load', () => {
        const slot = frame.id === 'singleFrame' ? 'single' : frame.id === 'leftFrame' ? 'left' : frame.id === 'rightFrame' ? 'right' : 'codePreview';
        if (frame.dataset.previewRuntime === 'direct-source-editor') scheduleVisualAdapter(slot);
        if (frame.dataset.previewRuntime !== 'visual-preview-editor') frame.closest('.view-pane')?.classList.remove('visual-preview-edit-active');
      }));

    const observer = new MutationObserver(keepEditButtonsAvailable);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled', 'data-preview-runtime', 'class'] });
    setInterval(keepEditButtonsAvailable, 1000);
    keepEditButtonsAvailable();
  }

  function waitForLeafReady() {
    if (document.getElementById('singleFrame')) {
      install();
      return;
    }
    setTimeout(waitForLeafReady, 100);
  }

  waitForLeafReady();
})();
