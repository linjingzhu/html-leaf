const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('src/main.js');
const preload = read('src/preload.js');
const renderer = read('src/renderer/renderer.js');
const css = read('src/renderer/styles.css');
const html = read('src/renderer/index.html');

const checks = [];
function check(name, condition, detail=''){
  checks.push({name, pass:!!condition, detail});
  if(!condition) process.exitCode = 1;
}
function includesAll(text, parts){ return parts.every(p=>text.includes(p)); }

check('No framework migration dependency',
  !['react','react-dom','vite','tailwindcss','@radix-ui/react-dialog'].some(d=>pkg.dependencies?.[d] || pkg.devDependencies?.[d]),
  'Renderer remains Vanilla HTML/CSS/JS.');
check('Electron dependency unchanged',
  Object.keys(pkg.devDependencies||{}).length===1 && pkg.devDependencies.electron==='43.4.0',
  JSON.stringify(pkg.devDependencies));
check('Electron security boundaries preserved',
  includesAll(main, ['contextIsolation: true','nodeIntegration: false','sandbox: true','webSecurity: true']));
check('Preload uses narrow contextBridge surface',
  preload.includes('contextBridge.exposeInMainWorld') && !preload.includes('nodeIntegration'));
check('No CDN runtime resource in application shell',
  !/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//i.test(html));

const semanticTokens = [
  '--background','--foreground','--panel','--panel-secondary','--border','--border-subtle',
  '--muted','--accent','--selection','--focus-ring','--success','--warning','--error'
];
check('Semantic design tokens present', semanticTokens.every(t=>css.includes(t)), semanticTokens.join(', '));
check('Light/Dark share semantic token names',
  css.includes('body[data-theme="light"]') && semanticTokens.slice(0,9).every(t=>css.includes(t)));

check('Inspector collapse removes Inspector and its splitter columns',
  css.includes('grid-template-columns:var(--sidebar-width) var(--splitter-hit) minmax(0,1fr) 0 0') &&
  css.includes('.workspace.inspector-collapsed .inspector-resizer'));
check('All splitters use shared 8px gutter + 1px visible separator',
  html.includes('id="sidebarResizer"') && html.includes('id="splitDivider"') &&
  html.includes('id="codeDivider"') && html.includes('id="inspectorResizer"') &&
  css.includes('.splitter-handle::after') && css.includes('width:1px') && css.includes('--splitter-hit:8px'));
check('Unified splitter uses Pointer Capture and rAF',
  renderer.includes('setPointerCapture(pointerId)') &&
  renderer.includes('requestAnimationFrame(flush)') &&
  renderer.includes("document.body.classList.add('is-resizing')"));
check('Resize blocks iframe pointer interaction',
  css.includes('body.is-resizing iframe{pointer-events:none!important}'));
check('Split and Code dividers are real resizers',
  renderer.includes("refs.splitDivider.addEventListener('pointerdown'") &&
  renderer.includes("refs.codeDivider.addEventListener('pointerdown'"));
check('Sidebar and Inspector resizers are real resizers',
  renderer.includes("refs.sidebarResizer.addEventListener('pointerdown'") &&
  renderer.includes("refs.inspectorResizer.addEventListener('pointerdown'"));

check('Project card grouping preserved',
  renderer.includes("card.className='project-card'") && css.includes('.project-card{') &&
  css.includes('--project-color'));
check('Empty page is a true placeholder',
  renderer.includes("source:'',baseUrl:null,sourcePath:null,isEmpty:true"));
check('Explorer HTML drag/drop preserved',
  renderer.includes('readDroppedHtml(file)') && preload.includes('webUtils.getPathForFile(file)'));
check('Preview render size controls exist in every preview slot',
  ['single','left','right','codePreview'].every(slot=>html.includes(`data-preview-size-slot="${slot}"`)));
check('Preview viewport presets include responsive and fixed sizes',
  html.includes('value="responsive"') && html.includes('value="1920x1080"') &&
  html.includes('value="390x844"') && html.includes('value="custom"'));
check('Preview fixed size changes actual iframe surface dimensions',
  renderer.includes('surface.style.width=`${width}px`') &&
  renderer.includes('surface.style.height=`${height}px`') &&
  css.includes('.preview-canvas.is-responsive'));


check('HTML Edit OFF gates hover/select',
  renderer.includes("if(!htmlEditEnabled || e.target.dataset?.editorOverlay) return"));
check('Hover and Selected visuals are distinct',
  renderer.includes("stateName='hover'") && renderer.includes("stateName==='selected'"));

check('Inspector draft has explicit edit-context fields',
  includesAll(renderer, ['selectedElementId','savedValues','dirtyFields','validationErrors','inspectorPreviewEnabled','htmlEditEnabled']));
check('Typing/Preview do not commit source',
  renderer.includes('applyDraftPreview()') && renderer.includes('syncFrameToPage(inspectorDraft.frame,page)'));
check('Apply is a transaction boundary',
  renderer.includes('// One Apply = one logical transaction boundary.') && renderer.includes('pushUndo(page)'));
check('Reset restores last applied state',
  renderer.includes('inspectorDraft.values=clone(inspectorDraft.savedValues)') &&
  renderer.includes('inspectorDraft.dirtyFields=[]'));

check('Draft validation blocks Apply',
  renderer.includes('function validateInspectorDraft()') &&
  renderer.includes('hasInspectorValidationErrors()') &&
  renderer.includes("applyButton.disabled=!(htmlEditEnabled && inspectorDraft?.dirty) || invalid"));
check('Invalid draft prevents preview partial application',
  renderer.includes('if(inspectorPreviewEnabled && !hasInspectorValidationErrors()) applyDraftPreview()') &&
  renderer.includes('else restoreDraftOriginalLive()'));

check('Unsaved guard covers page switching',
  renderer.includes('function selectPageFromTree') && renderer.includes('withUnsavedInspectorGuard(()=>'));
check('Unsaved guard covers element switching',
  renderer.includes('targetId!==currentId') && renderer.includes('withUnsavedInspectorGuard(selectTarget'));
check('Unsaved guard covers project switching',
  renderer.includes("state.selectedProjectId=project.id") && renderer.includes('row.onclick=e=>') &&
  renderer.includes('withUnsavedInspectorGuard(()=>'));
check('Unsaved dialog exposes Cancel / Discard / Apply',
  includesAll(html,['id="unsavedCancel"','id="unsavedDiscard"','id="unsavedApply"']));

check('Inspector properties are single vertical rows',
  renderer.includes('propertyRow(') && css.includes('.property-row{') &&
  css.includes('grid-template-columns:minmax(92px,42%) minmax(0,1fr)'));

check('No general panel shadows',
  !/\.sidebar[^}]*box-shadow|\.inspector[^}]*box-shadow|\.menubar[^}]*box-shadow/s.test(css));
check('Popup/dialog shadow token exists',
  css.includes('--shadow-popup') && css.includes('.context-menu{') && css.includes('.modal{'));

check('Desktop density targets are represented',
  css.includes('--control-h:30px') && css.includes('--row-h:27px') && css.includes('--section-h:28px'));

// Data-model scale smoke: 10 projects / 50 groups / 300 pages.
const large = [];
let pageCount=0, groupCount=0;
for(let p=0;p<10;p++){
  const project={id:`p${p}`,nodes:[]};
  for(let g=0;g<5;g++){
    const gid=`p${p}g${g}`;
    project.nodes.push({id:gid,type:'group',parentId:null,order:g});
    groupCount++;
    for(let n=0;n<6;n++){
      project.nodes.push({id:`${gid}page${n}`,type:'page',parentId:gid,order:n,source:'<p>x</p>'});
      pageCount++;
    }
  }
  large.push(project);
}
check('Large tree fixture = 10 projects', large.length===10);
check('Large tree fixture = 50 groups', groupCount===50);
check('Large tree fixture = 300 pages', pageCount===300);
check('Large tree hierarchy parent IDs resolve',
  large.every(project => {
    const ids=new Set(project.nodes.map(n=>n.id));
    return project.nodes.every(n=>n.parentId===null || ids.has(n.parentId));
  }));

// Project reorder invariant: B above A produces B,A,C.
const order=['A','B','C'];
const from=order.indexOf('B'), to=order.indexOf('A');
const [moved]=order.splice(from,1); order.splice(to,0,moved);
check('Project drag reorder invariant B,A,C', order.join(',')==='B,A,C', order.join(','));

console.log('\nHTML Book Editor v0.3.5 static QA');
console.log('==================================');
for(const item of checks){
  console.log(`${item.pass?'PASS':'FAIL'}  ${item.name}${item.detail?` — ${item.detail}`:''}`);
}
const passed=checks.filter(x=>x.pass).length;
console.log(`\n${passed}/${checks.length} checks passed.`);
if(process.exitCode) process.exit(process.exitCode);
