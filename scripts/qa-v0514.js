const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const css=read('src/renderer/styles.css');
const js=read('src/renderer/renderer.js');
const main=read('src/main.js');
const preload=read('src/preload.js');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Native document fullscreen hides the operating-system title bar',main.includes('mainWindow.setFullScreen(Boolean(enabled))')&&preload.includes("window:setDocumentFullscreen")&&js.includes('setDocumentFullscreen(!!next)'));
check('Show UI is an accessible circular translucent icon',js.includes("button.setAttribute('aria-label',active?'Show Leaf UI'")&&css.includes('border-radius:50%')&&css.includes('background:rgba(20,23,29,.52)'));
check('Document tree accepts Explorer page drops',js.includes("e.dataTransfer.types.includes('Files')")&&(js.includes('readDroppedPage(file)')||js.includes('readDroppedDocument(file)'))&&(js.includes('importDroppedPages(event,project,null)')||js.includes('importDroppedDocuments(event,project,null)')));
check('Document imports support HTML, Markdown, JSON, XML, PDF, and later binary formats',/new Set\(\['\.html', '\.htm', '\.md', '\.markdown', '\.json', '\.xml', '\.pdf'/.test(main)&&main.includes("documentType === 'pdf'")&&js.includes("page.documentType==='markdown'")&&js.includes("page.documentType==='json'"));
check('Leaf container serializes the complete child collection',((html.includes('data-action="save-project"')||html.includes('data-action="save-leaf-project"'))&&js.includes("format:'leaf-project'")&&js.includes('documents:clone(state.documents)')||html.includes('data-action="save-leaf-document"')&&js.includes("format:'leaf-document'")&&js.includes('projects:clone(state.projects)'))&&(main.includes("extensions: ['prj', 'leaf', 'hbeproj', 'json']")||main.includes("extensions: ['leaf', 'hbeproj', 'json']")));
check('Leaf child and leaf Page commands remain separate',html.includes('data-action="new-document"')&&(html.includes('data-action="new-page"')||html.includes('data-action="new-project"'))&&js.includes('project.nodes.push(page)'));
check('Leaf shortcuts target the active hierarchy',(js.includes("e.shiftKey&&e.key.toLowerCase()==='n'")&&js.includes('newPage()')&&js.includes('newProject()')&&js.includes('saveLeafProject(true)'))||(js.includes("e.key.toLowerCase()==='n'){e.preventDefault();newPage()")&&js.includes('savePage(true)')&&js.includes('savePage(false)'))||(js.includes("e.key.toLowerCase()==='n'){e.preventDefault();newDocument()")&&js.includes('saveDocument(true)')&&js.includes('saveDocument(false)')));
check('Edit state uses a red button and red View outline',js.includes("classList.toggle('edit-active',active)")&&css.includes('.view-pane.edit-active')&&css.includes('background:#d93c3c'));
check('App and preview scrollbars use compact styling',css.includes('*::-webkit-scrollbar{width:8px;height:8px}')&&js.includes('data-leaf-scrollbar-runtime="1"')&&js.includes('runtimePreviewScrollbarCss'));
check('Code line rail follows editor metrics and scrolling',html.includes('wrap="off"')&&js.includes('syncLineRailScroll')&&js.includes('translateY(${-refs.source.scrollTop}px)')&&css.includes('font:12px/1.55'));
check('Code search bar and Ctrl+F focus path exist',html.includes('id="codeSearch"')&&(js.includes("modifier&&e.key.toLowerCase()==='f'&&state.mode==='code'")||js.includes('activeViewSearchInput()'))&&js.includes('findCodeMatch'));
check('Inspector supports two foldable grouping levels',js.includes('class="property-subgroup"')&&js.includes("data-inspector-group=\"General\"")&&js.includes("'Appearance/Typography'"));
check('Inspector object name has prominent typography',css.includes('.node-name{')&&css.includes('font-size:15px')&&css.includes('font-weight:750'));
check('Raster export captures the rendered object',main.includes('webContents.capturePage')&&js.includes('captureRenderedObject(element,snapshot,format)'));
check('Multi-selection export writes separate files',main.includes('async function exportObjectAssets')&&js.includes('SelectionManager.items().filter')&&js.includes('window.electronAPI.exportObjectAssets({format,items})'));
check('Inspector Reset is hidden',html.includes('id="resetInspectorBtn" type="button" disabled hidden'));
check('Source-fidelity sanitizer still removes runtime scrollbar metadata',js.includes('style data-editor-overlay="1"')&&read('src/renderer/source-fidelity.js').includes("querySelectorAll('[data-editor-overlay]"));

const mainProcess=spawnSync(process.execPath,[path.join(__dirname,'qa-main-document-v0514.js')],{stdio:'inherit'});
check('main-process document and batch-export adversarial QA',mainProcess.status===0);

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0513.js')],{stdio:'inherit'});
check('qa-v0513.js regression',prior.status===0);
console.log(`Leaf v0.5.14 document workspace regression QA: ${passed}/19 PASS`);
