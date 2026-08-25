const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/build-windows.yml');
const html = read('src/renderer/index.html');
const preload = read('src/preload.js');
const fidelity = read('src/renderer/source-fidelity.js');

const passes = [];
function assertIncludes(name, text, parts) {
  const missing = parts.filter(part => !text.includes(part));
  return { name, pass: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(', ')}` : '' };
}
function assertTrue(name, condition, detail = '') {
  return { name, pass: !!condition, detail };
}
function before(text, left, right) {
  const l = text.indexOf(left);
  const r = text.indexOf(right);
  return l >= 0 && r >= 0 && l < r;
}
function addPass(name, checks) {
  passes.push({ name, checks });
}

addPass('1. Startup screen remains diagnosable before renderer.js executes', [
  assertIncludes('startup overlay exists in the application shell', html, [
    'id="appStartup"',
    'id="appStartupMessage"',
    'setTimeout(loadRenderer, 80)'
  ]),
  assertIncludes('visible debug panel is created by the early fidelity bundle', fidelity, [
    "const STARTUP_DEBUG_VERSION='source-fidelity-startup-debug-v3'",
    "panel.id='appStartupDebug'",
    'startup.appendChild(panel)',
    'function recordStartupDebug(message,detail)',
    "recordStartupDebug('startup diagnostics active'"
  ])
]);

addPass('2. Startup debug actions remain clickable even while loading is stuck', [
  assertIncludes('startup actions use capture-level event handling', fidelity, [
    'function installStartupActionCapture()',
    "document.addEventListener('pointerup',handleStartupActionEvent,true)",
    "document.addEventListener('click',handleStartupActionEvent,true)",
    "continueButton.dataset.leafStartupAction='continue'",
    "resetButton.dataset.leafStartupAction='reset'",
    "copyButton.dataset.leafStartupAction='copy'"
  ]),
  assertIncludes('startup buttons force pointer events and expose Electron clipboard fallback', fidelity, [
    "startup.style.pointerEvents='auto'",
    "'pointer-events:auto'",
    'window.electronAPI?.writeTextClipboard',
    'fallbackCopyStartupDebugLog(text)',
    "startup.style.pointerEvents='none'"
  ])
]);

addPass('3. renderer.js load failures and missing loader progress are recoverable', [
  assertIncludes('renderer script observer is installed and watches future script nodes', fidelity, [
    'function installRendererScriptObserver()',
    'const observer=new MutationObserver',
    "observer.observe(document.documentElement,{childList:true,subtree:true})",
    'function observeRendererScript(script)',
    'function hasRendererBootstrapScript()'
  ]),
  assertIncludes('source-fidelity can recover when the bottom inline renderer loader is never reached', fidelity, [
    'function ensureRendererBootstrapRecovery()',
    'function loadRendererScriptFromStartupRecovery',
    "script.dataset.leafRendererRecovery=reason",
    "recordStartupDebug('renderer startup recovery appended renderer.js'",
    'RENDERER_BOOTSTRAP_MAX_WAIT_MS',
    "duplicate renderer.js script removed after startup recovery"
  ])
]);

addPass('4. Renderer recovery preserves dependencies and does not wait only on DOMContentLoaded', [
  assertIncludes('renderer recovery loads startup dependencies before renderer.js', fidelity, [
    "{src:'./widget-registry.js',global:'WidgetRegistry'}",
    "{src:'./jira-compat.js',global:'JiraCompatibility'}",
    "{src:'./semantic-document.js',global:'SemanticDocument'}",
    "{src:'./jira-export.js',global:'JiraExport'}",
    'for(const dep of RENDERER_BOOTSTRAP_DEPENDENCIES)',
    'await loadStartupDependencyScript(dep)'
  ]),
  assertIncludes('extensions install immediately when the app shell is already parsed', fidelity, [
    'function canInstallExtensionsImmediately()',
    "document.readyState==='loading'&&!canInstallExtensionsImmediately()",
    "recordStartupDebug('document still loading; app shell parsed; installing extensions before DOMContentLoaded')",
    "recordStartupDebug('renderer ready marker observed')"
  ])
]);

addPass('5. Windows build cannot start until adversarial and static QA pass', [
  assertTrue('package exposes qa:startup-adversarial',
    pkg.scripts && pkg.scripts['qa:startup-adversarial'] === 'node scripts/qa-startup-adversarial.js',
    JSON.stringify(pkg.scripts || {})),
  assertIncludes('Windows workflow runs adversarial QA and static QA', workflow, [
    'Run adversarial startup QA and static QA',
    'npm run qa:startup-adversarial',
    'npm run qa:static',
    'npm run qa:scripted-html-edit',
    'npm run qa:theme-light',
    'Build Windows installer + zip'
  ]),
  assertTrue('adversarial QA runs before static QA', before(workflow, 'npm run qa:startup-adversarial', 'npm run qa:static')),
  assertTrue('static QA runs before Windows build', before(workflow, 'npm run qa:static', 'Build Windows installer + zip'))
]);

if (passes.length !== 5) {
  console.error(`Expected exactly 5 adversarial passes, found ${passes.length}.`);
  process.exit(1);
}

console.log('\nLeaf startup adversarial QA');
console.log('===========================');
let failed = 0;
for (const pass of passes) {
  const ok = pass.checks.every(check => check.pass);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${pass.name}`);
  for (const check of pass.checks) {
    console.log(`  ${check.pass ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
  }
}

const totalChecks = passes.reduce((sum, pass) => sum + pass.checks.length, 0);
const passedChecks = passes.reduce((sum, pass) => sum + pass.checks.filter(check => check.pass).length, 0);
console.log(`\n${passes.length - failed}/${passes.length} adversarial passes passed.`);
console.log(`${passedChecks}/${totalChecks} checks passed.`);
if (failed) process.exit(1);
