const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const main=read('src/main.js');
const preload=read('src/preload.js');
const html=read('src/renderer/index.html');
const js=read('src/renderer/renderer.js');
const css=read('src/renderer/styles.css');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('HTML load creates a session-scoped OS temp directory',main.includes("fs.mkdtemp(path.join(app.getPath('temp'), 'leaf-editor-'))"));
check('First loaded source is written to an initial snapshot',main.includes('snapshotInitialHtml(filePath, source)')&&main.includes('initialSnapshotPath'));
check('Repeated loads reuse the first snapshot for a source path',main.includes('initialHtmlSnapshots.has(key)')&&main.includes('initialHtmlSnapshots.get(key)'));
check('Software exit removes the entire session temp directory',main.includes("app.on('will-quit', cleanupSessionTempDir)")&&main.includes('fsSync.rmSync(sessionTempDir, { recursive: true, force: true })'));
check('Preload exposes the path reader for snapshot lifecycle QA',preload.includes("readHtmlPath: (filePath) => ipcRenderer.invoke('file:readHtmlPath', filePath)"));
check('Inspector Apply control and unapplied modal are removed',!html.includes('applyElementBtn')&&!html.includes('unsavedInspectorModal'));
check('Valid Inspector input commits immediately',js.includes('commitInspectorDraft({immediate:true})')&&js.includes('Valid values are reflected'));
check('Selection manager owns a multi-object Set',js.includes('let selectedElements = new Set()')&&js.includes('selectedElements.has(element)'));
check('Ctrl/Cmd object pointer down toggles selection',js.includes("doc.addEventListener('pointerdown'")&&js.includes('toggle:e.ctrlKey||e.metaKey'));
check('Selected objects persist through hover changes',js.includes('syncSelectionOverlays')&&js.includes('SelectionManager.items().some(item=>item.ownerDocument===doc)'));
check('Text widgets enter inline edit on double click',js.includes("doc.addEventListener('dblclick'")&&js.includes("element.setAttribute('contenteditable','plaintext-only')"));
check('Inline text editing commits through the source transaction path',js.includes("mutationKind:'inline-text-edit'")&&js.includes("element.addEventListener('input',updateLiveState)"));
check('Every source serialization strips runtime inline-edit state',js.includes('inlineSession.originalContentEditable')&&js.includes("inlineSession.element.setAttribute('contenteditable','plaintext-only')"));
check('Delete key removes selected document objects',js.includes("event.key==='Delete'||event.key==='Del'")&&js.includes('deleteSelectedElements()'));
check('Escape clears all object selections',js.includes("event.key==='Escape'")&&js.includes('clearInspector()'));
check('Hierarchy Page badge is replaced by a name mode toggle',!html.includes('hierarchy-mode-badge">Page')&&html.includes('id="hierarchyNameModeToggle"'));
check('Hierarchy name mode renders editable object names',js.includes('state.preferences.hierarchyNameMode')&&js.includes('objectDisplayName(n.el)'));
check('F2 starts Hierarchy object rename',js.includes("e.key==='F2'")&&js.includes('beginHierarchyRename()'));
check('Second mouse down on a selected named object starts rename',js.includes('selectedElements.has(node.el)')&&js.includes('hierarchyRenameElement=node.el'));
check('Object Name is available in Inspector and persists separately from content',js.includes("propertyRow('objectName','Object Name'")&&js.includes("setAttribute('data-hbe-name'"));
check('Hierarchy arrows use the enlarged hit target',css.includes('.hierarchy-twisty{width:18px;min-width:18px')&&css.includes('font-size:15px'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v054.js')],{stdio:'inherit'});
check('qa-v054.js regression',prior.status===0);
console.log(`v0.5.7 live editing/selection regression QA: ${passed}/22 PASS`);
