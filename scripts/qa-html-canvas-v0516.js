const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const main = read('src/main.js');
const preload = read('src/preload.js');
const fidelity = read('src/renderer/source-fidelity.js');
const capability = read('src/renderer/html-canvas-capability.js');
const lab = read('src/renderer/canvas-lab.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function includesAll(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}

check('Package exposes HTML-in-Canvas QA', pkg.scripts?.['qa:html-canvas'] === 'node scripts/qa-html-canvas-v0516.js');

includesAll('Experiment stays behind the existing env gate and narrow preload bridge', main + preload, [
  'LEAF_ENABLE_HTML_CANVAS',
  'LEAF_EXPERIMENTAL_HTML_CANVAS',
  "app.commandLine.appendSwitch('enable-blink-features', HTML_CANVAS_BLINK_FEATURE)",
  "runtimeConfig: () => ipcRenderer.invoke('runtime:config')"
]);

includesAll('Capability runtime feature-detects drawElementImage before painting', capability, [
  "typeof ctx?.drawElementImage === 'function'",
  'function detectHtmlInCanvasSupport()',
  "reason: 'unsupported-api'",
  'window.LeafHtmlCanvasRuntime'
]);

includesAll('Canvas Preview is default-off and preserves DOM Preview fallback', capability, [
  'runtime.enabled',
  "slotMode(slot) === 'dom'",
  "setSlotMode(slot, 'dom')",
  "frame.dataset.previewRuntime = 'canvas-fallback'",
  "frame.style.opacity = ''"
]);

includesAll('Canvas Preview synchronizes viewport, zoom, and DPR before first badge', capability, [
  'window.devicePixelRatio || 1',
  'readSlotZoom(slot)',
  'canvas.width = Math.max(1, Math.round(rect.width * dpr))',
  'ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0)',
  'record.firstPaint = true',
  "setRuntimeBadge(slot, 'canvas'"
]);

includesAll('Canvas Preview disables itself while DOM Edit is active', capability, [
  'isEditingSlot(slot)',
  "return fallbackSlot(slot, 'edit-active')",
  "frame.dataset.previewRuntime === 'static-editable-scripts-off'"
]);

includesAll('Fallback reasons are visible and non-destructive', capability, [
  'unsupported-api',
  'paint-failure',
  'protected-content',
  'readback-restricted',
  'data-canvas-fallback-reason',
  "setRuntimeBadge(slot, 'fallback'"
]);

includesAll('Runtime wrappers are stripped from saved source reports', fidelity, [
  '[data-leaf-html-canvas-runtime]',
  'data-leaf-html-canvas-runtime',
  'editorArtifactReport'
]);

includesAll('Compare supports DOM-vs-Canvas A/B validation for the same Page', capability, [
  'function installCompareControls()',
  'data-canvas-ab-bind="same-page"',
  'bindCompareSamePage()',
  "setSlotMode('left', 'dom')",
  "setSlotMode('right', 'canvas')",
  'validateCompareAlignment()'
]);

includesAll('Canvas Lab renders through the real runtime and records pointer transforms', lab, [
  'window.LeafHtmlCanvasRuntime',
  'renderLabThroughRuntime(page)',
  'canvasPointFromEvent(event, canvas)',
  'hit-test',
  'canvasLabMismatchList',
  'validateSlotAlignment'
]);

console.log('\nLeaf HTML-in-Canvas QA');
console.log('======================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
