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
      title: 'Experimental HTML-in-Canvas capability is available after renderer feature detection.'
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
    state: 'dom',
    blinkFeature: 'CanvasDrawElement'
  };
  let refreshScheduled = false;

  function injectBadgeStyle() {
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

  function pageHasScripts(page) {
    return !!page && page.documentType === 'html' && /<script\b[^>]*>/i.test(page.source || '');
  }

  function canDomEdit(page) {
    return !!page && page.documentType === 'html' && !page.isEmpty && !!String(page.source || '').trim();
  }

  function isEditingSlot(slot) {
    const button = document.querySelector(`[data-edit-slot="${slot}"]`);
    return !!button && (button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true');
  }

  function shouldRunScripts(page, slot) {
    return pageHasScripts(page) && !isEditingSlot(slot);
  }

  function detectHtmlInCanvasSupport() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      return typeof ctx?.drawElementImage === 'function';
    } catch {
      return false;
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
    runtime.supported = detectHtmlInCanvasSupport();
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

  function badgeStateForSlot(slot) {
    const page = pageForSlot(slot);
    const frame = frameForSlot(slot);
    if (!frame || !canDomEdit(page)) return null;

    const previewRuntime = frame.dataset.previewRuntime || '';
    if (previewRuntime === 'static-editable-scripts-off') return 'scripts-off';
    if (!runtime.enabled) return null;
    if (previewRuntime === 'canvas-preview') return runtime.supported ? 'canvas' : 'fallback';
    if (previewRuntime === 'canvas-fallback') return 'fallback';
    if (previewRuntime === 'interactive-isolated' || shouldRunScripts(page, slot)) return 'js';
    if (!runtime.supported) return 'unavailable';
    return 'dom';
  }

  function syncBadgeClass(badge, className) {
    const needsClassUpdate = !badge.classList.contains(className) ||
      BADGE_CLASSES.some(name => name !== className && badge.classList.contains(name));
    if (!needsClassUpdate) return;
    BADGE_CLASSES.forEach(name => badge.classList.remove(name));
    badge.classList.add(className);
  }

  function setBadge(slot, state) {
    const badge = document.querySelector(`[data-runtime-badge="${slot}"]`);
    const config = BADGE_STATES[state];
    if (!badge || !config) return;
    setHiddenIfChanged(badge, false);
    setTextIfChanged(badge, config.label);
    setTitleIfChanged(badge, config.title);
    setDatasetIfChanged(badge, 'runtimeState', state);
    syncBadgeClass(badge, config.className);
  }

  function refreshRuntimeBadges() {
    Object.keys(FRAME_IDS).forEach(slot => {
      const state = badgeStateForSlot(slot);
      if (state) setBadge(slot, state);
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

  function refresh() {
    runtime.supported = detectHtmlInCanvasSupport();
    runtime.state = runtime.enabled ? (runtime.supported ? 'canvas' : 'unavailable') : 'dom';
    if (window.LeafHtmlCanvasCapability) {
      window.LeafHtmlCanvasCapability.enabled = runtime.enabled;
      window.LeafHtmlCanvasCapability.supported = runtime.supported;
      window.LeafHtmlCanvasCapability.state = runtime.state;
    }
    setDocumentDatasetIfChanged('htmlCanvasSupport', runtime.supported ? 'supported' : 'unsupported');
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

  function install() {
    injectBadgeStyle();
    refreshRuntimeConfig().then(scheduleRefresh);
    new MutationObserver(scheduleRefresh).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-preview-runtime', 'class', 'aria-pressed', 'hidden']
    });
    setInterval(scheduleRefresh, 1000);
  }

  function waitForLeafReady() {
    if (document.body) {
      install();
      return;
    }
    setTimeout(waitForLeafReady, 50);
  }

  waitForLeafReady();
})();