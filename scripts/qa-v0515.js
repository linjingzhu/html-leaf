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
const pkg=JSON.parse(read('package.json'));
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Release retains v0.5.15+ hierarchy work',['0.5.15','0.5.16'].includes(pkg.version)&&['release-v0.5.15','release-v0.5.16'].includes(pkg.build.directories.output));
check('Visible hierarchy is Project, Document, Page',
  (html.includes('Open Leaf Project')||html.includes('Open Project'))&&html.includes('<span>Documents</span>')&&(html.includes('New Page <kbd>Ctrl+N</kbd>')||html.includes('New Page <kbd>Ctrl+Shift+N</kbd>'))&&
  html.includes('New Document…')&&!html.includes('<span>Projects</span>'));
check('Default hierarchy is Untitled Leaf Project, Default Document, Empty Page',
  js.includes("projectName:'Untitled Leaf Project'")&&js.includes("name:'Default Document'")&&js.includes("name:'Empty Page'"));
check('Leaf Project schema stores Documents',
  js.includes("format:'leaf-project'")&&(js.includes("version:'0.5.15'")||js.includes("version:'0.5.16'"))&&js.includes('documents:clone(state.documents)'));
check('v0.5.14 Leaf Document schema remains readable',
  js.includes("payload?.format==='leaf-document'")&&js.includes('Array.isArray(payload?.projects)')&&
  js.includes('s.projectName||s.documentName')&&js.includes('s.selectedDocumentId||s.selectedProjectId'));
check('New Page and New Document are separate commands',
  html.includes('data-action="new-page"')&&html.includes('data-action="new-document"')&&
  js.includes("case 'new-page': return newPage()")&&js.includes("case 'new-document': return newDocument()"));
check('Content shortcuts target the current lifecycle',
  (js.includes("e.key.toLowerCase()==='n'){e.preventDefault();newPage()")&&js.includes('savePage(true)')&&js.includes('savePage(false)'))||
  (js.includes("e.shiftKey&&e.key.toLowerCase()==='n'")&&js.includes('newPage()')&&js.includes('saveLeafProject(true)')&&js.includes('saveLeafProject(false)')));
check('Document tree uses Document domain names',
  js.includes("card.className='document-card'")&&js.includes("setData('text/leaf-document-id'")&&
  css.includes('.document-card{')&&css.includes('--document-color'));
check('Explorer import is named and routed as Page import',
  html.includes('Import Pages…')&&preload.includes('importPages:')&&preload.includes('readDroppedPage:')&&
  main.includes("ipcMain.handle('file:importPages'")&&js.includes('importDroppedPages(e,project,null)'));
check('Page dialogs use Page terminology',
  main.includes("title: 'Import Pages'")&&main.includes("title: 'Save Page As'")&&
  js.includes("openModal('New Page'")&&js.includes("showToast('Page loaded')"));
check('Project dialogs use Project terminology',
  main.includes("title: 'Open Leaf Project'")&&main.includes("name: 'Leaf Project'")&&
  js.includes("showToast('Leaf project saved')"));
check('Trust Foundation remains enabled',
  main.includes('contextIsolation: true')&&main.includes('sandbox: true')&&main.includes('webSecurity: true')&&
  read('src/renderer/source-fidelity.js').includes('stripEditorArtifactsFromDocument'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0514.js')],{stdio:'inherit'});
check('v0.5.14 complete regression chain',prior.status===0);
console.log(`Leaf v0.5.15 Project / Document / Page terminology QA: ${passed}/13 PASS`);
