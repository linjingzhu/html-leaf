(() => {
  'use strict';

  const BLOCK_TAGS = new Set([
    'ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DIV','DL','FIELDSET','FIGURE','FOOTER',
    'FORM','H1','H2','H3','H4','H5','H6','HEADER','HR','LI','MAIN','NAV','OL','P',
    'PRE','SECTION','TABLE','UL'
  ]);

  function warningCollector() {
    const warnings = [];
    const seen = new Set();
    return {
      warnings,
      add(message) {
        if (!message || seen.has(message)) return;
        seen.add(message);
        warnings.push(message);
      }
    };
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ');
  }

  function cleanInlineList(items) {
    const out = [];
    for (const item of items || []) {
      if (!item) continue;
      if (item.type === 'text') {
        if (!item.text) continue;
        const prev = out[out.length - 1];
        if (prev && prev.type === 'text' && JSON.stringify(prev.marks || []) === JSON.stringify(item.marks || [])) {
          prev.text += item.text;
        } else {
          out.push(item);
        }
      } else {
        out.push(item);
      }
    }
    return out;
  }

  function addMark(marks, mark) {
    const next = [...(marks || [])];
    if (!next.some(m => JSON.stringify(m) === JSON.stringify(mark))) next.push(mark);
    return next;
  }

  function safeHref(rawHref, baseUrl, warn) {
    if (!rawHref) return null;
    const href = String(rawHref).trim();
    if (!href) return null;

    if (href.startsWith('#')) {
      warn.add('In-document anchor links are exported as plain text because Jira cannot preserve local HTML anchors reliably.');
      return null;
    }

    try {
      const resolved = baseUrl ? new URL(href, baseUrl) : new URL(href);
      if (!['http:', 'https:', 'mailto:'].includes(resolved.protocol)) {
        warn.add(`Unsupported/local link was exported as plain text: ${href}`);
        return null;
      }
      return resolved.href;
    } catch {
      warn.add(`Invalid link was exported as plain text: ${href}`);
      return null;
    }
  }

  function parseInlineChildren(node, ctx, inheritedMarks = []) {
    const result = [];
    node.childNodes.forEach(child => {
      result.push(...parseInlineNode(child, ctx, inheritedMarks));
    });
    return cleanInlineList(result);
  }

  function parseInlineNode(node, ctx, marks = []) {
    const NodeCtor = node.ownerDocument?.defaultView?.Node || window.Node;

    if (node.nodeType === NodeCtor.TEXT_NODE) {
      const text = normalizeText(node.nodeValue);
      if (!text) return [];
      return [{ type: 'text', text, marks: marks.length ? marks : undefined }];
    }

    if (node.nodeType !== NodeCtor.ELEMENT_NODE) return [];

    const tag = node.tagName.toUpperCase();
    if (tag === 'BR') return [{ type: 'hardBreak' }];
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(tag)) return [];

    let nextMarks = marks;
    if (tag === 'STRONG' || tag === 'B') nextMarks = addMark(nextMarks, { type: 'strong' });
    if (tag === 'EM' || tag === 'I') nextMarks = addMark(nextMarks, { type: 'em' });
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') nextMarks = addMark(nextMarks, { type: 'strike' });
    if (tag === 'U') nextMarks = addMark(nextMarks, { type: 'underline' });
    if (tag === 'CODE') nextMarks = addMark(nextMarks, { type: 'code' });
    if (tag === 'SUB') nextMarks = addMark(nextMarks, { type: 'subsup', attrs: { type: 'sub' } });
    if (tag === 'SUP') nextMarks = addMark(nextMarks, { type: 'subsup', attrs: { type: 'sup' } });

    if (tag === 'A') {
      const href = safeHref(node.getAttribute('href'), ctx.baseUrl, ctx.warn);
      if (href) {
        nextMarks = addMark(nextMarks, {
          type: 'link',
          attrs: {
            href,
            ...(node.getAttribute('title') ? { title: node.getAttribute('title') } : {})
          }
        });
      }
    }

    if (tag === 'IMG') {
      const alt = node.getAttribute('alt') || node.getAttribute('src') || 'Image';
      ctx.warn.add('Images are exported as text placeholders. Jira attachment/media upload is not part of this version.');
      return [{ type: 'text', text: `[Image: ${alt}]`, marks: marks.length ? marks : undefined }];
    }

    if (tag === 'SVG') {
      ctx.warn.add('Inline SVG is exported as a text placeholder. Jira ADF does not embed arbitrary SVG directly.');
      return [{ type: 'text', text: '[SVG diagram omitted]', marks: marks.length ? marks : undefined }];
    }

    if (BLOCK_TAGS.has(tag) && !['SPAN','A'].includes(tag)) {
      return parseInlineChildren(node, ctx, nextMarks);
    }

    return parseInlineChildren(node, ctx, nextMarks);
  }

  function textContentAsInline(node, ctx) {
    const content = parseInlineChildren(node, ctx, []);
    return content.length ? content : [];
  }

  function panelTypeForElement(el) {
    const classes = new Set([...el.classList]);
    if (classes.has('w') || classes.has('warning') || classes.has('warn')) return 'warning';
    if (classes.has('g') || classes.has('success') || classes.has('ok')) return 'success';
    if (classes.has('error') || classes.has('danger')) return 'error';
    if (classes.has('k') || classes.has('info') || classes.has('key')) return 'info';
    return 'note';
  }

  function parseTable(table, ctx) {
    const rows = [];
    table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr')
      .forEach(rowEl => {
        const cells = [];
        [...rowEl.children].forEach(cellEl => {
          if (!['TH','TD'].includes(cellEl.tagName)) return;
          let blocks = [];
          [...cellEl.childNodes].forEach(child => {
            blocks.push(...parseBlockNode(child, ctx));
          });
          if (!blocks.length) {
            const inline = textContentAsInline(cellEl, ctx);
            blocks = [{ type: 'paragraph', content: inline }];
          }
          cells.push({
            type: cellEl.tagName === 'TH' ? 'tableHeader' : 'tableCell',
            colspan: Math.max(1, Number(cellEl.getAttribute('colspan') || 1)),
            rowspan: Math.max(1, Number(cellEl.getAttribute('rowspan') || 1)),
            content: blocks
          });
        });
        if (cells.length) rows.push({ type: 'tableRow', content: cells });
      });

    return rows.length ? { type: 'table', content: rows } : null;
  }

  function parseList(listEl, ctx, ordered) {
    const items = [];
    [...listEl.children].forEach(li => {
      if (li.tagName !== 'LI') return;
      const blocks = [];
      const inlineAccumulator = [];

      li.childNodes.forEach(child => {
        if (child.nodeType === 1 && ['UL','OL'].includes(child.tagName)) {
          if (inlineAccumulator.length) {
            blocks.push({ type: 'paragraph', content: cleanInlineList(inlineAccumulator.splice(0)) });
          }
          const nested = parseList(child, ctx, child.tagName === 'OL');
          if (nested) blocks.push(nested);
        } else if (child.nodeType === 1 && BLOCK_TAGS.has(child.tagName) && child.tagName !== 'SPAN') {
          if (inlineAccumulator.length) {
            blocks.push({ type: 'paragraph', content: cleanInlineList(inlineAccumulator.splice(0)) });
          }
          blocks.push(...parseBlockNode(child, ctx));
        } else {
          inlineAccumulator.push(...parseInlineNode(child, ctx, []));
        }
      });

      if (inlineAccumulator.length) {
        blocks.unshift({ type: 'paragraph', content: cleanInlineList(inlineAccumulator) });
      }
      if (!blocks.length) blocks.push({ type: 'paragraph', content: [] });
      items.push({ type: 'listItem', content: blocks });
    });

    if (!items.length) return null;
    return { type: ordered ? 'orderedList' : 'bulletList', content: items };
  }

  function parseGenericContainer(el, ctx) {
    const blocks = [];
    el.childNodes.forEach(child => blocks.push(...parseBlockNode(child, ctx)));
    return blocks;
  }

  function parseBlockNode(node, ctx) {
    const NodeCtor = node.ownerDocument?.defaultView?.Node || window.Node;

    if (node.nodeType === NodeCtor.TEXT_NODE) {
      const text = normalizeText(node.nodeValue).trim();
      return text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [];
    }
    if (node.nodeType !== NodeCtor.ELEMENT_NODE) return [];

    const el = node;
    const tag = el.tagName.toUpperCase();

    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE'].includes(tag)) return [];
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return [];

    if (/^H[1-6]$/.test(tag)) {
      return [{
        type: 'heading',
        level: Number(tag.slice(1)),
        content: textContentAsInline(el, ctx)
      }];
    }

    if (tag === 'P') {
      return [{ type: 'paragraph', content: textContentAsInline(el, ctx) }];
    }

    if (tag === 'PRE') {
      const code = el.textContent || '';
      return code ? [{ type: 'codeBlock', text: code }] : [];
    }

    if (tag === 'UL') {
      const list = parseList(el, ctx, false);
      return list ? [list] : [];
    }

    if (tag === 'OL') {
      const list = parseList(el, ctx, true);
      return list ? [list] : [];
    }

    if (tag === 'BLOCKQUOTE') {
      const content = parseGenericContainer(el, ctx);
      return [{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph', content: textContentAsInline(el, ctx) }] }];
    }

    if (tag === 'HR') return [{ type: 'rule' }];

    if (tag === 'TABLE') {
      const table = parseTable(el, ctx);
      return table ? [table] : [];
    }

    if (tag === 'IMG') {
      const alt = el.getAttribute('alt') || el.getAttribute('src') || 'Image';
      ctx.warn.add('Images are exported as text placeholders. Jira attachment/media upload is not part of this version.');
      return [{ type: 'paragraph', content: [{ type: 'text', text: `[Image: ${alt}]` }] }];
    }

    if (tag === 'SVG') {
      ctx.warn.add('Inline SVG is exported as a text placeholder. Jira ADF does not embed arbitrary SVG directly.');
      return [{ type: 'paragraph', content: [{ type: 'text', text: '[SVG diagram omitted]' }] }];
    }

    if (el.matches('.note, .callout, [data-hbe-object="panel"], [data-hbe-object="callout"]')) {
      const content = parseGenericContainer(el, ctx).filter(b => b.type !== 'panel');
      return [{
        type: 'panel',
        panelType: el.getAttribute('data-hbe-panel-type') || panelTypeForElement(el),
        content: content.length ? content : [{ type: 'paragraph', content: textContentAsInline(el, ctx) }]
      }];
    }

    if (tag === 'FIGURE') {
      ctx.warn.add('Complex figure layout is flattened to semantic content.');
      return parseGenericContainer(el, ctx);
    }

    if (['BUTTON','INPUT','SELECT','TEXTAREA'].includes(tag)) {
      ctx.warn.add('Interactive form controls are omitted from Jira export.');
      return [];
    }

    return parseGenericContainer(el, ctx);
  }

  function chooseContentRoot(doc) {
    return doc.querySelector('[data-hbe-export-root]') ||
      doc.querySelector('main') ||
      doc.querySelector('article') ||
      doc.body;
  }

  function fromHtml(html, options = {}) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ''), 'text/html');
    const warn = warningCollector();
    const ctx = {
      baseUrl: options.baseUrl || null,
      warn
    };

    const root = chooseContentRoot(doc);
    const content = root ? parseGenericContainer(root, ctx) : [];

    if (doc.querySelector('script')) {
      warn.add('This document contains JavaScript. Export should use the rendered DOM snapshot when available.');
    }
    if (doc.querySelector('svg')) {
      warn.add('One or more SVG diagrams were flattened to placeholders.');
    }

    return {
      type: 'doc',
      content,
      warnings: warn.warnings,
      meta: {
        title: doc.title || options.title || '',
        sourceKind: options.sourceKind || 'source'
      }
    };
  }

  window.SemanticDocument = {
    fromHtml
  };
})();