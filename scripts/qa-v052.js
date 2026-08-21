const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exitCode=1;return;}passed++;console.log(`PASS ${name}`);}

check('Loaded baseline is tracked independently',js.includes("typeof page.loadedSource!=='string'")&&js.includes('function pageHasUnsavedChanges(page)'));
check('Unchanged Clear bypasses confirmation',/if\(!pageHasUnsavedChanges\(page\)\)[\s\S]*?clearLoadedHtml\(\)/.test(js));
check('Changed Clear offers save discard cancel',html.includes('id="clearHtmlSave"')&&html.includes('Clear without saving')&&html.includes('id="clearHtmlCancel"'));
check('Save before Clear uses atomic main-process path',main.includes('async function saveHtmlPath')&&main.includes('atomicWriteFile(filePath')&&preload.includes("ipcRenderer.invoke('file:saveHtmlPath'"));
check('Split left inherits the active visual document',js.includes("if(nextMode==='split')")&&js.includes('ensureDistinctSplitBindings(currentPageId)')&&js.includes('state.views.left=leftId'));
check('New Project activates Projects panel',js.includes("activateLeftTab('project')")&&js.includes('project.expanded=true'));
check('Occupied drop asks for replacement confirmation',html.includes('id="replaceHtmlModal"')&&js.includes('pendingHtmlDrop={slot,pageId:page.id,result}'));
check('Replacement updates the existing page',js.includes("showToast('HTML replaced')")&&js.includes('page.source=pending.result.source'));
check('Hierarchy begins at BODY Root',js.includes('const root=doc.body')&&js.includes("n.depth===0?'Root'"));

for(const script of ['qa-v051.js','qa-source-fidelity.js']){
  const result=cp.spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});
  check(`${script} regression`,result.status===0);
}
console.log(`v0.5.2 lifecycle regression QA: ${passed}/11 PASS`);
if(process.exitCode)process.exit(process.exitCode);
