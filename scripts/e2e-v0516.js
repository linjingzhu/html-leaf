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
  let passed=0;const check=(name,condition,detail='')=>{if(!condition)throw new Error(`FAIL ${name}${detail?`: ${detail}`:''}`);passed++;console.log(`PASS ${name}`);};
  await send('Runtime.enable');await send('Page.enable');await sleep(700);

  const modeLabels=await evaluate(`[...document.querySelectorAll('#viewSeg button[data-mode]')].map(button=>({mode:button.dataset.mode,label:button.textContent.trim(),aria:button.getAttribute('aria-label')}))`);
  check('Document View modes are labelled Focus, Compare, and Code',JSON.stringify(modeLabels)===JSON.stringify([{mode:'preview',label:'Focus',aria:'Focus view'},{mode:'split',label:'Compare',aria:'Compare view'},{mode:'code',label:'Code',aria:null}]),JSON.stringify(modeLabels));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true}))`);await sleep(60);
  const dialog=await evaluate(`({open:document.querySelector('#inputModal').classList.contains('show'),title:document.querySelector('#modalTitle').textContent,documents:document.querySelectorAll('.document-card').length})`);
  check('Ctrl+N opens New Project',dialog.open&&dialog.title==='New Project'&&dialog.documents===1,JSON.stringify(dialog));
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Manual Project';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const created=await evaluate(`({documents:document.querySelectorAll('.document-card').length,nodes:document.querySelectorAll('.tree-row[data-node-id]').length,crumbs:document.querySelector('#crumbs').textContent,title:document.querySelector('#workspaceTitle').textContent})`);
  check('New Project starts with Default Document and Empty Page',created.documents===1&&created.nodes===1&&created.crumbs.includes('Default Document')&&created.title.includes('Manual Project / Default Document'),JSON.stringify(created));

  await evaluate(`document.querySelector('[data-action="new-document"]').click()`);await sleep(60);
  const documentDialog=await evaluate(`({open:document.querySelector('#inputModal').classList.contains('show'),title:document.querySelector('#modalTitle').textContent})`);
  check('New Document is a separate middle-level command',documentDialog.open&&documentDialog.title==='New Document',JSON.stringify(documentDialog));
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Reference Manual';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const documentCreated=await evaluate(`({documents:document.querySelectorAll('.document-card').length,pages:document.querySelectorAll('.tree-row[data-node-id]').length,crumbs:document.querySelector('#crumbs').textContent,title:document.querySelector('#workspaceTitle').textContent})`);
  check('Document owns its initial Page inside the Project',documentCreated.documents===2&&documentCreated.pages===2&&documentCreated.crumbs.includes('Reference Manual')&&documentCreated.title.includes('Manual Project / Reference Manual'),JSON.stringify(documentCreated));

  await evaluate(`(()=>{const card=document.querySelector('.document-card:last-child');card.querySelector(':scope > .tree-row .tree-row-add').click();document.querySelector('[data-tree-add="group"]').click()})()`);await sleep(60);
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Section Group';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const group=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.document-card:last-child .tree-row[data-node-id]')];const row=rows.find(item=>item.querySelector('.label')?.textContent==='Section Group');return{exists:!!row,depth:row?.dataset.depth,nodes:rows.length}})()`);
  check('Group is created as a Document container',group.exists&&group.depth==='1'&&group.nodes===2,JSON.stringify(group));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await sleep(60);
  const pageDialog=await evaluate(`({open:document.querySelector('#inputModal').classList.contains('show'),title:document.querySelector('#modalTitle').textContent})`);
  check('Ctrl+Shift+N opens New Page for the active Document selection',pageDialog.open&&pageDialog.title==='New Page',JSON.stringify(pageDialog));
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Child Page';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const childPage=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.document-card:last-child .tree-row[data-node-id]')];const row=rows.find(item=>item.querySelector('.label')?.textContent==='Child Page');return{exists:!!row,depth:row?.dataset.depth,crumbs:document.querySelector('#crumbs').textContent}})()`);
  check('New Page is inserted as the selected Group child',childPage.exists&&childPage.depth==='2'&&childPage.crumbs.includes('Section Group / Child Page'),JSON.stringify(childPage));

  const source='<!doctype html>\n<html>\n<head><title>Needle</title></head>\n<body>\n<h1 data-hbe-name="Hero Title">Needle</h1>\n<p>Body</p>\n'+Array.from({length:120},(_,index)=>`<div>Line ${index+1}</div>`).join('\n')+'\n</body>\n</html>';
  await evaluate(`(()=>{document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));editor.scrollTop=36;editor.dispatchEvent(new Event('scroll'));})()`);await sleep(180);
  const lines=await evaluate(`(()=>{const editor=document.querySelector('#sourceEditor'),rail=document.querySelector('.line-rail-lines');return{count:rail.children.length,sourceLines:editor.value.split('\\n').length,wrap:editor.getAttribute('wrap'),transform:rail.style.transform,editorLine:getComputedStyle(editor).lineHeight,railLine:getComputedStyle(rail.children[0]).lineHeight}})()`);
  check('Code line numbers match logical lines and follow scroll',lines.count===lines.sourceLines&&lines.wrap==='off'&&lines.transform.includes('-36px')&&Math.abs(parseFloat(lines.editorLine)-parseFloat(lines.railLine))<.2,JSON.stringify(lines));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))`);
  const searchFocus=await evaluate(`document.activeElement.id`);check('Ctrl+F focuses Code search',searchFocus==='codeSearch',searchFocus);
  await evaluate(`(()=>{const input=document.querySelector('#codeSearch');input.value='needle';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(40);
  const search=await evaluate(`({status:document.querySelector('#codeSearchStatus').textContent,active:document.activeElement.id,selected:document.querySelector('#sourceEditor').value.slice(document.querySelector('#sourceEditor').selectionStart,document.querySelector('#sourceEditor').selectionEnd).toLowerCase()})`);
  check('Code search counts and selects matches without losing input focus',search.status==='2'&&search.active==='codeSearch'&&search.selected==='needle',JSON.stringify(search));

  await evaluate(`document.querySelector('[data-mode="preview"]').click()`);await sleep(180);
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await sleep(80);
  const edit=await evaluate(`(()=>{const pane=document.querySelector('#singleView'),button=document.querySelector('[data-edit-slot="single"]');return{pressed:button.getAttribute('aria-pressed'),pane:pane.classList.contains('edit-active'),buttonColor:getComputedStyle(button).backgroundColor,border:getComputedStyle(pane).borderTopColor}})()`);
  check('Edit activation turns both button and View outline red',edit.pressed==='true'&&edit.pane&&/rgb\((217, 60, 60|239, 77, 77)\)/.test(`${edit.buttonColor} ${edit.border}`),JSON.stringify(edit));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),target=frame.contentDocument.querySelector('h1');target.dispatchEvent(new frame.contentWindow.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));})()`);await sleep(90);
  const inspector=await evaluate(`(()=>{const body=document.querySelector('#inspectorBody'),name=body.querySelector('.node-name');return{name:name?.textContent,parents:body.querySelectorAll(':scope > details.property-group').length,nested:body.querySelectorAll('.property-group .property-subgroup').length,nameSize:parseFloat(getComputedStyle(name).fontSize),resetVisible:document.querySelector('#resetInspectorBtn').getBoundingClientRect().width}})()`);
  check('Inspector shows a large object name and two-level folds',inspector.name==='Hero Title'&&inspector.parents>=3&&inspector.nested>=5&&inspector.nameSize>=15&&inspector.resetVisible===0,JSON.stringify(inspector));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),p=frame.contentDocument.querySelector('p');p.dispatchEvent(new frame.contentWindow.MouseEvent('pointerdown',{bubbles:true,cancelable:true,ctrlKey:true}));document.querySelector('#objectContextMenu [data-object-context="export"]').click()})()`);await sleep(80);
  const multiple=await evaluate(`({open:document.querySelector('#objectExportModal').classList.contains('show'),summary:document.querySelector('#objectExportSummary').textContent})`);
  check('Multi-selection context Export prepares separate object files',multiple.open&&multiple.summary.includes('2 objects'),JSON.stringify(multiple));
  await evaluate(`document.querySelector('#objectExportCancel').click()`);

  await evaluate(`document.querySelector('[data-document-fullscreen="single"]').click()`);await sleep(450);
  const fullscreen=await evaluate(`(()=>{const button=document.querySelector('[data-document-fullscreen="single"]'),style=getComputedStyle(button);return{body:document.body.classList.contains('document-view-only'),label:button.getAttribute('aria-label'),text:button.textContent,radius:style.borderRadius,width:style.width}})()`);
  check('Fullscreen uses an icon-only circular translucent Show UI control',fullscreen.body&&fullscreen.label==='Show Leaf UI'&&!fullscreen.text.includes('Show UI')&&parseFloat(fullscreen.radius)>=18&&parseFloat(fullscreen.width)===38,JSON.stringify(fullscreen));
  await evaluate(`document.querySelector('[data-document-fullscreen="single"]').click()`);await sleep(250);

  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-v0516.png'),Buffer.from(screenshot.data,'base64'));
  console.log(`Leaf v0.5.16 functional QA: ${passed}/15 PASS`);socket.close();
}
main().catch(error=>{console.error(error.stack||error);process.exit(1);});
