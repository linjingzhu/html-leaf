const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

const pkg = JSON.parse(read('package.json'));
const html = read('src/renderer/index.html');
const renderer = read('src/renderer/renderer.js');
const fidelity = read('src/renderer/source-fidelity.js');
const themePolicy = read('src/renderer/theme-policy.js');
const scriptedHtmlEdit = read('src/renderer/scripted-html-edit.js');
const previewUniversalEdit = read('src/renderer/preview-universal-edit.js');
const cleanup = read('scripts/apply-roadmap-source-cleanup.js');
const qa = read('scripts/qa-v0516.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function missing(parts, text) {
  return parts.filter(part => !text.includes(part));
}
function includesAll(name, text, parts) {
  const absent = missing(parts, text);
  check(name, absent.length === 0, absent.length ? `Missing: ${absent.join(', ')}` : '');
}

function probeThemePolicyEventLoop() {
  let observerCallback = null;
  let observerTarget = null;
  let observerOptions = null;
  let intervalCallback = null;
  let textWrites = 0;

  const mark = initial => {
    let value = initial;
    return {
      get textContent() { return value; },
      set textContent(next) { value = String(next); textWrites += 1; },
      remove() {}
    };
  };
  const marks = {
    '.theme-dark': [mark('')],
    '.theme-light': [mark('✓')]
  };
  const document = {
    body: { dataset: {} },
    readyState: 'complete',
    querySelectorAll(selector) { return marks[selector] || []; },
    addEventListener() {}
  };
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
  class MutationObserver {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { observerTarget = target; observerOptions = options; }
  }

  vm.runInNewContext(themePolicy, {
    document,
    localStorage,
    MutationObserver,
    setInterval(callback) { intervalCallback = callback; return 1; },
    clearInterval() {},
    console
  }, { timeout: 1000, filename: 'theme-policy.js' });

  intervalCallback?.();
  intervalCallback?.();
  const stableWrites = textWrites;
  document.body.dataset.theme = 'dark';
  observerCallback?.([]);
  const changedWrites = textWrites;
  observerCallback?.([]);

  return {
    pass: observerTarget === document.body &&
      observerOptions?.attributes === true &&
      observerOptions?.childList !== true &&
      observerOptions?.subtree !== true &&
      stableWrites === 0 &&
      changedWrites === 2 &&
      textWrites === changedWrites,
    detail: JSON.stringify({ observerOptions, stableWrites, changedWrites, finalWrites: textWrites })
  };
}

function probeScriptedHtmlEditTransition() {
  const listeners = new Map();
  const classes = new Set(['scripted-preview']);
  const pane = {
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); }
    }
  };
  const frame = {
    dataset: { previewRuntime: 'interactive-isolated' },
    attributes: new Map([['sandbox', 'allow-scripts']]),
    closest(selector) { return selector === '.view-pane' ? pane : null; },
    addEventListener() {},
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    srcdoc: ''
  };
  const badgeClasses = new Set();
  const badge = {
    hidden: true,
    dataset: {},
    textContent: '',
    title: '',
    classList: {
      add(name) { badgeClasses.add(name); },
      remove(name) { badgeClasses.delete(name); }
    }
  };
  const page = {
    id: 'page-scripted',
    type: 'page',
    documentType: 'html',
    source: '<!doctype html><html><head></head><body><main>Editable</main><script>window.rendered=true</script></body></html>'
  };
  const state = { views: { single: page.id }, documents: [{ nodes: [page] }] };
  const document = {
    getElementById(id) { return id === 'singleFrame' ? frame : null; },
    querySelector(selector) { return selector === '[data-runtime-badge="single"]' ? badge : null; },
    addEventListener(type, callback) { listeners.set(type, callback); }
  };

  vm.runInNewContext(scriptedHtmlEdit, {
    document,
    localStorage: { getItem() { return JSON.stringify(state); } },
    setTimeout(callback) { callback(); return 1; },
    console,
    Date,
    Math
  }, { timeout: 1000, filename: 'scripted-html-edit.js' });

  const transition = listeners.get('leaf-edit-runtime-transition');
  transition?.({ detail: { enabled: true, slot: 'single', pageId: page.id } });
  const enabled = frame.dataset.previewRuntime === 'static-editable-scripts-off' &&
    frame.attributes.get('sandbox') === 'allow-same-origin' &&
    frame.srcdoc.includes('<main>Editable</main>') &&
    frame.srcdoc.includes("script-src 'none'") &&
    classes.has('scripts-off-edit');
  transition?.({ detail: { enabled: false, slot: 'single', pageId: page.id } });
  const disabled = frame.dataset.previewRuntime === 'interactive-isolated' &&
    frame.attributes.get('sandbox') === 'allow-scripts' &&
    classes.has('scripted-preview') &&
    !classes.has('scripts-off-edit');

  return {
    pass: !!transition && enabled && disabled,
    detail: JSON.stringify({ enabled, disabled, runtime: frame.dataset.previewRuntime })
  };
}

check('Renderer restores persisted Leaf state before creating a fallback state',
  renderer.includes('let state = normalizeState(loadState() || createDefaultState());') &&
  !renderer.includes('let state = normalizeState(createDefaultState());'));

check('Only renderer bootstrap is allowed to set leafReady true',
  renderer.includes("document.documentElement.dataset.leafReady='true'") &&
  !html.includes("document.documentElement.dataset.leafReady = 'true';") &&
  !fidelity.includes("document.documentElement.dataset.leafReady='true';"));

includesAll('Inline startup Continue refuses to fake readiness', html, [
  "document.documentElement.dataset.leafReady !== 'true'",
  'Cannot continue before renderer signals ready.',
  'manual-continue-before-ready',
  "startup.setAttribute('aria-hidden', 'true')"
]);

includesAll('Source-fidelity manual Continue refuses to fake readiness', fidelity, [
  "function hideStartupOverlay(reason='manual')",
  'if(!isRendererReady())',
  "reportStartupError('Cannot continue before renderer signals ready.'",
  'releaseStartupPointerBarrier(reason)'
]);

includesAll('Theme policy check synchronization is idempotent', themePolicy, [
  'function setThemeCheck(selector, checked)',
  'if (mark.textContent !== next) mark.textContent = next;'
]);

check('Theme policy observer cannot recursively watch its own child updates',
  themePolicy.includes('observer.observe(document.body, {') &&
  themePolicy.includes("attributeFilter: ['data-theme']") &&
  !themePolicy.includes('observer.observe(document.documentElement') &&
  !/observer\.observe\([\s\S]*?childList\s*:\s*true/.test(themePolicy));

const themePolicyProbe = probeThemePolicyEventLoop();
check('Theme policy remains idle across repeated enforcement and observer callbacks',
  themePolicyProbe.pass,
  themePolicyProbe.detail);

check('Renderer exclusively owns Edit button availability',
  renderer.includes('button.disabled=unavailable;') &&
  !/button\.disabled\s*=/.test(scriptedHtmlEdit) &&
  !/button\.disabled\s*=/.test(previewUniversalEdit));

includesAll('Renderer publishes scripted and visual Edit runtime transitions', renderer, [
  'const scriptedHtmlAvailable=pageRequiresScripts(page)&&!!frame;',
  "frame.dataset.previewRuntime!=='interactive-isolated'||scriptedHtmlAvailable",
  "new CustomEvent('leaf-edit-runtime-transition'"
]);

check('Edit extensions cannot create an attribute-observer feedback loop',
  !scriptedHtmlEdit.includes('new MutationObserver') &&
  !previewUniversalEdit.includes('new MutationObserver') &&
  !scriptedHtmlEdit.includes('setInterval(') &&
  !previewUniversalEdit.includes('setInterval('));

check('Edit extensions consume the renderer transition event without competing click handlers',
  scriptedHtmlEdit.includes("document.addEventListener('leaf-edit-runtime-transition'") &&
  previewUniversalEdit.includes("document.addEventListener('leaf-edit-runtime-transition'") &&
  !scriptedHtmlEdit.includes('handleEditClick') &&
  !previewUniversalEdit.includes("event.target.closest?.('[data-edit-slot]')"));

const scriptedHtmlEditProbe = probeScriptedHtmlEditTransition();
check('Scripted HTML Edit event performs a reversible runtime transition',
  scriptedHtmlEditProbe.pass,
  scriptedHtmlEditProbe.detail);

const startupErrorReleaseCount = (html.match(
  /startup\?\.classList\.remove\('is-complete'\);\r?\n\s*if \(startup\) startup\.style\.pointerEvents = 'auto';/g
) || []).length;
check('Inline startup error pointer release appears exactly once',
  startupErrorReleaseCount === 1,
  `Found ${startupErrorReleaseCount} copies`);

includesAll('Roadmap cleanup normalizes startup error recovery idempotently', cleanup, [
  "'startup error pointer release'",
  "startup\\?\\.classList\\.remove\\('is-complete'\\)",
  "startup\\?\\.classList\\.add\\('startup-error'\\)"
]);

check('Roadmap cleanup no longer rewrites QA files',
  !cleanup.includes('cleanupStaticQa') &&
  !cleanup.includes('cleanupStartupAdversarialQa') &&
  !cleanup.includes('cleanupThemeLightQa') &&
  !cleanup.includes('removeHistoricalCodexQa') &&
  !cleanup.includes('scripts/qa-'));

check('Startup readiness guard is wired in package scripts',
  pkg.scripts?.['qa:startup-readiness'] === 'node scripts/qa-startup-readiness-guard.js');

const spawnedQaFiles = [...qa.matchAll(/path\.join\(__dirname,'([^']+)'\)/g)].map(match => `scripts/${match[1]}`);
check('npm run qa references only existing child QA scripts',
  spawnedQaFiles.every(exists),
  spawnedQaFiles.filter(file => !exists(file)).join(', '));

console.log('\nLeaf startup readiness guard QA');
console.log('===============================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);

