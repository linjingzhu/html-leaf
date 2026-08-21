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

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true}))`);await sleep(60);
  const dialog=await evaluate(`({open:document.querySelector('#inputModal').classList.contains('show'),title:document.querySelector('#modalTitle').textContent,projects:document.querySelectorAll('.project-card').length})`);
  check('Ctrl+N opens New Document without creating a project',dialog.open&&dialog.title==='New Document'&&dialog.projects===1,JSON.stringify(dialog));
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Search Notes';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const created=await evaluate(`({projects:document.querySelectorAll('.project-card').length,documents:document.querySelectorAll('.tree-row[data-node-id]').length,crumbs:document.querySelector('#crumbs').textContent})`);
  check('New Document is inserted under Default Project',created.projects===1&&created.documents===2&&created.crumbs.includes('Default Project'),JSON.stringify(created));

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
  fs.writeFileSync(path.join(__dirname,'qa-evidence-v0514.png'),Buffer.from(screenshot.data,'base64'));
  console.log(`Leaf v0.5.14 functional QA: ${passed}/9 PASS`);socket.close();
}
main().catch(error=>{console.error(error.stack||error);process.exit(1);});
