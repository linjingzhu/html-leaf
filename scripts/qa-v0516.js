const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const js=read('src/renderer/renderer.js');
const css=read('src/renderer/styles.css');
const main=read('src/main.js');
const pkg=JSON.parse(read('package.json'));
const registryContext={window:{},crypto:{randomUUID:()=>''}};
vm.runInNewContext(read('src/renderer/widget-registry.js'),registryContext);
const widgetDefinitions=registryContext.window.WidgetRegistry.all();
const widgetTypes=new Set(widgetDefinitions.map(item=>item.type));
const widgetCategories=new Set(widgetDefinitions.map(item=>item.category));
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Release is v0.5.16',pkg.version==='0.5.16'&&pkg.build.directories.output==='release-v0.5.16');
check('Canonical hierarchy is Project, Document, Page and Group',
  html.includes('New Project <kbd>Ctrl+N</kbd>')&&html.includes('data-action="new-document">New Document</button>')&&
  html.includes('New Page <kbd>Ctrl+Shift+N</kbd>')&&html.includes('data-tree-add="group">New Section</button>'));
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
check('New Document, Page, and Section create immediately without naming dialogs',
  !js.includes("openModal('New Document'")&&!js.includes("openModal('New Page'")&&!js.includes("openModal('Add Group'")&&
  js.includes("uniqueTreeName('New Document'")&&js.split("uniqueTreeName('New Page'").length>=3&&js.includes("uniqueTreeName('New Section'"));
check('Group is explicitly normalized as a container',
  js.includes("if(page.type==='group')page.container=true")&&js.includes("type:'group',name,parentId")&&js.includes('container:true'));
check('New Project schema remains leaf-project and v0.5.16',
  js.includes("format:'leaf-project',version:'0.5.16'")&&js.includes('documents:clone(state.documents)'));
check('Legacy leaf paths migrate through Save As prj',
  js.includes("const requiresPrjPath=!/\\.prj$/i.test(state.projectFilePath||'')")&&js.includes('forceAs||!state.projectFilePath||requiresPrjPath'));
check('Trust Foundation remains active',
  main.includes('contextIsolation: true')&&main.includes('sandbox: true')&&main.includes('webSecurity: true')&&
  read('src/renderer/source-fidelity.js').includes('stripEditorArtifactsFromDocument'));
check('Supported Page formats include HTML, Markdown, JSON, XML, and PDF',
  main.includes("new Set(['.html', '.htm', '.md', '.markdown', '.json', '.xml', '.pdf'])")&&
  main.includes("extensions: ['html', 'htm', 'md', 'markdown', 'json', 'xml', 'pdf']")&&
  !main.includes("return 'webp'")&&!js.includes("documentType==='webp'"));
check('Preview Edit provides an isolated direct source editor for Markdown, JSON and XML',
  js.includes("function isDirectSourceType(page){return page?.documentType==='markdown'||page?.documentType==='json'||page?.documentType==='xml';}")&&
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
check('Edit outline is 2px and View tool rows are 20 percent taller',
  read('src/renderer/styles.css').includes('--view-head-h:34px')&&
  read('src/renderer/styles.css').includes('outline:2px solid #ff3f46')&&
  read('src/renderer/styles.css').includes('height:var(--view-head-h);flex:0 0 var(--view-head-h)'));
check('Splitters reserve a visible eight-pixel gutter between panes',
  read('src/renderer/styles.css').includes('--splitter-hit:8px')&&
  read('src/renderer/styles.css').includes('background:var(--background);cursor:col-resize')&&
  read('src/renderer/styles.css').includes('.view-divider{background:var(--background)'));
check('A source document has one Page identity and one Compare binding',
  js.includes('function pageDocumentKey(page)')&&js.includes('function loadedPageForPath(sourcePath)')&&
  js.includes('This document is already open. Focused the existing Page.')&&js.includes('function bindPageToSlot(slot,nextPageId)')&&
  js.includes('samePageDocument(nextPageId,state.views[other])'));
check('Markdown and PDF Edit controls are enabled in their visual Views',
  js.includes('function isDirectSourceEdit(page,slot){return !!htmlEditEnabled&&editOwnerSlot===slot&&!!frameForEditSlot(slot)')&&
  js.includes("const pdfAvailable=page?.documentType==='pdf'&&!!frame")&&js.includes("frame.dataset.previewRuntime=isPdfNativeEdit(page,slot)?'pdf-native-editor':'document-readonly'")&&
  js.includes('Use the native PDF toolbar to highlight, draw, annotate, fill, sign'));

check('Startup status is present before the editor initializes',html.includes('id="appStartup"')&&html.includes('Starting Leaf')&&html.includes('Preparing the editor and document views'));
check('Renderer loading is deferred until the startup screen can paint',html.includes('setTimeout(loadRenderer, 80)')&&html.includes("script.src = './renderer.js'"));
check('Startup status closes deterministically after bootstrap',js.includes("performance.measure('leaf-renderer-bootstrap'")&&js.includes("document.documentElement.dataset.leafReady='true'")&&js.includes("startup?.classList.add('is-complete')"));
check('Preview fallback surfaces follow the harmonious canvas token',css.includes('iframe{width:100%;height:100%;border:0;background:var(--canvas);color-scheme:dark')&&css.includes('position:relative;flex:none;background:var(--canvas)')&&js.includes('<html style="background:transparent;color-scheme:dark">'));
check('Objects palette contains forty practical components',widgetDefinitions.length===40&&['Document','Media','Actions & Navigation','Forms','Data Display','Layout'].every(category=>widgetCategories.has(category)));
check('Objects palette covers common navigation and form controls',['button','link','breadcrumb','navigation','tabs','pagination','form','textInput','textArea','select','checkbox','radioGroup','switch','search'].every(type=>widgetTypes.has(type)));
check('Objects palette covers common content, data, and layout controls',['bulletedList','numberedList','taskList','descriptionList','video','progress','meter','stat','card','section','columns','spacer','hero'].every(type=>widgetTypes.has(type)));
check('Zoom controls live outside the scrolling canvas',js.includes("layer.className='viewport-floating-controls'")&&js.includes('layer.append(control,fit);pane?.appendChild(layer)')&&css.includes('.viewport-floating-controls{'));
check('Floating controls reserve outer and document scrollbar insets',js.includes('function updateViewportFloatingInsets(slot)')&&js.includes('root.scrollHeight>view.innerHeight+1')&&css.includes('var(--viewport-scrollbar-inline,0px)')&&css.includes('var(--viewport-scrollbar-block,0px)'));
check('Inspector mouse wheel adjusts numeric values live',js.includes('function handleInspectorNumberWheel(event)')&&js.includes("control.dispatchEvent(new Event(control.dataset.draftKey?'input':'change'"));
check('Inspector exposes safe hyperlink URL and target properties',js.includes("propertyRow('linkHref','Link URL'")&&js.includes("propertyRow('linkTarget','Open In'")&&js.includes("['http:','https:','mailto:','tel:'].includes(url.protocol)")&&js.includes("anchor.setAttribute('rel','noopener noreferrer')"));
check('Non-anchor objects can be wrapped and unwrapped as real links',js.includes('function applyDraftHyperlink(')&&js.includes("anchor=el.ownerDocument.createElement('a')")&&js.includes('anchor.replaceWith(el)'));
check('No link navigates the iframe: fragments scroll, the rest are handled',js.includes('function installLocalAnchorNavigation(frame)')&&js.includes("if(!raw)return;")&&js.includes('function followPreviewLink(frame,doc,anchor,raw)')&&js.includes("target?.scrollIntoView({block:'start'")&&!js.includes("if(!raw.startsWith('#'))return;\n      event.preventDefault()"));
check('Script-isolated previews receive local-anchor protection',js.includes("raw[0]!=='#'")&&js.includes('document.getElementById(fragment)||document.getElementsByName(fragment)[0]'));
check('Occupied View drop offers Cancel, Open as New, and Replace',html.includes('id="replaceHtmlCancel"')&&html.includes('id="replaceHtmlOpenNew"')&&html.includes('id="replaceHtmlConfirm"'));
check('Drop choices route to separate new-Page and replace transactions',js.includes('refs.replaceHtmlOpenNew.onclick=async')&&js.includes('await addHtmlResultToDocument(pending.result,pending.slot)')&&js.includes("showToast('Page replaced')"));
check('Selecting another object commits text without reselecting the old object',js.includes('endInlineTextEdit({commit:true,restoreSelection:false})')&&js.includes('function endInlineTextEdit({commit=true,restoreSelection=true}={})'));
check('Overlay components establish a persistent free-positioning context',read('src/renderer/widget-registry.js').includes("position:relative;display:block;min-height:240px")&&js.includes("placement.mode==='free'"));
check('Selection overlay exposes a move handle with an existing-object payload',js.includes("moveHandle.dataset.editorOverlay='move-handle'")&&js.includes("setData('application/x-hbe-existing-element',id)"));
check('Palette, Used, and existing objects share viewport placement previews',js.includes('function calculateViewportPlacement(')&&js.includes('function renderViewportPlacementPreview(')&&js.includes('data.template&&!data.used&&!data.existing'));
check('Placement preview distinguishes free, inside, before, and after targets',js.includes("placement.mode==='free'?'Free position'")&&js.includes("placement.mode==='inside'?'Place inside'")&&js.includes("placement.mode==='before'?'Insert before':'Insert after'"));
check('Inspector owns live property-name search',html.includes('id="inspectorPropertySearch"')&&js.includes('function filterInspectorProperties()')&&js.includes("querySelectorAll('.property-row,.inspector-property-row')"));
check('Project tree owns document search with ancestor preservation',html.includes('id="projectSearch"')&&js.includes('function projectTreeSearchContext(project)')&&js.includes('while(current?.parentId){visible.add(current.parentId)'));
check('Preview scrollbar colors derive from the same app muted token',js.includes("getPropertyValue('--muted')")&&js.includes('background:color-mix(in srgb,${muted} 42%,transparent)'));
check('Used selection synchronization runs only while Used is open',js.includes("if(!document.querySelector('[data-left-panel=\"used\"]')?.classList.contains('active'))return")&&js.includes('usedDocumentSelectionSignature=usedComponentSignature(selectedElement)'));
check('Used context menu highlights runtime instances without source metadata',html.includes('id="usedContextMenu"')&&js.includes("marker.dataset.editorOverlay='used-instance-highlight'")&&js.includes('function highlightUsedInstances(token)'));
check('Used extraction removes nested runtime overlays',js.includes("clone.querySelectorAll('[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line]')"));
check('Table drag selection calculates contiguous row or column ranges',js.includes('function tableRangeCells(startCell,endCell)')&&js.includes('if(rowDistance>columnDistance)')&&js.includes('function beginTableRangeDrag(cell,frame,event)'));
check('Table row and column actions consume the accumulated selection',js.includes('function selectedTableRowIndexes(table)')&&js.includes('function selectedTableColumnIndexes(table)')&&js.includes('const selectedColumns=selectedTableColumnIndexes(table)'));
check('Preview Page name is a document dropdown like Compare',html.includes('<select class="page-select" id="singlePageName"')&&js.includes("['#singlePageName','single',refs.singleFrame]"));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0515.js')],{stdio:'inherit'});
check('v0.5.15 complete regression chain',prior.status===0);
const pageExport=spawnSync(process.execPath,[path.join(__dirname,'qa-main-export-v0516.js')],{stdio:'inherit'});
check('main-process HTML, Markdown, JSON, and PDF Page export QA',pageExport.status===0);
const zoomScrollbar=spawnSync(process.execPath,[path.join(__dirname,'qa-zoom-scrollbar-v0516.js')],{stdio:'inherit'});
check('zoom-independent document scrollbar regression QA',zoomScrollbar.status===0);
const codexTheme=spawnSync(process.execPath,[path.join(__dirname,'qa-theme-codex-v0516.js')],{stdio:'inherit'});
check('Codex application theme regression QA',codexTheme.status===0);
console.log(`Leaf v0.5.16 Page lifecycle, editing, and layout QA: ${passed}/65 PASS`);
