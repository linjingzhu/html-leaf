const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exitCode=1;return;}passed++;console.log(`PASS ${name}`);}

check('Fixed resolution has a fit calculation',js.includes('function fitPreviewZoom(slot')&&js.includes('availableWidth/width')&&js.includes('availableHeight/height'));
check('Resolution change triggers Fit',/requestAnimationFrame\(\(\)=>\{applyPreviewSize\(slot\);fitPreviewZoom\(slot\);\}\)/.test(js));
check('Orientation change triggers Fit',/config\.width=height;[\s\S]*?requestAnimationFrame\(\(\)=>fitPreviewZoom\(slot\)\)/.test(js));
check('Fit synchronizes on Viewport resize',js.includes('new ResizeObserver')&&js.includes("state.previewZoomMode?.[slot]==='fit'"));
check('Ctrl wheel is captured without page zoom',js.includes("canvas?.addEventListener('wheel'")&&js.includes('if(!event.ctrlKey) return')&&js.includes('event.preventDefault()'));
check('Wheel up and down share toolbar zoom state',js.includes('event.deltaY<0?1:-1')&&js.includes('setPreviewZoom(slot,previewZoomForSlot(slot)'));
check('Very large resolutions can fit below 25%',js.includes('const PREVIEW_ZOOM_MIN=5'));
check('Fit hides unnecessary scrollbars',css.includes('.preview-canvas.is-fit{overflow:hidden}'));
check('Static iframe captures Ctrl wheel in the loaded document',js.includes("doc?.addEventListener('wheel'")&&js.includes('previewSlotForFrame(frame)'));
check('Interactive iframe forwards Ctrl wheel through a validated token bridge',js.includes('__hbeViewportInput:true')&&js.includes("data.token!==frame.dataset.snapshotToken")&&js.includes("kind:'zoom'"));
check('Viewport becomes active on pointer down',js.includes("addEventListener('pointerdown',()=>activateViewportSlot(slot),true)")&&js.includes('function activateViewportSlot(slot)'));
check('Startup discards persisted editing sessions',js.includes('resetPersistedEditorState();')&&!js.includes('normalizeState(loadState() || createDefaultState())'));
check('Default container starts with only an empty page',(js.includes("name:'Default Document'")||js.includes("name:'Default Project'"))&&js.includes("name:'Empty Page'")&&!js.includes('function coverHtml()')&&!js.includes('function chapterHtml()'));
check('Inspector Preview UI is removed and preview is forced on',!html.includes('inspectorPreviewToggle')&&js.includes('let inspectorPreviewEnabled = true')&&js.includes('state.preferences.inspectorPreview=true'));
check('4K preview is contained inside the center workspace',css.includes('contain:layout paint')&&css.includes('.workspace{')&&css.includes('overflow:hidden'));
check('Selected widgets expose four corners and four edge handles',js.includes("const scaleHandles=['nw','n','ne','e','se','s','sw','w']")&&js.includes("commitDomMutation(frame,page,target,'viewport-scale')"));
check('Each resize edge changes only its own axis',js.includes("if(direction.includes('e'))")&&js.includes("if(direction.includes('s'))")&&js.includes('startWidth+deltaX')&&js.includes('startHeight+deltaY'));
check('Window Edit control remains an on/off Edit toggle',js.includes("button.textContent='Edit'")&&js.includes("active?'Disable Edit for this Window':'Enable Edit for this Window'"));
check('Window Edit controls are the first title-bar control',html.indexOf('data-edit-slot="single"')<html.indexOf('id="singlePageName"')&&html.indexOf('data-edit-slot="left"')<html.indexOf('id="leftPageSelect"')&&!html.includes('<span class="view-name">Preview</span>'));
check('Inspector Delete preserves the edited frame and scroll position',js.includes('renderVisibleFramesForPage(pageId,frame)')&&js.includes('const scrollPosition={x:frame.contentWindow.scrollX,y:frame.contentWindow.scrollY}')&&js.includes('frame.contentWindow.scrollTo(scrollPosition.x,scrollPosition.y)'));
check('Reset is placed immediately left of Export and Inspector Delete is removed',html.indexOf('id="inspectorActions"')<html.indexOf('id="resetInspectorBtn"')&&html.indexOf('id="resetInspectorBtn"')<html.indexOf('id="exportElementBtn"')&&!html.includes('id="deleteElementBtn"'));
check('Fit is a separate button to the right of zoom controls',js.includes("control.insertAdjacentElement('afterend',fit)")&&js.includes('fitPreviewZoom(slot);')&&css.includes('.viewport-zoom-fit{'));
check('New child container updates an immutable list and renders the tree',(js.includes('state.documents=[...state.documents,project]')&&/state\.documents=\[\.\.\.state\.documents,project\];[\s\S]*?renderTree\(\);[\s\S]*?renderAll\(\)/.test(js))||(js.includes('state.projects=[...state.projects,project]')&&/state\.projects=\[\.\.\.state\.projects,project\];[\s\S]*?renderTree\(\);[\s\S]*?renderAll\(\)/.test(js)));
check('Project tree active marker has a runtime implementation',js.includes('function isNodeInActiveViewport(nodeId)')&&js.includes('nodeId===currentActivePageId()'));

for(const script of ['qa-v053.js','qa-source-fidelity.js']){
  const result=cp.spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});
  check(`${script} regression`,result.status===0);
}
console.log(`v0.5.6 selection/window regression QA: ${passed}/26 PASS`);
if(process.exitCode)process.exit(process.exitCode);
