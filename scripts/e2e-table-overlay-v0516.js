const fs=require('fs');
const http=require('http');
const path=require('path');
const port=Number(process.env.LEAF_DEBUG_PORT||9230);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=url=>new Promise((resolve,reject)=>http.get(url,response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject));

async function main(){
  let targets;
  for(let attempt=0;attempt<50;attempt++){try{targets=await json(`http://127.0.0.1:${port}/json/list`);break;}catch{await sleep(250);}}
  const target=targets?.find(item=>item.type==='page'&&item.title==='Leaf')||targets?.find(item=>item.type==='page');
  if(!target)throw new Error('Leaf renderer target not found');
  const socket=new WebSocket(target.webSocketDebuggerUrl);let nextId=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
  const waitFor=async(expression,attempts=50)=>{for(let i=0;i<attempts;i++){if(await evaluate(expression))return true;await sleep(100);}throw new Error(`Timed out: ${expression}`);};
  let passed=0;const check=(name,condition,detail='')=>{if(!condition)throw new Error(`FAIL ${name}${detail?`: ${detail}`:''}`);passed++;console.log(`PASS ${name}`);};
  await send('Runtime.enable');await send('Page.enable');await sleep(500);

  const source='<!doctype html><html><head><style>body{font:16px Arial;padding:90px;background:#fff;color:#202124}table{border-collapse:collapse;width:520px}th,td{border:1px solid #777;padding:18px;text-align:left}</style></head><body><table data-hbe-object="table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>One</td><td>Two</td></tr></tbody></table></body></html>';
  await evaluate(`(()=>{document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mode="preview"]').click()})()`);
  await waitFor(`document.querySelector('#singleFrame').contentDocument?.querySelectorAll('td').length===2`);
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await sleep(80);
  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),cell=frame.contentDocument.querySelector('tbody td');cell.dispatchEvent(new frame.contentWindow.PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:11,button:0}))})()`);await sleep(100);

  const toolbar=await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),doc=frame.contentDocument,bar=doc.querySelector('[data-editor-overlay="table-toolbar"]'),buttons=[...bar.querySelectorAll('[data-table-overlay-action]')];return{display:bar.style.display,visibility:bar.style.visibility,role:bar.getAttribute('role'),label:bar.getAttribute('aria-label'),actions:buttons.map(button=>button.dataset.tableOverlayAction),labels:buttons.map(button=>button.getAttribute('aria-label')),left:parseFloat(bar.style.left),top:parseFloat(bar.style.top),selected:doc.querySelectorAll('.table-cell-selected').length}})()`);
  check('Selecting a cell displays the in-document Table toolbar',toolbar.display==='flex'&&toolbar.visibility==='visible'&&toolbar.role==='toolbar'&&toolbar.label==='Table editing'&&toolbar.selected===1&&Number.isFinite(toolbar.left)&&Number.isFinite(toolbar.top),JSON.stringify(toolbar));
  check('Toolbar exposes six accessible row, column, merge, and split actions',toolbar.actions.join(',')==='add-row,delete-row,add-column,delete-column,merge-right,unmerge'&&toolbar.labels.every(Boolean),JSON.stringify(toolbar));

  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="add-row"]').click()`);await sleep(100);
  let shape=await evaluate(`(()=>{const doc=document.querySelector('#singleFrame').contentDocument,table=doc.querySelector('table');return{rows:table.rows.length,bodyRows:table.tBodies[0].rows.length,columns:[...table.rows].map(row=>[...row.cells].reduce((sum,cell)=>sum+cell.colSpan,0)),selected:doc.querySelector('.table-cell-selected')?.textContent}})()`);
  check('Add Row inserts after the selected row and keeps a cell selected',shape.rows===3&&shape.bodyRows===2&&shape.columns.every(count=>count===2)&&shape.selected==='Cell',JSON.stringify(shape));

  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="add-column"]').click()`);await sleep(100);
  shape=await evaluate(`(()=>{const table=document.querySelector('#singleFrame').contentDocument.querySelector('table');return{rows:table.rows.length,columns:[...table.rows].map(row=>[...row.cells].reduce((sum,cell)=>sum+cell.colSpan,0))}})()`);
  check('Add Column inserts across every row at the selected logical column',shape.rows===3&&shape.columns.every(count=>count===3),JSON.stringify(shape));

  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="delete-column"]').click()`);await sleep(80);
  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="delete-row"]').click()`);await sleep(100);
  shape=await evaluate(`(()=>{const table=document.querySelector('#singleFrame').contentDocument.querySelector('table');return{rows:table.rows.length,columns:[...table.rows].map(row=>[...row.cells].reduce((sum,cell)=>sum+cell.colSpan,0)),toolbar:document.querySelector('#singleFrame').contentDocument.querySelector('[data-editor-overlay="table-toolbar"]').style.display}})()`);
  check('Delete Column and Delete Row restore the original table dimensions',shape.rows===2&&shape.columns.every(count=>count===2)&&shape.toolbar==='flex',JSON.stringify(shape));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),cell=frame.contentDocument.querySelector('tbody td');cell.dispatchEvent(new frame.contentWindow.PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:12,button:0}));frame.contentDocument.querySelector('[data-table-overlay-action="merge-right"]').click()})()`);await sleep(100);
  let merge=await evaluate(`(()=>{const doc=document.querySelector('#singleFrame').contentDocument,cell=doc.querySelector('tbody td'),mergeButton=doc.querySelector('[data-table-overlay-action="merge-right"]'),splitButton=doc.querySelector('[data-table-overlay-action="unmerge"]');return{cells:cell.parentElement.cells.length,span:cell.colSpan,text:cell.innerText,mergeDisabled:mergeButton.disabled,splitDisabled:splitButton.disabled}})()`);
  check('Merge Right combines content and colspan while updating action availability',merge.cells===1&&merge.span===2&&merge.text.includes('One')&&merge.text.includes('Two')&&merge.mergeDisabled&& !merge.splitDisabled,JSON.stringify(merge));

  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="delete-column"]').click()`);await sleep(100);
  const spanningDelete=await evaluate(`(()=>{const table=document.querySelector('#singleFrame').contentDocument.querySelector('table'),cell=table.querySelector('tbody td');return{columns:[...table.rows].map(row=>[...row.cells].reduce((sum,item)=>sum+item.colSpan,0)),bodyCells:cell.parentElement.cells.length,span:cell.colSpan}})()`);
  check('Delete Column contracts a spanning cell without corrupting its row',spanningDelete.columns.every(count=>count===1)&&spanningDelete.bodyCells===1&&spanningDelete.span===1,JSON.stringify(spanningDelete));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);await waitFor(`document.querySelector('#singleFrame').contentDocument?.querySelector('tbody td')?.colSpan===2`);

  await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('[data-table-overlay-action="unmerge"]').click()`);await sleep(100);
  merge=await evaluate(`(()=>{const cell=document.querySelector('#singleFrame').contentDocument.querySelector('tbody td');return{cells:cell.parentElement.cells.length,span:cell.colSpan}})()`);
  check('Split restores individual cells from a merged cell',merge.cells===2&&merge.span===1,JSON.stringify(merge));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);await waitFor(`document.querySelector('#singleFrame').contentDocument?.querySelector('tbody td')?.colSpan===2`);
  const undone=await evaluate(`(()=>{const cell=document.querySelector('#singleFrame').contentDocument.querySelector('tbody td');return{cells:cell.parentElement.cells.length,span:cell.colSpan}})()`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await waitFor(`document.querySelector('#singleFrame').contentDocument?.querySelector('tbody tr')?.cells.length===2`);
  const redone=await evaluate(`(()=>{const cell=document.querySelector('#singleFrame').contentDocument.querySelector('tbody td');return{cells:cell.parentElement.cells.length,span:cell.colSpan}})()`);
  check('Table structural edits participate in Undo and Redo',undone.cells===1&&undone.span===2&&redone.cells===2&&redone.span===1,JSON.stringify({undone,redone}));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),cell=frame.contentDocument.querySelector('tbody td');cell.dispatchEvent(new frame.contentWindow.PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:13,button:0}))})()`);await sleep(80);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-table-overlay-v0516.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('[data-mode="code"]').click()`);await sleep(120);
  const saved=await evaluate(`document.querySelector('#sourceEditor').value`);
  check('Saved HTML contains table edits without editor overlays or selection markers',saved.includes('<table')&&saved.includes('<tbody>')&&!saved.includes('data-editor-overlay')&&!saved.includes('table-cell-selected'),saved.slice(0,240));

  console.log(`Leaf in-document table editing functional QA: ${passed}/10 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
