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
const dropBridge = read('src/renderer/view-drop-bridge.js');

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

checkIncludesAll('Supported Page formats include HTML, Markdown, JSON, XML, PDF, and images', main,
  ["new Set(['.html', '.htm', '.md', '.markdown', '.json', '.xml', '.pdf', ...IMAGE_EXTENSIONS])",
   "extensions: ['html', 'htm', 'md', 'markdown', 'json', 'xml', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']"]);
check('Image formats share one binary Page type instead of one type each',
  main.includes("if (IMAGE_EXTENSIONS.has(extension)) return 'image';")
  && !main.includes("return 'webp'") && !renderer.includes("documentType==='webp'")
  && !renderer.includes("documentType==='png'"));
checkIncludesAll('Save Page As supports HTML, Markdown, JSON, and rendered PDF', html,
  ['option value="html"', 'option value="markdown"', 'option value="json"', 'option value="pdf"']);
checkIncludesAll('Rendered PDF export uses secure hidden printing', main,
  ['async function exportPageAs', 'printToPDF({ printBackground: true, preferCSSPageSize: true })', "javascript: false"]);

checkIncludesAll('Direct Markdown, JSON and XML editing remains isolated', renderer,
  ["function isDirectSourceType(page){return page?.documentType==='markdown'||page?.documentType==='json'||page?.documentType==='xml';}",
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

// Mixed line endings are a recurring defect source here, not a cosmetic issue:
// the QA suites assert on source text, and multi-line literals silently stop
// matching when a file is CRLF. Windows runners check out with core.autocrlf,
// so this only reproduces in CI unless .gitattributes pins the working tree.
// In-iframe input never reaches the parent document, so active-view-policy
// synthesizes a pointerdown to tell the renderer which pane is active. That
// forged gesture must carry why it fired: focus-driven activation is not a
// click, and treating it as one cancelled every inline text edit on start.
const activePolicy = read(path.join(rendererDir, 'active-view-policy.js'));
check('Synthesized pane activation states whether a pointer or focus caused it',
  /function dispatchPaneActivation\(slot, reason = 'pointer'\)/.test(activePolicy) &&
  activePolicy.includes('event.leafActivationReason = reason;') &&
  activePolicy.includes("dispatchPaneActivation(slot, 'pointer')") &&
  !/dispatchPaneActivation\(slot\)/.test(activePolicy) &&
  renderer.includes("if(event.leafActivationReason==='focus')return;"));
check('Inline text edit setup cannot be torn down by its own focus',
  renderer.includes('let inlineTextEditStarting = false;') &&
  renderer.includes('if(inlineTextEditStarting) return;') &&
  /const \{element,frame,page,listeners\}=session;[\s\S]{0,200}?if\(listeners\)\{/.test(renderer));

const textDirs = ['src/renderer', 'src/', 'scripts', '.github/workflows'];
const textExtensions = ['.js', '.html', '.css', '.json', '.yml', '.md'];
const trackedTextFiles = [...new Set(textDirs.flatMap(dir => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true })
    .filter(entry => entry.isFile() && textExtensions.some(ext => entry.name.endsWith(ext)))
    .map(entry => path.join(dir, entry.name));
}))].sort();
const crlfFiles = trackedTextFiles.filter(file => read(file).includes('\r'));
check('No tracked text file carries CR line endings',
  crlfFiles.length === 0,
  crlfFiles.length ? `CRLF: ${crlfFiles.join(', ')}` : `${trackedTextFiles.length} text files scanned.`);
const attributes = read('.gitattributes');
const unprotectedBinaryTypes = ['exe', 'dll', 'node', 'zip', 'dmg', 'icns', 'ico', 'png', 'jpg', 'jpeg', 'gif', 'pdf']
  .filter(ext => !new RegExp(`^\\*\\.${ext}\\s+binary$`, 'm').test(attributes));
check('gitattributes pins LF working trees and shields every binary type',
  /^\*\s+text=auto\s+eol=lf$/m.test(attributes) && unprotectedBinaryTypes.length === 0,
  unprotectedBinaryTypes.length ? `Unshielded: ${unprotectedBinaryTypes.join(', ')}` : 'text=auto eol=lf with binaries shielded.');

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
// The whole chain is plain Node - no Electron, no display - so CI runs `qa` too.
const runnableQaScripts = Object.keys(pkg.scripts).filter(name => name === 'qa' || name.startsWith('qa:')).sort();
const workflowQaSuites = workflowFiles.flatMap(name => {
  // Windows runners check out with autocrlf, so normalize before matching.
  const text = read(path.join('.github', 'workflows', name)).replace(/\r\n/g, '\n');
  return [...text.matchAll(/- name: [^\n]*QA[^\n]*\n\s*run: \|\n((?:[ \t]*npm run [^\n]*\n)+)/g)]
    .map(match => ({
      workflow: name,
      suites: [...match[1].matchAll(/npm run (qa(?::[\w:-]+)?)(?=\s|$)/gm)].map(entry => entry[1]).sort().join(' ')
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

checkIncludesAll('Application footer exposes version and live diagnostics', html,
  ['id="appStatusBar"', 'id="appVersion"', 'id="appDebugMessage"', 'aria-live="polite"']);
checkIncludesAll('Footer occupies a stable non-overlapping app grid row', css,
  ['grid-template-rows:34px minmax(0,1fr) 22px', '.app-statusbar{', '.status-debug{',
   'body.document-view-only .app-statusbar', 'position:fixed;right:14px;bottom:30px']);
// The version must reach the renderer, but NOT by reading a file: this preload
// is sandboxed, so require() outside Electron's allowlist throws before
// contextBridge runs and the renderer loses electronAPI entirely.
checkIncludesAll('Packaged version is exposed through the sandboxed startup bridge', preload,
  ["ipcRenderer.invoke('app:version')", 'appVersion,', 'startupInfo: () => Promise.resolve(startupInfo())']);
check('Main process serves the version the sandboxed preload asks for',
  main.includes("ipcMain.handle('app:version'"),
  main.includes("ipcMain.handle('app:version'") ? '' : 'no app:version handler');
const preloadFileRequires = [...preload.matchAll(/require\((['"])([^'"]+)\1\)/g)]
  .map(match => match[2]).filter(name => name.startsWith('.') || name.endsWith('.json'));
check('Sandboxed preload requires nothing off Electron\'s allowlist',
  preloadFileRequires.length === 0,
  preloadFileRequires.length
    ? `Throws before contextBridge runs: ${preloadFileRequires.join(', ')}`
    : 'electron only.');
checkIncludesAll('Startup diagnostics continuously update footer state', fidelity,
  ['function renderDebugFooter(', 'function applyRuntimeVersion(', 'footer.dataset.level=debugFooterLevel',
   'renderDebugFooter(line,debugFooterLevel(message,level))', 'applyRuntimeVersion(info?.appVersion)']);
check('Footer diagnostics add no MutationObserver or polling loop',
  !/MutationObserver\([^)]*renderDebugFooter/.test(fidelity) &&
  !/setInterval\([^)]*renderDebugFooter/.test(fidelity));
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
  ["layer.className='viewport-floating-controls'", 'layer.append(contents,control,fit);pane?.appendChild(layer)']);
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

// --- Edit Save --------------------------------------------------------------
check('Every View head offers Apply, Save and discard in that order',
  (html.match(/data-edit-save="/g) || []).length === 4
  && /data-edit-slot="single"[\s\S]{0,400}?data-edit-save="single"[\s\S]{0,400}?data-edit-cancel="single"/.test(html));
// A Page typed into the app has no file behind it, so Save has nowhere to write.
check('Save is offered only while editing and only with an original file',
  renderer.includes('saveButton.hidden=!active;')
  && renderer.includes('const savable=!!page?.sourcePath;')
  && renderer.includes('saveButton.disabled=!savable;'));
check('Save applies the edit before writing',
  /const slot=button\.dataset\.editSave;[\s\S]{0,900}?setHtmlEditEnabled\(false,slot\);\s*\n\s*await savePage\(false\);/.test(renderer));

// --- PDF annotation write-back ---------------------------------------------
// The viewer can already annotate; its Save was a plain browser download, which
// dropped a detached copy and left the Page pointing at the untouched original.
check('The PDF viewer save is captured and written back to the Page',
  main.includes("session.on('will-download'")
  && main.includes('function registerPdfAnnotationCapture(session)')
  && main.includes('registerPdfAnnotationCapture(mainWindow.webContents.session);'));
// Staging first means a cancelled or failed download cannot truncate the original.
check('An annotated PDF is staged before it replaces the original',
  main.includes('item.setSavePath(staging);')
  && /if \(state !== 'completed'\)/.test(main)
  && main.includes('await atomicWriteFile(target, await fs.readFile(staging), null);'));
// Without arming, any download the user started for another reason could be
// redirected onto a Page's file.
check('Only an explicitly armed Page can receive a captured download',
  main.includes('function armPdfAnnotationSave(')
  && main.includes('pendingPdfSaves.set(sourcePath')
  && renderer.includes('window.electronAPI.armPdfAnnotationSave({sourcePath:page.sourcePath'));
check('A saved PDF refreshes the View instead of showing the cached copy',
  renderer.includes('window.electronAPI.onPdfAnnotationSaved?.(')
  && renderer.includes('renderVisibleFramesForPage(found.page.id,null);'));

// --- Image pages -----------------------------------------------------------
// PDF and images are the same kind of Page: a binary shown but never edited as
// source. Naming the type at each of those ~15 sites is how a format ends up
// half-supported, so they all ask one predicate.
check('Binary Pages are recognised by one predicate, not by naming pdf everywhere',
  renderer.includes("function isBinaryPage(page){return page?.documentType==='pdf'||page?.documentType==='image';}")
  && renderer.includes('if(isBinaryPage(page)&&!forceAs)')
  && renderer.includes('(isBinaryPage(page)?!!(page.previewUrl||page.sourcePath)')
  && renderer.includes('refs.source.readOnly=isBinaryPage(page);'));
check('An image Page carries a preview URL and its own tree badge',
  main.includes("documentType === 'pdf' || documentType === 'image' ? pathToFileURL(filePath).href : null")
  && renderer.includes("node.documentType==='image'?'IMG'")
  && renderer.includes("/\\.(png|jpe?g|webp|gif|svg)$/i.test(page.fileName||'')?'image'"));
// A bare image document is laid out by the browser on its own background, which
// ignores the View's zoom and fit chrome, so it goes through the srcdoc path.
check('Images render through the sandboxed srcdoc wrapper, not a raw frame src',
  renderer.includes("if(page.documentType==='image'){")
  && renderer.includes("object-fit:contain")
  && renderer.includes("frame.setAttribute('sandbox','allow-same-origin');\n      return false;")
  && !renderer.includes("if(page.documentType==='pdf'||page.documentType==='image'){\n      frame.dataset.snapshotToken"));
check('Save As on a binary Page copies the original and keeps its extension',
  renderer.includes('if(isBinaryPage(page)){')
  && renderer.includes("page.documentType==='pdf'?'pdf':'png'"));

// --- XML pages -------------------------------------------------------------
// A document type is only supported once every list agrees. Missing one leaves
// a type that imports but cannot be saved, or that normalizeState rewrites back
// to html on the next load.
check('XML is accepted by the main-process file surface',
  main.includes("'.json', '.xml', '.pdf', ...IMAGE_EXTENSIONS")
  && main.includes("if (extension === '.xml') return 'xml';")
  && main.includes("extensions: ['html', 'htm', 'md', 'markdown', 'json', 'xml', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']")
  && main.includes("xml: { extension: 'xml', name: 'XML Page' },"));
check('XML survives state normalization instead of being rewritten to html',
  renderer.includes("if(!['html','markdown','json','xml','pdf','image'].includes(page.documentType)){")
  && renderer.includes("/\\.xml$/i.test(page.fileName||'')?'xml'"));
check('XML is droppable and carries its own tree badge',
  renderer.includes("isSupportedDocumentFile(file){return !!file&&/\\.(html?|md|markdown|json|xml|pdf|png|jpe?g|webp|gif|svg)$/i")
  && renderer.includes("isHtmlFile(file){ return !!file && /\\.(html?|md|markdown|json|xml|pdf|png|jpe?g|webp|gif|svg)$/i")
  && renderer.includes("node.documentType==='xml'?'XML'"));
// XML whitespace can be significant, so the preview reports well-formedness
// rather than reformatting the file the way the JSON preview does.
check('The XML preview validates without rewriting the source',
  renderer.includes("if(page.documentType==='xml'){")
  && renderer.includes("new DOMParser().parseFromString(raw,'application/xml')")
  && renderer.includes('Well-formed XML')
  && renderer.includes('<pre>${esc(raw)}</pre>'));
check('XML edits through the same source editor, correctly labelled',
  renderer.includes("page?.documentType==='xml';")
  && renderer.includes("const DIRECT_SOURCE_LABEL={markdown:'Markdown',json:'JSON',xml:'XML'};")
  && renderer.includes("const label=DIRECT_SOURCE_LABEL[page.documentType]||'Markdown';"));
check('Saving an XML Page uses an XML name and extension',
  renderer.includes("xml:{title:'Save XML Page',extension:'xml'}")
  && renderer.includes('const text=TEXT_PAGE_SAVE[page.documentType]||TEXT_PAGE_SAVE.markdown;'));

// --- Preview link navigation ------------------------------------------------
// Every link in a preview must be preventDefault()ed. Letting one through
// navigates the srcdoc iframe itself - to chrome-error:// for a missing file,
// or to the live site for an external link - and the View stays dead, because
// re-picking the same Page in the select is a no-op.
check('Preview link clicks never reach the iframe navigation',
  renderer.includes('function followPreviewLink(frame,doc,anchor,raw)')
  && /if\(!raw\)return;\s*\n\s*event\.preventDefault\(\);event\.stopPropagation\(\);/.test(renderer));
check('A cross-page link resolves through the main process, not string munging',
  main.includes('async function resolveLinkTarget(payload)')
  && main.includes('fileURLToPath(resolved)')
  && preload.includes("resolveLinkTarget: (payload) => ipcRenderer.invoke('file:resolveLinkTarget', payload)"));
check('An already-loaded target is reused instead of imported twice',
  renderer.includes('const already=loadedPageForPath(target.filePath);')
  && renderer.includes('bindPageToSlot(slot,already.page.id);'));
// shell.openExternal hands the string to the OS handler, so the scheme allowlist
// is the only thing between a document's href and arbitrary local execution.
check('Only http, https, mailto and tel can be opened externally',
  main.includes("const EXTERNAL_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);")
  && main.includes('if (!EXTERNAL_LINK_PROTOCOLS.has(url.protocol))'));
check('Same-document anchors still scroll rather than navigate',
  renderer.includes('function scrollFrameToFragment(doc,fragment)')
  && renderer.includes("if(raw.startsWith('#')){"));

// --- Undo/Redo shortcuts ----------------------------------------------------
// A keydown raised inside a preview document never reaches the parent, so the
// app's own shortcuts stopped firing the moment focus entered a View - which is
// most of the time while editing. The forwarder is what keeps them alive.
const activeViewPolicy = read(path.join('src', 'renderer', 'active-view-policy.js'));
// Redo is Ctrl+Y only by request. Dropping the Ctrl+Shift+Z branch is not
// enough on its own: without !shiftKey on undo, that chord would fall through
// and undo instead of doing nothing.
check('Redo is Ctrl+Y, and Ctrl+Shift+Z is inert rather than undoing',
  renderer.includes("else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}")
  && renderer.includes("if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}")
  && !renderer.includes("(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='z'"));
check('The Redo menu item advertises Ctrl+Y', html.includes('<button data-action="redo">Redo <kbd>Ctrl+Y</kbd></button>'));

// --- Tree row chip structure ------------------------------------------------
// Five chips as direct children of the row each multiplied its 6px gap, and the
// label was the only shrinkable item, so a page bound to several Views lost its
// file name entirely (measured 0px at a 170px sidebar).
check('View chips are grouped into one flex child', renderer.includes('<span class="view-chips"')
  && css.includes('.tree-row .view-chips{'));
check('The chip group can shrink but the file name cannot vanish',
  /\.tree-row \.label\{flex:1 1 auto;min-width:52px/.test(css)
  && /\.tree-row \.view-chips\{[^}]*flex:0 1 auto;min-width:0;overflow:hidden/.test(css));
check('A clipped chip is still reported by the group title',
  renderer.includes('const chipsTitle=boundChips.map(chip=>chip.title)')
  && renderer.includes('<span class="view-chips" title="${esc(chipsTitle)}">'));
// Chips report only the Views the current mode puts on screen. repairViews
// binds every slot to the first Page whenever one is unset, so without this a
// single Page claimed five bindings - Compare and Code slots included, while
// neither was displaying anything - and the phantom chips crowded out the name.
check('Chips are limited to the Views the current mode displays',
  renderer.includes("const MODE_CHIP_SLOTS={preview:['single'],split:['left','right'],code:['codePreview','codePage']};")
  && renderer.includes('function chipSlotsForCurrentMode()')
  && renderer.includes('VIEW_CHIPS.filter(chip=>visibleChipSlots.includes(chip.slot)&&node.id===state.views[chip.slot])'));
// The four view-* row classes were hooks for the retired ::after chips. Nothing
// styles or reads them any more, so leaving them implied binding state still
// flowed through CSS.
check('The retired ::after chip hook classes are gone',
  !renderer.includes("row.classList.add('view-left')")
  && !renderer.includes("row.classList.add('view-code-editor')")
  && !css.includes('.tree-row.view-left'));
check('History shortcuts are forwarded out of preview documents',
  activeViewPolicy.includes('function forwardHistoryShortcut(event)')
  && activeViewPolicy.includes("doc.addEventListener('keydown', forwardHistoryShortcut, true)")
  && activeViewPolicy.includes("document.dispatchEvent(forwarded)"));
check('The forwarder covers both undo and redo keys',
  /return key === 'z' \|\| key === 'y';/.test(activeViewPolicy));
// Hijacking Ctrl+Z while someone types in the document would replace the
// browser's native, per-keystroke undo with a whole-page revert.
check('Typing inside an editable element keeps its native undo',
  /if \(target && \(target\.isContentEditable \|\| \['INPUT', 'TEXTAREA'\]\.includes\(target\.tagName\)\)\) return;/.test(activeViewPolicy));

// --- Windows artifacts ------------------------------------------------------
// Both Windows targets ship: the NSIS installer and the portable zip. The
// installer's assets are referenced by path from package.json, so a missing
// file here fails the build on the runner rather than here.
const winTargets = JSON.stringify(pkg.build?.win?.target);
check('Windows builds both an installer and a portable zip',
  winTargets === '["nsis","zip"]' && /nsis/.test(pkg.scripts?.['dist:win'] || ''),
  `target=${winTargets} dist:win=${pkg.scripts?.['dist:win'] || ''}`);
check('The installer keeps its Leaf-branded name and shortcut',
  pkg.build?.nsis?.artifactName?.startsWith('Leaf-Setup-')
  && pkg.build?.nsis?.shortcutName === 'Leaf'
  && pkg.build?.nsis?.oneClick === false
  && pkg.build?.nsis?.allowToChangeInstallationDirectory === true);
const nsisAssets = ['include', 'installerIcon', 'installerHeaderIcon', 'uninstallerIcon']
  .map(key => pkg.build?.nsis?.[key])
  .filter(Boolean);
check('Every installer asset referenced by package.json exists',
  nsisAssets.length === 4 && nsisAssets.every(rel => fs.existsSync(path.join(root, rel))),
  nsisAssets.filter(rel => !fs.existsSync(path.join(root, rel))).join(', ') || `${nsisAssets.length} assets`);
// Collecting only *.zip would upload a green build that silently omits the
// installer, which is exactly how it would go missing without anyone noticing.
for (const wf of ['build-windows.yml', 'build-release.yml']) {
  const text = read(path.join('.github', 'workflows', wf)).replace(/\r/g, '');
  check(`${wf} collects the installer alongside the zip`,
    /-name '\*\.zip' -o -name '\*\.exe'/.test(text),
    text.includes("-name '*.zip' -exec") ? 'collects only *.zip' : '');
}

// --- Startup project reset -------------------------------------------------
// The project is a per-run workspace: every launch opens a clean one. The
// reset must not take the user's app settings with it - theme, UI scale,
// language, panel widths and split ratios live in the same stored object as
// the project, so a blanket wipe would silently reset the whole app chrome.
check('Startup opens a clean project instead of restoring the stored one',
  renderer.includes('let state = startFreshProject(storedStateAtStartup);')
  && !renderer.includes('normalizeState(loadState() || createDefaultState())'));
check('The startup reset carries the user app settings across',
  renderer.includes('function startFreshProject(stored){')
  && renderer.includes('fresh.preferences=carried.preferences;')
  && renderer.includes('fresh.layout=carried.layout;')
  && renderer.includes('fresh.previewSizes=carried.previewSizes;')
  // Recent is app history, not the project. Wiping it made File > Recent a menu
  // that could never list anything: the launch after the one that filled it
  // started from an empty list, every time.
  && renderer.includes('fresh.recent=carried.recent;'));
check('A corrupt stored state still yields a usable fresh project',
  /catch\{ return fresh; \}/.test(renderer));
// The discarded project must not linger in storage waiting for some later edit
// to overwrite it - but it has to be read for its settings before it is dropped.
check('The discarded project is cleared from storage at startup, after it is read',
  renderer.includes('const storedStateAtStartup = loadState();')
  && renderer.indexOf('const storedStateAtStartup = loadState();') < renderer.indexOf('resetPersistedEditorState();\n  let state')
  && renderer.includes('.filter(key=>key===stateKey||'));

// --- CI triggers -----------------------------------------------------------
// Every PR branch here is claude/** targeting stable. Listing claude/** under
// push as well ran the whole Windows build twice per commit, and the publish
// step fired on any push event, so each of those runs minted its own
// windows-v<version> prerelease - 116 release tags before this was caught.
const windowsWorkflow = read('.github/workflows/build-windows.yml');
const windowsTriggers = windowsWorkflow.slice(0, windowsWorkflow.indexOf('\njobs:')).replace(/\r/g, '');
const pushBranches = /\n {2}push:\n {4}branches:\n((?: {6}- .*\n)+)/.exec(windowsTriggers)?.[1] || '';
check('Windows CI does not build PR branches twice per commit',
  pushBranches.includes('"stable"') && !pushBranches.includes('claude/'),
  `push branches: ${pushBranches.trim().replace(/\s+/g, ' ') || '(none found)'}`);
check('Windows CI publishes a release only from stable, a tag, or a dispatch',
  /if: startsWith\(github\.ref, 'refs\/tags\/v'\) \|\| github\.ref == 'refs\/heads\/stable' \|\| inputs\.publish_release/.test(windowsWorkflow)
  && !windowsWorkflow.includes("github.event_name == 'push' || inputs.publish_release"));
check('Superseded PR builds are cancelled, release builds are not',
  /\nconcurrency:\n/.test(windowsTriggers)
  && windowsTriggers.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));

// --- Group Tile View -------------------------------------------------------
checkIncludesAll('Group Tile View is wired into the tree and the viewport', renderer,
  ['function renderGroupTileView(', 'function selectedGroupContext(', "found?.node?.type==='group'", 'function buildGroupTile(']);
checkIncludesAll('Group Tile View markup exists in the viewport host', html,
  ['id="groupTileView"', 'id="groupTileGrid"', 'id="groupTileTitle"', 'id="groupTileClose"']);
checkIncludesAll('Tiles are rounded squares with the file name printed underneath', css,
  ['.group-tile-thumb{', 'aspect-ratio:1/1', '.group-tile-name{']);

// A Group can hold hundreds of Pages. Filling every tile on render would spawn
// that many live documents at once - exactly the shape that froze the renderer
// in the v0.5.16 defect family. The thumbnails must stay lazy.
const tileSection = renderer.slice(
  renderer.indexOf('const GROUP_TILE_LOGICAL_SIZE'),
  renderer.indexOf('function setModePanelVisibility()')
);
check('Group Tile View section is present', tileSection.length > 500, `${tileSection.length} chars`);
check('Group tile thumbnails are filled lazily, not all at once',
  /new IntersectionObserver\(/.test(tileSection) && tileSection.includes('unobserve(entry.target)'));
check('Group tile thumbnails run with scripts off and without same-origin access',
  tileSection.includes("frame.setAttribute('sandbox','')")
  && /buildPreviewSource\([^)]*allowScripts:false/.test(tileSection)
  && !tileSection.includes('allow-scripts'));
check('Group tile rebuilds are skipped when nothing about the Group changed',
  tileSection.includes('groupTileSignature') && /if\(signature===groupTileSignature/.test(tileSection));
check('Leaving a Group tears the tile observers down',
  tileSection.includes('function teardownGroupTileObservers()')
  && /groupTileIntersection\?\.disconnect\(\)/.test(tileSection)
  && /groupTileResize\?\.disconnect\(\)/.test(tileSection));
check('The Tile View hides the pane chrome it covers instead of stacking under it',
  renderer.includes("classList.add('group-tiles-open')")
  && renderer.includes("classList.remove('group-tiles-open')")
  && css.includes('body.group-tiles-open .viewport-floating-controls,body.group-tiles-open .toc-panel{display:none}'));

// --- New Page templates ----------------------------------------------------
// Before this, New Page always produced a blank HTML Page - and a blank Page was
// a dead end: the Code editor was display:none behind the import drop zone, so
// there was nothing to type into and Edit stayed disabled. Two invariants keep
// that from coming back: every offered type has a template, and a blank Page
// stays authorable.
const newPageTypes = renderer.slice(
  renderer.indexOf('const NEW_PAGE_TYPES={'),
  renderer.indexOf('function addEmptyPage(')
);
const menuTypes = [...html.matchAll(/data-tree-add="page:([a-z]+)"/g)].map(match => match[1]);
check('The tree add menu offers HTML, Markdown, JSON and XML Pages',
  ['html', 'markdown', 'json', 'xml'].every(type => menuTypes.includes(type)),
  menuTypes.join(', ') || 'none');
check('Every Page type the menu offers has a template entry',
  menuTypes.length > 0 && menuTypes.every(type => new RegExp(`\\n\\s*${type}:\\{`).test(newPageTypes)),
  menuTypes.filter(type => !new RegExp(`\\n\\s*${type}:\\{`).test(newPageTypes)).join(', '));
check('New Page takes its type, extension and source from the template table',
  /addEmptyPage\(project,node,\{asChild:true,documentType:action\.slice\(5\)\|\|'html'\}\)/.test(renderer)
  && renderer.includes("const source=NEW_PAGE_TYPES[type].template(name);")
  && renderer.includes('${exportSafeName(name)}.${NEW_PAGE_TYPES[type].extension}')
  && renderer.includes("isEmpty:!source.trim()"));
checkIncludesAll('The HTML template is a real scaffold, not a blank document', newPageTypes,
  ["'<!DOCTYPE html>'", '\'<html lang="en">\'', "'<head>'", "'<body>'", '${esc(name)}</title>', "'</html>'"]);
// Blank was the old rule here. It is gone deliberately: see the template
// validity checks further down, which parse what each template produces.
// The drop zone used to be painted over the code pane and the editor hidden
// underneath it, which is what made an empty Page unauthorable.
// newPage() (Ctrl+Shift+N and the File menu) is the second creation path. It
// used to hardcode a blank HTML Page of its own, so a fix applied only to the
// tree menu would leave the shortcut on the old dead end.
const newPageCommand = renderer.slice(
  renderer.indexOf('function newPage(){'),
  renderer.indexOf('async function newDocument()')
);
check('Ctrl+Shift+N builds its Page from the same template table',
  newPageCommand.includes('NEW_PAGE_TYPES.html.template(name)')
  && newPageCommand.includes('${NEW_PAGE_TYPES.html.extension}')
  && newPageCommand.includes('isEmpty:!source.trim()')
  && !newPageCommand.includes("source:'',loadedSource:''"));
check('A blank Page keeps its Code editor reachable',
  css.includes('.code-editor-pane.is-empty .code-area{display:block}')
  && css.includes('.code-editor-pane.is-empty .html-drop-zone{display:none}')
  && !css.includes('.code-editor-pane.is-empty .code-area{display:none}')
  && !/\.view-pane\.is-empty \.html-drop-zone,\.code-editor-pane\.is-empty \.html-drop-zone\{display:flex/.test(css));

// --- Contents (document outline) -------------------------------------------
// The outline is derived, never stored. Anchoring it the obvious way - writing
// ids onto the headings - would leak into every export and Save, because
// stripEditorArtifactsFromDocument cannot tell an injected id from an author's
// own. The panel therefore holds element references and document-order indices,
// and nothing it does may reach page.source.
const tocSection = renderer.slice(
  renderer.indexOf('const TOC_HEADING_SELECTOR'),
  renderer.indexOf('function installPreviewZoomControls()')
);
check('Contents section is present', tocSection.length > 1500, `${tocSection.length} chars`);
check('Contents floats over the viewport and is toggled from the floating controls',
  renderer.includes("contents.dataset.tocToggle=slot")
  && /layer\.append\(contents,control,fit\)/.test(renderer)
  && renderer.includes('buildTocPanel(slot,pane)')
  && css.includes('.toc-panel{')
  && /\.toc-panel\{[^}]*position:absolute/.test(css));
check('The outline never writes to the Page, and injects no anchor ids',
  !/page\.source\s*=/.test(tocSection)
  && !/\.id\s*=[^=]/.test(tocSection)
  && !/setAttribute\(\s*'id'/.test(tocSection)
  && tocSection.includes('new DOMParser().parseFromString'));
check('Editor overlays are kept out of the outline',
  tocSection.includes("'[data-editor-overlay],[data-adf-marker]'"));
// Scoping to the containing node is what lets a sibling Page be previewed
// without being loaded into the View.
check('Contents is scoped to the node holding the View Page, not to the View alone',
  tocSection.includes('function tocScope(')
  && tocSection.includes("children(project,node.parentId).filter(item=>item.type==='page')")
  && tocSection.includes('container?.name||project.name'));
check('An unloaded Page is outlined from its stored source',
  tocSection.includes('function headingsFromSource(')
  && /reachableTocDocument\(slot,pageId\)/.test(tocSection)
  && tocSection.includes('doc?headingsFromDocument(doc):headingsFromSource(pageById(pageId))'));
check('A reachable preview scrolls its own element; the isolated runtime goes through the bridge',
  tocSection.includes("__leafViewTocScroll:true")
  && /if\(\['interactive-isolated','direct-source-editor','pdf-native-editor'\]\.includes\(frame\.dataset\.previewRuntime\)\)return null/.test(tocSection)
  && tocSection.includes("target?.el?.scrollIntoView("));
check('The preview bridge answers the outline scroll message',
  /__leafViewTocScroll===true/.test(renderer)
  && /event\.data\.token===TOKEN/.test(renderer)
  && /const target=document\.querySelectorAll\('h1,h2,h3,h4,h5,h6'\)\[event\.data\.index\]/.test(renderer)
  && /target\.scrollIntoView\(\{block:'start',inline:'nearest'\}\)/.test(renderer));
check('A Page with no headings explains itself instead of showing a blank panel',
  tocSection.includes('toc-panel-empty')
  && tocSection.includes('have no headings to extract')
  && tocSection.includes('Contents is extracted from HTML and Markdown Pages')
  && tocSection.includes("'No headings in this Page'"));
check('Contents stays out of the way of the Group Tile View',
  css.includes('body.group-tiles-open .viewport-floating-controls,body.group-tiles-open .toc-panel{display:none}'));

// --- Inspector section chrome ----------------------------------------------
// The first-depth section is a heading with its content under it, not a box.
// The nested subgroup keeps its border - that is the only thing distinguishing
// the two depths once the outer box is gone, so it must not be flattened too.
check('First-depth Inspector sections carry no box outline',
  /\n\.property-group\{[^}]*\}/.test(css)
  && !/\n\.property-group\{[^}]*border:/.test(css)
  && !/\n\.property-group\{[^}]*border-radius:/.test(css)
  && !css.includes('.property-group:first-of-type{border-top:0}'));
check('The section header keeps the background and separator that replace the box',
  /\.property-group-title\{[^}]*background:/.test(css)
  && css.includes('.property-group[open]>.property-group-title{border-bottom-color:var(--border)}'));
check('Nested Inspector subgroups keep their own border',
  /\.property-subgroup\{[^}]*border:1px solid var\(--border-subtle\)/.test(css)
  && /\.property-subgroup\{[^}]*border-radius:4px/.test(css));

// --- Used list follows the marked row -------------------------------------
// Selecting in a document View marks the matching Used row, but the list is a
// scroller with far more rows than fit, so the mark was regularly off-screen.
// The reveal must move the list's own scrollTop and nothing else: scrollIntoView
// on the row would also scroll every scrollable ancestor.
const usedReveal = renderer.slice(
  renderer.indexOf('function revealUsedComponentRow('),
  renderer.indexOf('function renderUsedComponents()')
);
check('The Used list can bring a marked row into view', usedReveal.length > 300, `${usedReveal.length} chars`);
check('The reveal moves the list itself, never an ancestor',
  usedReveal.includes('list.scrollTop+=rowBox.top-listBox.top')
  && usedReveal.includes('list.scrollTop+=rowBox.bottom-listBox.bottom')
  && !usedReveal.includes('scrollIntoView'));
check('The reveal scrolls both up and back down, and no-ops on a visible row',
  /if\(rowBox\.top<listBox\.top\)/.test(usedReveal)
  && /else if\(rowBox\.bottom>listBox\.bottom\)/.test(usedReveal));
check('A document-View selection brings its Used row into view',
  renderer.includes('requestAnimationFrame(()=>revealUsedComponentRow(selectedUsedComponentToken));'));
check('Highlighting instances from the list reveals that row too',
  /classList\.add\('instance-highlighted'\);\s*\n\s*revealUsedComponentRow\(token\);/.test(renderer));

// --- Opening a Page by URL -------------------------------------------------
// This is the first network code in the app, and a URL box in a desktop app is
// an SSRF hole by default: main runs with full privileges, so an unguarded
// fetch reaches the user's own localhost services, their LAN, and the cloud
// metadata endpoint. Every guard below is load-bearing.
const fetchSection = main.slice(
  main.indexOf('const FETCH_PROTOCOLS'),
  main.indexOf('function documentTypeForPath(')
);
check('URL fetch section is present', fetchSection.length > 2000, `${fetchSection.length} chars`);
check('Only http and https are reachable',
  /const FETCH_PROTOCOLS = new Set\(\['http:', 'https:'\]\)/.test(fetchSection)
  && fetchSection.includes('if (!FETCH_PROTOCOLS.has(url.protocol))'));
check('Link-local is refused on every hop, typed or not',
  fetchSection.includes('function isLinkLocalAddress(')
  && /v4\[0\] === 169 && v4\[1\] === 254/.test(fetchSection)
  && fetchSection.includes('Refusing to fetch a link-local address'));
checkIncludesAll('Loopback, LAN and CGNAT ranges are all classified as internal', fetchSection,
  ['function isInternalAddress(', 'a === 127', 'a === 10',
   'a === 172 && b >= 16 && b <= 31', 'a === 192 && b === 168', 'a === 100 && b >= 64 && b <= 127']);
// The whole point of the redirect loop: a public site must not be able to 302
// its way into loopback, while a dev server redirecting / to /index.html must
// still work.
check('An internal address is reachable only on the host the user typed',
  fetchSection.includes('const sameHostAsTyped = originHost !== null')
  && fetchSection.includes('if (isInternalAddress(address) && !sameHostAsTyped)')
  && /for \(let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop\+\+\)/.test(fetchSection)
  && /await assertFetchableUrl\(next, \{ originHost \}\)/.test(fetchSection));
check('A hostname is resolved before it is judged, so a name cannot hide an address',
  fetchSection.includes('function addressesForHost(')
  && fetchSection.includes("dns.lookup(bare, { all: true, verbatim: true })")
  && fetchSection.includes('const addresses = await addressesForHost(url.hostname)'));
check('Fetches carry no app cookies and are capped in size, time and hops',
  fetchSection.includes("const FETCH_PARTITION = 'leaf-url-fetch'")
  && fetchSection.includes('session: session.fromPartition(FETCH_PARTITION, { cache: false })')
  && fetchSection.includes('useSessionCookies: false')
  && fetchSection.includes('size > FETCH_MAX_BYTES')
  && fetchSection.includes('FETCH_TIMEOUT_MS')
  && fetchSection.includes('FETCH_MAX_REDIRECTS'));
check('Redirects are followed by hand, not by the network stack',
  fetchSection.includes("redirect: 'manual'"));
// image/svg+xml and application/xhtml+xml both end in +xml, so a generic XML
// rule placed first swallows them - that shipped broken once.
check('Specific content types are matched before the generic +xml rule',
  fetchSection.indexOf("'image'") < fetchSection.indexOf("[/^application\\/xml")
  && fetchSection.indexOf("'html'") < fetchSection.indexOf("[/^application\\/xml"));
check('A fetched Page has no local file, so Save stays disabled and Save As takes over',
  /filePath: null/.test(fetchSection) && fetchSection.includes('sourceUrl: current'));
check('A fetched binary is staged locally, because the preview CSP admits file: and not http:',
  fetchSection.includes('await ensureSessionTempDir()')
  && fetchSection.includes('previewUrl: pathToFileURL(staged).href'));
check('The renderer cannot widen what is reachable',
  preload.includes("ipcRenderer.invoke('net:fetchPage', url)")
  && main.includes("ipcMain.handle('net:fetchPage', (_e, url) => fetchPageAtUrl(url))"));
check('The URL field lives in the drop zone, and a dragged link works too',
  renderer.includes('function installDropZoneUrlFields()')
  && renderer.includes('installDropZoneUrlFields();')
  && renderer.includes('function urlFromDataTransfer(')
  && renderer.includes("getData('text/uri-list')")
  && css.includes('.drop-url{')
  && html.includes('or open a URL'));
check('The URL field keeps its own clicks, so it does not open the file picker',
  /\['click','pointerdown','dblclick'\]\.forEach\(type=>row\.addEventListener\(type,event=>event\.stopPropagation\(\)\)\)/.test(renderer));

// --- Downloading the fonts a page uses -------------------------------------
// @font-face is the only place a font's URL is written down: document.fonts
// reports the families but carries no src at all, so the stylesheets are the
// route and both readable and unreadable sheets have to be covered.
const fontScan = renderer.slice(
  renderer.indexOf('const FONT_SRC_ENTRY'),
  renderer.indexOf('// ----- Download Page Fonts dialog')
);
check('Font scan section is present', fontScan.length > 2500, `${fontScan.length} chars`);
check('src is parsed into url(), local() and format() parts',
  fontScan.includes('function parseFontSrc(')
  && fontScan.includes("entries.push({kind:'url'")
  && fontScan.includes("entries.push({kind:'local'")
  && fontScan.includes('function preferredFontSource('));
// A sheet on a CDN saying /f/x.woff2 means the CDN's root, not the page's.
check('A relative src resolves against the stylesheet, not the Page',
  fontScan.includes('function resolveAgainst(')
  && fontScan.includes("const sheetBase=sheet.href||page?.baseUrl||''")
  && fontScan.includes('resolveAgainst(face.sheetBase,chosen.value)'));
check('A cross-origin stylesheet is fetched as text rather than silently dropped',
  fontScan.includes('function parseFontFacesFromText(')
  && fontScan.includes('window.electronAPI.fetchStylesheetText(href)')
  && fontScan.includes('unreadable.push(sheet.href)'));
check('Only families the document actually renders with are offered',
  fontScan.includes('function renderedFamilies(')
  && fontScan.includes('if(!used.has(normalizeFamilyName(face.family)))continue;'));
check('Embedded and system-only faces are classified, not queued for download',
  fontScan.includes("kind:url.startsWith('data:')?'embedded':localOnly?'system':url?'network':'unknown'"));
check('woff2 is preferred when a face offers several formats',
  /const FONT_FORMAT_RANK=\{woff2:0,woff:1/.test(fontScan));
const fontMain = main.slice(main.indexOf('const FONT_MAX_BYTES'), main.indexOf('function documentTypeForPath('));
check('Font downloads run through the same guarded fetch as the URL bar',
  fontMain.includes('await fetchGuardedBytes(source)')
  && main.includes('async function fetchGuardedBytes(rawUrl)')
  && main.includes('const fetched = await fetchGuardedBytes(rawUrl);'));
check('A data: font is decoded locally instead of being fetched',
  fontMain.includes("if (source.startsWith('data:'))")
  && fontMain.includes("Buffer.from(source.slice(comma + 1), 'base64')"));
check('Font writes are staged and rolled back, and are size-capped',
  fontMain.includes('FONT_MAX_BYTES')
  && fontMain.includes('FONT_TOTAL_MAX_BYTES')
  && fontMain.includes('leaf-stage-')
  && /await Promise\.allSettled\(staged\.map\(item => fs\.unlink\(item\.stagePath\)\)\)/.test(fontMain));
check('A usable fonts.css is generated beside the files',
  fontMain.includes("const cssPath = path.join(directory, 'fonts.css')")
  && fontMain.includes('@font-face{')
  && /licence before redistributing/.test(fontMain));
check('One font failing does not lose the rest',
  fontMain.includes('failed.push({ family:') && fontMain.includes('continue;'));
check('The dialog states the licence position instead of implying reuse is free',
  html.includes('id="fontExportModal"')
  && /Licences differ by family/.test(html)
  && html.includes('data-action="extract-fonts"')
  && renderer.includes("case 'extract-fonts': return openFontExportDialog();"));
// The checkbox index addresses the full row list; a filtered copy silently
// downloads the wrong faces.
check('Checkbox indices address the same list they were rendered from',
  renderer.includes('pendingFontRows=rows;')
  && renderer.includes('pendingFontRows[Number(box.dataset.fontIndex)]'));

// --- No settings that only pretend to apply --------------------------------
// Preference carried a Language switch that stored a value, moved a tick, and
// changed nothing else: there is no i18n layer and the UI is English only. A
// control that reports a state the app does not have is worse than no control.
check('No Language setting is offered while there is nothing to translate',
  !html.includes('data-pref-lang')
  && !renderer.includes("state.preferences.language")
  && !renderer.includes('.lang-ko')
  && !renderer.includes('.lang-en'));
check('The Preference settings that remain all reach something real',
  html.includes('data-pref-scale') && /font-size:calc\(12px \* var\(--ui-scale\)\)/.test(css)
  && html.includes('data-pref-theme') && renderer.includes("document.body.dataset.theme = state.preferences.theme"));
// The Code pane is its own drop target; the zone over it is only an affordance,
// and it has to stay out of the way at rest or an empty Page cannot be typed
// into. view-drop-bridge.js owns bringing it back mid-drag.
check('The Code pane stays a drop target, with the affordance owned by the bridge',
  renderer.includes("bindDropTarget('#codeView .code-editor-pane','codePage');")
  && css.includes('.code-editor-pane.is-empty .html-drop-zone{display:none}')
  && dropBridge.includes('.code-editor-pane.${OVER_CLASS} .html-drop-zone')
  && dropBridge.includes("{ slot: 'codePage', pane: '#codeView .code-editor-pane'"));
check('No URL field is placed in a zone that is only visible mid-drag',
  renderer.includes("if(zone.classList.contains('code-drop-zone'))return;"));

// --- Navigation guards -----------------------------------------------------
// One window showing one local page; nothing in it should ever navigate away.
// That held by construction while Leaf only opened local files, but previews now
// render fetched pages and their own scripts, so it is stated rather than left
// to hold by accident.
const navSection = main.slice(
  main.indexOf('let appEntryUrl = null;'),
  main.indexOf('function createWindow()')
);
check('Navigation guard section is present', navSection.length > 800, `${navSection.length} chars`);
// main.js is evaluated in a bare vm context by the main-process QA, so nothing
// at module scope may touch __dirname - resolving the entry URL eagerly crashed
// three suites at load.
check('The entry URL is resolved on first use, not at module load',
  navSection.includes('function appEntryHref()')
  && !/^const APP_ENTRY_URL/m.test(main));
check('Guards are bound for every webContents, not one wired window',
  main.includes("app.on('web-contents-created', (_event, contents) => installNavigationGuards(contents));"));
check('Top-level navigation away from the app page is refused',
  navSection.includes("contents.on('will-navigate'")
  && navSection.includes('event.preventDefault();')
  && navSection.includes('if (isAppEntry(url) || isPrintableTemp(url)) return;'));
check('A reload and the print window are not caught by it',
  navSection.includes('function isAppEntry(')
  && navSection.includes('return `${url.origin}${url.pathname}` === appEntryHref();')
  && navSection.includes('function isPrintableTemp('));
check('No second window is ever opened, and http links go to the browser',
  navSection.includes('contents.setWindowOpenHandler(')
  && navSection.includes("return { action: 'deny' };")
  && /openExternalLink\(url\)\.catch\(\(\) => \{\}\)/.test(navSection));
// Pointing a preview frame at a PDF or an image IS a frame navigation, so a
// subframe guard here would block the app's own rendering. That case is held by
// the sandbox, frame-src 'none', and the renderer preventDefaulting every link.
check('Subframe navigation is observed but never blocked',
  navSection.includes("contents.on('will-frame-navigate'")
  && !/will-frame-navigate[\s\S]{0,600}?event\.preventDefault\(\)/.test(navSection)
  && !navSection.includes("'will-redirect'")
  && renderer.includes("frame.src=page.previewUrl||")
  && /frame-src 'none'/.test(renderer));

// --- A fetched page has to be allowed to be a page ------------------------
// The scripted preview's policy was written when Leaf only opened local files,
// where refusing external scripts cost nothing. Applied to a fetched page it
// rendered most of the web as a blank frame: script-src carried 'unsafe-inline'
// and no host, so every <script src> was blocked.
const cspSection = renderer.slice(
  renderer.indexOf('const remote=/^https?:/i.test'),
  renderer.indexOf('const bridge=allowScripts')
);
check('A fetched Page may load its own scripts and call its own APIs',
  cspSection.includes("script-src 'unsafe-inline' 'unsafe-eval' https: http:; connect-src https: http: data: blob:;"));
check('A local file Page is not widened with it',
  cspSection.includes("script-src 'unsafe-inline'; connect-src 'none';")
  && cspSection.includes("const remote=/^https?:/i.test(String(page.baseUrl||''))"));
// The widening is only safe because the sandbox, not the policy, is what keeps
// a scripted preview away from Leaf: no allow-same-origin means an opaque
// origin with no reach into the app, its storage, or any cookie.
check('The scripted runtime stays on an opaque origin',
  renderer.includes("frame.setAttribute('sandbox','allow-scripts');")
  && !renderer.includes("'allow-scripts allow-same-origin'"));
check('Nested frames and plugins stay refused in every preview',
  (renderer.match(/frame-src 'none'/g) || []).length >= 2
  && (renderer.match(/object-src 'none'/g) || []).length >= 2);

// --- Clicking an outline entry marks the heading ---------------------------
// Contents was built on injecting nothing into the Page, and the highlight must
// not be the thing that breaks that. It is a positioned overlay carrying
// data-editor-overlay - the same shape the Used-instance marker uses - so the
// export stripper removes it and the edit-session mutation check reads it as
// not-a-change. The heading's own style attribute is never touched.
const tocHighlightSection = renderer.slice(
  renderer.indexOf("const TOC_HIGHLIGHT_MARK="),
  renderer.indexOf('function scrollSlotToHeading(')
);
check('Heading highlight section is present', tocHighlightSection.length > 700, `${tocHighlightSection.length} chars`);
check('The mark is a runtime overlay, not a write to the Page',
  tocHighlightSection.includes("marker.dataset.editorOverlay=TOC_HIGHLIGHT_MARK;")
  && tocHighlightSection.includes("position:'absolute'")
  && tocHighlightSection.includes("pointerEvents:'none'")
  && !/element\.style\./.test(tocHighlightSection)
  && !/\.setAttribute\('style'/.test(tocHighlightSection));
check('Only one heading is ever marked',
  renderer.includes('clearTocHighlight();\n    tocHighlight={slot,pageId,index};')
  && tocHighlightSection.includes('function clearTocHighlight('));
check('The mark is put away when the panel closes or the outlined Page changes',
  /clearTocHighlight\(\);setTocVisible\(false\)/.test(renderer)
  && /clearTocHighlight\(\);tocSelection\.set\(slot,event\.target\.value\)/.test(renderer)
  && renderer.includes('tocHighlight.pageId!==pageIdForSlot(slot))tocHighlight=null;'));
// The isolated runtime's document is unreachable from the renderer, so it draws
// its own marker over the same bridge the scroll already uses.
check('The bridged runtime paints and clears its own marker',
  renderer.includes('__leafViewTocHighlight===true')
  && /marker\.dataset\.editorOverlay='toc-heading-highlight'/.test(renderer)
  && renderer.includes(`document.querySelectorAll('[data-editor-overlay="toc-heading-highlight"]').forEach(node=>node.remove());`));
check('The panel shows which entry is marked',
  renderer.includes("const activeIndex=tocHighlight&&tocHighlight.slot===slot&&tocHighlight.pageId===selectedId?tocHighlight.index:-1;")
  && css.includes('.toc-entry.is-active{'));

// --- The app follows a preview that navigated itself -----------------------
// A fetched Page is a live page: its scripts run and its links really move the
// frame. Both already happened; what did not was Leaf following. The outline,
// the Code view and Save As kept describing the page the View started on, and
// the next re-render rebuilt the frame from that stale model, throwing the
// navigation away.
const followSection = renderer.slice(
  renderer.indexOf('let followingFrameNavigation=false;'),
  renderer.indexOf('// ----- Opening a Page by URL')
);
check('Follow section is present', followSection.length > 900, `${followSection.length} chars`);
// The frame is opaque-origin, so the renderer cannot read where it went. Main
// reports it, and reports only - blocking here would break the navigation the
// user asked for.
check('Main reports where a preview frame went, and never blocks it',
  main.includes("contents.on('will-frame-navigate', event => {")
  && main.includes("const slot = /^leaf-view-(.+)$/.exec(event.frame?.name || '')?.[1];")
  && main.includes("mainWindow.webContents.send('preview:frameNavigated', { slot, url: event.url });")
  && !/will-frame-navigate[\s\S]{0,600}?event\.preventDefault\(\)/.test(main));
check('Preview frames are named so the report can name a slot',
  ['single','left','right','codePreview'].every(slot => html.includes(`name="leaf-view-${slot}"`)));
check('Only a Page that was already remote follows',
  followSection.includes("if(!page||!/^https?:/i.test(String(page.baseUrl||'')))return;")
  && followSection.includes('if(String(page.baseUrl)===String(url))return;'));
// Re-rendering would rebuild the frame from source and undo the navigation, so
// only what reads the model is refreshed.
check('Following refreshes the model, not the frame',
  followSection.includes('renderTree();renderPageSelects();renderCrumbs();renderTocPanel(slot);')
  && !/^\s*renderAll\(\);/m.test(followSection));
check('A View that moved on while the fetch was in flight is not overwritten',
  followSection.includes('if(!current||current.id!==page.id)return;')
  && followSection.includes('followingFrameNavigation=true;')
  && followSection.includes('finally{ followingFrameNavigation=false; }'));
check('The destination goes through the same guarded fetch as the URL bar',
  followSection.includes('await window.electronAPI.fetchPageAtUrl(url)')
  && preload.includes("ipcRenderer.on('preview:frameNavigated', listener)"));

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

// Markdown rendering is exercised for real, not matched as text: the parser is
// loaded into a bare context and its output inspected. Front matter as body,
// pipes instead of a table, and relative links dropped to plain text were all
// shipped defects, and all three are invisible to a substring check.
const markdownRender = (() => {
  const vm = require('node:vm');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(read('src/renderer/jira-export.js'), context);
  return context.window.JiraExport.markdownToRichHtml;
})();
const markdownSample = [
  '---',
  'title: Getting Started',
  'outline: [2, 3]',
  '---',
  '',
  '# Getting Started',
  '',
  '| Option | Type |',
  '| ------ | ---: |',
  '| base | string |',
  '',
  'See [the reference](./reference.md) and [home](../index.html).'
].join('\n');
const markdownHtml = markdownRender(markdownSample);
check('Markdown front matter is stripped, not rendered as body',
  !/title\s*:\s*Getting Started/.test(markdownHtml) && !markdownHtml.includes('<hr>'),
  markdownHtml.slice(0, 120));
check('Markdown GFM table becomes a real table',
  /<table>/.test(markdownHtml) && /<th[^>]*>Option<\/th>/.test(markdownHtml)
    && /<tbody>/.test(markdownHtml) && /text-align:right/.test(markdownHtml),
  markdownHtml.slice(0, 160));
check('Markdown relative links stay links so Leaf can follow them',
  markdownHtml.includes('<a href="./reference.md">') && markdownHtml.includes('<a href="../index.html">'),
  markdownHtml.slice(-160));
check('Markdown thematic break outside front matter still renders',
  markdownRender('a\n\n---\n\nb').includes('<hr>'));
check('Markdown link hrefs stay restricted to schemes Leaf follows',
  !markdownRender('[x](javascript:alert(1))').includes('<a ')
    && !markdownRender('[x](//evil.test/x)').includes('<a ')
    && markdownRender('[x](#section)').includes('<a href="#section">'));

// The splash is a launcher, so every row on it has to reach a real action. A
// button whose data-splash-action names no handleAction case would look alive
// and do nothing - that is the failure mode this guards.
const splashActions = [...html.matchAll(/data-splash-action="([a-z-]+)"/g)].map(match => match[1]);
const handledActions = new Set([...renderer.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]));
check('Splash footer offers actions', splashActions.length >= 3, splashActions.join(', '));
check('Every splash footer action is a real handleAction case',
  splashActions.every(action => handledActions.has(action)),
  splashActions.filter(action => !handledActions.has(action)).join(', '));
checkIncludesAll('Splash markup carries the hooks the renderer fills', html, [
  'id="splashModal"', 'id="splashNewList"', 'id="splashRecentList"',
  'id="splashVersion"', 'class="splash-art"'
]);
check('Help menu can reopen the splash',
  html.includes('data-action="splash"') && renderer.includes("case 'splash': return openSplash();"));
check('Splash is on by default and the startup honours the preference',
  renderer.includes('splash:true') && renderer.includes("if(state.preferences.splash!==false)openSplash();"));
check('Preference menu exposes the splash toggle',
  html.includes('data-pref-splash') && html.includes('id="prefSplashCheck"')
    && renderer.includes('[data-pref-splash]'));
// The Recent submenu and the splash must not drift into two implementations.
check('Splash and the Recent submenu share one open path',
  renderer.includes('function openRecentItem(item)')
    && (renderer.match(/openRecentItem\(item\)/g) || []).length >= 3
    && !/readProjectPath[\s\S]{0,400}readProjectPath/.test(renderer));
check('Splash New Page rows are built from the same templates as the tree',
  renderer.includes('Object.entries(NEW_PAGE_TYPES).map') && renderer.includes('addEmptyPage(project,null,{asChild:false,documentType})'));
checkIncludesAll('Splash styles are defined', css, [
  '.splash-modal', '.splash-art', '.splash-columns', '.splash-list button', '.splash-foot'
]);

// A component belongs in a table cell as much as anywhere else that holds flow
// content. Three separate gates had to agree before a drop could land there, so
// each is guarded: the registry's container test, the viewport's target walk,
// and the Hierarchy's node filter. canContain runs for real rather than being
// matched as text.
const canContainFn = (() => {
  const vm = require('node:vm');
  const context = { window: {}, crypto: { randomUUID: () => 'x' } };
  vm.createContext(context);
  vm.runInContext(read('src/renderer/widget-registry.js'), context);
  return context.window.WidgetRegistry.canContain;
})();
const asElement = tagName => ({ tagName, getAttribute: () => null });
check('A table cell can hold components',
  canContainFn(asElement('TD')) === true && canContainFn(asElement('TH')) === true);
check('A table and a row still cannot hold components directly',
  canContainFn(asElement('TABLE')) === false && canContainFn(asElement('TR')) === false,
  'a <p> dropped into <table> or <tr> is hoisted back out by the parser');
check('Existing containers still accept components',
  ['BODY','MAIN','ARTICLE','SECTION','ASIDE','DIV'].every(tag => canContainFn(asElement(tag)) === true));
check('A panel widget stays a container whatever its tag',
  canContainFn({ tagName: 'SPAN', getAttribute: name => name === 'data-hbe-object' ? 'card' : null }) === true
    && canContainFn({ tagName: 'SPAN', getAttribute: name => name === 'data-hbe-object' ? 'callout' : null }) === false,
  'card is kind:panel, callout is not');
// The walk up from the drop point returns the first match, so td/th must be
// listed ahead of table or a drop on a cell resolves to the whole table.
const authorTargetSelector = (renderer.match(/let target=event\.target\?\.closest\?\.\('([^']+)'\)/) || [])[1] || '';
check('The viewport drop target resolves a cell before the table',
  authorTargetSelector.includes('td') && authorTargetSelector.includes('th')
    && authorTargetSelector.indexOf('td,th') < authorTargetSelector.indexOf('table'),
  authorTargetSelector);
check('The Hierarchy lists rows and cells so a cell can be a drop target',
  /const meaningful=new Set\(\[[^\]]*'TR','TD','TH'[^\]]*\]\)/.test(renderer));

// The scaffold's stylesheet is evaluated rather than grepped: these assertions
// are about the CSS a new Page actually ships with, not about how the array
// that builds it happens to be written.
const scaffoldCss = (() => {
  const vm = require('node:vm');
  const literal = renderer.slice(
    renderer.indexOf('const NEW_PAGE_STYLES=['),
    renderer.indexOf('const NEW_PAGE_TYPES={')
  );
  const array = literal.slice(literal.indexOf('['), literal.lastIndexOf(']') + 1);
  return vm.runInNewContext(array).join('\n');
})();
check('A new Page ships a stylesheet instead of the browser defaults',
  scaffoldCss.length > 200 && newPageTypes.includes("'  <style>'") && newPageTypes.includes('...NEW_PAGE_STYLES'));
const bodyRule = (scaffoldCss.match(/\bbody\s*\{[^}]*\}/) || [''])[0];
const mainRule = (scaffoldCss.match(/\bmain\s*\{[^}]*\}/) || [''])[0];
check('The scaffold clears the body margin the browser adds',
  /margin:\s*0\s*;/.test(bodyRule), bodyRule.replace(/\s+/g, ' ').slice(0, 90));
check('The scaffold sets a real font stack instead of the serif default',
  /font:[^;]*system-ui/.test(bodyRule));
checkIncludesAll('The scaffold resets box sizing and constrains the column', scaffoldCss, [
  'box-sizing: border-box',
  'max-width: var(--measure)'
]);
check('The scaffold gives the column a readable measure and centres it',
  /--measure:\s*\d+ch/.test(scaffoldCss) && /main\s*\{[^}]*margin:\s*0 auto/.test(scaffoldCss),
  (scaffoldCss.match(/--measure:[^;]+;/) || [])[0] || 'no measure');
// The author looks at this page inside light app chrome the whole time they
// write it, so the scaffold commits to light rather than following the OS.
check('The scaffold commits to one palette instead of following the OS',
  scaffoldCss.includes('color-scheme: light') && !scaffoldCss.includes('prefers-color-scheme'),
  'a dark block would flip every new Page on a dark-mode machine');
check('The scaffold themes through custom properties, so it is retheme-able',
  ['--bg','--fg','--muted','--rule','--link'].every(token => scaffoldCss.includes(`${token}:`)));
// main is what makes a dropped component land in the column rather than
// full-bleed on body, so the tag and the container rule have to agree.
check('The scaffold wraps its content in a container the palette can drop into',
  newPageTypes.includes("'  <main>'") && canContainFn(asElement('MAIN')) === true);
check('Scaffold table cells align to the top, for cells holding blocks',
  /th,\s*td\s*\{[\s\S]*?vertical-align:\s*top/.test(scaffoldCss));

// Every New Page template is run and its output parsed with the parser for its
// own format. A blank JSON Page used to fail JSON.parse and a blank XML Page had
// no root element, so both opened in a state their own source editor reported as
// broken - a substring check would never have noticed.
const pageTemplates = (() => {
  const vm = require('node:vm');
  const block = renderer.slice(
    renderer.indexOf('const NEW_PAGE_TYPES={'),
    renderer.indexOf('function addEmptyPage(')
  );
  const context = {
    esc: value => String(value ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    NEW_PAGE_STYLES: scaffoldCss.split('\n')
  };
  vm.createContext(context);
  vm.runInContext(block.slice(0, block.lastIndexOf('};') + 2), context);
  return vm.runInContext('NEW_PAGE_TYPES', context);
})();

// A stack scan is enough to catch the failure that matters: no root element, or
// a root that never closes.
function xmlIsBalanced(text) {
  const stack = [];
  for (const [, closing, name, selfClosing] of text.matchAll(/<(\/?)([A-Za-z_][\w.-]*)[^>]*?(\/?)>/g)) {
    if (text.startsWith('<?xml') && name === 'xml') continue;
    if (selfClosing) continue;
    if (closing) { if (stack.pop() !== name) return false; }
    else stack.push(name);
  }
  return stack.length === 0;
}

check('Every Page type offers a template that produces something',
  ['html', 'markdown', 'json', 'xml'].every(type =>
    typeof pageTemplates[type]?.template === 'function'
    && pageTemplates[type].template('Sample').trim().length > 0),
  ['html', 'markdown', 'json', 'xml']
    .filter(type => !(pageTemplates[type]?.template('Sample') || '').trim()).join(', '));
check('A new JSON Page parses as JSON', (() => {
  try {
    const parsed = JSON.parse(pageTemplates.json.template('Quarterly "Report"'));
    return parsed.title === 'Quarterly "Report"';   // JSON-escaped, not HTML-escaped
  } catch { return false; }
})(), pageTemplates.json.template('Sample').replace(/\n/g, ' '));
check('A new XML Page has a declaration and one balanced root', (() => {
  const xml = pageTemplates.xml.template('Tools & Parts');
  return xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')
    && xmlIsBalanced(xml)
    && xml.includes('Tools &amp; Parts');          // XML-escaped, not raw
})(), pageTemplates.xml.template('Sample').replace(/\n/g, ' '));
check('A new Markdown Page opens with a heading the outline can find',
  /^#\s+Sample Page$/m.test(pageTemplates.markdown.template('Sample Page')),
  pageTemplates.markdown.template('Sample').replace(/\n/g, ' '));
check('The Markdown template stays Markdown, not HTML-escaped',
  pageTemplates.markdown.template('Tools & Parts').includes('# Tools & Parts'));

// --- GitHub ----------------------------------------------------------------
const preloadGithub = preload.slice(preload.indexOf('github: Object.freeze({'), preload.indexOf('openProject:'));
check('The bridge exposes GitHub verbs and no way to read the token',
  /status:|connect:|disconnect:|repositories:|repository:|branches:|tree:|read:/.test(preloadGithub)
  && !/token\s*:|getToken|readToken/i.test(preloadGithub),
  preloadGithub.replace(/\s+/g, ' ').slice(0, 100));
check('The token never crosses the bridge',
  !main.includes("ipcMain.handle('github:token'")
  && !/return\s+(?:await\s+)?readStoredToken\(\)/.test(main.replace(/async function readStoredToken[\s\S]*?\n}/, '')));
// An Error crossing contextBridge keeps only its message, so the failure kind
// has to travel as data or the UI cannot tell a spent rate limit from a bad token.
check('GitHub failures cross the bridge as a typed envelope',
  main.includes('const githubReply = run =>')
  && /ok:\s*false,\s*\n?\s*kind,/.test(main)
  && [...main.matchAll(/ipcMain\.handle\('github:[a-z]+',\s*([a-zA-Z]+)/g)]
       .every(match => match[1] === 'githubReply'),
  'every github: handler must be wrapped in githubReply');
check('A transport failure is named rather than shown as a Chromium code',
  main.includes('function githubTransportKind') && main.includes('net::ERR_'));
// Comments mention safeStorage to explain the storage note, so the check is on
// code rather than on the word appearing anywhere in the file.
const rendererCode = renderer.replace(/^\s*\/\/.*$/gm, '');
check('The token is stored through the OS, never in project state',
  main.includes('safeStorage.encryptString') && main.includes('0o600')
  && !/safeStorage\s*\./.test(rendererCode)
  && !/githubToken\s*[:=]\s*['"`]/.test(rendererCode),
  'the renderer must not touch the token store');

// The tree-to-nodes mapping is the whole adaptation from a repository to Leaf's
// own shape, so it is run rather than read.
const githubNodes = (() => {
  const vm = require('node:vm');
  const openable = renderer.slice(renderer.indexOf('const GITHUB_OPENABLE'), renderer.indexOf('let githubModalState'));
  const start = renderer.indexOf('  function githubNodesFromTree(');
  const end = renderer.indexOf('  function githubDocumentType(');
  const typeStart = end;
  const typeEnd = renderer.indexOf('  async function connectGithubRepository(');
  let counter = 0;
  const context = { uid: prefix => `${prefix}${++counter}` };
  vm.createContext(context);
  vm.runInContext(
    `${openable}\n${renderer.slice(start, end)}\n${renderer.slice(typeStart, typeEnd)}\n`,
    context
  );
  return {
    fromTree: vm.runInContext('githubNodesFromTree', context),
    typeOf: vm.runInContext('githubDocumentType', context)
  };
})();

const REPO_TREE = [
  { path: 'docs', type: 'dir' },
  { path: 'docs/guide.md', type: 'file', sha: 'a', size: 10 },
  { path: 'docs/api', type: 'dir' },
  { path: 'docs/api/index.html', type: 'file', sha: 'b', size: 20 },
  { path: 'src', type: 'dir' },
  { path: 'src/app.js', type: 'file', sha: 'c', size: 30 },
  { path: 'node_modules', type: 'dir' },
  { path: 'node_modules/left-pad/index.js', type: 'file', sha: 'd', size: 40 },
  { path: 'README.md', type: 'file', sha: 'e', size: 50 }
];

const mapped = githubNodes.fromTree(REPO_TREE);
const names = mapped.map(node => `${node.type}:${node.name}`).sort();
check('Only files Leaf can open become Pages',
  mapped.filter(node => node.type === 'page').map(node => node.name).sort().join(',') === 'README.md,guide.md,index.html',
  names.join(' '));
check('A folder holding nothing openable is dropped, not left as an empty shell',
  !mapped.some(node => node.type === 'group' && (node.name === 'src' || node.name === 'node_modules')),
  names.join(' '));
const docs = mapped.find(node => node.type === 'group' && node.name === 'docs');
const api = mapped.find(node => node.type === 'group' && node.name === 'api');
check('Nested folders keep their parent', !!docs && !!api && api.parentId === docs.id);
check('A file sits under its own folder',
  mapped.find(node => node.name === 'guide.md')?.parentId === docs.id
  && mapped.find(node => node.name === 'index.html')?.parentId === api.id
  && mapped.find(node => node.name === 'README.md')?.parentId === null);
// The stub is what keeps a large repository cheap: real in the tree, fetched on
// first open.
check('Every Page starts as an unloaded stub carrying its path and sha',
  mapped.filter(node => node.type === 'page').every(node =>
    node.remote && node.remote.loaded === false && node.remote.path && node.remote.sha
    && node.source === '' && node.loadedSource === ''),
  JSON.stringify(mapped.find(node => node.type === 'page')?.remote));

const scoped = githubNodes.fromTree(REPO_TREE, { root: 'docs' });
check('A folder root scopes the tree and re-roots what is inside it',
  scoped.filter(node => node.type === 'page').map(node => node.name).sort().join(',') === 'guide.md,index.html'
  && scoped.find(node => node.name === 'guide.md')?.parentId === null,
  scoped.map(node => node.name).join(' '));

const everything = githubNodes.fromTree(REPO_TREE, { showAllFiles: true });
check('Show all files brings back what the filter hid',
  everything.filter(node => node.type === 'page').length === 5
  && everything.some(node => node.name === 'app.js'),
  String(everything.filter(node => node.type === 'page').length));

check('Each extension maps to the Page type that can open it',
  githubNodes.typeOf('a.md') === 'markdown' && githubNodes.typeOf('a.markdown') === 'markdown'
  && githubNodes.typeOf('a.html') === 'html' && githubNodes.typeOf('a.htm') === 'html'
  && githubNodes.typeOf('a.json') === 'json' && githubNodes.typeOf('a.xml') === 'xml'
  && githubNodes.typeOf('a.svg') === 'xml' && githubNodes.typeOf('a.pdf') === 'pdf'
  && githubNodes.typeOf('a.png') === 'image');

check('A GitHub URL in the drop-zone field is recognised as a repository',
  /const GITHUB_URL\s*=/.test(renderer)
  && renderer.includes("case 'connect-github': return openGithubModal();")
  && html.includes('data-action="connect-github"'));

// --- Release notes ---------------------------------------------------------
// These builds are ad-hoc signed and not notarized, so macOS refuses them on
// first launch with a dialog that says the app is damaged. A release that ships
// a .dmg without saying how to get past that hands the user a file that looks
// broken. build-release.yml shipped exactly that for two releases while
// build-macos.yml carried the instruction all along.
const releaseWorkflows = fs.readdirSync(path.join(root, '.github', 'workflows'))
  .filter(name => name.endsWith('.yml'))
  .map(name => ({ name, text: read(path.join('.github', 'workflows', name)) }));
const macPublishers = releaseWorkflows.filter(workflow =>
  /mac-\$\{?arch|macos-artifacts|dist:mac/.test(workflow.text) && workflow.text.includes('gh release'));
check('A workflow that publishes a macOS build exists', macPublishers.length > 0,
  macPublishers.map(workflow => workflow.name).join(', '));
check('Every release that ships a macOS build says how to get past Gatekeeper',
  macPublishers.every(workflow => workflow.text.includes('xattr -dr com.apple.quarantine')),
  macPublishers.filter(workflow => !workflow.text.includes('xattr -dr com.apple.quarantine'))
    .map(workflow => workflow.name).join(', ') || 'all covered');
// Right-click-Open is the bypass for a Developer ID app that is merely
// un-notarized. It does nothing for an ad-hoc signed one, and macOS 15 removed
// it outright, so telling anyone to try it sends them in a circle.
check('No release note offers right-click Open as the way in',
  macPublishers.every(workflow => !/or right-click the app and choose/i.test(workflow.text)),
  macPublishers.filter(workflow => /or right-click the app and choose/i.test(workflow.text))
    .map(workflow => workflow.name).join(', ') || 'none do');

// --- Left panel grid ------------------------------------------------------
// A grid whose row list is longer than its child list silently puts a child in
// the wrong track. That is how the Documents search field ended up in a 28px
// row it needed 45px for: the panel kept a row from a pane title that no longer
// existed, so the input was clipped and the tree sat in the auto row with the
// 1fr row empty below it. Counting both sides catches the whole family.
function trackCount(value) {
  const tracks = [];
  let depth = 0;
  let current = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (current) tracks.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current) tracks.push(current);
  return tracks.length;
}

for (const [, panel] of html.matchAll(/data-left-panel="([a-z]+)"/g)) {
  const section = html.slice(html.indexOf(`data-left-panel="${panel}"`));
  const body = section.slice(0, section.indexOf('</section>'));
  const children = [...body.matchAll(/\n\s{10}<(?:div|section|button|input)\b/g)].length;
  const rule = new RegExp(
    `\\.left-tab-panel\\[data-left-panel="${panel}"\\]\\{grid-template-rows:([^}]+)\\}`
  ).exec(css);
  if (!rule) continue;
  const rows = trackCount(rule[1]);
  check(`The ${panel} panel declares one grid row per child`,
    rows === children, `${rows} rows for ${children} children`);
}

// The Documents toolbar holds a search field and a growing set of buttons. A
// fixed two-column template wrapped the second button onto its own row, which
// doubled the toolbar's height; flowing the buttons into auto columns keeps any
// number of them on the line with the input.
const searchToolbar = (/\.project-search-toolbar\{([^}]+)\}/.exec(css) || [])[1] || '';
const toolbarButtons = [...html.matchAll(/class="tiny-btn"[^>]*>/g)].length;
check('The Documents toolbar keeps its buttons on the search row',
  /grid-auto-flow:\s*column/.test(searchToolbar),
  `${toolbarButtons} tiny-btn in the sidebar; ${searchToolbar}`);

// A .tiny-btn is a 28px square for a single glyph, but several carry a word.
// A fixed width has no way to say so: Preview in the Used panel overflowed its
// box by 13px. min-width keeps the square for glyphs and lets a label grow.
const tinyBtnRule = (/\.panel-toggle-top,\.tiny-btn\{([^}]+)\}/.exec(css) || [])[1] || '';
check('A labelled tiny button can grow instead of spilling out of its box',
  /min-width:\s*28px/.test(tinyBtnRule) && !/(^|;)\s*width:/.test(tinyBtnRule),
  tinyBtnRule.replace(/\s+/g, ' ').trim());
const labelledTinyButtons = [...html.matchAll(/class="tiny-btn[^"]*"[^>]*>([^<]+)</g)]
  .map(match => match[1].trim())
  .filter(label => /[A-Za-z]{2}/.test(label));
check('Some tiny buttons really do carry words, so the rule above matters',
  labelledTinyButtons.length > 0, labelledTinyButtons.join(', '));

// --- Google Drive wiring ---------------------------------------------------
//
// The Drive client and the sign-in flow are exercised for real by
// scripts/qa-google-drive.js. What is guarded here is the wiring around them,
// which that suite cannot see: what crosses the process boundary, and what
// never does.

const googleAuth = read('src/google-auth.js');
const driveClient = read('src/drive-client.js');

// Widening this is a compliance decision, not a refactor: drive and
// drive.readonly are "restricted" scopes and drag the project into a paid
// third-party security assessment. A guard is the cheapest place to notice
// someone reaching for one.
const restrictedScope = /auth\/drive(?:\.readonly|\.metadata|\.appdata)?(?!\.file)['"\s]/;
check('Leaf asks Google for the drive.file scope and nothing wider',
  googleAuth.includes("'https://www.googleapis.com/auth/drive.file'")
  && !restrictedScope.test(googleAuth.replace(/^\s*\/\/.*$/gm, '')),
  (googleAuth.match(/auth\/drive[^'"\s]*/g) || []).join(', '));

// PKCE is what makes a desktop client secret survivable: it ships inside the
// binary and anyone can extract it, so the proof of possession has to be the
// verifier instead.
checkIncludesAll('The sign-in flow proves possession with PKCE S256', googleAuth, [
  "code_challenge_method', 'S256'",
  'code_verifier',
  'createHash(\'sha256\')'
]);

// Loopback on an assigned port, per RFC 8252. A wildcard bind would put the
// callback on every interface the machine has.
check('The sign-in listener binds loopback only',
  /server\.listen\(0,\s*'127\.0\.0\.1'/.test(googleAuth),
  (googleAuth.match(/server\.listen\([^)]*\)/) || [''])[0]);
check('A callback carrying the wrong state never yields a code',
  googleAuth.includes('if (!sameState(returned, state)) return { kind: \'state\' };')
  && googleAuth.includes('crypto.timingSafeEqual'));

// The token goes to the origins this was configured for and nowhere else, and
// the decision is remade every hop so a redirect off Google cannot carry it.
check('The Drive client re-decides the token host on every redirect hop',
  driveClient.includes('tokenOrigins.has(new URL(current).origin)')
  && !/carryToken/.test(driveClient));
check('The Drive token host list is derived from the configured origin',
  driveClient.includes('tokenOriginsFor(apiOrigin)'));

// The same rule for the credentials themselves.
check('Google credentials only go to the configured token endpoint',
  googleAuth.includes('credentialOrigins.has(new URL(endpoint).origin)'));

// A Google Doc has no bytes and cannot be written back through this API.
// Offering Save on one would be offering a lie.
check('A Google-native document is marked read-only rather than silently failing to save',
  driveClient.includes("readOnly: !!exported")
  && driveClient.includes("throw new DriveError('read-only'"));

// main.js is evaluated in a bare vm context by the legacy QA suites, whose
// require shim cannot resolve these paths. A module-scope require would break
// them the moment the file loads.
for (const [label, name] of [['Google sign-in', 'google-auth'], ['Drive client', 'drive-client']]) {
  const requireLine = new RegExp(`require\\('\\./${name}\\.js'\\)`);
  const atModuleScope = new RegExp(`^(?:const|let|var)[^\n]*require\\('\\./${name}\\.js'\\)`, 'm');
  check(`The ${label} module is required lazily, so the vm suites still load main.js`,
    requireLine.test(main) && !atModuleScope.test(main));
}

// Every Drive handler answers with the envelope. An Error crossing
// contextBridge keeps only its message, and the kind is what decides whether
// the UI offers a re-sign-in, a wait, or the picker.
const driveHandlers = [...main.matchAll(/ipcMain\.handle\('(drive:[^']+)',\s*(\w+)/g)];
check('Every Drive IPC handler answers through the typed envelope',
  driveHandlers.length >= 8 && driveHandlers.every(match => match[2] === 'driveReply'),
  driveHandlers.map(match => `${match[1]}:${match[2]}`).join(' '));

// Verbs only. There is deliberately no way to ask for the credential itself.
const driveBridge = (/drive: Object\.freeze\(\{([\s\S]*?)\}\)/.exec(preload) || [])[1] || '';
check('The Drive bridge exposes verbs and no way to read the credential',
  driveBridge.includes('connect:') && driveBridge.includes('read:')
  && !/token|secret|clientId/i.test(driveBridge),
  driveBridge.replace(/\s+/g, ' ').trim().slice(0, 80));
check('Nothing in the renderer can reach a Google credential',
  !/clientSecret|refreshToken|accessToken/.test(renderer));

// Only the refresh token reaches the disk, and only through safeStorage. The
// access token is good for an hour and can always be minted again, so storing
// it would add a second copy of a credential for no benefit.
check('The Google refresh token is only ever written encrypted, at 0600',
  main.includes('safeStorage.encryptString(String(token))')
  && /driveTokenPath\(\), encrypted, \{ mode: 0o600 \}/.test(main));
check('The stored Google credential is the refresh token, not the access token',
  /writeStoredRefreshToken\(session\.refreshToken\)/.test(main)
  && !/writeStoredRefreshToken\([^)]*accessToken/.test(main));

// A rotated refresh token that is not written back signs the user out at the
// next launch, which reads as "it keeps forgetting me" rather than as a bug.
check('A rotated refresh token is written back',
  main.includes('driveSession.refreshToken !== refreshToken'));

// Disconnect withdraws the grant at Google rather than only hiding it locally.
check('Disconnecting revokes the grant with Google, not just locally',
  /driveDisconnect[\s\S]{0,600}googleAuthClient\(\)\.revoke/.test(main));

check('The Drive QA suite is wired into the package scripts',
  pkg.scripts?.['qa:google-drive'] === 'node scripts/qa-google-drive.js');

// The Drive panel's own logic, run rather than matched. These three functions
// are what turn Google's answers into things the rest of Leaf understands, and
// a string search would not notice any of them getting it wrong.
const driveUi = (() => {
  const vm = require('node:vm');
  const slice = (from, to) => renderer.slice(renderer.indexOf(from), renderer.indexOf(to));
  let counter = 0;
  const context = {
    uid: prefix => `${prefix}${++counter}`,
    state: { documents: [], selectedDocumentId: null },
    // The DOM and the rest of the app are not the subject here.
    $: () => null, showToast: () => {}, persist: () => {}, renderAll: () => {},
    clearInspector: () => {}, focusDocument: () => {}, setDriveError: () => {},
    closeDriveModal: () => {}, isBinaryPage: () => false
  };
  vm.createContext(context);
  vm.runInContext(
    slice('  function githubDocumentType(', '  async function connectGithubRepository(')
    + slice('  function driveNodesFromFiles(', '  async function uploadPageToDrive('),
    context
  );
  return {
    nodesFrom: vm.runInContext('driveNodesFromFiles', context),
    openDocument: vm.runInContext('openDriveDocument', context),
    state: context.state
  };
})();

const DRIVE_FILES = [
  { id: 'f1', name: 'notes.md', mimeType: 'text/markdown', isFolder: false, readOnly: false, exportAs: null },
  { id: 'f2', name: 'Plan', mimeType: 'application/vnd.google-apps.document', isFolder: false, readOnly: true, exportAs: 'text/html' },
  { id: 'f3', name: 'Archive', mimeType: 'application/vnd.google-apps.folder', isFolder: true, readOnly: false },
  { id: 'f4', name: 'page.html', mimeType: 'text/html', isFolder: false, readOnly: false, exportAs: null }
];

const driveNodes = driveUi.nodesFrom(DRIVE_FILES);
check('A Drive folder does not become a Page',
  driveNodes.length === 3 && !driveNodes.some(node => node.fileName === 'Archive'),
  driveNodes.map(node => node.fileName).join(','));
check('A Drive file arrives as an unloaded stub, so nothing is downloaded until it is opened',
  driveNodes.every(node => node.remote.loaded === false && node.source === ''));
check('A Drive file keeps its id, which is the only handle Drive has',
  driveNodes.map(node => node.remote.driveId).join(',') === 'f1,f2,f4');
// A Google Doc has no extension, so its type has to come from what it exports
// as - otherwise the HTML that comes back would open as a plain image.
check('A Google document is typed by its export format, not its name',
  driveNodes.find(node => node.remote.driveId === 'f2').documentType === 'html',
  driveNodes.map(node => `${node.fileName}:${node.documentType}`).join(' '));
check('An ordinary Drive file is typed by its name',
  driveNodes.find(node => node.remote.driveId === 'f1').documentType === 'markdown');
check('A Google document carries its read-only state into the Page',
  driveNodes.find(node => node.remote.driveId === 'f2').remote.readOnly === true
  && driveNodes.find(node => node.remote.driveId === 'f1').remote.readOnly === false);

driveUi.openDocument(DRIVE_FILES);
check('Opening Drive adds one document', driveUi.state.documents.length === 1);
driveUi.openDocument(DRIVE_FILES);
check('Re-opening Drive does not stack a second copy of the same files',
  driveUi.state.documents.length === 1 && driveUi.state.documents[0].nodes.length === 3,
  `${driveUi.state.documents.length} documents, ${driveUi.state.documents[0].nodes.length} nodes`);
driveUi.openDocument([...DRIVE_FILES, { id: 'f5', name: 'new.md', mimeType: 'text/markdown', isFolder: false }]);
check('Re-opening Drive adds only what is new',
  driveUi.state.documents[0].nodes.length === 4,
  String(driveUi.state.documents[0].nodes.length));

// Save on a Drive-backed page has to reach Drive. Falling through to the export
// dialog would leave the user with a local copy that quietly stopped matching
// the file they opened.
check('Saving a Drive-backed page writes back to Drive instead of opening a file dialog',
  /if\(page\.remote\?\.driveId\)return saveDrivePage\(page\);/.test(renderer));
check('A Google document refuses the save rather than appearing to succeed',
  /saveDrivePage[\s\S]{0,300}page\.remote\?\.readOnly[\s\S]{0,200}return false;/.test(renderer));
// A sign-in still waiting on the browser holds a loopback socket open.
check('Closing the Drive panel mid-sign-in cancels the loopback listener',
  /closeDriveModal[\s\S]{0,400}drive\.cancelConnect\(\)/.test(renderer));
check('The Drive panel is reachable from the menu',
  html.includes('data-action="connect-drive"')
  && renderer.includes("case 'connect-drive': return openDriveModal();"));
// The scope is a product constraint, not a bug, so the panel says so.
check('The Drive panel explains why a listing can be empty',
  /Google only lets Leaf see the files it created/.test(html));

console.log('\nLeaf v0.5.16 static QA');
console.log('=======================');
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}
const passed = checks.filter(item => item.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if (process.exitCode) process.exit(process.exitCode);
