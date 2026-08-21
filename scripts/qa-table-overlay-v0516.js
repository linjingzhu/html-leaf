const fs=require('fs');

const html=fs.readFileSync('src/renderer/index.html','utf8');
const js=fs.readFileSync('src/renderer/renderer.js','utf8');
const fidelity=fs.readFileSync('src/renderer/source-fidelity.js','utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exit(1);}
  passed++;console.log(`PASS ${name}`);
}

check('Inspector table controls remain available',
  ['tableAddRow','tableDeleteRow','tableAddColumn','tableDeleteColumn','tableMergeRight','tableUnmerge'].every(id=>html.includes(`id="${id}"`)));
check('Selected tables receive an in-document toolbar overlay',
  js.includes("tableOverlayToolbar.dataset.editorOverlay='table-toolbar'")&&
  js.includes("setAttribute('role','toolbar')")&&js.includes("setAttribute('aria-label','Table editing')"));
check('Document toolbar exposes row, column, merge, and split actions',
  ['add-row','delete-row','add-column','delete-column','merge-right','unmerge'].every(action=>js.includes(`['${action}'`)));
check('Every in-document table action has an accessible label',
  js.includes("button.setAttribute('aria-label',title)")&&js.includes("button.dataset.tableOverlayAction=name"));
check('Toolbar is positioned inside the visible document viewport',
  js.includes('view.innerWidth-toolbarRect.width-6')&&js.includes('view.innerHeight-toolbarRect.height-6'));
check('Unavailable destructive and merge actions are disabled',
  js.includes("'delete-row':table.rows.length<=1")&&js.includes("'delete-column':logicalColumns<=1")&&
  js.includes("'merge-right':!cell")&&js.includes('unmerge:!cell'));
check('Row insertion targets the selected row and returns a live selection',
  js.includes('const reference=cell?.parentElement')&&js.includes('section.insertBefore(row,reference.nextSibling)')&&
  js.includes('return{selection:row.cells[0]}'));
check('Column insertion uses logical colspan-aware coordinates',
  js.includes('function tableCellLogicalStart(cell)')&&js.includes('function tableCellAtLogicalColumn(row,column)')&&
  js.includes('covering.cell.colSpan=Math.max(1,covering.cell.colSpan||1)+1'));
check('Column deletion contracts spanning cells instead of corrupting the row',
  js.includes("if((hit.cell.colSpan||1)>1)hit.cell.colSpan-=1")&&js.includes('else hit.cell.remove()'));
check('Table edits retain selected-cell context after DOM mutation',
  js.includes('const nextSelection=result?.selection?.isConnected')&&js.includes('commitDomMutation(frame,page,nextSelection,source)'));
check('Table actions remain undoable through the shared mutation transaction',
  js.includes('function mutateSelectedTable(mutator,source)')&&js.includes('function commitDomMutation(frame,page,selected=null,source=')&&
  js.includes('pushUndo(page);'));
check('Document toolbar and selected-cell markers are stripped from saved source',
  fidelity.includes("querySelectorAll('[data-editor-overlay]")&&fidelity.includes("'table-cell-selected'")&&
  fidelity.includes('editorArtifactReport'));

console.log(`Leaf in-document table editing regression QA: ${passed}/12 PASS`);
