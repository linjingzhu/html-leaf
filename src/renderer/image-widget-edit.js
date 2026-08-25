(() => {
  'use strict';

  const ACCEPT = '.jpg,.jpeg,.png,.svg,.gif,.webp,image/jpeg,image/png,image/svg+xml,image/gif,image/webp';
  const MAX_IMAGE_BYTES = 30_000_000;
  const IMAGE_EXTENSIONS = /\.(jpe?g|png|svg|gif|webp)$/i;
  const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp']);
  const FRAME_CONFIG = {
    single: { frame: 'singleFrame', pane: '#singleView', select: '#singlePageName' },
    left: { frame: 'leftFrame', pane: '#splitView [data-view-slot="left"]', select: '#leftPageSelect' },
    right: { frame: 'rightFrame', pane: '#splitView [data-view-slot="right"]', select: '#rightPageSelect' },
    codePreview: { frame: 'codePreviewFrame', pane: '#codeView [data-view-slot="code-preview"]', select: '#codePreviewSelect' }
  };

  const boundDocs = new WeakSet();
  const activeWidgets = new WeakMap();
  const cropWidgets = new WeakMap();
  const pasteFallbackTimers = new WeakMap();
  const lastPasteHandled = new WeakMap();

  const $ = selector => document.querySelector(selector);

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function slotForFrame(frame) {
    return Object.keys(FRAME_CONFIG).find(slot => document.getElementById(FRAME_CONFIG[slot].frame) === frame) || null;
  }

  function frameForSlot(slot) {
    return document.getElementById(FRAME_CONFIG[slot]?.frame || '');
  }

  function pageIdForFrame(frame) {
    const slot = slotForFrame(frame);
    const select = slot ? $(FRAME_CONFIG[slot].select) : null;
    return select?.value || frame?.dataset?.snapshotPageId || frame?.dataset?.directSourcePageId || '';
  }

  function activatePane(frame) {
    const slot = slotForFrame(frame);
    const pane = slot ? $(FRAME_CONFIG[slot].pane) : null;
    if (!pane) return;
    try {
      pane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    } catch {
      pane.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    }
  }

  function canEditFrame(frame) {
    const slot = slotForFrame(frame);
    const editButton = slot ? document.querySelector(`[data-edit-slot="${slot}"]`) : null;
    const active = editButton?.classList.contains('active') || editButton?.getAttribute('aria-pressed') === 'true';
    return !!active && /^static-editable/.test(frame?.dataset?.previewRuntime || '');
  }

  function imageWidgetFrom(target) {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    return element?.closest?.('[data-hbe-object="image"],figure[data-hbe-image-widget]') || null;
  }

  function imageFrame(widget) {
    if (!widget) return null;
    let box = widget.querySelector('[data-hbe-image-frame]');
    if (!box) {
      box = widget.ownerDocument.createElement('div');
      box.dataset.hbeImageFrame = '1';
      Object.assign(box.style, {
        position: 'relative', display: 'grid', placeItems: 'center', minHeight: '160px',
        aspectRatio: '16 / 9', overflow: 'hidden', border: '1px dashed currentColor',
        background: 'rgba(127,127,127,.08)', boxSizing: 'border-box'
      });
      widget.prepend(box);
    }
    return box;
  }

  function widgetImage(widget) {
    return widget?.querySelector?.('[data-hbe-image],img') || null;
  }

  function isSupportedImageFile(file) {
    if (!file) return false;
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '');
    return IMAGE_MIME.has(type) || IMAGE_EXTENSIONS.test(name);
  }

  function imageFileFromList(list) {
    return [...(list || [])].find(isSupportedImageFile) || null;
  }

  function readFileAsAsset(file, fallbackName = 'image') {
    return new Promise((resolve, reject) => {
      if (!isSupportedImageFile(file)) {
        reject(new Error('Supported image formats: JPG, PNG, SVG, GIF, WEBP.'));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error('Image files must be smaller than 30 MB.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const mime = String(file.type || '').toLowerCase() || mimeFromName(file.name) || 'image/png';
        resolve({ dataUrl: String(reader.result || ''), mime, fileName: file.name || fallbackName });
      };
      reader.onerror = () => reject(new Error('Could not read the image file.'));
      reader.readAsDataURL(file);
    });
  }

  function mimeFromName(name) {
    const lower = String(name || '').toLowerCase();
    if (/\.svg$/.test(lower)) return 'image/svg+xml';
    if (/\.webp$/.test(lower)) return 'image/webp';
    if (/\.gif$/.test(lower)) return 'image/gif';
    if (/\.png$/.test(lower)) return 'image/png';
    if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
    return '';
  }

  function chooseImageAsset() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT;
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.style.top = '0';
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        const file = input.files?.[0] || null;
        input.remove();
        if (!file) { resolve(null); return; }
        try { resolve(await readFileAsAsset(file)); }
        catch (error) { showToast(error.message); resolve(null); }
      }, { once: true });
      input.click();
      setTimeout(() => {
        if (!document.body.contains(input)) return;
        const cleanup = () => { if (document.body.contains(input)) input.remove(); };
        window.addEventListener('focus', () => setTimeout(cleanup, 400), { once: true });
      }, 0);
    });
  }

  async function navigatorClipboardAsset() {
    if (!navigator.clipboard?.read) return null;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(value => IMAGE_MIME.has(String(value).toLowerCase()));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/svg+xml' ? 'svg' : type.split('/')[1];
        return await readFileAsAsset(new File([blob], `clipboard.${ext}`, { type }), `clipboard.${ext}`);
      }
    } catch {}
    return null;
  }

  function serializeFrame(frame) {
    const doc = frame?.contentDocument;
    if (!doc?.documentElement) return '';
    const parsed = new DOMParser().parseFromString(`<!doctype html>${doc.documentElement.outerHTML}`, 'text/html');
    window.SourceFidelity?.stripEditorArtifactsFromDocument?.(parsed);
    return `<!doctype html>${parsed.documentElement.outerHTML}`;
  }

  function commitFrameSource(frame) {
    const pageId = pageIdForFrame(frame);
    const source = serializeFrame(frame);
    const codeSelect = $('#codePageSelect');
    const editor = $('#sourceEditor');
    if (!pageId || !source || !codeSelect || !editor) {
      showToast('Image changed, but source sync is unavailable');
      return false;
    }
    if (![...codeSelect.options].some(option => option.value === pageId)) {
      showToast('Image changed, but this Page is not available in Code View');
      return false;
    }
    if (codeSelect.value !== pageId) {
      codeSelect.value = pageId;
      codeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    editor.value = source;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function assetLabel(asset) {
    return String(asset?.fileName || 'Image').replace(/\.[^.]+$/, '').trim() || 'Image';
  }

  function setImageWidgetSource(widget, asset) {
    if (!widget || !asset?.dataUrl) return false;
    const doc = widget.ownerDocument;
    const box = imageFrame(widget);
    const previous = widgetImage(widget);
    const previousPosition = previous?.style?.objectPosition || '50% 50%';
    widget.setAttribute('data-hbe-image-widget', 'filled');
    widget.setAttribute('data-hbe-image-name', asset.fileName || 'image');
    widget.setAttribute('data-hbe-image-mime', asset.mime || '');
    if (!widget.getAttribute('data-hbe-name')) widget.setAttribute('data-hbe-name', 'Image');
    if (!widget.style.maxWidth) widget.style.maxWidth = '100%';
    if (!widget.style.width) widget.style.width = 'min(100%, 480px)';
    Object.assign(box.style, {
      position: 'relative', display: 'block', width: '100%', minHeight: '96px',
      aspectRatio: box.style.aspectRatio || '16 / 9', overflow: 'hidden',
      border: '0', background: 'rgba(127,127,127,.08)', boxSizing: 'border-box'
    });
    box.replaceChildren();
    const img = doc.createElement('img');
    img.dataset.hbeImage = '1';
    img.src = asset.dataUrl;
    img.alt = assetLabel(asset);
    img.draggable = false;
    Object.assign(img.style, {
      display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: previousPosition
    });
    box.appendChild(img);
    const caption = widget.querySelector('[data-hbe-image-caption]');
    if (caption && /^(image caption|image)$/i.test(caption.textContent.trim())) caption.textContent = assetLabel(asset);
    return true;
  }

  async function openPickerForWidget(frame, widget) {
    activatePane(frame);
    activeWidgets.set(frame, widget);
    const asset = await chooseImageAsset();
    if (!asset || !widget.isConnected) return;
    setImageWidgetSource(widget, asset);
    commitFrameSource(frame);
    showToast('Image inserted');
  }

  async function replaceWidgetFromFile(frame, widget, file) {
    try {
      const asset = await readFileAsAsset(file);
      if (!widget.isConnected) return;
      setImageWidgetSource(widget, asset);
      commitFrameSource(frame);
      showToast('Image replaced');
    } catch (error) {
      showToast(error.message);
    }
  }

  function currentWidgetForFrame(frame, eventTarget = null) {
    const direct = imageWidgetFrom(eventTarget);
    if (direct) activeWidgets.set(frame, direct);
    const active = activeWidgets.get(frame);
    return active?.isConnected ? active : direct;
  }

  function isEditingControl(target) {
    return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]');
  }

  function parseObjectPosition(value) {
    const parts = String(value || '50% 50%').split(/\s+/);
    const number = text => {
      const parsed = Number.parseFloat(text);
      return Number.isFinite(parsed) ? parsed : 50;
    };
    return { x: number(parts[0]), y: number(parts[1]) };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function removeCropHud(doc) {
    doc?.querySelectorAll('[data-editor-overlay="image-crop-hud"]').forEach(node => node.remove());
  }

  function renderCropHud(frame) {
    const doc = frame?.contentDocument;
    removeCropHud(doc);
    const widget = cropWidgets.get(frame);
    const box = imageFrame(widget);
    if (!doc?.body || !widget?.isConnected || !box) return;
    const rect = box.getBoundingClientRect();
    const hud = doc.createElement('div');
    hud.dataset.editorOverlay = 'image-crop-hud';
    hud.textContent = 'Crop: drag image, double-click to finish';
    Object.assign(hud.style, {
      position: 'absolute', zIndex: 2147483647, pointerEvents: 'none',
      left: `${rect.left + doc.defaultView.scrollX + 8}px`, top: `${rect.top + doc.defaultView.scrollY + 8}px`,
      maxWidth: `${Math.max(120, rect.width - 16)}px`, padding: '5px 8px', borderRadius: '4px',
      background: 'rgba(24,27,33,.88)', color: '#fff', font: '11px/1.35 Arial,sans-serif',
      boxShadow: '0 2px 10px rgba(0,0,0,.28)'
    });
    doc.body.appendChild(hud);
  }

  function toggleCropMode(frame, widget) {
    if (!widgetImage(widget)) {
      openPickerForWidget(frame, widget);
      return;
    }
    if (cropWidgets.get(frame) === widget) {
      cropWidgets.delete(frame);
      removeCropHud(frame.contentDocument);
      showToast('Crop applied');
    } else {
      cropWidgets.set(frame, widget);
      renderCropHud(frame);
      showToast('Crop mode: drag image to reposition');
    }
  }

  function beginCropDrag(frame, widget, event) {
    const img = widgetImage(widget);
    const box = imageFrame(widget);
    if (!img || !box) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const doc = widget.ownerDocument;
    const start = parseObjectPosition(img.style.objectPosition);
    const rect = box.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let changed = false;
    const move = moveEvent => {
      moveEvent.preventDefault();
      const dx = ((moveEvent.clientX - startX) / Math.max(1, rect.width)) * 100;
      const dy = ((moveEvent.clientY - startY) / Math.max(1, rect.height)) * 100;
      const x = clamp(start.x + dx, 0, 100);
      const y = clamp(start.y + dy, 0, 100);
      img.style.objectFit = 'cover';
      img.style.objectPosition = `${Math.round(x * 10) / 10}% ${Math.round(y * 10) / 10}%`;
      changed = true;
    };
    const finish = finishEvent => {
      finishEvent?.preventDefault();
      doc.defaultView.removeEventListener('pointermove', move, true);
      doc.defaultView.removeEventListener('pointerup', finish, true);
      doc.defaultView.removeEventListener('pointercancel', finish, true);
      if (changed) commitFrameSource(frame);
      renderCropHud(frame);
    };
    doc.defaultView.addEventListener('pointermove', move, true);
    doc.defaultView.addEventListener('pointerup', finish, true);
    doc.defaultView.addEventListener('pointercancel', finish, true);
    return true;
  }

  function beginAspectResize(frame, widget, event, direction) {
    const box = imageFrame(widget);
    if (!box) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const doc = widget.ownerDocument;
    const startRect = box.getBoundingClientRect();
    if (startRect.width < 1 || startRect.height < 1) return false;
    const startWidgetRect = widget.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const aspect = startRect.width / startRect.height;
    const computed = doc.defaultView.getComputedStyle(widget);
    const startWidth = parseFloat(computed.width) || startWidgetRect.width || startRect.width;
    const startMarginLeft = parseFloat(computed.marginLeft) || 0;
    const startMarginTop = parseFloat(computed.marginTop) || 0;
    let changed = false;

    const move = moveEvent => {
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      let widthDelta = 0;
      if (direction.includes('e')) widthDelta = dx;
      else if (direction.includes('w')) widthDelta = -dx;
      else if (direction.includes('s')) widthDelta = dy * aspect;
      else if (direction.includes('n')) widthDelta = -dy * aspect;
      const nextWidth = Math.max(32, Math.round(startWidth + widthDelta));
      const nextHeight = Math.max(24, Math.round(nextWidth / aspect));
      widget.style.width = `${nextWidth}px`;
      widget.style.maxWidth = '100%';
      if (direction.includes('w')) widget.style.marginLeft = `${Math.round(startMarginLeft + (startWidth - nextWidth))}px`;
      if (direction.includes('n')) widget.style.marginTop = `${Math.round(startMarginTop + ((startWidth / aspect) - nextHeight))}px`;
      box.style.aspectRatio = `${Math.round(aspect * 10000) / 10000}`;
      box.style.height = `${nextHeight}px`;
      changed = true;
    };

    const finish = finishEvent => {
      finishEvent?.preventDefault();
      doc.defaultView.removeEventListener('pointermove', move, true);
      doc.defaultView.removeEventListener('pointerup', finish, true);
      doc.defaultView.removeEventListener('pointercancel', finish, true);
      if (changed) {
        commitFrameSource(frame);
        showToast('Image resized proportionally');
      }
    };

    doc.defaultView.addEventListener('pointermove', move, true);
    doc.defaultView.addEventListener('pointerup', finish, true);
    doc.defaultView.addEventListener('pointercancel', finish, true);
    return true;
  }

  async function handlePasteAsset(frame, widget, event) {
    const file = imageFileFromList(event.clipboardData?.files) || [...(event.clipboardData?.items || [])]
      .map(item => item.kind === 'file' ? item.getAsFile() : null)
      .find(isSupportedImageFile);
    if (!file) {
      showToast('Clipboard has no supported image');
      return false;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    lastPasteHandled.set(frame, Date.now());
    await replaceWidgetFromFile(frame, widget, file);
    return true;
  }

  function scheduleNavigatorPasteFallback(frame, widget) {
    clearTimeout(pasteFallbackTimers.get(frame));
    const timer = setTimeout(async () => {
      if ((Date.now() - (lastPasteHandled.get(frame) || 0)) < 240) return;
      const asset = await navigatorClipboardAsset();
      if (!asset || !widget?.isConnected) {
        showToast('Clipboard has no supported image');
        return;
      }
      setImageWidgetSource(widget, asset);
      commitFrameSource(frame);
      showToast('Image pasted');
    }, 90);
    pasteFallbackTimers.set(frame, timer);
  }

  function bindFrameDocument(frame) {
    let doc = null;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc?.body || boundDocs.has(doc)) return;
    boundDocs.add(doc);

    doc.addEventListener('pointerdown', event => {
      if (!canEditFrame(frame)) return;
      const handle = event.target?.closest?.('[data-scale-handle]');
      const current = currentWidgetForFrame(frame, event.target);
      if (handle && current) {
        beginAspectResize(frame, current, event, handle.dataset.scaleHandle || 'se');
        return;
      }
      const crop = cropWidgets.get(frame);
      if (crop && crop.contains(event.target)) {
        beginCropDrag(frame, crop, event);
        return;
      }
      const widget = imageWidgetFrom(event.target);
      if (widget) activeWidgets.set(frame, widget);
    }, true);

    doc.addEventListener('click', event => {
      if (!canEditFrame(frame)) return;
      const label = event.target?.closest?.('[data-hbe-image-label]');
      const widget = imageWidgetFrom(label || event.target);
      if (!label || !widget) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPickerForWidget(frame, widget);
    }, true);

    doc.addEventListener('keydown', event => {
      if (!canEditFrame(frame) || isEditingControl(event.target)) return;
      const widget = currentWidgetForFrame(frame, event.target);
      const modifier = event.ctrlKey || event.metaKey;
      if (widget && modifier && event.key.toLowerCase() === 'v') {
        event.stopImmediatePropagation();
        scheduleNavigatorPasteFallback(frame, widget);
      }
      if (widget && (event.key === 'Enter' || event.key === ' ') && event.target?.closest?.('[data-hbe-image-label]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPickerForWidget(frame, widget);
      }
    }, true);

    doc.addEventListener('paste', event => {
      if (!canEditFrame(frame) || isEditingControl(event.target)) return;
      const widget = currentWidgetForFrame(frame, event.target);
      if (!widget) return;
      handlePasteAsset(frame, widget, event);
    }, true);

    doc.addEventListener('dblclick', event => {
      if (!canEditFrame(frame)) return;
      const widget = imageWidgetFrom(event.target);
      if (!widget) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      activeWidgets.set(frame, widget);
      toggleCropMode(frame, widget);
    }, true);

    doc.addEventListener('dragover', event => {
      if (!canEditFrame(frame)) return;
      const widget = imageWidgetFrom(event.target) || activeWidgets.get(frame);
      if (!widget || !imageFileFromList(event.dataTransfer?.files)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.dataTransfer.dropEffect = 'copy';
      imageFrame(widget)?.setAttribute('data-leaf-image-drag', 'true');
    }, true);

    doc.addEventListener('dragleave', event => {
      imageWidgetFrom(event.target)?.querySelector?.('[data-hbe-image-frame]')?.removeAttribute('data-leaf-image-drag');
    }, true);

    doc.addEventListener('drop', event => {
      if (!canEditFrame(frame)) return;
      const widget = imageWidgetFrom(event.target) || activeWidgets.get(frame);
      const file = imageFileFromList(event.dataTransfer?.files);
      if (!widget || !file) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      imageFrame(widget)?.removeAttribute('data-leaf-image-drag');
      activeWidgets.set(frame, widget);
      replaceWidgetFromFile(frame, widget, file);
    }, true);

    doc.addEventListener('scroll', () => renderCropHud(frame), true);
    doc.defaultView.addEventListener('resize', () => renderCropHud(frame));
  }

  function bindFrame(frame) {
    if (!frame || frame.dataset.leafImageWidgetEdit === 'true') {
      if (frame) bindFrameDocument(frame);
      return;
    }
    frame.dataset.leafImageWidgetEdit = 'true';
    frame.addEventListener('load', () => setTimeout(() => bindFrameDocument(frame), 0));
    bindFrameDocument(frame);
  }

  function install() {
    Object.keys(FRAME_CONFIG).forEach(slot => bindFrame(frameForSlot(slot)));
  }

  const LIFECYCLE_EVENTS = ['leaf-renderer-ready', 'leaf-frame-rendered'];

  LIFECYCLE_EVENTS.forEach(type => document.addEventListener(type, install));

  // Injected after the renderer signals ready, so `leaf-renderer-ready` may already have fired.
  if (document.documentElement.dataset.leafReady === 'true') install();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
