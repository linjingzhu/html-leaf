const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const fixture = read('tests/html-fixtures/11-scripted-dom-edit.html');
const extension = read('src/renderer/scripted-html-edit.js');
const fidelity = read('src/renderer/source-fidelity.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function checkIncludesAll(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}
function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

const lineEnding = extension.includes('\r\n') ? '\r\n' : '\n';
const instrumented = extension.replace(
  /  waitForLeafReady\(\);\r?\n\}\);\s*$/,
  [
    '  globalThis.__scriptedHtmlEditApi = {',
    '    hasRenderableContent,',
    '    isScriptedHtmlPage,',
    '    buildStaticEditSource,',
    '    buildInteractiveSource,',
    '    runtimePreviewScrollbarCss',
    '  };',
    '})();'
  ].join(lineEnding)
);
check('Scripted HTML Edit extension can be QA-instrumented without changing source', instrumented !== extension);

let api = null;
if (instrumented !== extension) {
  const context = { console };
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: 'scripted-html-edit.js' });
  api = context.__scriptedHtmlEditApi;
}
check('QA instrumentation exposes pure scripted edit helpers',
  !!api && ['hasRenderableContent', 'isScriptedHtmlPage', 'buildStaticEditSource', 'buildInteractiveSource'].every(name => typeof api[name] === 'function'));

const page = {
  id: 'fixture-scripted-dom-edit',
  documentType: 'html',
  isEmpty: false,
  source: fixture,
  baseUrl: 'file:///tmp/leaf-fixtures/'
};
const staticSource = api ? api.buildStaticEditSource(page) : '';
const interactiveSource = api ? api.buildInteractiveSource(page, 'qa-token') : '';
const fixtureScriptCount = countMatches(fixture, /<script\b/gi);
const forbiddenFixtureText = ['DEV-20453', 'Tangent_Handle', 'data-editor-overlay', 'data-adf-marker', 'data-hbe-drop-line', 'data-editor-element-id', 'data-leaf-scrollbar-runtime'];

check('Synthetic fixture is scripted HTML', api?.hasRenderableContent(page) && api?.isScriptedHtmlPage(page));
check('Synthetic fixture is not derived from the reported user document',
  !forbiddenFixtureText.slice(0, 2).some(text => fixture.includes(text)));
check('Synthetic fixture contains no Leaf editor artifacts before loading',
  !forbiddenFixtureText.slice(2).some(text => fixture.includes(text)));
checkIncludesAll('Synthetic fixture covers language toggle behavior', fixture,
  ['data-lang-target="en"', 'data-lang-target="ko"', 'function setLanguage(lang)', 'document.documentElement.dataset.activeLanguage = lang']);
checkIncludesAll('Synthetic fixture covers local navigation and TOC state', fixture,
  ['href="#intro"', 'href="#api"', "localStorage.setItem('leafFixtureActiveSection'", 'id="api"']);
checkIncludesAll('Synthetic fixture covers runtime DOM mutation behavior', fixture,
  ['document.createElement(\'li\')', "item.dataset.runtimeItem = 'true'", "document.getElementById('runtimeList').appendChild(item)"]);
checkIncludesAll('Synthetic fixture keeps authored objects selectable in scripts-off DOM Edit', fixture,
  ['data-edit-target="hero"', 'data-edit-target="api-section"', 'data-edit-target="runtime-list"', 'data-edit-target="action-button"']);

check('Non-HTML and empty scripted pages are rejected',
  api && !api.isScriptedHtmlPage({ ...page, documentType: 'markdown' }) &&
  !api.hasRenderableContent({ ...page, isEmpty: true }) &&
  !api.isScriptedHtmlPage({ ...page, source: '<main>No scripts</main>' }));
checkIncludesAll('Static edit source injects scripts-off CSP and base URL', staticSource,
  ['<base href="file:///tmp/leaf-fixtures/">', "script-src 'none'", "object-src 'none'", "frame-src 'none'"]);
check('Static edit source preserves authored script tags instead of deleting user source',
  countMatches(staticSource, /<script\b/gi) === fixtureScriptCount,
  `fixture=${fixtureScriptCount}, static=${countMatches(staticSource, /<script\b/gi)}`);
check('Static edit source does not add the interactive bridge script',
  !staticSource.includes('data-hbe-export-bridge') && !staticSource.includes('__hbeRenderedSnapshot'));
checkIncludesAll('Static edit source preserves selectable authored DOM nodes', staticSource,
  ['data-edit-target="language-toolbar"', 'data-edit-target="hero"', 'data-edit-target="api-section"', 'data-edit-target="runtime-list"']);
checkIncludesAll('Static edit source adds only removable Leaf runtime chrome', staticSource,
  ['data-editor-overlay="1"', 'data-leaf-scrollbar-runtime="1"']);

checkIncludesAll('Interactive preview source keeps scripts enabled and isolated', interactiveSource,
  ["script-src 'unsafe-inline'", 'data-hbe-export-bridge', '__hbeRenderedSnapshot', 'qa-token']);
check('Interactive preview source preserves authored script tags plus one bridge script',
  countMatches(interactiveSource, /<script\b/gi) === fixtureScriptCount + 1,
  `fixture=${fixtureScriptCount}, interactive=${countMatches(interactiveSource, /<script\b/gi)}`);
checkIncludesAll('Interactive bridge protects local anchor navigation from iframe navigation', interactiveSource,
  ["raw[0] !== '#'", 'document.getElementById(fragment) || document.getElementsByName(fragment)[0]', "target.scrollIntoView({ block: 'start'"]);

checkIncludesAll('Edit click transitions scripted pages into selectable scripts-off DOM', extension,
  ["frame.dataset.previewRuntime = 'static-editable-scripts-off'", "frame.dataset.snapshotToken = ''", "frame.setAttribute('sandbox', 'allow-same-origin')", 'frame.srcdoc = buildStaticEditSource(page)', "setRuntimeBadge(slot, 'scripts-off')"]);
checkIncludesAll('Edit toggle restores scripted pages to interactive isolated preview', extension,
  ["frame.dataset.previewRuntime = 'interactive-isolated'", "frame.setAttribute('sandbox', 'allow-scripts')", 'frame.srcdoc = buildInteractiveSource(page, token)', "setRuntimeBadge(slot, 'interactive')"]);
checkIncludesAll('Scripted Edit keeps the Edit button enabled for scripted HTML pages', extension,
  ['function refreshEditButtons()', 'button.disabled = false', "Enable scripts-off DOM Edit for this scripted Page"]);
checkIncludesAll('Source fidelity strips scripted-edit runtime artifacts before save', fidelity,
  ['[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line],[data-leaf-scrollbar-runtime]', "'data-leaf-scrollbar-runtime'", 'editorArtifactReport']);

console.log('\nLeaf scripted HTML Edit QA');
console.log('==========================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
