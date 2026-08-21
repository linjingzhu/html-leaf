const fs=require('fs');
const http=require('http');
const path=require('path');
const port=Number(process.env.LEAF_DEBUG_PORT||9231);
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

  await evaluate(`document.body.classList.remove('document-view-only');document.querySelector('[data-pref-theme="codex"]').click()`);await sleep(150);
  await evaluate(`document.querySelector('#singleView')?.classList.add('edit-active')`);await sleep(80);
  const codex=await evaluate(`(()=>{const body=getComputedStyle(document.body),card=document.querySelector('.document-card'),active=document.querySelector('#viewSeg button.active'),segment=document.querySelector('#viewSeg'),menu=getComputedStyle(document.querySelector('.menubar')),view=document.querySelector('#singleView'),host=document.querySelector('#viewportHost'),canvas=document.querySelector('[data-preview-canvas="single"]'),fullscreen=document.querySelector('[data-document-fullscreen="single"]'),saved=JSON.parse(localStorage.getItem('leaf-v0-5-16-state'));return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},theme:document.body.dataset.theme,checked:document.querySelector('.theme-codex').textContent,background:body.getPropertyValue('--background').trim(),panel:body.getPropertyValue('--panel').trim(),canvasToken:body.getPropertyValue('--canvas').trim(),accent:body.getPropertyValue('--accent').trim(),foreground:body.getPropertyValue('--foreground').trim(),radius:body.getPropertyValue('--radius-control').trim(),fontSize:body.fontSize,menuHeight:menu.height,cardBackground:getComputedStyle(card).backgroundColor,activeColor:getComputedStyle(active).color,activeBackground:getComputedStyle(active).backgroundColor,segmentBackground:getComputedStyle(segment).backgroundColor,canvasBackground:getComputedStyle(canvas).backgroundColor,fullscreenBackground:getComputedStyle(fullscreen).backgroundColor,hostPadding:getComputedStyle(host).padding,outlineWidth:getComputedStyle(view).outlineWidth,outlineOffset:getComputedStyle(view).outlineOffset,savedTheme:saved?.preferences?.theme}})()`);
  check('Codex can be selected and reports its independent checkmark',codex.theme==='codex'&&codex.checked==='✓',JSON.stringify(codex));
  check('Codex resolves the intended neutral and blue semantic tokens',codex.background==='#000000'&&codex.panel==='#181818'&&codex.accent==='#339cff'&&codex.foreground==='#dfdfdf',JSON.stringify(codex));
  check('Codex geometry and typography are rendered by Electron',codex.radius==='8px'&&codex.fontSize==='13px'&&codex.menuHeight==='46px',JSON.stringify(codex));
  check('Codex styles visible chrome and persists the preference',codex.cardBackground==='rgb(24, 24, 24)'&&codex.savedTheme==='codex',JSON.stringify(codex));
  check('Edit outline occupies a 2px outside gutter instead of the document interior',codex.hostPadding==='2px'&&parseFloat(codex.outlineWidth)>=1.5&&codex.outlineOffset==='0px',JSON.stringify(codex));
  check('Blank canvas, View toggle, and fullscreen control use related raised surfaces',codex.canvasToken==='#111111'&&codex.canvasBackground==='rgb(17, 17, 17)'&&codex.segmentBackground==='rgb(33, 33, 33)'&&codex.fullscreenBackground==='rgba(255, 255, 255, 0.04)',JSON.stringify(codex));

  await evaluate(`([...document.querySelectorAll('.menu-trigger')].find(button=>button.textContent.trim()==='Preference'))?.click()`);await sleep(100);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-codex-v0516.png'),Buffer.from(screenshot.data,'base64'));

  console.log(`Viewport ${codex.viewport.width}x${codex.viewport.height} CSS px at DPR ${codex.viewport.dpr}`);
  console.log(`Leaf Codex theme functional QA: ${passed}/6 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
