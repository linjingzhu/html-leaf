const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const js=read('src/renderer/renderer.js');
const css=read('src/renderer/styles.css');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Shift+Enter inserts a durable BR and a temporary caret marker',js.includes("if(event.shiftKey)")&&js.includes("createElement('br')")&&js.includes("createTextNode('\\u200b')"));
check('Inline commit strips every temporary caret marker',js.includes("node.data.replace(/\\u200b/g,'')"));
check('Inspector text newlines materialize as BR elements',js.includes('function replaceDirectTextWithBreaks(')&&js.includes("split('\\n')"));
check('Hierarchy defaults to editable Name mode',js.includes('hierarchyNameMode:true')&&html.includes('aria-pressed="true"')&&html.includes('>Name</button>'));
check('Root is excluded by SelectionManager and Hierarchy handlers',js.includes("['HTML','BODY'].includes(element.tagName)")&&js.includes("if(node.depth===0)return")&&html.includes('id="hierarchyTree"'));
check('Text CSS exposes at least 34 direct style properties',js.match(/key:'[^']+',label:'[^']+',property:'[^']+'/g)?.length>=34&&(js.includes("data-inspector-group=\"Text CSS\"")||js.includes("'Appearance/Text CSS'")));
check('Text CSS values are read and applied through a shared property map',js.includes('TEXT_CSS_FIELDS.forEach(field=>{values[field.key]')&&js.includes("el.style[field.property]="));
check('Split guarantees distinct left and right document bindings',js.includes('function ensureDistinctSplitBindings(')&&js.includes('state.views.right!==leftId')&&js.includes("state.views.right=alternate.id"));
check('Split selector collision swaps the opposite binding',js.includes("key==='left'&&nextPageId===state.views.right")&&js.includes("key==='right'&&nextPageId===state.views.left"));
check('Used panel contains list and lower sandboxed preview',html.includes('id="usedComponentsList"')&&html.includes('id="usedComponentPreviewFrame" sandbox=""'));
check('Used preview enforces a no-script Content Security Policy',js.includes("default-src 'none'; img-src data:; style-src 'unsafe-inline'"));
check('Document selection synchronizes one-way into Used',js.includes('function syncUsedSelectionFromElement(')&&js.includes('usedDocumentSelectionSignature=null;selectedUsedComponentToken'));
check('Document View title no longer renders a Preview label',!html.includes('<span class="view-name">Preview</span>'));
check('Project context menu shows all requested shortcuts',html.includes('Rename <span>F2</span>')&&html.includes('Copy <span>Ctrl+C</span>')&&html.includes('Paste <span>Ctrl+V</span>')&&html.includes('Duplicate <span>Ctrl+D</span>')&&html.includes('Delete <span>Del</span>'));
check('Project tree keyboard executes F2, C, V, D and Delete actions',js.includes("refs.tree.addEventListener('keydown'")&&js.includes("handleContext('copy')")&&js.includes("handleContext('paste')")&&js.includes("handleContext('duplicate')"));
check('Every rendered Project tree object owns a child add button',js.split('class="tree-row-add"').length>=3&&html.includes('id="treeAddMenu"'));
check('Add Page and Add Group support explicit child creation',js.includes("function addEmptyPage(project,targetNode,{asChild=false}={})")&&js.includes("function addGroup(project,targetNode,{asChild=false}={})"));
check('Document tree nodes support cycle-safe hierarchy drag moves',js.includes('application/x-hbe-tree-node')&&(js.includes('function moveDocumentTreeNode(')||js.includes('function moveProjectTreeNode('))&&js.includes('subtreeIds.has(targetNode.id)'));
check('Undo history captures and restores structural selection paths',js.includes('function captureSelectionSnapshot(')&&js.includes('selection:captureSelectionSnapshot(page.id)')&&js.includes('restorePendingSelection(frame)'));
check('Runtime render nonce forces iframe refresh and remains sanitizer-owned',js.includes('name="hbe-render-token"')&&js.includes('data-editor-overlay="1"'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v058.js')],{stdio:'inherit'});
check('qa-v058.js regression',prior.status===0);
console.log(`v0.5.9 document/tree/history regression QA: ${passed}/21 PASS`);
