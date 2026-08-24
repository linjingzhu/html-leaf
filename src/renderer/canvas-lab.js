(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const LAB_ID = 'canvasLabView';

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

  function pageList() {
    const state = readState();
    return (state?.documents || []).flatMap(document =>
      (document.nodes || [])
        .filter(node => node.type === 'page')
        .map(page => ({ document, page }))
    );
  }

  function pageById(pageId) {
    return pageList().find(item => item.page.id === pageId)?.page || null;
  }

  function activePageId() {
    const state = readState();
    if (!state?.views) return pageList()[0]?.page.id || '';
    if (state.mode === 'split') return state.activeSlots?.split === 'right' ? state.views.right : state.views.left;
    if (state.mode === 'code') return state.activeSlots?.code === 'editor' ? state.views.codePage : state.views.codePreview;
    return state.views.single || pageList()[0]?.page.id || '';
  }

  function supportsHtmlInCanvas() {
    const proto = window.CanvasRenderingContext2D?.prototype;
    return !!(proto && (proto.drawElement || proto.drawElementImage || proto.drawHTMLElement));
  }

  function renderPageSource(page) {
    if (!page) return '<!doctype html><html><body></body></html>';
    if (page.documentType === 'markdown') {
      const rich = window.JiraExport?.markdownToRichHtml?.(page.source || '') || `<pre>${esc(page.source || '')}</pre>`;
      return `<!doctype html><html><head><meta charset="utf-8"><style>body{max-width:920px;margin:0 auto;padding:38px 44px;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;color:#20242a;background:#fff}img{max-width:100%}pre{padding:14px;background:#f4f5f7;border-radius:6px;overflow:auto}table{border-collapse:collapse}th,td{border:1px solid #d9dde3;padding:7px 9px}</style></head><body>${rich}</body></html>`;
    }
    if (page.documentType === 'json') {
      let formatted = String(page.source || '');
      try { formatted = JSON.stringify(JSON.parse(formatted), null, 2); } catch {}
      return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:30px 36px;background:#fff;color:#20242a;font:14px/1.55 system-ui}pre{margin:0;padding:18px;border:1px solid #d9dde3;border-radius:7px;background:#f7f8fa;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 Consolas,monospace}</style></head><body><pre>${esc(formatted)}</pre></body></html>`;
    }
    if (page.documentType === 'pdf') {
      return `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui;color:#344054;background:#f8fafc"><div>PDF Canvas Lab uses native Preview fallback.</div></body></html>`;
    }
    return page.source || '<!doctype html><html><body></body></html>';
  }

  function injectStyle() {
    if (document.getElementById('leaf-canvas-lab-style')) return;
    const style = document.createElement('style');
    style.id = 'leaf-canvas-lab-style';
    style.textContent = `
      .canvas-lab-view{display:none;position:relative;min-width:0;min-height:0;background:var(--panel-secondary,#f2f4f7)}
      .canvas-lab-view.is-active{display:grid;grid-template-rows:42px minmax(0,1fr) 104px;height:100%}
      .canvas-lab-toolbar{display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--border,#d0d7e2);background:var(--panel,#fff);min-width:0}
      .canvas-lab-toolbar select{height:28px;min-width:170px;border:1px solid var(--border,#d0d7e2);border-radius:6px;background:var(--panel-secondary,#f2f4f7);color:var(--foreground,#20242a)}
      .canvas-lab-toolbar .canvas-lab-status{margin-left:auto;font-size:11px;font-weight:700;color:var(--success,#1f8a56);padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--success,#1f8a56) 12%,transparent)}
      .canvas-lab-mode{display:inline-flex;border:1px solid var(--border,#d0d7e2);border-radius:6px;overflow:hidden}
      .canvas-lab-mode button{height:28px;border:0;border-right:1px solid var(--border,#d0d7e2);background:var(--panel,#fff);color:var(--muted,#667085);padding:0 10px}
      .canvas-lab-mode button:last-child{border-right:0}
      .canvas-lab-mode button.active{background:var(--accent,#4268d6);color:#fff;font-weight:700}
      .canvas-lab-body{min-height:0;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:12px}
      .canvas-lab-stage{min-width:0;display:grid;grid-template-columns:1fr;gap:12px}
      .canvas-lab-stage.side-by-side{grid-template-columns:1fr 1fr}
      .canvas-lab-card{min-width:0;min-height:0;border:1px solid var(--border,#d0d7e2);border-radius:8px;background:var(--panel,#fff);overflow:hidden;display:grid;grid-template-rows:32px minmax(0,1fr)}
      .canvas-lab-card-head{display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--border,#d0d7e2);font-size:12px;color:var(--foreground,#20242a)}
      .canvas-lab-badge{font-size:10px;color:var(--accent,#4268d6);background:color-mix(in srgb,var(--accent,#4268d6) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent,#4268d6) 35%,var(--border,#d0d7e2));border-radius:4px;padding:1px 5px}
      .canvas-lab-canvas-wrap,.canvas-lab-dom-wrap{position:relative;min-height:0;padding:12px;background:var(--panel-secondary,#f2f4f7)}
      #canvasLabCanvas{width:100%;height:100%;min-height:360px;border:1px solid var(--border,#d0d7e2);border-radius:6px;background:#fff}
      #canvasLabDomFrame{width:100%;height:100%;min-height:360px;border:1px solid var(--border,#d0d7e2);border-radius:6px;background:#fff}
      .canvas-lab-side{min-width:0;display:grid;gap:10px;align-content:start}
      .canvas-lab-panel{border:1px solid var(--border,#d0d7e2);border-radius:8px;background:var(--panel,#fff);padding:10px;display:grid;gap:8px;font-size:12px}
      .canvas-lab-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#667085)}
      .canvas-lab-check{display:flex;align-items:center;gap:7px;color:var(--foreground,#20242a)}
      .canvas-lab-check::before{content:"";width:12px;height:12px;border-radius:3px;background:var(--accent,#4268d6);box-shadow:inset 0 0 0 2px #fff}
      .canvas-lab-metric{display:flex;justify-content:space-between;color:var(--muted,#667085)}
      .canvas-lab-metric strong{color:var(--foreground,#20242a)}
      .canvas-lab-trace{border-top:1px solid var(--border,#d0d7e2);background:var(--panel,#fff);padding:9px 12px;display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px;font-size:12px}
      .canvas-lab-trace strong{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#667085)}
      .canvas-lab-lines{display:grid;gap:5px;color:var(--muted,#667085)}
      .canvas-lab-lines span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .canvas-lab-lines b{color:var(--accent,#4268d6)}
      @media(max-width:860px){.canvas-lab-body{grid-template-columns:1fr}.canvas-lab-side{grid-template-columns:repeat(2,minmax(0,1fr))}.canvas-lab-stage.side-by-side{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function createLabView() {
    const host = document.getElementById('viewportHost');
    if (!host || document.getElementById(LAB_ID)) return;
    const section = document.createElement('section');
    section.id = LAB_ID;
    section.className = 'canvas-lab-view viewport-mode';
    section.dataset.modePanel = 'canvas-lab';
    section.innerHTML = `
      <div class="canvas-lab-toolbar">
        <select id="canvasLabPageSelect" aria-label="Canvas Lab page"></select>
        <div class="canvas-lab-mode" aria-label="Canvas Lab mode">
          <button type="button" class="active" data-canvas-lab-mode="canvas">Canvas</button>
          <button type="button" data-canvas-lab-mode="dom">DOM</button>
          <button type="button" data-canvas-lab-mode="side-by-side">Side-by-side</button>
          <button type="button" data-canvas-lab-mode="events">Event Trace</button>
        </div>
        <select id="canvasLabContext" aria-label="Canvas context">
          <option value="2d">2D Canvas</option>
          <option value="webgl">WebGL Texture</option>
          <option value="webgpu">WebGPU Texture</option>
        </select>
        <span class="canvas-lab-status" id="canvasLabStatus"></span>
      </div>
      <div class="canvas-lab-body">
        <div class="canvas-lab-stage" id="canvasLabStage">
          <section class="canvas-lab-card" data-canvas-lab-pane="canvas">
            <div class="canvas-lab-card-head"><strong>Canvas Preview</strong><span class="canvas-lab-badge" id="canvasLabApiBadge">probe</span><span class="canvas-lab-badge">event trace</span></div>
            <div class="canvas-lab-canvas-wrap"><canvas id="canvasLabCanvas"></canvas></div>
          </section>
          <section class="canvas-lab-card" data-canvas-lab-pane="dom" hidden>
            <div class="canvas-lab-card-head"><strong>DOM Reference</strong><span class="canvas-lab-badge">fallback</span></div>
            <div class="canvas-lab-dom-wrap"><iframe id="canvasLabDomFrame" sandbox="allow-same-origin"></iframe></div>
          </section>
        </div>
        <aside class="canvas-lab-side">
          <div class="canvas-lab-panel">
            <div class="canvas-lab-title">Interaction</div>
            <div class="canvas-lab-check">Hit testing</div>
            <div class="canvas-lab-check">Hover</div>
            <div class="canvas-lab-check">Click</div>
            <div class="canvas-lab-check">Focus</div>
          </div>
          <div class="canvas-lab-panel">
            <div class="canvas-lab-title">Diagnostics</div>
            <div class="canvas-lab-metric"><span>Paint count</span><strong id="canvasLabPaintCount">0</strong></div>
            <div class="canvas-lab-metric"><span>Frame cost</span><strong id="canvasLabFrameCost">0ms</strong></div>
            <div class="canvas-lab-metric"><span>API</span><strong id="canvasLabApiName">Fallback</strong></div>
          </div>
        </aside>
      </div>
      <div class="canvas-lab-trace">
        <strong>Event Trace</strong>
        <div class="canvas-lab-lines" id="canvasLabTrace" aria-live="polite"></div>
      </div>
    `;
    host.appendChild(section);
  }

  function createModeButton() {
    const seg = document.getElementById('viewSeg');
    if (!seg || seg.querySelector('[data-mode="canvas-lab"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = 'canvas-lab';
    button.textContent = 'Canvas Lab';
    seg.appendChild(button);
  }

  function setActiveMode() {
    document.querySelectorAll('[data-mode-panel]').forEach(panel => panel.classList.toggle('is-active', panel.id === LAB_ID));
    document.querySelectorAll('#viewSeg button[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === 'canvas-lab'));
    document.querySelectorAll('.view-pane,.code-editor-pane').forEach(pane => pane.classList.remove('active-view'));
    refreshPageSelect();
    renderLab();
  }

  function refreshPageSelect() {
    const select = document.getElementById('canvasLabPageSelect');
    if (!select) return;
    const previous = select.value || activePageId();
    select.innerHTML = pageList().map(({ document, page }) =>
      `<option value="${esc(page.id)}">${esc(document.name)} / ${esc(page.name)}${page.documentType && page.documentType !== 'html' ? ` [${page.documentType.toUpperCase()}]` : ''}</option>`
    ).join('');
    select.value = pageById(previous) ? previous : pageList()[0]?.page.id || '';
  }

  function setTrace(kind, detail) {
    const trace = document.getElementById('canvasLabTrace');
    if (!trace) return;
    const row = document.createElement('span');
    row.innerHTML = `<b>${esc(kind)}</b> ${esc(detail)}`;
    trace.prepend(row);
    while (trace.children.length > 5) trace.lastElementChild.remove();
  }

  function drawFallbackCanvas(page, reason = '') {
    const canvas = document.getElementById('canvasLabCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(640, Math.floor(rect.width || 860));
    const height = Math.max(360, Math.floor(rect.height || 420));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const start = performance.now();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d8deea';
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    const pageX = Math.round(width * 0.1);
    const pageY = Math.round(height * 0.12);
    const pageW = Math.round(width * 0.8);
    const pageH = Math.round(height * 0.72);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#c9d2e4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pageX, pageY, pageW, pageH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#243763';
    ctx.fillRect(pageX + 28, pageY + 30, Math.min(360, pageW * 0.58), 24);
    ctx.fillStyle = '#cbd6ea';
    ctx.fillRect(pageX + 28, pageY + 70, Math.min(520, pageW * 0.75), 14);
    ctx.fillStyle = '#eef3fb';
    ctx.strokeStyle = '#d6deed';
    const cardW = Math.max(90, (pageW - 78) / 3);
    for (let i = 0; i < 3; i += 1) {
      const x = pageX + 28 + i * (cardW + 11);
      ctx.beginPath();
      ctx.roundRect(x, pageY + 112, cardW, 74, 6);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#4268d6';
    ctx.beginPath();
    ctx.roundRect(pageX + 28, pageY + pageH - 58, 92, 34, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px system-ui';
    ctx.fillText('Submit', pageX + 44, pageY + pageH - 36);
    ctx.strokeStyle = '#ff3f46';
    ctx.lineWidth = 2;
    ctx.strokeRect(pageX + 28, pageY + pageH - 58, 92, 34);
    ctx.fillStyle = '#344054';
    ctx.font = '12px system-ui';
    ctx.fillText(page?.name || 'No page selected', 18, height - 18);
    if (reason) ctx.fillText(reason, width - Math.min(430, width - 30), height - 18);
    document.getElementById('canvasLabPaintCount').textContent = String(Number(document.getElementById('canvasLabPaintCount').textContent || 0) + 1);
    document.getElementById('canvasLabFrameCost').textContent = `${Math.max(1, Math.round((performance.now() - start) * 10) / 10)}ms`;
  }

  function renderLab() {
    const select = document.getElementById('canvasLabPageSelect');
    const page = pageById(select?.value) || pageById(activePageId());
    const apiSupported = supportsHtmlInCanvas();
    document.getElementById('canvasLabStatus').textContent = apiSupported ? 'HTML-in-Canvas Ready' : 'Canvas fallback active';
    document.getElementById('canvasLabApiBadge').textContent = apiSupported ? 'native API' : 'fallback';
    document.getElementById('canvasLabApiName').textContent = apiSupported ? 'Native' : 'Fallback';

    const frame = document.getElementById('canvasLabDomFrame');
    if (frame) {
      frame.srcdoc = renderPageSource(page);
      frame.onload = () => {
        try {
          const doc = frame.contentDocument;
          doc.addEventListener('mousemove', event => {
            const target = event.target?.closest?.('button,a,input,textarea,select,h1,h2,h3,p,li,td,th') || event.target;
            setTrace('mousemove', target?.tagName ? target.tagName.toLowerCase() : 'document');
          }, { passive: true });
          doc.addEventListener('click', event => {
            const target = event.target?.closest?.('button,a,input,textarea,select,h1,h2,h3,p,li,td,th') || event.target;
            setTrace('click', target?.tagName ? target.tagName.toLowerCase() : 'document');
          }, true);
          doc.addEventListener('focusin', event => setTrace('focus', event.target?.tagName?.toLowerCase?.() || 'document'), true);
        } catch {}
      };
    }
    drawFallbackCanvas(page, apiSupported ? 'Native draw API detected' : 'Native draw API unavailable');
  }

  function setCanvasMode(mode) {
    document.querySelectorAll('[data-canvas-lab-mode]').forEach(button => button.classList.toggle('active', button.dataset.canvasLabMode === mode));
    const stage = document.getElementById('canvasLabStage');
    const canvasPane = document.querySelector('[data-canvas-lab-pane="canvas"]');
    const domPane = document.querySelector('[data-canvas-lab-pane="dom"]');
    const eventsOnly = mode === 'events';
    stage.classList.toggle('side-by-side', mode === 'side-by-side');
    canvasPane.hidden = mode === 'dom';
    domPane.hidden = !(mode === 'dom' || mode === 'side-by-side');
    if (eventsOnly) {
      canvasPane.hidden = false;
      domPane.hidden = false;
      stage.classList.add('side-by-side');
    }
    renderLab();
  }

  function bindEvents() {
    document.getElementById('viewSeg')?.addEventListener('click', event => {
      const button = event.target.closest('[data-mode="canvas-lab"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveMode();
    }, true);
    document.getElementById('canvasLabPageSelect')?.addEventListener('change', renderLab);
    document.getElementById('canvasLabContext')?.addEventListener('change', renderLab);
    document.querySelectorAll('[data-canvas-lab-mode]').forEach(button => {
      button.addEventListener('click', () => setCanvasMode(button.dataset.canvasLabMode));
    });
    document.getElementById('canvasLabCanvas')?.addEventListener('mousemove', event => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTrace('mousemove', `canvas ${Math.round(event.clientX - rect.left)}, ${Math.round(event.clientY - rect.top)}`);
    }, { passive: true });
    document.getElementById('canvasLabCanvas')?.addEventListener('click', event => {
      const rect = event.currentTarget.getBoundingClientRect();
      setTrace('click', `canvas ${Math.round(event.clientX - rect.left)}, ${Math.round(event.clientY - rect.top)}`);
    });
  }

  function install() {
    injectStyle();
    createModeButton();
    createLabView();
    bindEvents();
    refreshPageSelect();
    renderLab();
  }

  function waitForLeafReady() {
    if (document.getElementById('viewSeg') && document.getElementById('viewportHost')) {
      install();
      return;
    }
    setTimeout(waitForLeafReady, 100);
  }

  waitForLeafReady();
})();
