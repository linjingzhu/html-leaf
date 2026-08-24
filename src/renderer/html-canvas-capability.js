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
    document.documentElement.dataset.htmlCanvasExperiment = runtime.enabled ? 'on' : 'off';
    document.documentElement.dataset.htmlCanvasSupport = runtime.supported ? 'supported' : 'unsupported';
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

  function setBadge(slot, state) {
    const badge = document.querySelector(`[data-runtime-badge="${slot}"]`);
    const config = BADGE_STATES[state];
    if (!badge || !config) return;
    badge.hidden = false;
    badge.textContent = config.label;
    badge.title = config.title;
    badge.dataset.runtimeState = state;
    BADGE_CLASSES.forEach(name => badge.classList.remove(name));
    badge.classList.add(config.className);
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
    if (status) {
      status.textContent = runtime.enabled
        ? (runtime.supported ? 'HTML-in-Canvas Ready' : 'HTML-in-Canvas Unavailable')
        : 'HTML-in-Canvas gated off';
      status.dataset.htmlCanvasState = runtime.state;
      status.title = runtime.enabled
        ? `Blink feature: ${runtime.blinkFeature}`
        : 'Set LEAF_ENABLE_HTML_CANVAS=1 before launching Leaf to enable the Chromium feature gate.';
    }
    if (apiBadge) {
      apiBadge.textContent = runtime.enabled
        ? (runtime.supported ? 'Canvas' : 'Unavailable')
        : 'DOM';
      apiBadge.dataset.htmlCanvasState = runtime.state;
    }
    if (apiName) {
      apiName.textContent = runtime.enabled
        ? (runtime.supported ? 'Canvas' : 'Unavailable')
        : 'DOM';
    }
  }

  function refresh() {
    runtime.supported = detectHtmlInCanvasSupport();
    runtime.state = runtime.enabled ? (runtime.supported ? 'canvas' : 'unavailable') : 'dom';
    if (window.LeafHtmlCanvasCapability) {
      window.LeafHtmlCanvasCapability.enabled = runtime.enabled;
      window.LeafHtmlCanvasCapability.supported = runtime.supported;
      window.LeafHtmlCanvasCapability.state = runtime.state;
    }
    document.documentElement.dataset.htmlCanvasSupport = runtime.supported ? 'supported' : 'unsupported';
    refreshRuntimeBadges();
    refreshCanvasLabCapability();
  }

  function install() {
    refreshRuntimeConfig().then(refresh);
    new MutationObserver(refresh).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-preview-runtime', 'class', 'aria-pressed', 'hidden']
    });
    setInterval(refresh, 1000);
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
