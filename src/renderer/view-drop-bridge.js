(() => {
  'use strict';

  const PAGE_MIME = 'application/x-leaf-page-id';
  const TREE_MIME = 'application/x-hbe-tree-node';
  const ROUTING_CLASS = 'leaf-view-drop-routing';
  const OVER_CLASS = 'leaf-view-drag-over';

  const targets = [
    { slot: 'single', pane: '#singleView', select: '#singlePageName' },
    { slot: 'left', pane: '#splitView [data-view-slot="left"]', select: '#leftPageSelect' },
    { slot: 'right', pane: '#splitView [data-view-slot="right"]', select: '#rightPageSelect' },
    { slot: 'codePreview', pane: '#codeView [data-view-slot="code-preview"]', select: '#codePreviewSelect' },
    { slot: 'codePage', pane: '#codeView .code-editor-pane', select: '#codePageSelect' }
  ];

  const forwardedEvents = new WeakSet();
  let routingTimer = null;

  function dragTypes(event) {
    return [...(event.dataTransfer?.types || [])];
  }

  function hasFiles(event) {
    return dragTypes(event).includes('Files');
  }

  function hasPageNode(event) {
    return dragTypes(event).includes(PAGE_MIME);
  }

  function hasRoutableDocumentDrag(event) {
    return hasFiles(event) || hasPageNode(event);
  }

  function keepRouting() {
    document.body.classList.add(ROUTING_CLASS);
    clearTimeout(routingTimer);
    routingTimer = setTimeout(clearRouting, 320);
  }

  function clearRouting() {
    clearTimeout(routingTimer);
    routingTimer = null;
    document.body.classList.remove(ROUTING_CLASS);
    document.querySelectorAll(`.${OVER_CLASS}`).forEach(pane => pane.classList.remove(OVER_CLASS));
    document.querySelectorAll('.html-drop-zone.drag-over').forEach(zone => zone.classList.remove('drag-over'));
  }

  function pageOptionExists(pageId) {
    if (!pageId) return false;
    return targets.some(target => {
      const select = document.querySelector(target.select);
      return !!select && [...select.options].some(option => option.value === pageId);
    });
  }

  function pageIdFromDrag(event) {
    const direct = event.dataTransfer?.getData(PAGE_MIME);
    if (pageOptionExists(direct)) return direct;

    const raw = event.dataTransfer?.getData(TREE_MIME);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw);
      return pageOptionExists(payload?.nodeId) ? payload.nodeId : null;
    } catch {
      return null;
    }
  }

  function markDropTarget(pane) {
    keepRouting();
    pane.classList.add(OVER_CLASS);
    pane.querySelector('.html-drop-zone')?.classList.add('drag-over');
  }

  function activatePane(pane) {
    try {
      pane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    } catch {
      pane.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    }
  }

  function selectPageInView(target, pageId) {
    const pane = document.querySelector(target.pane);
    const select = document.querySelector(target.select);
    if (!pane || !select || ![...select.options].some(option => option.value === pageId)) return false;
    activatePane(pane);
    select.value = pageId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function installTreePagePayload() {
    const tree = document.querySelector('#tree');
    if (!tree || tree.dataset.leafViewDropBridge === 'true') return;
    tree.dataset.leafViewDropBridge = 'true';
    tree.addEventListener('dragstart', event => {
      const row = event.target?.closest?.('.tree-row[data-node-id]');
      if (!row || event.target?.closest?.('.tree-row-add')) return;
      const pageId = row.dataset.nodeId;
      if (!pageOptionExists(pageId)) return;
      try {
        event.dataTransfer.effectAllowed = 'copyMove';
        event.dataTransfer.setData(PAGE_MIME, pageId);
      } catch {}
      keepRouting();
    }, true);
  }

  function installPaneTarget(target) {
    const pane = document.querySelector(target.pane);
    if (!pane || pane.dataset.leafViewDropBridge === 'true') return;
    pane.dataset.leafViewDropBridge = 'true';

    pane.addEventListener('dragenter', event => {
      if (!hasPageNode(event)) return;
      event.preventDefault();
      event.stopPropagation();
      markDropTarget(pane);
    }, true);

    pane.addEventListener('dragover', event => {
      if (!hasPageNode(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      markDropTarget(pane);
    }, true);

    pane.addEventListener('dragleave', event => {
      if (pane.contains(event.relatedTarget)) return;
      pane.classList.remove(OVER_CLASS);
      pane.querySelector('.html-drop-zone')?.classList.remove('drag-over');
    }, true);

    pane.addEventListener('drop', event => {
      if (!hasPageNode(event)) return;
      const pageId = pageIdFromDrag(event);
      if (!pageId) return;
      event.preventDefault();
      event.stopPropagation();
      selectPageInView(target, pageId);
      clearRouting();
    }, true);
  }

  function forwardDragFromFrame(frame, pane, event) {
    if (!hasRoutableDocumentDrag(event)) return;
    keepRouting();
    const rect = frame.getBoundingClientRect();
    let forwarded;
    try {
      forwarded = new DragEvent(event.type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: event.dataTransfer,
        clientX: rect.left + event.clientX,
        clientY: rect.top + event.clientY
      });
    } catch {
      return;
    }
    forwardedEvents.add(forwarded);
    pane.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented || event.type === 'dragover' || event.type === 'drop') event.preventDefault();
    event.stopPropagation();
  }

  function bindFrameDocument(frame, pane) {
    let doc = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    if (!doc || doc.__leafViewDropBridge === true) return;
    doc.__leafViewDropBridge = true;
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(type => {
      doc.addEventListener(type, event => forwardDragFromFrame(frame, pane, event), true);
    });
  }

  function installFrameBridge(target) {
    const pane = document.querySelector(target.pane);
    const frame = pane?.querySelector('iframe');
    if (!pane || !frame || frame.dataset.leafViewDropBridge === 'true') return;
    frame.dataset.leafViewDropBridge = 'true';
    frame.addEventListener('load', () => bindFrameDocument(frame, pane));
    bindFrameDocument(frame, pane);
  }

  function installGlobalRouting() {
    if (document.documentElement.dataset.leafViewDropBridge === 'true') return;
    document.documentElement.dataset.leafViewDropBridge = 'true';

    ['dragenter', 'dragover'].forEach(type => {
      window.addEventListener(type, event => {
        if (!hasRoutableDocumentDrag(event) || forwardedEvents.has(event)) return;
        keepRouting();
      }, true);
    });

    ['drop', 'dragend'].forEach(type => {
      window.addEventListener(type, () => setTimeout(clearRouting, 0), true);
    });

    const style = document.createElement('style');
    style.dataset.leafViewDropBridge = 'true';
    style.textContent = `
      body.${ROUTING_CLASS} iframe{pointer-events:none!important}
      .view-pane.${OVER_CLASS} .html-drop-zone,
      .code-editor-pane.${OVER_CLASS} .html-drop-zone,
      body.${ROUTING_CLASS} .html-drop-zone.drag-over{
        display:flex;
        pointer-events:auto;
      }
      .view-pane.${OVER_CLASS} .html-drop-zone,
      .code-editor-pane.${OVER_CLASS} .html-drop-zone{
        background:color-mix(in srgb,var(--accent) 8%,var(--canvas));
        border-color:var(--focus-ring);
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    installGlobalRouting();
    installTreePagePayload();
    targets.forEach(target => {
      installPaneTarget(target);
      installFrameBridge(target);
    });
  }

  function scheduleInstall() {
    install();
    requestAnimationFrame(install);
    setTimeout(install, 160);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInstall, { once: true });
  } else {
    scheduleInstall();
  }

  new MutationObserver(scheduleInstall).observe(document.documentElement, { childList: true, subtree: true });
})();
