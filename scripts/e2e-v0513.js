const fs=require('fs');
const http=require('http');
const path=require('path');

const port=Number(process.env.HBE_DEBUG_PORT||9228);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=url=>new Promise((resolve,reject)=>http.get(url,response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(JSON.parse(body)));}).on('error',reject));

async function main(){
  let targets;
  for(let attempt=0;attempt<40;attempt++){
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
  await send('Runtime.enable');await send('Page.enable');await sleep(600);

  const source='<!doctype html><html><head><style>body{margin:0;font:16px Arial}.hero{width:1900px;height:1000px;padding:40px;background:linear-gradient(135deg,#deebff,#fff)}h1{font-size:42px}blockquote{padding:16px;background:#fffae6}</style></head><body><main class="hero"><h1>Cursor anchored Jira preview</h1><p><strong>Leaf</strong> keeps this description under the cursor.</p><blockquote>Atlassian conversion content</blockquote></main></body></html>';
  await evaluate(`(() => {document.querySelector('[data-mode="code"]').click();const editor=document.querySelector('#sourceEditor');editor.value=${JSON.stringify(source)};editor.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-mode="preview"]').click();const select=document.querySelector('[data-preview-size-slot="single"]');select.value='1920x1080';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(300);
  await evaluate(`(() => {const input=document.querySelector('[data-preview-zoom="single"]');input.value='100%';input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(120);

  const zoom=await evaluate(`(async()=>{const frame=document.querySelector('#singleFrame'),surface=document.querySelector('[data-preview-surface="single"]'),canvas=document.querySelector('[data-preview-canvas="single"]');const oldZoom=parseFloat(document.querySelector('[data-preview-zoom="single"]').value),oldScale=oldZoom/100,inner={x:260,y:280};const before=frame.getBoundingClientRect();const outer={x:before.left+inner.x*(before.width/frame.clientWidth),y:before.top+inner.y*(before.height/frame.clientHeight)};const local={x:(outer.x-surface.getBoundingClientRect().left)/oldScale,y:(outer.y-surface.getBoundingClientRect().top)/oldScale};frame.contentDocument.dispatchEvent(new frame.contentWindow.WheelEvent('wheel',{ctrlKey:true,deltaY:-100,clientX:inner.x,clientY:inner.y,bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,80));const newZoom=parseFloat(document.querySelector('[data-preview-zoom="single"]').value),scale=newZoom/100,after=surface.getBoundingClientRect();const projected={x:after.left+local.x*scale,y:after.top+local.y*scale};return{oldZoom,newZoom,zoom:document.querySelector('[data-preview-zoom="single"]').value,diffX:Math.abs(projected.x-outer.x),diffY:Math.abs(projected.y-outer.y),scrollLeft:canvas.scrollLeft,scrollTop:canvas.scrollTop};})()`);
  check('Ctrl-wheel zoom keeps the cursor document point fixed',zoom.zoom==='110%'&&zoom.diffX<2&&zoom.diffY<2,JSON.stringify(zoom));

  await evaluate(`document.querySelector('[data-jira-check-slot="single"]').click()`);await sleep(450);
  const split=await evaluate(`(() => {const pane=document.querySelector('#splitView [data-view-slot="right"]'),doc=document.querySelector('#rightFrame').contentDocument,close=document.querySelector('#atlassianPreviewClose'),open=document.querySelector('#atlassianOpenFile'),paneRect=pane.getBoundingClientRect(),closeRect=close.getBoundingClientRect(),openRect=open.getBoundingClientRect();return{mode:document.querySelector('[data-mode-panel="split"]').classList.contains('is-active'),active:pane.classList.contains('atlassian-preview-active'),title:doc.querySelector('h1')?.textContent||'',description:doc.querySelector('.description')?.innerText||'',source:document.querySelector('#atlassianPreviewSource').textContent,formatButtons:[...document.querySelectorAll('[data-atlassian-format]')].map(x=>x.textContent),controlsVisible:openRect.width>0&&closeRect.width>0&&closeRect.right<=paneRect.right};})()`);
  check('Check Atlassian opens Split with a Jira issue body on the right',split.mode&&split.active&&split.controlsVisible&&split.title.includes('RICH TEXT')&&split.description.includes('Cursor anchored Jira preview')&&split.description.includes('Atlassian conversion content')&&split.formatButtons.join('|')==='Rich|MD|ADF',JSON.stringify(split));

  await evaluate(`(async()=>{const input=document.querySelector('#atlassianFileInput'),file=new File(['# Imported Markdown\\n\\n- **safe item**\\n\\n<script>alert(1)</script>'],'jira-body.md',{type:'text/markdown'});Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,120));})()`);
  const md=await evaluate(`(() => {const doc=document.querySelector('#rightFrame').contentDocument;return{title:doc.querySelector('h1')?.textContent||'',heading:doc.querySelector('.description h1')?.textContent||'',strong:doc.querySelector('.description strong')?.textContent||'',scripts:doc.querySelectorAll('script').length,text:doc.querySelector('.description')?.innerText||''};})()`);
  check('Dropped/opened Markdown renders safely as Jira description',md.title.includes('jira-body')&&md.heading==='Imported Markdown'&&md.strong==='safe item'&&md.scripts===0&&md.text.includes('<script>alert(1)</script>'),JSON.stringify(md));

  const adfSource=JSON.stringify({fields:{description:{version:1,type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'ADF body'}]},{type:'paragraph',content:[{type:'text',text:'Jira REST description',marks:[{type:'strong'}]}]}]}}});
  await evaluate(`(async()=>{const input=document.querySelector('#atlassianFileInput'),file=new File([${JSON.stringify(adfSource)}],'issue.json',{type:'application/json'});Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,120));})()`);
  const adf=await evaluate(`(() => {const doc=document.querySelector('#rightFrame').contentDocument;return{heading:doc.querySelector('.description h2')?.textContent||'',strong:doc.querySelector('.description strong')?.textContent||'',format:doc.querySelector('.format')?.textContent||''};})()`);
  check('Jira REST ADF JSON renders as a ticket description',adf.heading==='ADF body'&&adf.strong==='Jira REST description'&&adf.format==='ADF JSON',JSON.stringify(adf));

  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(__dirname,'qa-evidence-v0513.png'),Buffer.from(screenshot.data,'base64'));
  console.log(`Leaf v0.5.13 functional QA: ${passed}/4 PASS`);socket.close();
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
