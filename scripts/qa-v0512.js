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

check('Inspector replaces Delete with Export',html.includes('id="exportElementBtn"')&&!html.includes('id="deleteElementBtn"'));
check('Object export offers PNG, JPG, SVG, and scale choices',html.includes('id="objectExportModal"')&&html.includes('value="png"')&&html.includes('value="jpg"')&&html.includes('value="svg"')&&html.includes('id="objectExportScale"'));
check('Object export snapshots computed CSS without editor artifacts',js.includes('function exportCloneWithComputedStyles(')&&js.includes('function createObjectSvgSnapshot(')&&js.includes("/^data-editor-/i")&&js.includes("querySelectorAll('script,base,meta"));
check('Raster export supports transparent PNG and white-backed JPG',js.includes('function rasterizeObjectSnapshot(')&&js.includes("format==='jpg'")&&js.includes("canvas.toDataURL(format==='jpg'?'image/jpeg':'image/png'"));
check('Object export saves through a validated atomic main-process path',preload.includes('exportObjectAsset')&&main.includes('async function exportObjectAsset(')&&main.includes("ipcMain.handle('file:exportObjectAsset'")&&main.includes('await atomicWriteFile(filePath'));
check('Object context menu exposes Export',html.includes('data-object-context="export"')&&js.includes("if(action==='export')openObjectExportDialog()"));
check('Used Preview owns a visible toggle and horizontal splitter',html.includes('id="toggleUsedPreview"')&&html.includes('id="usedPreviewSplitter"')&&css.includes('.preview-collapsed'));
check('Used Preview size and visibility persist in layout state',js.includes('usedPreviewVisible:true')&&js.includes('usedPreviewRatio:0.42')&&js.includes('state.layout.usedPreviewRatio=value'));
check('Viewport Edit remains a stable pressed-state toggle',js.includes("button.textContent='Edit'")&&js.includes("button.setAttribute('aria-pressed',active?'true':'false')"));
check('Every document View owns a UI-free fullscreen control',html.split('data-document-fullscreen=').length===5&&js.includes('function setDocumentFullscreen(')&&js.includes('dataset.documentFullscreenSlot')&&css.includes('body.document-view-only'));
check('Fullscreen control becomes an accessible Show UI control in the same location',(js.includes("button.textContent=active?'Show UI':'⛶'")||js.includes("button.setAttribute('aria-label',active?'Show Leaf UI'"))&&css.includes('>.document-fullscreen-toggle'));
check('Enter starts selected text editing',js.includes("event.key==='Enter' && !editing && !modifier")&&js.includes('editSelectedText()'));
check('Escape cancels inline text edits and restores original HTML',js.includes("endInlineTextEdit({commit:false})")&&js.includes('if(!commit && changed) element.innerHTML=session.originalHtml'));
check('Outside pointer completion commits while selection is restored',js.includes("if(inlineTextEditSession)endInlineTextEdit({commit:true})")&&js.includes("SelectionManager.select(element,frame,'inline-text')"));
check('F locates the selected object in the document',js.includes('function revealSelectedObject(')&&js.includes("scrollIntoView({behavior:'smooth',block:'center',inline:'center'})")&&js.includes("e.key.toLowerCase()==='f'"));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0511.js')],{stdio:'inherit'});
check('qa-v0511.js regression',prior.status===0);
console.log(`v0.5.12 export/view/edit regression QA: ${passed}/16 PASS`);
