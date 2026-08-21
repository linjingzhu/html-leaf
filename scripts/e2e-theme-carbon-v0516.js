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

  await evaluate(`document.querySelector('[data-pref-theme="carbon"]').click()`);await sleep(120);
  const carbon=await evaluate(`(()=>{const body=getComputedStyle(document.body),card=document.querySelector('.document-card'),active=document.querySelector('.seg button.active'),saved=JSON.parse(localStorage.getItem('leaf-v0-5-16-state'));return{theme:document.body.dataset.theme,checked:document.querySelector('.theme-carbon').textContent,background:body.getPropertyValue('--background').trim(),panel:body.getPropertyValue('--panel').trim(),accent:body.getPropertyValue('--accent').trim(),foreground:body.getPropertyValue('--foreground').trim(),radius:body.getPropertyValue('--radius-control').trim(),cardBackground:getComputedStyle(card).backgroundColor,activeColor:getComputedStyle(active).color,savedTheme:saved?.preferences?.theme}})()`);
  check('Carbon can be selected from Preference and reports its checkmark',carbon.theme==='carbon'&&carbon.checked==='✓',JSON.stringify(carbon));
  check('Carbon resolves the intended black, graphite, silver, and off-white tokens',carbon.background==='#050607'&&carbon.panel==='#0a0b0d'&&carbon.accent==='#deded9'&&carbon.foreground==='#f1f1ee'&&carbon.radius==='2px',JSON.stringify(carbon));
  check('Carbon styles rendered app chrome and persists the preference',carbon.cardBackground==='rgb(12, 13, 15)'&&carbon.activeColor==='rgb(247, 247, 244)'&&carbon.savedTheme==='carbon',JSON.stringify(carbon));

  await evaluate(`([...document.querySelectorAll('.menu-trigger')].find(button=>button.textContent.trim()==='Preference'))?.click()`);await sleep(80);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-carbon-v0516.png'),Buffer.from(screenshot.data,'base64'));

  await evaluate(`document.querySelector('[data-pref-theme="dark"]').click()`);await sleep(80);
  const restored=await evaluate(`({theme:document.body.dataset.theme,dark:document.querySelector('.theme-dark').textContent,carbon:document.querySelector('.theme-carbon').textContent})`);
  check('Switching back to Dark clears the Carbon check state',restored.theme==='dark'&&restored.dark==='✓'&&restored.carbon==='',JSON.stringify(restored));

  console.log(`Leaf Carbon theme functional QA: ${passed}/4 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
