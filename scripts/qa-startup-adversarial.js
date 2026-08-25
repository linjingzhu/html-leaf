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
    "const STARTUP_DEBUG_VERSION='source-fidelity-startup-debug-v2'",
    "panel.id='appStartupDebug'",
    'startup.appendChild(panel)',
    'function recordStartupDebug(message,detail)',
    "recordStartupDebug('startup diagnostics active'"
  ])
]);

addPass('2. Old install, missing preload, and runtime mismatch evidence is visible', [
  assertIncludes('preload exposes a narrow local startup diagnostic surface', preload, [
    'function startupInfo()',
    "diagnostics: 'preload-startup-info-v1'",
    'platform: process.platform',
    'electron: process.versions.electron',
    'startupInfo: () => Promise.resolve(startupInfo())'
  ]),
  assertIncludes('startup screen records bridge and runtime evidence', fidelity, [
    "recordStartupDebug('preload bridge probe'",
    "recordStartupDebug('app startup info'",
    "recordStartupDebug('runtime config'",
    "copyButton.textContent='Copy debug'",
    "copyButton.addEventListener('click',copyStartupDebugLog)"
  ])
]);

addPass('3. renderer.js load failures are captured without needing DevTools', [
  assertIncludes('renderer script observer is installed and watches future script nodes', fidelity, [
    'function installRendererScriptObserver()',
    'const observer=new MutationObserver',
    "observer.observe(document.documentElement,{childList:true,subtree:true})",
    'function observeRendererScript(script)',
    '/renderer\\.js(?:$|[?#])/i.test(src)'
  ]),
  assertIncludes('renderer script success and failure events reach the visible log', fidelity, [
    "recordStartupDebug('renderer.js script element detected'",
    "recordStartupDebug('renderer.js load event fired')",
    "reportStartupError('renderer.js failed to load.','renderer-load')",
    "target?.tagName==='SCRIPT'"
  ])
]);

addPass('4. Ready never arrives still leaves a readable failure trail', [
  assertIncludes('LeafStartup reportError now writes through the visible logger', fidelity, [
    'reportError:reportStartupError',
    'clearLegacyStateKeys,',
    'record:recordStartupDebug',
    'getDebugLog:()=>Array.from(window.__leafStartupDebugLog||[])'
  ]),
  assertTrue('older non-logging reportError is not preserved as the active handler',
    !fidelity.includes('reportError:previous.reportError||reportStartupError'),
    'LeafStartup.reportError must not bypass the visible debug log.'),
  assertIncludes('timeouts are recorded even if an earlier startup error already exists', fidelity, [
    "if(existing&&context==='timeout')",
    'existing ${existing.context}: ${existing.detail}',
    "reportStartupError('Renderer did not signal ready within 12 seconds.','timeout')",
    "recordStartupDebug('extensions still waiting for renderer readiness after 2.5s')",
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
