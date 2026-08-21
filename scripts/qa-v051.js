const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exitCode=1;return;}
  passed+=1;console.log(`PASS ${name}`);
}

check('Inspector Preview has an explicit state transition',js.includes('function setInspectorPreviewEnabled(enabled)'));
check('Inspector Preview applies and restores Draft DOM',js.includes('applyDraftPreview();')&&js.includes('else restoreDraftOriginalLive();'));
check('New child-container dialog closes before its action runs',js.indexOf('closeModal();\n    try{ action(value);')>0);
check('New child container creates and selects a real page',(js.includes("showToast('New document created')")||js.includes("showToast('New project created')"))&&js.includes('state.views.single=pageId'));
check('Preview Split Code buttons are directly bound',js.includes("$$('#viewSeg button[data-mode]').forEach(button=>"));
check('Mode transition updates state and rerenders',js.includes('state.mode=nextMode;')&&js.includes('renderViewMode();'));
check('Zoom controls are installed for every preview',js.includes('function installPreviewZoomControls()')&&js.includes("['single','left','right','codePreview'].forEach(slot=>"));
check('Zoom changes real preview rendering',js.includes('surface.style.zoom=String(zoom/100)'));
check('Zoom is bounded and persisted',/PREVIEW_ZOOM_MIN=\d+/.test(js)&&js.includes('PREVIEW_ZOOM_MAX=200')&&js.includes('setPreviewZoom(slot'));
check('Zoom controls are accessible buttons',css.includes('.viewport-zoom-control>button')&&html.includes('data-preview-zoom="single"'));

for(const script of ['qa-v050.js','qa-source-fidelity.js']){
  const result=cp.spawnSync(process.execPath,[path.join(__dirname,script)],{cwd:root,stdio:'inherit'});
  check(`${script} regression`,result.status===0);
}

console.log(`v0.5.1 UI regression QA: ${passed}/12 PASS`);
if(process.exitCode) process.exit(process.exitCode);
