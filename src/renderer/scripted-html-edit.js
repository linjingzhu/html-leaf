(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const SLOTS = {
    single: 'singleFrame',
    left: 'leftFrame',
    right: 'rightFrame',
    codePreview: 'codePreviewFrame'
  };
  const BADGE_CLASSES = ['interactive', 'scripts-off', 'static', 'dom', 'js', 'canvas', 'fallback', 'unavailable'];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function pageById(state, pageId) {
    for (const document of state?.documents || []) {
      const page = (document.nodes || []).find(node => node.id === pageId && node.type === 'page');
      if (page) return page;
    }
    return null;
  }

  function pageForSlot(slot) {
    const state = readState();
    return pageById(state, state?.views?.[slot]);
  }

  function frameForSlot(slot) {
    return document.getElementById(SLOTS[slot]);
  }

  function hasRenderableContent(page) {
    return !!page && !page.isEmpty && !!String(page.source || '').trim();
  }

  function isScriptedHtmlPage(page) {
    return !!page && page.documentType === 'html' && /<script\b[^>]*>/i.test(page.source || '');
  }

  function runtimePreviewScrollbarCss() {
    return '*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(142,152,165,.42);border:2px solid transparent;border-radius:8px;background-clip:padding-box}*::-webkit-scrollbar-corner{background:transparent}';
  }

  function buildStaticEditSource(page) {
    const base = page.baseUrl ? `<base href="${esc(page.baseUrl)}">` : '';
    const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; img-src file: data: blob: https: http:; style-src \'unsafe-inline\' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; object-src \'none\'; frame-src \'none\';">';
    const chrome = `${base}${csp}<style data-editor-overlay="1" data-leaf-scrollbar-runtime="1">${runtimePreviewScrollbarCss()}</style>`;
    const source = String(page.source || '');
    if (/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${chrome}`);
    if (/<html[\s>]/i.test(source)) return source.replace(/<html([^>]*)>/i, `<html$1><head>${chrome}</head>`);
    return `<!doctype html><html><head>${chrome}</head><body>${source}</body></html>`;
  }

  function snapshotBridgeScript(token) {
    const safeToken = JSON.stringify(String(token || ''));
    return `<script data-hbe-export-bridge>
      (() => {
        const TOKEN = ${safeToken};
        const sendSnapshot = () => {
          try {
            parent.postMessage({
              __hbeRenderedSnapshot: true,
              token: TOKEN,
              html: document.documentElement.outerHTML,
              title: document.title || ''
            }, '*');
          } catch {}
        };
        const runSearch = (query, requestedIndex = 0) => {
          try {
            CSS.highlights?.delete('leaf-search-all');
            CSS.highlights?.delete('leaf-search-current');
            document.querySelector('[data-hbe-search-style]')?.remove();
            const ranges = [];
            const needle = String(query || '').toLocaleLowerCase();
            if (needle) {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                  const parent = node.parentElement;
                  return node.data && parent && !parent.closest('script,style,noscript,textarea,input,select') && node.data.toLocaleLowerCase().includes(needle)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT;
                }
              });
              let node;
              while ((node = walker.nextNode())) {
                const text = node.data.toLocaleLowerCase();
                let from = 0;
                while (from <= text.length - needle.length) {
                  const at = text.indexOf(needle, from);
                  if (at < 0) break;
                  const range = document.createRange();
                  range.setStart(node, at);
                  range.setEnd(node, at + query.length);
                  ranges.push(range);
                  from = at + Math.max(1, needle.length);
                }
              }
            }
            const index = ranges.length ? ((Number(requestedIndex) || 0) % ranges.length + ranges.length) % ranges.length : 0;
            if (ranges.length && CSS.highlights && window.Highlight) {
              const style = document.createElement('style');
              style.dataset.hbeSearchStyle = '1';
              style.textContent = '::highlight(leaf-search-all){background:#ffe36e;color:#172033}::highlight(leaf-search-current){background:#ff963d;color:#111827;text-decoration:underline 2px}';
              document.head.appendChild(style);
              CSS.highlights.set('leaf-search-all', new Highlight(...ranges));
              CSS.highlights.set('leaf-search-current', new Highlight(ranges[index]));
              ranges[index].startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
            parent.postMessage({ __leafViewSearchResult: true, token: TOKEN, count: ranges.length, index }, '*');
          } catch {
            parent.postMessage({ __leafViewSearchResult: true, token: TOKEN, count: 0, index: 0 }, '*');
          }
        };
        addEventListener('message', event => {
          if (event.data && event.data.__leafViewportChromeScale === true && event.data.token === TOKEN) {
            const style = document.querySelector('[data-leaf-scrollbar-runtime]');
            if (style && typeof event.data.css === 'string' && event.data.css.length < 1200) style.textContent = event.data.css;
            return;
          }
          if (event.data && event.data.__leafViewSearch === true && event.data.token === TOKEN) {
            runSearch(event.data.query, event.data.index);
            return;
          }
          if (event.data && event.data.__hbeSnapshotRequest === TOKEN) sendSnapshot();
        });
        addEventListener('pointerdown', () => {
          parent.postMessage({ __hbeViewportInput: true, token: TOKEN, kind: 'activate' }, '*');
        }, true);
        addEventListener('click', event => {
          const anchor = event.target && event.target.closest && event.target.closest('a[href]');
          const raw = anchor && String(anchor.getAttribute('href') || '').trim();
          if (!raw || raw[0] !== '#') return;
          event.preventDefault();
          event.stopPropagation();
          let fragment = '';
          try { fragment = decodeURIComponent(raw.slice(1)); } catch { fragment = raw.slice(1); }
          if (!fragment) {
            scrollTo({ top: 0, behavior: 'auto' });
            return;
          }
          const target = document.getElementById(fragment) || document.getElementsByName(fragment)[0];
          if (target) target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
        }, true);
        addEventListener('wheel', event => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          event.stopPropagation();
          parent.postMessage({
            __hbeViewportInput: true,
            token: TOKEN,
            kind: 'zoom',
            direction: event.deltaY < 0 ? 1 : -1,
            clientX: event.clientX,
            clientY: event.clientY
          }, '*');
        }, { capture: true, passive: false });
        if (document.readyState === 'loading') {
          addEventListener('DOMContentLoaded', () => {
            setTimeout(sendSnapshot, 0);
            setTimeout(sendSnapshot, 120);
          }, { once: true });
        } else {
          setTimeout(sendSnapshot, 0);
        }
        addEventListener('load', () => setTimeout(sendSnapshot, 0), { once: true });
      })();
    <\/script>`;
  }

  function buildInteractiveSource(page, token) {
    const base = page.baseUrl ? `<base href="${esc(page.baseUrl)}">` : '';
    const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; img-src file: data: blob: https: http:; style-src \'unsafe-inline\' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; connect-src \'none\'; object-src \'none\'; frame-src \'none\';">';
    const bridge = token ? snapshotBridgeScript(token) : '';
    const source = String(page.source || '');
    if (/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${base}${csp}${bridge}`);
    if (/<html[\s>]/i.test(source)) return source.replace(/<html([^>]*)>/i, `<html$1><head>${base}${csp}${bridge}</head>`);
    return `<!doctype html><html><head>${base}${csp}${bridge}</head><body>${source}</body></html>`;
  }

  function setRuntimeBadge(slot, state) {
    const badge = document.querySelector(`[data-runtime-badge="${slot}"]`);
    if (!badge) return;
    const states = {
      interactive: {
        text: 'Interactive',
        className: 'interactive',
        title: 'JavaScript runs in an isolated opaque-origin sandbox. Click Edit to switch this View to scripts-off DOM Edit.'
      },
      'scripts-off': {
        text: 'Scripts off',
        className: 'scripts-off',
        title: 'JavaScript is disabled while DOM Edit is active. Turn Edit off to return to Interactive Preview.'
      }
    };
    const config = states[state];
    badge.hidden = !config;
    badge.textContent = config?.text || '';
    badge.title = config?.title || '';
    badge.dataset.runtimeState = config ? state : '';
    BADGE_CLASSES.forEach(name => badge.classList.remove(name));
    if (config?.className) badge.classList.add(config.className);
  }

  function updateInspectorScriptsOffCopy(slot) {
    const button = document.querySelector(`[data-edit-slot="${slot}"]`);
    if (!button || !(button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true')) return;
    const body = document.getElementById('inspectorBody');
    if (!body) return;
    const empty = body.querySelector('.edit-mode-message,.empty-selection');
    if (!empty) return;
    empty.innerHTML = '<strong>Edit enabled</strong><span>JavaScript is disabled while editing. Hover or click an HTML object to inspect and modify the source DOM.</span>';
  }

  function enableStaticHtmlEdit(slot, page) {
    const frame = frameForSlot(slot);
    if (!frame || !isScriptedHtmlPage(page) || !hasRenderableContent(page)) return false;
    const pane = frame.closest('.view-pane');
    pane?.classList.remove('scripted-preview');
    pane?.classList.add('scripts-off-edit');
    setRuntimeBadge(slot, 'scripts-off');
    frame.dataset.previewRuntime = 'static-editable-scripts-off';
    frame.dataset.snapshotToken = '';
    frame.dataset.snapshotPageId = page.id;
    frame.dataset.leafScriptedHtmlEdit = 'static';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.removeAttribute('src');
    frame.srcdoc = buildStaticEditSource(page);
    setTimeout(() => updateInspectorScriptsOffCopy(slot), 80);
    return true;
  }

  function restoreInteractivePreview(slot, page) {
    const frame = frameForSlot(slot);
    if (!frame || !isScriptedHtmlPage(page) || frame.dataset.leafScriptedHtmlEdit !== 'static') return false;
    const pane = frame.closest('.view-pane');
    pane?.classList.add('scripted-preview');
    pane?.classList.remove('scripts-off-edit');
    setRuntimeBadge(slot, 'interactive');
    frame.dataset.previewRuntime = 'interactive-isolated';
    const token = `scripted-preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    frame.dataset.snapshotToken = token;
    frame.dataset.snapshotPageId = page.id;
    frame.dataset.leafScriptedHtmlEdit = '';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.removeAttribute('src');
    frame.srcdoc = buildInteractiveSource(page, token);
    return true;
  }

  function syncScriptedInspector(slot) {
    const frame = frameForSlot(slot);
    if (frame?.dataset.previewRuntime === 'static-editable-scripts-off') updateInspectorScriptsOffCopy(slot);
  }

  function handleEditRuntimeTransition(event) {
    const { enabled, slot, pageId } = event.detail || {};
    if (!slot) return;
    const page = pageForSlot(slot);
    if (!isScriptedHtmlPage(page) || (pageId && page.id !== pageId)) return;
    if (enabled) enableStaticHtmlEdit(slot, page);
    else restoreInteractivePreview(slot, page);
  }

  function install() {
    document.addEventListener('leaf-edit-runtime-transition', handleEditRuntimeTransition);
    Object.keys(SLOTS).forEach(slot => {
      frameForSlot(slot)?.addEventListener('load', () => setTimeout(() => syncScriptedInspector(slot), 0));
    });
  }

  function waitForLeafReady() {
    if (frameForSlot('single')) {
      install();
      return;
    }
    setTimeout(waitForLeafReady, 100);
  }

  waitForLeafReady();
})();
