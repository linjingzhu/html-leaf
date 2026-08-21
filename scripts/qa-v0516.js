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
check('Supported Page formats remain HTML, Markdown, and PDF',
  main.includes("new Set(['.html', '.htm', '.md', '.markdown', '.pdf'])")&&
  main.includes("extensions: ['html', 'htm', 'md', 'markdown', 'pdf']")&&
  !main.includes("return 'webp'")&&!js.includes("documentType==='webp'"));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0515.js')],{stdio:'inherit'});
check('v0.5.15 complete regression chain',prior.status===0);
console.log(`Leaf v0.5.16 hierarchy and .prj QA: ${passed}/14 PASS`);
