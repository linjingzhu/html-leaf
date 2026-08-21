const fs=require('fs');
const http=require('http');
const path=require('path');

const port=Number(process.env.HBE_DEBUG_PORT||9226);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=url=>new Promise((resolve,reject)=>http.get(url,response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject));

async function main(){
  let targets;
  for(let attempt=0;attempt<20;attempt++){
    try{targets=await json(`http://127.0.0.1:${port}/json/list`);break;}catch{await sleep(250);}
  }
  const target=targets?.find(item=>item.type==='page'&&item.title==='Leaf')||targets?.find(item=>item.type==='page');
  if(!target)throw new Error('Electron renderer target not found');

  const socket=new WebSocket(target.webSocketDebuggerUrl);
  let nextId=0;
  const pending=new Map();
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.text);return response.result.value;};

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(350);
  const result=await evaluate(`(() => {const bar=document.querySelector('.menubar'),menu=document.querySelector('#mainMenu'),file=document.querySelector('.menu-trigger');return{title:document.title,mark:!!document.querySelector('.product-mark'),first:bar?.firstElementChild===menu,fileLeft:file?.getBoundingClientRect().left};})()`);
  if(result.title!=='Leaf'||result.mark||!result.first||Math.abs(result.fileLeft)>1){
    throw new Error(`Main-menu icon removal E2E failed: ${JSON.stringify(result)}`);
  }
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-v0511.png'),Buffer.from(screenshot.data,'base64'));
  console.log(`PASS packaged main-menu icon removal E2E ${JSON.stringify(result)}`);
  socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
