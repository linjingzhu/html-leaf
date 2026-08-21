const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const js=read('src/renderer/renderer.js');
const main=read('src/main.js');
const pkg=JSON.parse(read('package.json'));
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Release is v0.5.16',pkg.version==='0.5.16'&&pkg.build.directories.output==='release-v0.5.16');
check('Canonical hierarchy is Project, Document, Page and Group',
  html.includes('New Project <kbd>Ctrl+N</kbd>')&&html.includes('New Document…')&&
  html.includes('New Page <kbd>Ctrl+Shift+N</kbd>')&&html.includes('Add Group (Container)'));
check('Document View mode labels are Preview and Compare',
  html.includes('data-mode="preview" class="active" aria-label="Preview view">Preview</button>')&&
  html.includes('data-mode="split" aria-label="Compare view">Compare</button>')&&
  html.includes('data-mode="code">Code</button>'));
check('Main menu starts at the left edge without a product icon',
  !html.includes('class="product-mark"')&&html.includes('<nav class="main-menu" id="mainMenu"')&&
  !read('src/renderer/styles.css').includes('.product-mark{'));
check('Hover inspection uses an independent highlight without changing selection',
  js.includes("hoverOverlay.dataset.editorOverlay='hover-highlight'")&&
  js.includes('positionHoverOverlay(e.target)')&&js.includes('syncSelectionOverlays()'));
check('Hover tooltip exposes object identity, geometry, role, display, and focusability',
  js.includes("hoverTooltip.dataset.editorOverlay='hover-tooltip'")&&
  js.includes("['Name',objectDisplayName(el)]")&&js.includes("['Role',implicitRole(el)]")&&
  js.includes("['Display',computed.display||'—']")&&js.includes("['Focusable',isKeyboardFocusable(el)?'Yes':'No']"));
check('Save Page As supports HTML, Markdown, JSON, and rendered PDF',
  ['html','markdown','json','pdf'].every(format=>html.includes(`option value="${format}"`))&&
  main.includes('async function exportPageAs')&&main.includes('printToPDF({ printBackground: true, preferCSSPageSize: true })')&&
  read('src/preload.js').includes("exportPageAs: (payload) => ipcRenderer.invoke('file:exportPageAs'"));
check('Every visual View owns non-mutating highlight search with Enter navigation',
  (html.match(/data-view-search=/g)||[]).length===4&&html.includes('id="codeSearch"')&&
  js.includes("CSS.highlights.set('leaf-search-all'")&&js.includes("CSS.highlights.set('leaf-search-current'")&&
  js.includes("if(event.key==='Enter'){event.preventDefault();refreshViewSearch"));
check('Help is the final main menu and About opens product information',
  html.lastIndexOf('<button class="menu-trigger">Help</button>')>html.lastIndexOf('<button class="menu-trigger">Preference</button>')&&
  html.includes('data-action="about"')&&html.includes('id="aboutModal"')&&js.includes("case 'about': return openAboutDialog()"));
check('Project save commands own Ctrl+S shortcuts',
  html.includes('Save Project <kbd>Ctrl+S</kbd>')&&html.includes('Save Project As <kbd>Ctrl+Shift+S</kbd>')&&
  js.includes('saveLeafProject(true)')&&js.includes('saveLeafProject(false)'));
check('Project files save with the prj extension',
  main.includes("defaultPath: suggestedName || 'project.prj'")&&main.includes("extensions: ['prj']")&&
  main.includes("if (!/\\.prj$/i.test(filePath)) filePath += '.prj'"));
check('Legacy Leaf project extensions remain openable',
  main.includes("extensions: ['prj', 'leaf', 'hbeproj', 'json']")&&js.includes("payload?.format==='leaf-document'"));
check('New Project resets the content hierarchy',
  js.includes('function newProject()')&&js.includes("openModal('New Project'")&&
  js.includes('state.projectFilePath=null')&&js.includes('state.documents=fresh.documents'));
check('Ctrl+N creates Project and Ctrl+Shift+N creates Page',
  js.includes("if(modifier&&e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();newPage()")&&
  js.includes("else if(modifier&&e.key.toLowerCase()==='n'){e.preventDefault();newProject()"));
check('New Page becomes a child of the active Document selection',
  js.includes("const parentId=context.project?.id===project.id&&context.node?context.node.id:null")&&
  js.includes('if(parentId){const parent=project.nodes.find'));
check('Group is explicitly normalized as a container',
  js.includes("if(page.type==='group')page.container=true")&&js.includes("type:'group',name,parentId")&&js.includes('container:true'));
check('New Project schema remains leaf-project and v0.5.16',
  js.includes("format:'leaf-project',version:'0.5.16'")&&js.includes('documents:clone(state.documents)'));
check('Legacy leaf paths migrate through Save As prj',
  js.includes("const requiresPrjPath=!/\\.prj$/i.test(state.projectFilePath||'')")&&js.includes('forceAs||!state.projectFilePath||requiresPrjPath'));
check('Trust Foundation remains active',
  main.includes('contextIsolation: true')&&main.includes('sandbox: true')&&main.includes('webSecurity: true')&&
  read('src/renderer/source-fidelity.js').includes('stripEditorArtifactsFromDocument'));
check('Supported Page formats include HTML, Markdown, JSON, and PDF',
  main.includes("new Set(['.html', '.htm', '.md', '.markdown', '.json', '.pdf'])")&&
  main.includes("extensions: ['html', 'htm', 'md', 'markdown', 'json', 'pdf']")&&
  !main.includes("return 'webp'")&&!js.includes("documentType==='webp'"));
check('Preview Edit provides an isolated direct source editor for Markdown and JSON',
  js.includes("function isDirectSourceType(page){return page?.documentType==='markdown'||page?.documentType==='json';}")&&
  js.includes("frame.dataset.previewRuntime='direct-source-editor'")&&js.includes("frame.setAttribute('sandbox','allow-scripts')")&&
  js.includes('__leafDirectSourceEdit:true'));
check('Direct source input is immediate, undoable, bounded, and metadata guarded',
  js.includes("if(!directSourceUndoTokens.has(data.token)){pushUndo(page)")&&js.includes('page.source=data.source')&&
  js.includes('data.source.length>50_000_000')&&js.includes('editorArtifactReport?.(data.source)'));
check('Clear targets its own View without an active-Inspector guard',
  js.includes('pendingClearPageId=pageId;')&&js.includes('const selectionBelongsToPage=selectedElementFrame&&frameToPageId(selectedElementFrame)===page.id')&&
  !/function openClearHtmlDialog\(slot\)[\s\S]{0,900}withUnsavedInspectorGuard/.test(js));
check('Hierarchy always displays object type at the right edge',
  js.includes('function hierarchyObjectType(el)')&&js.includes('<span class="hierarchy-type">')&&
  read('src/renderer/styles.css').includes('.hierarchy-type{flex:none;margin-left:auto'));
check('Hierarchy observes Page load and author DOM changes immediately',
  js.includes('function bindHierarchyObserver(frame)')&&js.includes('observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true})')&&
  js.includes('bindHierarchyObserver(frame);'));
check('Shift resize snaps dragged edges to nearby object alignment guides',
  js.includes('const snapAdjustment=(position,guides)=>')&&js.includes("if(moveEvent.shiftKey&&(direction.includes('e')||direction.includes('w')))")&&
  js.includes("if(moveEvent.shiftKey&&(direction.includes('n')||direction.includes('s')))"));
check('Edit outline is 3px and View tool rows are 20 percent taller',
  read('src/renderer/styles.css').includes('--view-head-h:34px')&&
  read('src/renderer/styles.css').includes('outline:3px solid #ff3f46')&&
  read('src/renderer/styles.css').includes('height:var(--view-head-h);flex:0 0 var(--view-head-h)'));
check('A source document has one Page identity and one Compare binding',
  js.includes('function pageDocumentKey(page)')&&js.includes('function loadedPageForPath(sourcePath)')&&
  js.includes('This document is already open. Focused the existing Page.')&&js.includes('function bindPageToSlot(slot,nextPageId)')&&
  js.includes('samePageDocument(nextPageId,state.views[other])'));
check('Markdown and PDF Edit controls are enabled in their visual Views',
  js.includes('function isDirectSourceEdit(page,slot){return !!htmlEditEnabled&&editOwnerSlot===slot&&!!frameForEditSlot(slot)')&&
  js.includes("const pdfAvailable=page?.documentType==='pdf'&&!!frame")&&js.includes("frame.dataset.previewRuntime=isPdfNativeEdit(page,slot)?'pdf-native-editor':'document-readonly'")&&
  js.includes('Use the native PDF toolbar to highlight, draw, annotate, fill, sign'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0515.js')],{stdio:'inherit'});
check('v0.5.15 complete regression chain',prior.status===0);
const pageExport=spawnSync(process.execPath,[path.join(__dirname,'qa-main-export-v0516.js')],{stdio:'inherit'});
check('main-process HTML, Markdown, JSON, and PDF Page export QA',pageExport.status===0);
console.log(`Leaf v0.5.16 Page lifecycle, editing, and layout QA: ${passed}/31 PASS`);
