(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const FRAME_IDS = {
    single: 'singleFrame',
    left: 'leftFrame',
    right: 'rightFrame',
    codePreview: 'codePreviewFrame'
  };
  const BADGE_CLASSES = ['dom', 'js', 'canvas', 'fallback', 'unavailable', 'scripts-off'];
  const SLOT_MODES = new Map();
  const SLOT_RECORDS = new Map();
  const BADGE_STATES = {
    dom: {
      label: 'DOM',
      className: 'dom',
      title: 'Static DOM Preview. HTML Edit and Inspector are available.'
    },
    js: {
      label: 'JS',
      className: 'js',
      title: 'Script-driven Interactive Preview. Click Edit to switch this View to scripts-off DOM Edit.'
    },
    canvas: {
      label: 'Canvas',
      className: 'canvas',
      title: 'Experimental read-only HTML-in-Canvas Preview is active.'
    },
    fallback: {
      label: 'Fallback',
      className: 'fallback',
      title: 'Canvas Preview was requested, but Leaf is using DOM Preview for this Page.'
    },
    unavailable: {
      label: 'Unavailable',
      className: 'unavailable',
      title: 'HTML-in-Canvas is not available in this Electron/Chromium build.'
    },
    'scripts-off': {
      label: 'Scripts off',
      className: 'scripts-off',
      title: 'JavaScript is disabled while DOM Edit is active. Turn Edit off to return to Interactive Preview.'
    }
  };

  const runtime = {
    enabled: false,
    supported: false,
    drawMethod: '',
    state: 'dom',
    blinkFeature: 'CanvasDrawElement',
    lastReason: 'experiment-off'
  };
  let refreshScheduled = false;
  let installed = false;

  function injectStyle() {
    if (document.getElementById('leaf-html-canvas-capability-style')) return;
    const style = document.createElement('style');
    style.id = 'leaf-html-canvas-capability-style';
    style.textContent = `
      .preview-runtime-badge.dom{
        color:var(--success);border-color:color-mix(in srgb,var(--success) 35%,var(--border));
        background:color-mix(in srgb,var(--success) 8%,var(--panel-secondary));
      }
      .preview-runtime-badge.js{
        color:var(--warning);border-color:color-mix(in srgb,var(--warning) 35%,var(--border));
        background:color-mix(in srgb,var(--warning) 8%,var(--panel-secondary));
      }
      .preview-runtime-badge.scripts-off{
        color:var(--focus-ring);border-color:color-mix(in srgb,var(--focus-ring) 38%,var(--border));
        background:color-mix(in srgb,var(--focus-ring) 9%,var(--panel-secondary));
      }
      .preview-runtime-badge.canvas{
        color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--border));
        background:color-mix(in srgb,var(--accent) 10%,var(--panel-secondary));
      }
      .preview-runtime-badge.fallback{
        color:var(--warning);border-color:color-mix(in srgb,var(--warning) 42%,var(--border));
        background:color-mix(in srgb,var(--warning) 10%,var(--panel-secondary));
      }
      .preview-runtime-badge.unavailable{
        color:var(--error);border-color:color-mix(in srgb,var(--error) 42%,var(--border));
        background:color-mix(in srgb,var(--error) 8%,var(--panel-secondary));
      }
      .leaf-html-canvas-layer{
        position:absolute;inset:0;z-index:3;width:100%;height:100%;display:block;
        background:#fff;pointer-events:auto;opacity:0;transition:opacity 120ms ease;
      }
      .leaf-html-canvas-layer.is-active{opacity:1}
      .leaf-canvas-compare-tools{display:inline-flex;align-items:center;gap:4px;margin-left:4px}
      .leaf-canvas-compare-tools button{height:22px;padding:0 6px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--muted);font-size:10px}
      .leaf-canvas-compare-tools button.active{background:var(--selected);color:var(--foreground);border-color:var(--focus-ring)}
      .leaf-canvas-mismatch{height:20px;display:inline-flex;align-items:center;padding:0 6px;border:1px solid var(--border);border-radius:4px;color:var(--muted);font-size:10px}
      .leaf-canvas-mismatch.has-warning{color:var(--warning);border-color:color-mix(in srgb,var(--warning) 38%,var(--border))}
    `;
    document.head.appendChild(style);
  }

  function setTextIfChanged(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function setTitleIfChanged(element, title) {
    if (element && element.title !== title) element.title = title;
  }

  function setDatasetIfChanged(element, key, value) {
    if (element && element.dataset[key] !== value) element.dataset[key] = value;
  }

  function setHiddenIfChanged(element, hidden) {
    if (element && element.hidden !== hidden) element.hidden = hidden;
  }

  function setDocumentDatasetIfChanged(key, value) {
    if (document.documentElement.dataset[key] !== value) document.documentElement.dataset[key] = value;
  }

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
    return document.getElementById(FRAME_IDS[slot]);
  }

  function surfaceForSlot(slot) {
    return document.querySelector(`[data-preview-surface="${slot}"]`);
  }

  function pageHasScripts(page) {
    return !!page && page.documentType === 'html' && /<script\b[^>]*>/i.test(page.source || '');
  }

  function canDomEdit(page) {
    return !!page && page.documentType === 'html' && !page.isEmpty && !!String(page.source || '').trim();
  }

  function isEditingSlot(slot) {
    const frame = frameForSlot(slot);
    const button = document.querySelector(`[data-edit-slot="${slot}"]`);
    return frame?.dataset.previewRuntime === 'static-editable-scripts-off' ||
      !!button && (button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true');
  }

  function shouldRunScripts(page, slot) {
    return pageHasScripts(page) && !isEditingSlot(slot);
  }

  function detectHtmlInCanvasSupport() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (typeof ctx?.drawElementImage === 'function') return { supported: true, method: 'drawElementImage', reason: 'ready' };
      return { supported: false, method: '', reason: 'unsupported-api' };
    } catch (error) {
      return { supported: false, method: '', reason: error?.name || 'unsupported-api' };
    }
  }

  async function refreshRuntimeConfig() {
    try {
      const config = await window.electronAPI?.runtimeConfig?.();
      const htmlCanvas = config?.htmlCanvas || {};
      runtime.enabled = htmlCanvas.enabled === true;
      runtime.blinkFeature = htmlCanvas.blinkFeature || runtime.blinkFeature;
    } catch {
      runtime.enabled = false;
    }
    const detected = detectHtmlInCanvasSupport();
    runtime.supported = detected.supported;
    runtime.drawMethod = detected.method;
    runtime.lastReason = runtime.enabled ? detected.reason : 'experiment-off';
    runtime.state = runtime.enabled ? (runtime.supported ? 'canvas' : 'unavailable') : 'dom';
    window.LeafHtmlCanvasCapability = {
      ...runtime,
      detectHtmlInCanvasSupport,
      pageHasScripts,
      shouldRunScripts,
      canDomEdit
    };
    setDocumentDatasetIfChanged('htmlCanvasExperiment', runtime.enabled ? 'on' : 'off');
    setDocumentDatasetIfChanged('htmlCanvasSupport', runtime.supported ? 'supported' : 'unsupported');
  }

  function slotMode(slot) {
    return SLOT_MODES.get(slot) || 'auto';
  }

  function setSlotMode(slot, mode) {
    if (!FRAME_IDS[slot]) return;
    SLOT_MODES.set(slot, ['auto', 'dom', 'canvas'].includes(mode) ? mode : 'auto');
    document.querySelectorAll(`[data-canvas-slot="${slot}"]`).forEach(button => {
      button.classList.toggle('active', button.dataset.canvasMode === slotMode(slot));
    });
    scheduleRefresh();
  }

  function ensureCanvasLayer(slot) {
    const surface = surfaceForSlot(slot);
    if (!surface) return null;
    if (getComputedStyle(surface).position === 'static') surface.style.position = 'relative';
    let canvas = surface.querySelector(':scope > canvas[data-leaf-html-canvas-runtime]');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'leaf-html-canvas-layer';
      canvas.dataset.leafHtmlCanvasRuntime = '1';
      canvas.dataset.leafHtmlCanvasSlot = slot;
      canvas.setAttribute('aria-label', 'Read-only HTML-in-Canvas preview');
      surface.appendChild(canvas);
    }
    return canvas;
  }

  function readSlotZoom(slot) {
    const input = document.querySelector(`[data-preview-zoom="${slot}"]`);
    const value = Number(String(input?.value || '100').replace('%', ''));
    return Number.isFinite(value) && value > 0 ? value / 100 : 1;
  }

  function setRuntimeBadge(slot, state, reason = '') {
    const badge = document.querySelector(`[data-runtime-badge="${slot}"]`);
    const config = BADGE_STATES[state];
    if (!badge || !config) return;
    setHiddenIfChanged(badge, false);
    setTextIfChanged(badge, config.label);
    setTitleIfChanged(badge, reason ? `${config.title} Reason: ${reason}.` : config.title);
    setDatasetIfChanged(badge, 'runtimeState', state);
    setDatasetIfChanged(badge, 'canvasFallbackReason', reason || '');
    BADGE_CLASSES.forEach(name => badge.classList.toggle(name, name === config.className));
  }

  function resetFrameFallback(slot, reason = '') {
    const frame = frameForSlot(slot);
    const canvas = ensureCanvasLayer(slot);
    if (canvas) {
      canvas.classList.remove('is-active');
      canvas.hidden = true;
      canvas.dataset.canvasFallbackReason = reason;
    }
    if (frame) {
      frame.style.opacity = '';
      if (reason) frame.dataset.canvasFallbackReason = reason;
    }
  }

  function fallbackSlot(slot, reason) {
    const frame = frameForSlot(slot);
    resetFrameFallback(slot, reason);
    if (frame && slotMode(slot) === 'canvas') frame.dataset.previewRuntime = 'canvas-fallback';
    SLOT_RECORDS.set(slot, {
      slot,
      state: runtime.enabled ? 'fallback' : 'dom',
      reason,
      firstPaint: false,
      at: Date.now()
    });
    if (runtime.enabled && slotMode(slot) === 'canvas') setRuntimeBadge(slot, runtime.supported ? 'fallback' : 'unavailable', reason);
    else refreshRuntimeBadges();
    return SLOT_RECORDS.get(slot);
  }

  async function invokeDrawElement(ctx, root) {
    const draw = ctx[runtime.drawMethod];
    if (typeof draw !== 'function') throw new Error('unsupported-api');
    try {
      return await draw.call(ctx, root, 0, 0);
    } catch (firstError) {
      try {
        return await draw.call(ctx, root);
      } catch {
        throw firstError;
      }
    }
  }

  async function paintSlot(slot) {
    const mode = slotMode(slot);
    const page = pageForSlot(slot);
    const frame = frameForSlot(slot);
    if (!frame || !canDomEdit(page)) return fallbackSlot(slot, 'no-page');
    if (mode === 'dom') {
      resetFrameFallback(slot, 'dom-mode');
      setRuntimeBadge(slot, shouldRunScripts(page, slot) ? 'js' : 'dom');
      return fallbackSlot(slot, 'dom-mode');
    }
    if (mode === 'auto' && (!runtime.enabled || pageHasScripts(page))) return fallbackSlot(slot, runtime.enabled ? 'scripted-page' : 'experiment-off');
    if (!runtime.enabled) return fallbackSlot(slot, 'experiment-off');
    if (!runtime.supported) return fallbackSlot(slot, 'unsupported-api');
    if (isEditingSlot(slot)) return fallbackSlot(slot, 'edit-active');
    if (frame.dataset.previewRuntime === 'static-editable-scripts-off') return fallbackSlot(slot, 'edit-active');

    const doc = frame.contentDocument;
    const root = doc?.documentElement;
    if (!root || !doc.body) return fallbackSlot(slot, 'protected-content');

    const canvas = ensureCanvasLayer(slot);
    if (!canvas) return fallbackSlot(slot, 'protected-content');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
    const zoom = readSlotZoom(slot);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallbackSlot(slot, 'readback-restricted');
    try {
      ctx.save();
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await invokeDrawElement(ctx, root);
      ctx.restore();
      const record = {
        slot,
        state: 'canvas',
        reason: 'painted',
        method: runtime.drawMethod,
        firstPaint: true,
        width: canvas.width,
        height: canvas.height,
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        zoom,
        dpr,
        scrollX: frame.contentWindow?.scrollX || 0,
        scrollY: frame.contentWindow?.scrollY || 0,
        searchHighlights: countSearchHighlights(doc),
        at: Date.now()
      };
      SLOT_RECORDS.set(slot, record);
      canvas.hidden = false;
      canvas.classList.add('is-active');
      canvas.dataset.canvasFallbackReason = '';
      frame.style.opacity = '0';
      frame.dataset.previewRuntime = 'canvas-preview';
      frame.dataset.canvasFallbackReason = '';
      setRuntimeBadge(slot, 'canvas', 'painted');
      validateCompareAlignment();
      return record;
    } catch (error) {
      try { ctx.restore(); } catch {}
      return fallbackSlot(slot, error?.name === 'SecurityError' ? 'readback-restricted' : 'paint-failure');
    }
  }

  function countSearchHighlights(doc) {
    try {
      return doc.querySelectorAll('mark,[data-leaf-search-highlight]').length;
    } catch {
      return 0;
    }
  }

  function badgeStateForSlot(slot) {
    const page = pageForSlot(slot);
    const frame = frameForSlot(slot);
    if (!frame || !canDomEdit(page)) return null;

    const previewRuntime = frame.dataset.previewRuntime || '';
    if (previewRuntime === 'static-editable-scripts-off') return 'scripts-off';
    if (previewRuntime === 'canvas-preview') return 'canvas';
    if (previewRuntime === 'canvas-fallback') return 'fallback';
    if (!runtime.enabled) return null;
    if (previewRuntime === 'interactive-isolated' || shouldRunScripts(page, slot)) return 'js';
    if (!runtime.supported) return 'unavailable';
    return 'dom';
  }

  function refreshRuntimeBadges() {
    Object.keys(FRAME_IDS).forEach(slot => {
      const state = badgeStateForSlot(slot);
      if (state) setRuntimeBadge(slot, state, SLOT_RECORDS.get(slot)?.reason || '');
    });
  }

  function refreshCanvasLabCapability() {
    const status = document.getElementById('canvasLabStatus');
    const apiBadge = document.getElementById('canvasLabApiBadge');
    const apiName = document.getElementById('canvasLabApiName');
    const statusText = runtime.enabled
      ? (runtime.supported ? 'HTML-in-Canvas Ready' : 'HTML-in-Canvas Unavailable')
      : 'HTML-in-Canvas gated off';
    const badgeText = runtime.enabled
      ? (runtime.supported ? 'Canvas' : 'Unavailable')
      : 'DOM';
    const statusTitle = runtime.enabled
      ? `Blink feature: ${runtime.blinkFeature}`
      : 'Set LEAF_ENABLE_HTML_CANVAS=1 before launching Leaf to enable the Chromium feature gate.';

    setTextIfChanged(status, statusText);
    setDatasetIfChanged(status, 'htmlCanvasState', runtime.state);
    setTitleIfChanged(status, statusTitle);
    setTextIfChanged(apiBadge, badgeText);
    setDatasetIfChanged(apiBadge, 'htmlCanvasState', runtime.state);
    setTextIfChanged(apiName, badgeText);
  }

  function validateSlotAlignment(slot) {
    const frame = frameForSlot(slot);
    const canvas = ensureCanvasLayer(slot);
    const record = SLOT_RECORDS.get(slot) || {};
    if (!frame || !canvas) return { slot, ok: false, reason: 'missing-slot' };
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const zoom = readSlotZoom(slot);
    const dpr = window.devicePixelRatio || 1;
    const mismatches = [];
    if (Math.abs(frameRect.width - canvasRect.width) > 1) mismatches.push('responsive-size');
    if (Math.abs(frameRect.height - canvasRect.height) > 1) mismatches.push('responsive-size');
    if (record.zoom && Math.abs(record.zoom - zoom) > 0.01) mismatches.push('zoom');
    if (record.dpr && Math.abs(record.dpr - dpr) > 0.25) mismatches.push('dpr');
    return {
      slot,
      ok: mismatches.length === 0,
      mismatches,
      zoom,
      dpr,
      scrollX: frame.contentWindow?.scrollX || 0,
      scrollY: frame.contentWindow?.scrollY || 0,
      searchHighlights: record.searchHighlights || 0
    };
  }

  function validateCompareAlignment() {
    const left = validateSlotAlignment('left');
    const right = validateSlotAlignment('right');
    const host = document.getElementById('leafCanvasCompareMismatch');
    if (!host) return { left, right };
    const mismatches = [...(left.mismatches || []), ...(right.mismatches || [])];
    host.textContent = mismatches.length ? `Mismatch: ${[...new Set(mismatches)].join(', ')}` : 'DOM/Canvas aligned';
    host.classList.toggle('has-warning', mismatches.length > 0);
    host.title = `Zoom L/R ${left.zoom}/${right.zoom}, DPR L/R ${left.dpr}/${right.dpr}, scroll L/R ${left.scrollY}/${right.scrollY}`;
    return { left, right };
  }

  function bindCompareSamePage() {
    const leftFrame = frameForSlot('left');
    const rightFrame = frameForSlot('right');
    const leftPage = pageForSlot('left');
    if (!leftFrame || !rightFrame || !leftPage) return;
    rightFrame.srcdoc = leftFrame.srcdoc || leftPage.source || '';
    rightFrame.dataset.canvasAbSourcePage = leftPage.id;
    document.documentElement.dataset.canvasCompareMode = 'dom-vs-canvas';
    setSlotMode('left', 'dom');
    setSlotMode('right', 'canvas');
    setRuntimeBadge('left', 'dom', 'a-b-reference');
    paintSlot('right');
  }

  function installCompareControls() {
    const split = document.getElementById('splitView');
    if (!split || document.getElementById('leafCanvasCompareTools')) return;
    const head = split.querySelector('[data-view-slot="right"] .view-pane-head .spacer');
    if (!head) return;
    const tools = document.createElement('span');
    tools.id = 'leafCanvasCompareTools';
    tools.className = 'leaf-canvas-compare-tools';
    tools.innerHTML = `
      <button type="button" data-canvas-ab-bind="same-page" title="Bind Compare to the same Page as DOM-vs-Canvas">A/B</button>
      <button type="button" data-canvas-slot="left" data-canvas-mode="dom" class="active">DOM L</button>
      <button type="button" data-canvas-slot="right" data-canvas-mode="canvas">Canvas R</button>
      <span class="leaf-canvas-mismatch" id="leafCanvasCompareMismatch">DOM/Canvas</span>
    `;
    head.before(tools);
    tools.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.canvasAbBind === 'same-page') bindCompareSamePage();
      if (button.dataset.canvasSlot) setSlotMode(button.dataset.canvasSlot, button.dataset.canvasMode);
    });
  }

  async function renderToCanvasFromHtml({ canvas, html, baseUrl = '', zoom = 1 }) {
    if (!canvas) throw new Error('missing-canvas');
    const detected = detectHtmlInCanvasSupport();
    if (!runtime.enabled || !detected.supported) throw new Error('unsupported-api');
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.sandbox = 'allow-same-origin';
    frame.srcdoc = baseUrl ? String(html || '').replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}">`) : String(html || '');
    document.body.appendChild(frame);
    await new Promise(resolve => { frame.onload = resolve; setTimeout(resolve, 500); });
    try {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
      await invokeDrawElement(ctx, frame.contentDocument.documentElement);
      return { state: 'canvas', method: runtime.drawMethod, width: canvas.width, height: canvas.height, zoom, dpr };
    } finally {
      frame.remove();
    }
  }

  function refresh() {
    const detected = detectHtmlInCanvasSupport();
    runtime.supported = detected.supported;
    runtime.drawMethod = detected.method;
    runtime.lastReason = runtime.enabled ? detected.reason : 'experiment-off';
    runtime.state = runtime.enabled ? (runtime.supported ? 'canvas' : 'unavailable') : 'dom';
    if (window.LeafHtmlCanvasCapability) {
      Object.assign(window.LeafHtmlCanvasCapability, runtime);
    }
    setDocumentDatasetIfChanged('htmlCanvasSupport', runtime.supported ? 'supported' : 'unsupported');
    installCompareControls();
    Object.keys(FRAME_IDS).forEach(slot => paintSlot(slot));
    refreshRuntimeBadges();
    refreshCanvasLabCapability();
  }

  function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refresh();
    });
  }

  function installRuntimeApi() {
    window.LeafHtmlCanvasRuntime = {
      runtime,
      detectHtmlInCanvasSupport,
      paintSlot,
      fallbackSlot,
      validateSlotAlignment,
      validateCompareAlignment,
      renderToCanvasFromHtml,
      setSlotMode,
      slotMode,
      records: SLOT_RECORDS,
      bindCompareSamePage
    };
  }

  function install() {
    if (installed) return;
    installed = true;
    injectStyle();
    installRuntimeApi();
    refreshRuntimeConfig().then(scheduleRefresh);
    new MutationObserver(scheduleRefresh).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-preview-runtime', 'class', 'aria-pressed', 'hidden', 'srcdoc']
    });
    Object.keys(FRAME_IDS).forEach(slot => {
      frameForSlot(slot)?.addEventListener('load', scheduleRefresh);
    });
    window.addEventListener('resize', scheduleRefresh, { passive: true });
    setInterval(scheduleRefresh, 1000);
  }

  function isLeafReady() {
    return document.documentElement.dataset.leafReady === 'true';
  }

  function waitForLeafReady() {
    if (document.body && isLeafReady()) {
      install();
      return;
    }
    setTimeout(waitForLeafReady, 50);
  }

  waitForLeafReady();
})();
