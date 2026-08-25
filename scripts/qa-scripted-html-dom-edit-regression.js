const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const fixture = read('tests/html-fixtures/11-scripted-dom-edit.html');
const extension = read('src/renderer/scripted-html-edit.js');
const renderer = read('src/renderer/renderer.js');
const fidelity = read('src/renderer/source-fidelity.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function includesAll(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}
function ordered(text, parts) {
  let offset = -1;
  return parts.every(part => {
    const next = text.indexOf(part, offset + 1);
    if (next < 0) return false;
    offset = next;
    return true;
  });
}

check('Fixture is synthetic and contains no user document name',
  !fixture.includes('DEV-20453') && !fixture.includes('Tangent_Handle'));

includesAll('Synthetic fixture covers script-driven document UI behavior', fixture, [
  'data-lang-target="en"',
  'data-lang-target="ko"',
  "localStorage.setItem('leafFixtureActiveSection'",
  "document.createElement('li')",
  "item.dataset.runtimeItem = 'true'"
]);

includesAll('Interactive Preview path is isolated and script-enabled', extension, [
  "frame.dataset.previewRuntime = 'interactive-isolated'",
  "frame.setAttribute('sandbox', 'allow-scripts')",
  'frame.srcdoc = buildInteractiveSource(page, token)'
]);

includesAll('Edit switches active View to scripts-off selectable DOM', extension, [
  "frame.dataset.previewRuntime = 'static-editable-scripts-off'",
  "frame.setAttribute('sandbox', 'allow-same-origin')",
  'frame.srcdoc = buildStaticEditSource(page)',
  "setRuntimeBadge(slot, 'scripts-off')",
  "document.addEventListener('leaf-edit-runtime-transition'"
]);

includesAll('Renderer keeps scripted HTML Edit available before runtime conversion', renderer, [
  'const scriptedHtmlAvailable=pageRequiresScripts(page)&&!!frame;',
  "frame.dataset.previewRuntime!=='interactive-isolated'||scriptedHtmlAvailable",
  "new CustomEvent('leaf-edit-runtime-transition'"
]);

check('Transition path is explicitly represented in scripted edit source',
  ordered(extension, [
    'function enableStaticHtmlEdit(slot, page)',
    "frame.dataset.previewRuntime = 'static-editable-scripts-off'",
    'frame.srcdoc = buildStaticEditSource(page)',
    'function restoreInteractivePreview(slot, page)',
    "frame.dataset.previewRuntime = 'interactive-isolated'",
    'frame.srcdoc = buildInteractiveSource(page, token)',
    'function handleEditRuntimeTransition(event)',
    'if (enabled) enableStaticHtmlEdit(slot, page);',
    'else restoreInteractivePreview(slot, page);'
  ]),
  'Expected renderer Edit state to route interactive Preview into scripts-off DOM Edit and back.');

check('Scripted Edit has no competing button observer or polling loop',
  !/button\.disabled\s*=/.test(extension) &&
  !extension.includes('new MutationObserver') &&
  !extension.includes('setInterval('));

includesAll('Authored DOM nodes remain selectable in scripts-off same-origin edit surface', extension + fixture, [
  "frame.setAttribute('sandbox', 'allow-same-origin')",
  'frame.srcdoc = buildStaticEditSource(page)',
  'data-edit-target="language-toolbar"',
  'data-edit-target="hero"',
  'data-edit-target="api-section"',
  'data-edit-target="runtime-list"'
]);

includesAll('Script tags are preserved and runtime artifacts are stripped before save', fidelity, [
  'stripEditorArtifactsFromDocument',
  '[data-editor-overlay]',
  'data-leaf-scrollbar-runtime',
  'editorArtifactReport'
]);

check('Fixture source contains no Leaf editor artifacts',
  !['data-editor-overlay', 'data-adf-marker', 'data-hbe-drop-line', 'data-editor-element-id', 'data-leaf-scrollbar-runtime'].some(marker => fixture.includes(marker)));

console.log('\nLeaf scripted HTML DOM Edit transition QA');
console.log('=======================================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
