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
  await send('Runtime.enable');await send('Page.enable');await sleep(500);

  const initial=await evaluate(`(()=>{const sidebar=document.querySelector('#leftSidebar'),main=document.querySelector('.main'),button=document.querySelector('#sidebarToggleTop');return{sidebarWidth:sidebar.getBoundingClientRect().width,mainWidth:main.getBoundingClientRect().width,expanded:button.getAttribute('aria-expanded'),title:button.title,inspector:getComputedStyle(document.querySelector('#inspector')).display}})()`);
  check('Left panel starts visible with an exposed collapse control',initial.sidebarWidth>=190&&initial.expanded==='true'&&initial.title==='Hide left panel'&&initial.inspector!=='none',JSON.stringify(initial));

  await evaluate(`document.querySelector('#sidebarToggleTop').click()`);await sleep(100);
  const hidden=await evaluate(`(()=>{const workspace=document.querySelector('#workspace'),sidebar=document.querySelector('#leftSidebar'),resizer=document.querySelector('#sidebarResizer'),main=document.querySelector('.main'),button=document.querySelector('#sidebarToggleTop'),saved=JSON.parse(localStorage.getItem('leaf-v0-5-16-state'));return{collapsed:workspace.classList.contains('sidebar-collapsed'),sidebar:getComputedStyle(sidebar).display,resizer:getComputedStyle(resizer).display,mainWidth:main.getBoundingClientRect().width,expanded:button.getAttribute('aria-expanded'),label:button.getAttribute('aria-label'),title:button.title,saved:saved?.preferences?.sidebarCollapsed,inspector:getComputedStyle(document.querySelector('#inspector')).display}})()`);
  check('Toggle hides the left panel and splitter while expanding the document area',hidden.collapsed&&hidden.sidebar==='none'&&hidden.resizer==='none'&&hidden.mainWidth>initial.mainWidth+150,JSON.stringify({initial,hidden}));
  check('Collapsed state is accessible, independent, and persisted',hidden.expanded==='false'&&hidden.label==='Show left panel'&&hidden.title==='Show left panel'&&hidden.saved===true&&hidden.inspector!=='none',JSON.stringify(hidden));

  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-sidebar-toggle-v0516.png'),Buffer.from(screenshot.data,'base64'));

  await evaluate(`document.querySelector('#inspectorToggleTop').click()`);await sleep(80);
  const bothHidden=await evaluate(`(()=>{const workspace=document.querySelector('#workspace'),main=document.querySelector('.main');return{both:workspace.classList.contains('sidebar-collapsed')&&workspace.classList.contains('inspector-collapsed'),mainWidth:main.getBoundingClientRect().width,columns:getComputedStyle(workspace).gridTemplateColumns}})()`);
  check('Left panel and Inspector can collapse independently to fill the workspace',bothHidden.both&&bothHidden.mainWidth>hidden.mainWidth&&bothHidden.columns.split(' ').filter(value=>value==='0px').length>=4,JSON.stringify(bothHidden));

  await evaluate(`document.querySelector('#sidebarToggleTop').click()`);await sleep(80);
  const leftRestored=await evaluate(`(()=>{const workspace=document.querySelector('#workspace'),sidebar=document.querySelector('#leftSidebar'),button=document.querySelector('#sidebarToggleTop');return{left:workspace.classList.contains('sidebar-collapsed'),inspector:workspace.classList.contains('inspector-collapsed'),sidebar:getComputedStyle(sidebar).display,width:sidebar.getBoundingClientRect().width,expanded:button.getAttribute('aria-expanded')}})()`);
  check('Left panel restores without forcing the Inspector open',!leftRestored.left&&leftRestored.inspector&&leftRestored.sidebar!=='none'&&leftRestored.width>=190&&leftRestored.expanded==='true',JSON.stringify(leftRestored));

  await evaluate(`document.querySelector('#inspectorToggleTop').click()`);await sleep(60);
  console.log(`Leaf left-panel toggle functional QA: ${passed}/5 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
