(() => {
  'use strict';

  const SLOT_CONFIG = {
    single: {
      pane: '#singleView',
      select: '#singlePageName',
      frame: '#singleFrame'
    },
    left: {
      pane: '#splitView [data-view-slot="left"]',
      select: '#leftPageSelect',
      frame: '#leftFrame'
    },
    right: {
      pane: '#splitView [data-view-slot="right"]',
      select: '#rightPageSelect',
      frame: '#rightFrame'
    },
    codePreview: {
      pane: '#codeView [data-view-slot="code-preview"]',
      select: '#codePreviewSelect',
      frame: '#codePreviewFrame'
    },
    codePage: {
      pane: '#codeView .code-editor-pane',
      select: '#codePageSelect',
      frame: null
    }
  };

  const FRAME_SLOT = new WeakMap();
  const boundFrameDocuments = new WeakSet();

  const $ = selector => document.querySelector(selector);

  function configForSlot(slot) {
    return SLOT_CONFIG[slot] || null;
  }

  function paneForSlot(slot) {
    const config = configForSlot(slot);
    return config ? $(config.pane) : null;
  }

  function selectForSlot(slot) {
    const config = configForSlot(slot);
    return config ? $(config.select) : null;
  }

  function frameForSlot(slot) {
    const config = configForSlot(slot);
    return config?.frame ? $(config.frame) : null;
  }

  function activeMode() {
    return $('#viewSeg button.active[data-mode]')?.dataset.mode || 'preview';
  }

  function slotFromActiveOutline() {
    if ($('#splitView [data-view-slot="right"]')?.classList.contains('active-view')) return 'right';
    if ($('#splitView [data-view-slot="left"]')?.classList.contains('active-view')) return 'left';
    if ($('#codeView .code-editor-pane')?.classList.contains('active-view')) return 'codePage';
    if ($('#codeView [data-view-slot="code-preview"]')?.classList.contains('active-view')) return 'codePreview';
    return 'single';
  }

  function currentActiveSlot() {
    const mode = activeMode();
    if (mode === 'split') {
      return $('#splitView [data-view-slot="right"]')?.classList.contains('active-view') ? 'right' : 'left';
    }
    if (mode === 'code') {
      return $('#codeView .code-editor-pane')?.classList.contains('active-view') ? 'codePage' : 'codePreview';
    }
    return mode === 'preview' ? 'single' : slotFromActiveOutline();
  }

  function pageIdForSlot(slot) {
    const select = selectForSlot(slot);
    if (select?.value) return select.value;
    const frame = frameForSlot(slot);
    return frame?.dataset?.snapshotPageId || frame?.dataset?.directSourcePageId || '';
  }

  function dispatchPaneActivation(slot, reason = 'pointer') {
    const pane = paneForSlot(slot);
    if (!pane) return false;
    let event;
    try {
      event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'mouse',
        isPrimary: true
      });
    } catch {
      event = new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true
      });
    }
    // In-iframe input never reaches the parent document, so this synthesized
    // pointerdown is the renderer's only signal. It must still say what caused
    // it: focus-driven activation is not a click, and treating it as one ends
    // an inline text edit the instant focus enters the element.
    event.leafActivationReason = reason;
    pane.dispatchEvent(event);
    return true;
  }

  function syncPreviewToActivePage() {
    const activeSlot = currentActiveSlot();
    const activePageId = pageIdForSlot(activeSlot);
    const singleSelect = selectForSlot('single');
    if (!activePageId || !singleSelect) return false;
    if (![...singleSelect.options].some(option => option.value === activePageId)) return false;
    if (singleSelect.value === activePageId) return true;
    singleSelect.value = activePageId;
    singleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function handleModeGesture(event) {
    const button = event.target?.closest?.('#viewSeg button[data-mode="preview"]');
    if (!button) return;
    syncPreviewToActivePage();
  }

  function bindPreviewModePolicy() {
    const viewSeg = $('#viewSeg');
    if (!viewSeg || viewSeg.dataset.leafPreviewActivePolicy === 'true') return;
    viewSeg.dataset.leafPreviewActivePolicy = 'true';
    viewSeg.addEventListener('pointerdown', handleModeGesture, true);
    viewSeg.addEventListener('click', handleModeGesture, true);
  }

  // A keydown raised inside a preview document never reaches the parent, so the
  // moment focus enters a View - which is most of the time while editing - the
  // app's own Undo/Redo shortcuts stop firing. Forward just those back out.
  //
  // Typing inside an editable element is left alone: there the browser's native
  // undo is what the user means, and the app records a text edit as a single
  // history entry when it commits rather than one per keystroke.
  function isHistoryShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
    const key = String(event.key || '').toLowerCase();
    return key === 'z' || key === 'y';
  }

  function forwardHistoryShortcut(event) {
    if (!isHistoryShortcut(event)) return;
    let target = event.target;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return;
    event.preventDefault();
    event.stopPropagation();
    let forwarded;
    try {
      forwarded = new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        bubbles: true,
        cancelable: true
      });
    } catch {
      return;
    }
    document.dispatchEvent(forwarded);
  }

  function bindFrameDocument(frame, slot) {
    if (!frame || !slot) return false;
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return false;
    }
    if (!doc || boundFrameDocuments.has(doc)) return false;
    boundFrameDocuments.add(doc);
    doc.addEventListener('pointerdown', () => dispatchPaneActivation(slot, 'pointer'), true);
    doc.addEventListener('focusin', () => dispatchPaneActivation(slot, 'focus'), true);
    doc.addEventListener('keydown', forwardHistoryShortcut, true);
    return true;
  }

  function bindFrame(slot) {
    const frame = frameForSlot(slot);
    if (!frame || frame.dataset.leafActivePolicyFrame === 'true') {
      if (frame) bindFrameDocument(frame, slot);
      return;
    }
    frame.dataset.leafActivePolicyFrame = 'true';
    FRAME_SLOT.set(frame, slot);
    frame.addEventListener('load', () => {
      setTimeout(() => bindFrameDocument(frame, slot), 0);
      setTimeout(() => bindFrameDocument(frame, slot), 80);
    });
    frame.addEventListener('focus', () => dispatchPaneActivation(slot, 'focus'), true);
    bindFrameDocument(frame, slot);
  }

  function syncFocusedFrameActivation() {
    const active = document.activeElement;
    if (!active || active.tagName !== 'IFRAME') return;
    const slot = FRAME_SLOT.get(active) || Object.keys(SLOT_CONFIG).find(key => frameForSlot(key) === active);
    if (slot) dispatchPaneActivation(slot, 'focus');
  }

  function bindFrameActivationPolicy() {
    ['single', 'left', 'right', 'codePreview'].forEach(bindFrame);
    if (document.body.dataset.leafFrameFocusPolicy === 'true') return;
    document.body.dataset.leafFrameFocusPolicy = 'true';
    window.addEventListener('blur', () => setTimeout(syncFocusedFrameActivation, 0), true);
    document.addEventListener('focusin', syncFocusedFrameActivation, true);
  }

  function syncPreviewLabel() {
    const button = $('#viewSeg button[data-mode="preview"]');
    if (!button || button.dataset.leafPreviewPolicyTitle === 'true') return;
    button.dataset.leafPreviewPolicyTitle = 'true';
    button.title = 'Preview follows the currently active document';
  }

  function install() {
    bindPreviewModePolicy();
    bindFrameActivationPolicy();
    syncPreviewLabel();
  }

  function handleFrameRendered(event) {
    const slot = event.detail?.slot;
    if (slot && configForSlot(slot)?.frame) bindFrame(slot);
  }

  document.addEventListener('leaf-renderer-ready', install);
  document.addEventListener('leaf-frame-rendered', handleFrameRendered);

  if (document.documentElement.dataset.leafReady === 'true') {
    install();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
