const fs=require('fs');
const http=require('http');
const path=require('path');

const port=Number(process.env.HBE_DEBUG_PORT||9227);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=url=>new Promise((resolve,reject)=>http.get(url,response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject));

async function main(){
  let targets;
  for(let attempt=0;attempt<30;attempt++){
    try{targets=await json(`http://127.0.0.1:${port}/json/list`);break;}catch{await sleep(250);}
  }
  const target=targets?.find(item=>item.type==='page'&&item.title==='Leaf')||targets?.find(item=>item.type==='page');
  if(!target)throw new Error('Leaf renderer target not found');
  const socket=new WebSocket(target.webSocketDebuggerUrl);let nextId=0;const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
  let passed=0;const check=(name,condition,detail='')=>{if(!condition)throw new Error(`FAIL ${name}${detail?`: ${detail}`:''}`);passed++;console.log(`PASS ${name}`);};
  await send('Runtime.enable');await send('Page.enable');await sleep(450);

  const source='<!doctype html><html><head><style>body{margin:0;font-family:Arial}.hero{margin:20px;padding:20px;background:#dff4c8;border:2px solid #3e8c3b;border-radius:12px}.space{height:1600px}.target{margin:20px;padding:18px;background:#fff3bf;color:#382f00;font-size:24px}</style></head><body><section class="hero" data-hbe-name="Hero"><h1>Leaf Export</h1></section><div class="space"></div><p class="target" data-hbe-name="Target Text">Original text</p></body></html>';
  await evaluate(`(() => {document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mode="preview"]').click();})()`);await sleep(260);
  const edit=await evaluate(`(() => {const button=document.querySelector('[data-edit-slot="single"]');button.click();return{text:button.textContent,pressed:button.getAttribute('aria-pressed'),active:button.classList.contains('active')};})()`);
  check('Edit remains a stable on/off label',edit.text==='Edit'&&edit.pressed==='true'&&edit.active,JSON.stringify(edit));

  await evaluate(`(() => {const p=document.querySelector('#singleFrame').contentDocument.querySelector('.target');p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));p.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));})()`);
  await send('Input.insertText',{text:'Cancelled text'});
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await sleep(100);
  const cancelled=await evaluate(`(() => {const frame=document.querySelector('#singleFrame'),p=frame.contentDocument.querySelector('.target');return{text:p.textContent,editable:p.isContentEditable,selected:document.querySelectorAll('#hierarchyTree .hierarchy-row.selected').length,hierarchy:document.querySelector('#hierarchyTree').innerText,inspector:document.querySelector('#inspectorBody').innerText.slice(0,120),overlays:[...frame.contentDocument.querySelectorAll('[data-editor-overlay]')].map(x=>({kind:x.dataset.editorOverlay,display:x.style.display}))};})()`);
  check('Enter starts editing and Escape restores the original text',cancelled.text==='Original text'&&!cancelled.editable&&cancelled.selected===1,JSON.stringify(cancelled));

  await evaluate(`(() => {const p=document.querySelector('#singleFrame').contentDocument.querySelector('.target');p.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));})()`);
  await send('Input.insertText',{text:'Committed outside'});
  await evaluate(`document.querySelector('[data-left-tab="project"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}))`);await sleep(120);
  const committed=await evaluate(`(() => {const p=document.querySelector('#singleFrame').contentDocument.querySelector('.target');return{text:p.textContent,editable:p.isContentEditable,selected:document.querySelectorAll('#hierarchyTree .hierarchy-row.selected').length};})()`);
  check('Outside pointer completes editing and preserves selection',committed.text==='Committed outside'&&!committed.editable&&committed.selected===1,JSON.stringify(committed));

  const located=await evaluate(`(async()=>{const frame=document.querySelector('#singleFrame'),p=frame.contentDocument.querySelector('.target');frame.contentWindow.scrollTo(0,0);p.dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,700));return{scrollY:frame.contentWindow.scrollY,scrollTop:frame.contentDocument.scrollingElement?.scrollTop,scrollHeight:frame.contentDocument.scrollingElement?.scrollHeight,innerHeight:frame.contentWindow.innerHeight,targetTop:p.getBoundingClientRect().top,toast:document.querySelector('#toast').textContent};})()`);
  check('F scrolls the selected object into view',located.scrollY>500&&located.toast.startsWith('Located'),JSON.stringify(located));

  const exportUi=await evaluate(`(() => {const inspectorDelete=!!document.querySelector('#deleteElementBtn'),exportButton=document.querySelector('#exportElementBtn');exportButton.click();const modal=document.querySelector('#objectExportModal'),formats=[...document.querySelectorAll('#objectExportFormat option')].map(x=>x.value),scales=[...document.querySelectorAll('#objectExportScale option')].map(x=>x.value);document.querySelector('#objectExportScale').value='2';document.querySelector('#objectExportScale').dispatchEvent(new Event('change',{bubbles:true}));return{inspectorDelete,exportButton:!!exportButton,open:modal.classList.contains('show'),formats,scales,summary:document.querySelector('#objectExportSummary').textContent};})()`);
  check('Inspector Export offers PNG, JPG, SVG and adjustable scale',!exportUi.inspectorDelete&&exportUi.exportButton&&exportUi.open&&exportUi.formats.join('|')==='png|jpg|svg'&&exportUi.scales.includes('4')&&exportUi.summary.includes('Output'),JSON.stringify(exportUi));
  await evaluate(`document.querySelector('#objectExportCancel').click()`);
  const contextExport=await evaluate(`(() => {const frame=document.querySelector('#singleFrame'),p=frame.contentDocument.querySelector('.target');p.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20}));const option=document.querySelector('#objectContextMenu [data-object-context="export"]');option.click();return{option:!!option,modal:document.querySelector('#objectExportModal').classList.contains('show')};})()`);
  check('Object context menu opens the same Export dialog',contextExport.option&&contextExport.modal,JSON.stringify(contextExport));
  await evaluate(`document.querySelector('#objectExportCancel').click()`);

  const used=await evaluate(`(() => {document.querySelector('[data-left-tab="used"]').click();const panel=document.querySelector('[data-left-panel="used"]'),toggle=document.querySelector('#toggleUsedPreview'),splitter=document.querySelector('#usedPreviewSplitter');const before=panel.style.getPropertyValue('--used-preview-height');toggle.click();const hidden=panel.classList.contains('preview-collapsed');toggle.click();splitter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));return{hidden,visible:!panel.classList.contains('preview-collapsed'),before,after:panel.style.getPropertyValue('--used-preview-height'),pressed:toggle.getAttribute('aria-pressed')};})()`);
  check('Used Preview toggles and resizes through its splitter',used.hidden&&used.visible&&used.before!==used.after&&used.pressed==='true',JSON.stringify(used));

  await evaluate(`document.querySelector('[data-document-fullscreen="single"]')?.click()`);await sleep(80);
  const enteredFullscreen=await evaluate(`(() => {const button=document.querySelector('[data-document-fullscreen="single"]'),menu=document.querySelector('.menubar'),view=document.querySelector('#singleView');return{body:document.body?.classList.contains('document-view-only'),label:button?.textContent,menu:menu?window.getComputedStyle(menu).display:'missing',target:view?.classList.contains('document-fullscreen-target')};})()`);
  await evaluate(`document.querySelector('[data-document-fullscreen="single"]')?.click()`);await sleep(80);
  const exitedFullscreen=await evaluate(`(() => {const button=document.querySelector('[data-document-fullscreen="single"]');return{exited:!document.body?.classList.contains('document-view-only'),label:button?.textContent};})()`);
  const fullscreen={entered:enteredFullscreen,...exitedFullscreen};
  check('Fullscreen hides Leaf UI and Show UI restores it in place',fullscreen.entered.body&&fullscreen.entered.label==='Show UI'&&fullscreen.entered.menu==='none'&&fullscreen.entered.target&&fullscreen.exited&&fullscreen.label==='⛶',JSON.stringify(fullscreen));

  await evaluate(`(() => {const edit=document.querySelector('[data-edit-slot="single"]');if(edit.getAttribute('aria-pressed')!=='true')edit.click();const p=document.querySelector('#singleFrame').contentDocument.querySelector('.target');p.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));document.querySelector('#exportElementBtn').click();})()`);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-v0512.png'),Buffer.from(screenshot.data,'base64'));
  console.log(`Leaf v0.5.12 packaged functional QA: ${passed}/8 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
