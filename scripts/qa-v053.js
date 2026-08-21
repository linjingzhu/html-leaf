const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exitCode=1;return;}passed++;console.log(`PASS ${name}`);}

check('Inspector no longer owns HTML Edit',!html.includes('id="htmlEditToggle"')&&!html.includes('>HTML Edit</button>'));
check('Every editable Viewport owns an Edit button',['single','left','right','codePreview'].every(slot=>html.includes(`data-edit-slot="${slot}"`)));
check('Edit is visibly accented',css.includes('.viewport-edit-toggle.active')&&css.includes('background:var(--accent)'));
check('Edit ownership restricts frame inspection',js.includes('let editOwnerSlot = null')&&js.includes('function canInspectFrame(frame)')&&js.includes('frameForEditSlot(editOwnerSlot)===frame'));
check('Interactive and empty previews disable Edit',js.includes("frame?.dataset.previewRuntime==='interactive-isolated'")&&js.includes('button.disabled=unavailable'));
check('Inspector groups are foldable',html.includes('Inspector')&&js.includes('<details class="property-group"')&&js.includes('function bindInspectorFolds()'));
check('Fold state is persisted',js.includes('state.preferences.inspectorFolds')&&js.includes("group.addEventListener('toggle'"));
check('Fold headers use subtle brighter treatment',css.includes('.property-group-title:hover')&&css.includes('color-mix(in srgb,var(--panel-secondary)'));
check('Collapsed invalid group exposes errors',js.includes('group-error-count')&&js.includes('group.open=true'));
check('Code follows active visual Page',js.includes('const currentPageId=currentActivePageId()')&&js.includes('state.views.codePreview=currentPageId')&&js.includes('state.views.codePage=currentPageId'));
check('Code enters source editor mode',js.includes("activeSlots.code='editor'"));
check('Code Preview and Source cannot diverge',js.includes("if(key==='codePreview'||key==='codePage')")&&js.includes('state.views.codePreview=nextPageId')&&js.includes('state.views.codePage=nextPageId'));
check('Split retains distinct independent Page bindings',js.includes('function ensureDistinctSplitBindings(')&&js.includes('state.views.right!==leftId')&&js.includes("state.views[activeSlots.split==='right'?'right':'left']=pageId"));
check('File menu uses the current leaf-content terminology',(html.includes('New Page')&&html.includes('Save Page')&&html.includes('Save Page As'))||(html.includes('New Document')&&html.includes('Save Document')&&html.includes('Save Document As')&&!html.includes('New Project <kbd>')));

for(const script of ['qa-v052.js','qa-source-fidelity.js']){
  const result=cp.spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});
  check(`${script} regression`,result.status===0);
}
console.log(`v0.5.3 editing UX regression QA: ${passed}/16 PASS`);
if(process.exitCode)process.exit(process.exitCode);
