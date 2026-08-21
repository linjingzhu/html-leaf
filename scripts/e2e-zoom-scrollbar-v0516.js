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

  const source='<!doctype html><html><head><style>html,body{margin:0}main{width:1800px;height:2600px;background:linear-gradient(135deg,#eef4ff,#fff0f0);padding:32px;font:24px Arial}</style></head><body><main>Zoom scrollbar fixture</main></body></html>';
  await evaluate(`(()=>{document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mode="preview"]').click()})()`);
  await waitFor(`document.querySelector('#singleFrame').contentDocument?.querySelector('[data-leaf-scrollbar-runtime]')`);

  const setZoom=async value=>{
    await evaluate(`(()=>{const input=document.querySelector('[data-preview-zoom="single"]');input.value='${value}%';input.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await sleep(100);
    return evaluate(`(()=>{const frame=document.querySelector('#singleFrame'),surface=document.querySelector('[data-preview-surface="single"]'),style=frame.contentDocument.querySelector('[data-leaf-scrollbar-runtime]'),css=style.textContent,width=Number((css.match(/width:([0-9.]+)px/)||[])[1]),height=Number((css.match(/height:([0-9.]+)px/)||[])[1]),border=Number((css.match(/border:([0-9.]+)px/)||[])[1]),scale=Number(surface.style.zoom);return{width,height,border,scale,visualWidth:width*scale,visualHeight:height*scale,visualBorder:border*scale,compensation:frame.dataset.scrollbarCompensation,target:frame.dataset.scrollbarVisualSize,indicator:document.querySelector('[data-preview-zoom="single"]').value}})()`);
  };

  const half=await setZoom(50);
  check('At 50% content zoom, scrollbar CSS doubles to remain visually 8px',half.width===16&&half.height===16&&half.border===4&&half.scale===.5&&half.visualWidth===8&&half.visualHeight===8&&half.visualBorder===2,JSON.stringify(half));
  check('Viewport reports inverse scrollbar compensation at 50%',half.compensation==='inverse-zoom'&&half.target==='8'&&half.indicator==='50%',JSON.stringify(half));

  const double=await setZoom(200);
  check('At 200% content zoom, scrollbar CSS halves to remain visually 8px',double.width===4&&double.height===4&&double.border===1&&double.scale===2&&double.visualWidth===8&&double.visualHeight===8&&double.visualBorder===2,JSON.stringify(double));
  check('Viewport reports inverse scrollbar compensation at 200%',double.compensation==='inverse-zoom'&&double.target==='8'&&double.indicator==='200%',JSON.stringify(double));

  const normal=await setZoom(100);
  check('At 100%, scrollbar returns to the native eight-pixel runtime size',normal.width===8&&normal.height===8&&normal.border===2&&normal.scale===1&&normal.visualWidth===8,JSON.stringify(normal));

  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-zoom-scrollbar-v0516.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('[data-mode="code"]').click()`);await sleep(100);
  const saved=await evaluate(`document.querySelector('#sourceEditor').value`);
  check('Runtime scrollbar compensation never enters editable Page source',saved===source&&!saved.includes('data-leaf-scrollbar-runtime')&&!saved.includes('__leafViewportChromeScale'),saved.slice(0,220));

  console.log(`Leaf zoom-independent scrollbar functional QA: ${passed}/6 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
