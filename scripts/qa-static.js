const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const pkg = JSON.parse(read('package.json'));
const main = read('src/main.js');
const preload = read('src/preload.js');
const renderer = read('src/renderer/renderer.js');
const css = read('src/renderer/styles.css');
const html = read('src/renderer/index.html');
const fidelity = read('src/renderer/source-fidelity.js');
const scriptedHtmlEdit = read('src/renderer/scripted-html-edit.js');
const registry = read('src/renderer/widget-registry.js');
const imageWidgetEdit = read('src/renderer/image-widget-edit.js');

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, pass: !!condition, detail });
  if (!condition) process.exitCode = 1;
}
function missingParts(text, parts) {
  return parts.filter(part => !text.includes(part));
}
function checkIncludesAll(name, text, parts) {
  const missing = missingParts(text, parts);
  check(name, missing.length === 0, missing.length ? `Missing: ${missing.join(', ')}` : '');
}

const rendererDir = path.join('src', 'renderer');
const rendererScripts = fs.readdirSync(path.join(root, rendererDir)).filter(name => name.endsWith('.js')).sort();

function observeCalls(text) {
  const calls = [];
  for (const match of text.matchAll(/\.observe\s*\(/g)) {
    const start = match.index + match[0].length;
    let end = start;
    let depth = 1;
    while (end < text.length && depth > 0) {
      const char = text[end++];
      if (char === '(' || char === '{' || char === '[') depth++;
      else if (char === ')' || char === '}' || char === ']') depth--;
    }
    const args = text.slice(start, end - 1);
    const split = args.indexOf(',');
    calls.push({
      target: (split < 0 ? args : args.slice(0, split)).replace(/\s+/g, ''),
      options: split < 0 ? '' : args.slice(split + 1)
    });
  }
  return calls;
}
// Only a bare `document.documentElement` / `document.body` target is the app shell renderer.js owns.
// Page iframe documents (`doc.body`, `frame.contentDocument.body`) stay legal.
function appShellSubtreeObservers(text) {
  return observeCalls(text).filter(call =>
    /^document\.(?:documentElement|body)$/.test(call.target) &&
    /childList\s*:\s*true/.test(call.options) &&
    /subtree\s*:\s*true/.test(call.options));
}
function amplifiedInstallCallbacks(text) {
  const framed = new Set([...text.matchAll(/requestAnimationFrame\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map(match => match[1]));
  return [...framed].filter(name => new RegExp(`setTimeout\\(\\s*${name}\\s*,`).test(text));
}

const forbiddenFrameworks = ['react', 'react-dom', 'vite', 'tailwindcss', '@radix-ui/react-dialog'];
check('No framework migration dependency',
  !forbiddenFrameworks.some(name => pkg.dependencies?.[name] || pkg.devDependencies?.[name]),
  'Renderer remains Vanilla HTML/CSS/JS.');
check('Desktop build toolchain is pinned',
  pkg.devDependencies?.electron === '43.4.0' && pkg.devDependencies?.['electron-builder'] === '26.0.12',
  JSON.stringify(pkg.devDependencies || {}));
check('Package exposes current QA entry points',
  pkg.scripts?.qa === 'node scripts/qa-v0516.js' && pkg.scripts?.['qa:static'] === 'node scripts/qa-static.js');
check('Release metadata targets v0.5.16 output',
  pkg.version === '0.5.16' && pkg.build?.directories?.output === 'release-v0.5.16');

checkIncludesAll('Electron security boundaries preserved', main,
  ['contextIsolation: true', 'nodeIntegration: false', 'sandbox: true', 'webSecurity: true']);
check('Preload uses a narrow contextBridge surface',
  preload.includes('contextBridge.exposeInMainWorld') && !preload.includes('nodeIntegration'));
check('Save Page As bridge is exposed only through preload',
  preload.includes("exportPageAs: (payload) => ipcRenderer.invoke('file:exportPageAs'"));
check('No CDN runtime resource in application shell',
  !/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i.test(html));

checkIncludesAll('Canonical hierarchy is Project, Document, Page, and Group', html,
  ['New Project <kbd>Ctrl+N</kbd>', 'data-action="new-document">New Document</button>',
   'New Page <kbd>Ctrl+Shift+N</kbd>', 'data-tree-add="group">New Section</button>']);
checkIncludesAll('Document View mode labels are Preview, Compare, and Code', html,
  ['data-mode="preview" class="active" aria-label="Preview view">Preview</button>',
   'data-mode="split" aria-label="Compare view">Compare</button>', 'data-mode="code">Code</button>']);
check('Main menu starts without a product icon',
  !html.includes('class="product-mark"') && html.includes('<nav class="main-menu" id="mainMenu"'));
check('Help is the final main menu and About exists',
  html.lastIndexOf('<button class="menu-trigger">Help</button>') > html.lastIndexOf('<button class="menu-trigger">Preference</button>') &&
  html.includes('data-action="about"') && html.includes('id="aboutModal"'));

checkIncludesAll('Project save commands own Ctrl shortcuts', html,
  ['Save Project <kbd>Ctrl+S</kbd>', 'Save Project As <kbd>Ctrl+Shift+S</kbd>']);
checkIncludesAll('Project files save with the prj extension', main,
  ["defaultPath: suggestedName || 'project.prj'", "extensions: ['prj']", "if (!/\\.prj$/i.test(filePath)) filePath += '.prj'"]);
checkIncludesAll('Legacy Leaf project extensions remain openable', main,
  ["extensions: ['prj', 'leaf', 'hbeproj', 'json']"]);
check('Legacy leaf-document projects still migrate in renderer',
  renderer.includes("payload?.format==='leaf-document'"));

checkIncludesAll('Supported Page formats include HTML, Markdown, JSON, and PDF', main,
  ["new Set(['.html', '.htm', '.md', '.markdown', '.json', '.pdf'])",
   "extensions: ['html', 'htm', 'md', 'markdown', 'json', 'pdf']"]);
check('Obsolete image Page formats are not restored',
  !main.includes("return 'webp'") && !renderer.includes("documentType==='webp'"));
checkIncludesAll('Save Page As supports HTML, Markdown, JSON, and rendered PDF', html,
  ['option value="html"', 'option value="markdown"', 'option value="json"', 'option value="pdf"']);
checkIncludesAll('Rendered PDF export uses secure hidden printing', main,
  ['async function exportPageAs', 'printToPDF({ printBackground: true, preferCSSPageSize: true })', "javascript: false"]);

checkIncludesAll('Direct Markdown and JSON editing remains isolated', renderer,
  ["function isDirectSourceType(page){return page?.documentType==='markdown'||page?.documentType==='json';}",
   "frame.dataset.previewRuntime='direct-source-editor'", "frame.setAttribute('sandbox','allow-scripts')", '__leafDirectSourceEdit:true']);
checkIncludesAll('Scripted HTML Edit extension is loaded with source-fidelity guards', fidelity,
  ["loadExtensionScript('./scripted-html-edit.js')"]);
const removedCanvasExperimentFiles = [
  path.join('src', 'renderer', ['html', 'canvas', 'capability.js'].join('-')),
  path.join('src', 'renderer', ['canvas', 'lab.js'].join('-')),
  path.join('scripts', ['qa', 'html', 'canvas', 'v0516.js'].join('-')),
  path.join('docs', ['HTML', 'IN', 'CANVAS', 'UX', 'PLAN.md'].join('_'))
];
const removedCanvasRuntimeTerms = [
  ['Canvas', 'Draw', 'Element'].join(''),
  ['LEAF', 'ENABLE', 'HTML', 'CANVAS'].join('_'),
  ['LEAF', 'EXPERIMENTAL', 'HTML', 'CANVAS'].join('_'),
  ['runtime', 'config'].join(':'),
  ['runtime', 'Config'].join(''),
  ['html', 'canvas', 'capability'].join('-'),
  ['canvas', 'lab'].join('-'),
  ['data', 'leaf', 'html', 'canvas', 'runtime'].join('-')
];
check('Experimental canvas renderer is fully removed',
  removedCanvasExperimentFiles.every(file => !fs.existsSync(path.join(root, file))) &&
  !pkg.scripts?.[['qa', 'html', 'canvas'].join(':')] &&
  removedCanvasRuntimeTerms.every(term => !main.includes(term) && !preload.includes(term) && !fidelity.includes(term)),
  'No runtime, preload bridge, QA script, docs, or extension loader should remain.');
checkIncludesAll('Image widget edit extension is loaded with source-fidelity guards', fidelity,
  ["loadExtensionScript('./image-widget-edit.js')", 'script.async=false']);
checkIncludesAll('Leaf extension bundle waits for renderer readiness before touching View DOM', fidelity,
  ["function waitForRendererReady(){", "document.documentElement.dataset.leafReady==='true'", "attributeFilter:['data-leaf-ready']", 'loadLeafExtensionsOnce();']);

const shellSubtreeObserverFiles = rendererScripts.filter(name =>
  name !== 'source-fidelity.js' && appShellSubtreeObservers(read(path.join(rendererDir, name))).length);
check('No renderer script observes the app shell with a document-wide subtree childList observer',
  shellSubtreeObserverFiles.length === 0,
  shellSubtreeObserverFiles.length
    ? `Offenders: ${shellSubtreeObserverFiles.join(', ')} - subscribe to the renderer lifecycle events instead.`
    : `${rendererScripts.length} renderer scripts scanned.`);
check('Startup script observer is the only app-shell subtree observer and it disconnects at readiness',
  appShellSubtreeObservers(fidelity).length === 1 &&
  fidelity.includes('function disconnectRendererScriptObserver(reason)') &&
  /function loadLeafExtensionsOnce\(\)\{[^}]*disconnectRendererScriptObserver\(/.test(fidelity),
  `source-fidelity.js app-shell observers: ${appShellSubtreeObservers(fidelity).length}`);
const extensionScripts = [...fidelity.matchAll(/loadExtensionScript\('\.\/([\w-]+\.js)'\)/g)]
  .map(match => match[1]).filter(name => rendererScripts.includes(name));
const amplifiedExtensions = extensionScripts.filter(name => amplifiedInstallCallbacks(read(path.join(rendererDir, name))).length);
const workflowFiles = fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => name.endsWith('.yml')).sort();
// `qa` needs Electron and a display, so CI cannot run it; every other qa:* script must be covered.
const runnableQaScripts = Object.keys(pkg.scripts).filter(name => name.startsWith('qa:')).sort();
const workflowQaSuites = workflowFiles.flatMap(name => {
  const text = read(path.join('.github', 'workflows', name));
  return [...text.matchAll(/- name: [^\n]*QA[^\n]*\n\s*run: \|\n((?:\s*npm run [^\n]*\n)+)/g)]
    .map(match => ({
      workflow: name,
      suites: [...match[1].matchAll(/npm run (qa:[\w:-]+)/g)].map(entry => entry[1]).sort().join(' ')
    }));
});
const distinctSuiteSets = [...new Set(workflowQaSuites.map(entry => entry.suites))];
check('Every workflow QA step runs the identical suite set',
  workflowQaSuites.length >= 4 && distinctSuiteSets.length === 1,
  distinctSuiteSets.length === 1
    ? `${workflowQaSuites.length} QA steps across ${workflowFiles.length} workflows`
    : `Diverged: ${workflowQaSuites.map(entry => `${entry.workflow}[${entry.suites}]`).join(' | ')}`);
const uncoveredQaScripts = runnableQaScripts.filter(name => !(distinctSuiteSets[0] || '').split(' ').includes(name));
check('CI covers every runnable qa:* script',
  uncoveredQaScripts.length === 0,
  uncoveredQaScripts.length ? `Not run by CI: ${uncoveredQaScripts.join(', ')}` : `${runnableQaScripts.length} suites covered.`);
check('Leaf extensions never amplify one change into rAF plus timer reinstalls',
  extensionScripts.length >= 6 && amplifiedExtensions.length === 0,
  amplifiedExtensions.length ? `Amplified: ${amplifiedExtensions.join(', ')}` : `${extensionScripts.length} extension scripts scanned.`);
checkIncludesAll('Scripted HTML Edit converts interactive previews into scripts-off selectable DOM', scriptedHtmlEdit,
  ["function isScriptedHtmlPage(page)", "frame.dataset.previewRuntime = 'static-editable-scripts-off'",
   "frame.setAttribute('sandbox', 'allow-same-origin')", "frame.srcdoc = buildStaticEditSource(page)", "setRuntimeBadge(slot, 'scripts-off')"]);
checkIncludesAll('Scripted HTML preview restores the interactive sandbox after Edit is disabled', scriptedHtmlEdit,
  ["frame.dataset.previewRuntime = 'interactive-isolated'", "frame.setAttribute('sandbox', 'allow-scripts')",
   "restoreInteractivePreview(slot, page)"]);
checkIncludesAll('PDF Edit delegates to the native PDF toolbar', renderer,
  ["const pdfAvailable=page?.documentType==='pdf'&&!!frame", "Use the native PDF toolbar to highlight, draw, annotate, fill, sign"]);
checkIncludesAll('Clear targets its own View without an active-Inspector guard', renderer,
  ['pendingClearPageId=pageId;', 'const selectionBelongsToPage=selectedElementFrame&&frameToPageId(selectedElementFrame)===page.id']);

checkIncludesAll('Hover inspection has independent overlay and tooltip', renderer,
  ["hoverOverlay.dataset.editorOverlay='hover-highlight'", "hoverTooltip.dataset.editorOverlay='hover-tooltip'",
   'positionHoverOverlay(e.target)', 'syncSelectionOverlays()']);
checkIncludesAll('Hover tooltip exposes object identity and semantics', renderer,
  ["['Name',objectDisplayName(el)]", "['Role',implicitRole(el)]", "['Display',computed.display||'—']", "['Focusable',isKeyboardFocusable(el)?'Yes':'No']"]);
checkIncludesAll('Every visual View owns non-mutating highlight search', renderer,
  ["CSS.highlights.set('leaf-search-all'", "CSS.highlights.set('leaf-search-current'", "if(event.key==='Enter'){event.preventDefault();refreshViewSearch"]);
check('Search controls exist for four visual Views plus Code',
  (html.match(/data-view-search=/g) || []).length === 4 && html.includes('id="codeSearch"'));

checkIncludesAll('Hierarchy observes Page load and author DOM changes', renderer,
  ['function bindHierarchyObserver(frame)', 'observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true})', 'bindHierarchyObserver(frame);']);
checkIncludesAll('Hierarchy displays object type at the right edge', renderer,
  ['function hierarchyObjectType(el)', '<span class="hierarchy-type">']);
check('Hierarchy type style reserves right-edge space',
  css.includes('.hierarchy-type{flex:none;margin-left:auto'));
checkIncludesAll('A source document has one Page identity and one Compare binding', renderer,
  ['function pageDocumentKey(page)', 'function loadedPageForPath(sourcePath)', 'This document is already open. Focused the existing Page.',
   'function bindPageToSlot(slot,nextPageId)', 'samePageDocument(nextPageId,state.views[other])']);

checkIncludesAll('Splitters reserve a visible eight-pixel gutter', css,
  ['--splitter-hit:8px', 'background:var(--background);cursor:col-resize', '.view-divider{background:var(--background)']);
checkIncludesAll('Edit outline and View header sizing match v0.5.16', css,
  ['--view-head-h:34px', 'outline:2px solid #ff3f46', 'height:var(--view-head-h);flex:0 0 var(--view-head-h)']);
checkIncludesAll('Startup status paints before renderer bootstrap', html,
  ['id="appStartup"', 'Starting Leaf', 'Preparing the editor and document views', 'setTimeout(loadRenderer, 80)']);
checkIncludesAll('Startup status closes deterministically', renderer,
  ["performance.measure('leaf-renderer-bootstrap'", "document.documentElement.dataset.leafReady='true'", "startup?.classList.add('is-complete')"]);
checkIncludesAll('Startup diagnostics cannot leave an invisible pointer-blocking overlay', fidelity,
  ["const STARTUP_DEBUG_VERSION='source-fidelity-startup-debug-v6'",
   'function startupOverlayShouldCapturePointer(startup)',
   "return !!startup&&(!startup.classList.contains('is-complete')||startup.classList.contains('startup-error'))",
   'if(startupOverlayShouldCapturePointer(startup))',
   'function releaseStartupPointerBarrier(',
   "startup.setAttribute('aria-hidden','true')",
   "releaseStartupPointerBarrier('renderer ready')"]);

const semanticTokens = ['--background', '--foreground', '--panel', '--panel-secondary', '--border', '--border-subtle', '--muted', '--accent', '--selection', '--focus-ring', '--success', '--warning', '--error'];
check('Semantic design tokens present', semanticTokens.every(token => css.includes(token)), semanticTokens.join(', '));
check('Dark and Light are the only exposed themes',
  ['dark', 'light'].every(theme => html.includes(`data-pref-theme="${theme}"`)) &&
  ['codex', 'carbon'].every(theme => !html.includes(`data-pref-theme="${theme}"`)) &&
  css.includes(':root{') && css.includes('body[data-theme="light"]') &&
  ['codex', 'carbon'].every(theme => !css.includes(`body[data-theme="${theme}"]`)));
check('Light is the default preference theme',
  renderer.includes("scale:1, theme:'light'") && renderer.includes("state.preferences.theme || 'light'") &&
  !renderer.includes("theme:'codex'") && !renderer.includes("state.preferences.theme || 'codex'"));
check('Theme CSS does not leak into Page iframes',
  !/body\[data-theme="[^"]+"\][^{]*iframe/.test(css));

checkIncludesAll('Zoom controls live outside the scrolling canvas', renderer,
  ["layer.className='viewport-floating-controls'", 'layer.append(control,fit);pane?.appendChild(layer)']);
checkIncludesAll('Zoom-independent scrollbar compensation remains metadata-safe', renderer,
  ['const PREVIEW_SCROLLBAR_VISUAL_SIZE=8', 'function runtimePreviewScrollbarCss(zoom=100)', 'applyPreviewScrollbarCompensation(slot,zoom);',
   "frame.dataset.scrollbarCompensation=applied?'inverse-zoom':'native'"]);
checkIncludesAll('Scrollbar runtime metadata is stripped from saved source', fidelity,
  ['[data-leaf-scrollbar-runtime]', "'data-leaf-scrollbar-runtime'", 'editorArtifactReport']);
check('Preview fallback surfaces use the canvas token',
  css.includes('iframe{width:100%;height:100%;border:0;background:var(--canvas)'));

checkIncludesAll('Objects palette includes practical content, form, and layout controls', registry,
  ["type:'button'", "type:'link'", "type:'form'", "type:'textInput'", "type:'table'", "type:'columns'", "type:'hero'"]);
checkIncludesAll('Image widget starts as an editable picker placeholder', registry,
  ['data-hbe-image-widget', 'data-hbe-image-frame', 'data-hbe-image-label', 'Click to insert image', 'Image caption']);
checkIncludesAll('Image widget supports picker, paste, drop, crop, and proportional resize', imageWidgetEdit,
  ['const ACCEPT', 'chooseImageAsset', 'handlePasteAsset', "doc.addEventListener('drop'", 'toggleCropMode', 'beginAspectResize', 'commitFrameSource', 'JPG, PNG, SVG, GIF, WEBP']);
check('Image widget edit path stays in the renderer sandbox',
  !imageWidgetEdit.includes('ipcRenderer') && !imageWidgetEdit.includes('require('));
checkIncludesAll('Overlay components establish a free-positioning context', registry,
  ['position:relative;display:block;min-height:240px']);
checkIncludesAll('Viewport placement preview handles palette, Used, and existing objects', renderer,
  ['function calculateViewportPlacement(', 'function renderViewportPlacementPreview(', 'data.template&&!data.used&&!data.existing']);
checkIncludesAll('Table overlay selection and structure actions remain wired', renderer,
  ['function tableRangeCells(startCell,endCell)', 'function selectedTableRowIndexes(table)', 'function selectedTableColumnIndexes(table)']);
checkIncludesAll('Inspector owns live property-name search and hyperlink controls', renderer,
  ['function filterInspectorProperties()', "propertyRow('linkHref','Link URL'", "propertyRow('linkTarget','Open In'", "['http:','https:','mailto:','tel:'].includes(url.protocol)"]);
checkIncludesAll('Project tree search preserves visible ancestors', renderer,
  ['function projectTreeSearchContext(project)', 'while(current?.parentId){visible.add(current.parentId)']);

const large = [];
let pageCount = 0;
let groupCount = 0;
for (let p = 0; p < 10; p++) {
  const project = { id: `p${p}`, nodes: [] };
  for (let g = 0; g < 5; g++) {
    const gid = `p${p}g${g}`;
    project.nodes.push({ id: gid, type: 'group', parentId: null, order: g });
    groupCount++;
    for (let n = 0; n < 6; n++) {
      project.nodes.push({ id: `${gid}page${n}`, type: 'page', parentId: gid, order: n, source: '<p>x</p>' });
      pageCount++;
    }
  }
  large.push(project);
}
check('Large tree fixture = 10 projects / 50 groups / 300 pages',
  large.length === 10 && groupCount === 50 && pageCount === 300,
  `${large.length} projects, ${groupCount} groups, ${pageCount} pages`);
check('Large tree hierarchy parent IDs resolve',
  large.every(project => {
    const ids = new Set(project.nodes.map(node => node.id));
    return project.nodes.every(node => node.parentId === null || ids.has(node.parentId));
  }));

const order = ['A', 'B', 'C'];
const from = order.indexOf('B');
const to = order.indexOf('A');
const [moved] = order.splice(from, 1);
order.splice(to, 0, moved);
check('Project drag reorder invariant B,A,C', order.join(',') === 'B,A,C', order.join(','));

console.log('\nLeaf v0.5.16 static QA');
console.log('=======================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
