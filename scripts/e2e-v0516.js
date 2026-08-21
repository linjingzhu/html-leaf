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
  await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');await sleep(700);

  const dropPageFixture=async filePath=>{
    await evaluate(`(()=>{document.querySelector('#e2ePageFile')?.remove();const input=document.createElement('input');input.id='e2ePageFile';input.type='file';input.hidden=true;document.body.appendChild(input)})()`);
    const documentNode=await send('DOM.getDocument',{depth:1});
    const inputNode=await send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#e2ePageFile'});
    await send('DOM.setFileInputFiles',{nodeId:inputNode.nodeId,files:[filePath]});
    const dispatched=await evaluate(`(()=>{const input=document.querySelector('#e2ePageFile'),file=input.files[0],card=document.querySelector('.document-card');if(!file||!card)return false;const transfer=new DataTransfer();transfer.items.add(file);card.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));input.remove();return true})()`);
    if(!dispatched)throw new Error(`Could not dispatch fixture drop: ${filePath}`);
    await sleep(350);
  };
  const replaceFocusedText=async text=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65});
    await send('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65});
    await send('Input.insertText',{text});
  };
  const waitFor=async(expression,timeout=1600)=>{const started=Date.now();while(Date.now()-started<timeout){if(await evaluate(expression))return true;await sleep(40);}return false;};

  const modeLabels=await evaluate(`[...document.querySelectorAll('#viewSeg button[data-mode]')].map(button=>({mode:button.dataset.mode,label:button.textContent.trim(),aria:button.getAttribute('aria-label')}))`);
  check('Document View modes are labelled Preview, Compare, and Code',JSON.stringify(modeLabels)===JSON.stringify([{mode:'preview',label:'Preview',aria:'Preview view'},{mode:'split',label:'Compare',aria:'Compare view'},{mode:'code',label:'Code',aria:null}]),JSON.stringify(modeLabels));
  const menuStart=await evaluate(`(()=>{const bar=document.querySelector('.menubar'),menu=document.querySelector('#mainMenu'),file=document.querySelector('.menu-trigger');return{icon:!!document.querySelector('.product-mark'),first:bar?.firstElementChild===menu,left:file?.getBoundingClientRect().left}})()`);
  check('Main menu starts at the left edge without a product icon',!menuStart.icon&&menuStart.first&&Math.abs(menuStart.left)<1,JSON.stringify(menuStart));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true}))`);await sleep(60);
  const dialog=await evaluate(`({open:document.querySelector('#inputModal').classList.contains('show'),title:document.querySelector('#modalTitle').textContent,documents:document.querySelectorAll('.document-card').length})`);
  check('Ctrl+N opens New Project without mutating content before confirmation',dialog.open&&dialog.title==='New Project'&&dialog.documents>=1,JSON.stringify(dialog));
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Manual Project';document.querySelector('#modalConfirm').click()})()`);await sleep(100);
  const created=await evaluate(`({documents:document.querySelectorAll('.document-card').length,nodes:document.querySelectorAll('.tree-row[data-node-id]').length,crumbs:document.querySelector('#crumbs').textContent,title:document.querySelector('#workspaceTitle').textContent})`);
  check('New Project starts with Default Document and Empty Page',created.documents===1&&created.nodes===1&&created.crumbs.includes('Default Document')&&created.title.includes('Manual Project / Default Document'),JSON.stringify(created));
  await evaluate(`document.querySelector('[data-action="save-page-as"]').click()`);await sleep(40);
  const saveFormats=await evaluate(`({open:document.querySelector('#savePageAsModal').classList.contains('show'),formats:[...document.querySelectorAll('#savePageAsFormat option')].map(option=>option.value)})`);
  check('Save Page As offers HTML, Markdown, JSON, and PDF',saveFormats.open&&JSON.stringify(saveFormats.formats)===JSON.stringify(['html','markdown','json','pdf']),JSON.stringify(saveFormats));
  await evaluate(`document.querySelector('#savePageAsCancel').click();document.querySelector('[data-action="about"]').click()`);await sleep(40);
  const about=await evaluate(`({open:document.querySelector('#aboutModal').classList.contains('show'),title:document.querySelector('#aboutTitle').textContent,version:document.querySelector('#aboutModal').textContent.includes('Version 0.5.16'),helpLast:[...document.querySelectorAll('#mainMenu>.menu .menu-trigger')].at(-1)?.textContent.trim()})`);
  check('Help is last and About opens Leaf product information',about.open&&about.title==='Leaf'&&about.version&&about.helpLast==='Help',JSON.stringify(about));
  await evaluate(`document.querySelector('#aboutClose').click()`);

  await dropPageFixture(path.join(__dirname,'..','tests','page-fixtures','focus-edit.json'));
  const jsonImported=await evaluate(`(()=>{const row=document.querySelector('.tree-row.selected');const button=document.querySelector('[data-edit-slot="single"]');return{name:row?.querySelector('.label')?.textContent,icon:row?.querySelector('.ico')?.textContent,disabled:button.disabled,runtime:document.querySelector('#singleFrame').dataset.previewRuntime}})()`);
  check('JSON imports as an editable Preview Page',jsonImported.name==='focus-edit'&&jsonImported.icon==='{}'&&!jsonImported.disabled&&jsonImported.runtime==='document-readonly',JSON.stringify(jsonImported));
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.directSourceReady==='true'`);
  const jsonEdit=await evaluate(`(()=>{const frame=document.querySelector('#singleFrame');return{runtime:frame.dataset.previewRuntime,ready:frame.dataset.directSourceReady,sandbox:frame.getAttribute('sandbox'),sourceUi:frame.getAttribute('srcdoc')?.includes('JSON Source')}})()`);
  await replaceFocusedText('{"leaf":"edited","items":[1,2]}');
  await sleep(100);
  check('JSON opens in the ready isolated Preview source editor',jsonEdit.runtime==='direct-source-editor'&&jsonEdit.ready==='true'&&jsonEdit.sandbox==='allow-scripts'&&jsonEdit.sourceUi,JSON.stringify(jsonEdit));
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.previewRuntime==='document-readonly'`);
  const jsonPreview=await evaluate(`(()=>{const frame=document.querySelector('#singleFrame');return{valid:frame.contentDocument.querySelector('.json-valid')?.textContent,text:frame.contentDocument.querySelector('pre')?.textContent}})()`);
  check('Disabling Edit restores the formatted JSON preview',jsonPreview.valid==='Valid JSON'&&jsonPreview.text.includes('"edited"')&&jsonPreview.text.includes('\n  "items"'),JSON.stringify(jsonPreview));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);await sleep(180);
  const jsonUndo=await evaluate(`document.querySelector('#singleFrame').contentDocument.querySelector('pre')?.textContent`);
  check('Preview JSON editing participates in Undo',jsonUndo.includes('"leaf": true')&&!jsonUndo.includes('edited'),jsonUndo);

  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.directSourceReady==='true'`);
  await replaceFocusedText('{"leaf":');await sleep(80);
  await replaceFocusedText('{"data-editor-overlay":true}');await sleep(80);
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.previewRuntime==='document-readonly'`);
  const invalidJson=await evaluate(`(()=>{const doc=document.querySelector('#singleFrame').contentDocument;return{error:doc.querySelector('.json-error')?.textContent,source:doc.querySelector('pre')?.textContent}})()`);
  check('Invalid JSON stays editable while editor metadata injection is rejected',invalidJson.error?.includes('JSON validation error')&&invalidJson.source==='{"leaf":'&&!invalidJson.source.includes('data-editor-overlay'),JSON.stringify(invalidJson));

  await dropPageFixture(path.join(__dirname,'..','tests','page-fixtures','focus-edit.md'));
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.directSourceReady==='true'`);
  const markdownSource='# Edited in Preview\n\nDirect **Markdown** editing.';
  const markdownEdit=await evaluate(`document.querySelector('#singleFrame').dataset.directSourceReady`);await replaceFocusedText(markdownSource);
  await sleep(100);await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await waitFor(`document.querySelector('#singleFrame').dataset.previewRuntime==='document-readonly'`);
  const markdownPreview=await evaluate(`(()=>{const doc=document.querySelector('#singleFrame').contentDocument;return{heading:doc.querySelector('h1')?.textContent,strong:doc.querySelector('strong')?.textContent}})()`);
  check('Markdown source edits directly and returns to rendered Preview',markdownEdit==='true'&&markdownPreview.heading==='Edited in Preview'&&markdownPreview.strong==='Markdown',JSON.stringify({markdownEdit,markdownPreview}));
  await evaluate(`document.querySelector('[data-mode="split"]').click()`);await sleep(180);
  const compareBoundary=await evaluate(`({mode:document.querySelector('[data-mode="split"]').classList.contains('active'),leftDisabled:document.querySelector('[data-edit-slot="left"]').disabled,leftType:document.querySelector('#leftFrame').dataset.previewRuntime})`);
  check('Markdown and JSON direct source editing remains scoped to Preview',compareBoundary.mode&&compareBoundary.leftDisabled&&compareBoundary.leftType==='document-readonly',JSON.stringify(compareBoundary));
  await evaluate(`document.querySelector('[data-mode="preview"]').click()`);await sleep(120);

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true,cancelable:true}))`);await sleep(60);
  await evaluate(`(()=>{const input=document.querySelector('#modalInput');input.value='Manual Project';document.querySelector('#modalConfirm').click()})()`);await sleep(100);

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

  const source='<!doctype html>\n<html>\n<head><title>Needle</title></head>\n<body>\n<h1 data-hbe-name="Hero Title">Needle</h1>\n<p>Body</p>\n'+Array.from({length:120},(_,index)=>index===119?'<div>Body conclusion</div>':`<div>Line ${index+1}</div>`).join('\n')+'\n</body>\n</html>';
  await evaluate(`(()=>{document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));editor.scrollTop=36;editor.dispatchEvent(new Event('scroll'));})()`);await sleep(180);
  const lines=await evaluate(`(()=>{const editor=document.querySelector('#sourceEditor'),rail=document.querySelector('.line-rail-lines');return{count:rail.children.length,sourceLines:editor.value.split('\\n').length,wrap:editor.getAttribute('wrap'),transform:rail.style.transform,editorLine:getComputedStyle(editor).lineHeight,railLine:getComputedStyle(rail.children[0]).lineHeight}})()`);
  check('Code line numbers match logical lines and follow scroll',lines.count===lines.sourceLines&&lines.wrap==='off'&&lines.transform.includes('-36px')&&Math.abs(parseFloat(lines.editorLine)-parseFloat(lines.railLine))<.2,JSON.stringify(lines));

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))`);
  const searchFocus=await evaluate(`document.activeElement.id`);check('Ctrl+F focuses Code search',searchFocus==='codeSearch',searchFocus);
  await evaluate(`(()=>{const input=document.querySelector('#codeSearch');input.value='needle';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(40);
  const search=await evaluate(`({status:document.querySelector('#codeSearchStatus').textContent,active:document.activeElement.id,selected:document.querySelector('#sourceEditor').value.slice(document.querySelector('#sourceEditor').selectionStart,document.querySelector('#sourceEditor').selectionEnd).toLowerCase()})`);
  check('Code search counts and selects matches without losing input focus',search.status==='2'&&search.active==='codeSearch'&&search.selected==='needle',JSON.stringify(search));

  await evaluate(`document.querySelector('[data-mode="preview"]').click()`);await sleep(180);
  await evaluate(`(()=>{const input=document.querySelector('[data-view-search="single"] input');input.value='Body';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await sleep(120);
  const previewSearchFirst=await evaluate(`(()=>{const control=document.querySelector('[data-view-search="single"]'),frame=document.querySelector('#singleFrame');return{status:control.querySelector('[data-view-search-status]').textContent,all:frame.contentDocument.defaultView.CSS.highlights.get('leaf-search-all')?.size,current:frame.contentDocument.defaultView.CSS.highlights.get('leaf-search-current')?.size,scroll:frame.contentWindow.scrollY}})()`);
  await evaluate(`document.querySelector('[data-view-search="single"] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await sleep(450);
  const previewSearchNext=await evaluate(`(()=>{const control=document.querySelector('[data-view-search="single"]'),frame=document.querySelector('#singleFrame');return{status:control.querySelector('[data-view-search-status]').textContent,scroll:frame.contentWindow.scrollY,searchCount:document.querySelectorAll('[data-view-search]').length,codeSearch:!!document.querySelector('#codeSearch')}})()`);
  check('All Views expose Search UI with non-DOM highlights',previewSearchFirst.status==='1/2'&&previewSearchFirst.all===2&&previewSearchFirst.current===1&&previewSearchNext.searchCount===4&&previewSearchNext.codeSearch,JSON.stringify({previewSearchFirst,previewSearchNext}));
  check('Enter advances to the next match and scrolls it into view',previewSearchNext.status==='2/2'&&previewSearchNext.scroll>previewSearchFirst.scroll+100,JSON.stringify({previewSearchFirst,previewSearchNext}));
  const searchScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-search-v0516.png'),Buffer.from(searchScreenshot.data,'base64'));
  await evaluate(`(()=>{const input=document.querySelector('[data-view-search="single"] input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await evaluate(`document.querySelector('[data-edit-slot="single"]').click()`);await sleep(80);
  const edit=await evaluate(`(()=>{const pane=document.querySelector('#singleView'),button=document.querySelector('[data-edit-slot="single"]');return{pressed:button.getAttribute('aria-pressed'),pane:pane.classList.contains('edit-active'),buttonColor:getComputedStyle(button).backgroundColor,border:getComputedStyle(pane).borderTopColor}})()`);
  check('Edit activation turns both button and View outline red',edit.pressed==='true'&&edit.pane&&/rgb\((217, 60, 60|239, 77, 77)\)/.test(`${edit.buttonColor} ${edit.border}`),JSON.stringify(edit));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),target=frame.contentDocument.querySelector('h1');target.dispatchEvent(new frame.contentWindow.MouseEvent('pointerdown',{bubbles:true,cancelable:true}));})()`);await sleep(90);
  const inspector=await evaluate(`(()=>{const body=document.querySelector('#inspectorBody'),name=body.querySelector('.node-name');return{name:name?.textContent,parents:body.querySelectorAll(':scope > details.property-group').length,nested:body.querySelectorAll('.property-group .property-subgroup').length,nameSize:parseFloat(getComputedStyle(name).fontSize),resetVisible:document.querySelector('#resetInspectorBtn').getBoundingClientRect().width}})()`);
  check('Inspector shows a large object name and two-level folds',inspector.name==='Hero Title'&&inspector.parents>=3&&inspector.nested>=5&&inspector.nameSize>=15&&inspector.resetVisible===0,JSON.stringify(inspector));

  await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),doc=frame.contentDocument,target=doc.querySelector('p'),previous=doc.querySelector('h1');target.dispatchEvent(new frame.contentWindow.MouseEvent('mouseover',{bubbles:true,cancelable:true,relatedTarget:previous}))})()`);await sleep(60);
  const hoverInspection=await evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),doc=frame.contentDocument,highlight=doc.querySelector('[data-editor-overlay="hover-highlight"]'),tip=doc.querySelector('[data-editor-overlay="hover-tooltip"]'),selected=[...doc.querySelectorAll('[data-editor-overlay="1"]')].find(node=>node.querySelector('[data-scale-handle]'));return{highlight:highlight?.style.display,highlightWidth:parseFloat(highlight?.style.width),tooltip:tip?.style.display,text:tip?.textContent,tooltipLeft:parseFloat(tip?.style.left),tooltipTop:parseFloat(tip?.style.top),selection:selected?.style.display,hierarchySelected:document.querySelectorAll('#hierarchyTree .hierarchy-row.selected').length,inspectorName:document.querySelector('#inspectorBody .node-name')?.textContent}})()`);
  check('Object hover shows an overlay and property tooltip',hoverInspection.highlight==='block'&&hoverInspection.highlightWidth>0&&hoverInspection.tooltip==='block'&&hoverInspection.text.includes('p')&&hoverInspection.text.includes('NameText')&&hoverInspection.text.includes('Rolegeneric')&&hoverInspection.text.includes('Displayblock')&&hoverInspection.text.includes('FocusableNo')&&Number.isFinite(hoverInspection.tooltipLeft)&&Number.isFinite(hoverInspection.tooltipTop),JSON.stringify(hoverInspection));
  check('Hovering another object preserves the selected object',hoverInspection.selection==='block'&&hoverInspection.hierarchySelected===1&&hoverInspection.inspectorName==='Hero Title',JSON.stringify(hoverInspection));
  const hoverScreenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-hover-v0516.png'),Buffer.from(hoverScreenshot.data,'base64'));

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
  console.log(`Leaf v0.5.16 functional and adversarial QA: ${passed}/29 PASS`);socket.close();
}
main().catch(error=>{console.error(error.stack||error);process.exit(1);});
