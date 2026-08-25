(() => {
  'use strict';
  const EDITOR_CLASS_NAMES=new Set(['table-cell-selected','viewport-object-drop-target']);
  const STARTUP_STATE_KEY='leaf-v0-5-16-state';

  function startupErrorDetail(error){
    if(!error)return 'Unknown startup error';
    if(typeof error==='string')return error;
    const name=error.name||'';
    const message=error.message||'';
    const detail=[name,message].filter(Boolean).join(': ');
    return detail||String(error);
  }

  function styleStartupButton(button,kind='default'){
    button.type='button';
    button.style.cssText=[
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:5px',
      'background:'+ (kind==='danger'?'rgba(216,107,114,.14)':'rgba(255,255,255,.08)'),
      'color:#eceff3',
      'font:12px/1.2 system-ui,-apple-system,Segoe UI,sans-serif',
      'padding:7px 10px',
      'cursor:pointer'
    ].join(';');
  }

  function clearLegacyStateKeys(){
    try{
      localStorage.removeItem(STARTUP_STATE_KEY);
      Object.keys(localStorage)
        .filter(key=>/^hbe-(?:v[\d-]+|v0-[\d-]+)-state$/.test(key))
        .forEach(key=>localStorage.removeItem(key));
    }catch(error){
      console.warn('Leaf startup state reset skipped',error);
    }
  }

  function ensureStartupActions(){
    const copy=document.querySelector('.app-startup-copy');
    if(!copy||document.getElementById('leafStartupActions'))return;
    const actions=document.createElement('div');
    actions.id='leafStartupActions';
    actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';

    const continueButton=document.createElement('button');
    continueButton.textContent='Continue';
    continueButton.title='Hide the startup overlay if the editor already rendered behind it.';
    styleStartupButton(continueButton);
    continueButton.addEventListener('click',()=>{
      document.documentElement.dataset.leafReady='true';
      const startup=document.getElementById('appStartup');
      startup?.classList.add('is-complete');
      setTimeout(()=>startup?.remove(),120);
    });

    const resetButton=document.createElement('button');
    resetButton.textContent='Reset state';
    resetButton.title='Clear local Leaf startup state and reload.';
    styleStartupButton(resetButton,'danger');
    resetButton.addEventListener('click',()=>{
      clearLegacyStateKeys();
      location.reload();
    });

    actions.append(continueButton,resetButton);
    copy.appendChild(actions);
  }

  function reportStartupError(error,context='startup'){
    const detail=startupErrorDetail(error);
    if(window.__leafStartupError&&context==='timeout')return;
    window.__leafStartupError={context,detail,at:new Date().toISOString()};
    console.error(`[Leaf startup] ${context}: ${detail}`,error);
    const message=document.getElementById('appStartupMessage');
    if(message)message.textContent=`Startup issue (${context}): ${detail}`;
    const startup=document.getElementById('appStartup');
    startup?.classList.add('startup-error');
    startup?.setAttribute('data-error-context',context);
    startup?.setAttribute('title',detail);
    ensureStartupActions();
  }

  function installStartupDiagnostics(){
    if(window.LeafStartup?.reportError)return;
    window.LeafStartup={reportError:reportStartupError,clearLegacyStateKeys};
    window.addEventListener('error',event=>{
      reportStartupError(event.error||event.message,'runtime');
    });
    window.addEventListener('unhandledrejection',event=>{
      reportStartupError(event.reason,'promise');
    });
    setTimeout(()=>{
      if(document.documentElement.dataset.leafReady!=='true'){
        reportStartupError('Renderer did not signal ready within 12 seconds.','timeout');
      }
    },12000);
  }

  function installStartupStorageGuard(){
    try{
      if(window.__leafStartupStorageGuard)return;
      const StorageApi=window.Storage;
      if(!StorageApi?.prototype?.setItem)return;
      const nativeSetItem=StorageApi.prototype.setItem;
      Object.defineProperty(window,'__leafStartupStorageGuard',{value:true,configurable:false});
      StorageApi.prototype.setItem=function(key,value){
        try{return nativeSetItem.call(this,key,value);}
        catch(error){
          if(this===window.localStorage&&String(key)===STARTUP_STATE_KEY){
            console.warn('Leaf state persist skipped during startup',error);
            reportStartupError(error,'state-persist');
            return undefined;
          }
          throw error;
        }
      };
    }catch(error){
      console.warn('Leaf startup storage guard not installed',error);
    }
  }

  installStartupDiagnostics();
  installStartupStorageGuard();

  function stripEditorArtifactsFromDocument(doc){
    if(!doc) return doc;
    doc.querySelectorAll('[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line],[data-leaf-scrollbar-runtime]').forEach(n=>n.remove());
    doc.querySelectorAll('[data-editor-element-id]').forEach(n=>n.removeAttribute('data-editor-element-id'));
    doc.querySelectorAll('[data-leaf-image-drag]').forEach(n=>n.removeAttribute('data-leaf-image-drag'));
    doc.querySelectorAll('*').forEach(node=>{
      if(!node.classList) return;
      EDITOR_CLASS_NAMES.forEach(name=>node.classList.remove(name));
      if(!node.getAttribute('class')?.trim()) node.removeAttribute('class');
    });
    doc.querySelectorAll('base').forEach(n=>n.remove());
    doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach(n=>n.remove());
    return doc;
  }

  function editorArtifactReport(html){
    const text=String(html||'');
    const patterns=['data-editor-overlay','data-adf-marker','data-hbe-drop-line','data-editor-element-id','data-leaf-scrollbar-runtime','data-leaf-image-drag','table-cell-selected','viewport-object-drop-target'];
    return patterns.map(pattern=>({pattern,count:(text.match(new RegExp(pattern,'g'))||[]).length})).filter(x=>x.count>0);
  }

  function countOccurrences(haystack,needle){
    if(!needle)return 0;
    let count=0,offset=0;
    while(true){const i=haystack.indexOf(needle,offset);if(i<0)return count;count++;offset=i+needle.length;}
  }

  function tryMinimalDirectTextPatch(source,oldText,newText){
    source=String(source||'');oldText=String(oldText??'');newText=String(newText??'');
    if(oldText===newText)return{ok:true,source,kind:'noop'};
    if(!oldText)return{ok:false,reason:'empty-original-text'};
    const count=countOccurrences(source,oldText);
    if(count!==1)return{ok:false,reason:`ambiguous-text:${count}`};
    const start=source.indexOf(oldText);
    return{ok:true,kind:'direct-text',source:source.slice(0,start)+newText+source.slice(start+oldText.length),changedRange:{start,oldLength:oldText.length,newLength:newText.length}};
  }

  function tryInspectorMinimalPatch({source,savedValues,nextValues,keys}){
    const changed=keys.filter(key=>String(savedValues?.[key]??'')!==String(nextValues?.[key]??''));
    if(changed.length===0)return{ok:true,source:String(source||''),kind:'noop'};
    if(changed.length===1&&changed[0]==='text')return tryMinimalDirectTextPatch(source,savedValues.text,nextValues.text);
    return{ok:false,reason:`unsupported-fields:${changed.join(',')}`};
  }

  function loadExtensionScript(src){
    if(document.querySelector(`script[data-leaf-extension="${src}"]`))return;
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.dataset.leafExtension=src;
    script.onerror=()=>console.warn(`Leaf extension failed to load: ${src}`);
    document.body.appendChild(script);
  }

  function loadEarlyExtensions(){
    loadExtensionScript('./theme-policy.js');
  }

  function loadLeafExtensions(){
    loadExtensionScript('./preview-universal-edit.js');
    loadExtensionScript('./html-canvas-capability.js');
    loadExtensionScript('./canvas-lab.js');
    loadExtensionScript('./image-widget-edit.js');
    loadExtensionScript('./view-drop-bridge.js');
    loadExtensionScript('./code-syntax-highlight.js');
    loadExtensionScript('./active-view-policy.js');
    loadExtensionScript('./scripted-html-edit.js');
  }

  let extensionsLoaded=false;

  function isRendererReady(){
    return document.documentElement.dataset.leafReady==='true';
  }

  function loadLeafExtensionsOnce(){
    if(extensionsLoaded)return;
    extensionsLoaded=true;
    loadLeafExtensions();
  }

  function waitForRendererReady(){
    if(isRendererReady()){
      loadLeafExtensionsOnce();
      return;
    }

    const observer=new MutationObserver(()=>{
      if(!isRendererReady())return;
      observer.disconnect();
      loadLeafExtensionsOnce();
    });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-leaf-ready']});

    setTimeout(()=>{
      if(!extensionsLoaded&&!isRendererReady()){
        console.warn('Leaf extensions are waiting for renderer readiness.');
      }
    },2500);
  }

  function installExtensions(){
    loadEarlyExtensions();
    waitForRendererReady();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installExtensions,{once:true});
  else installExtensions();

  window.SourceFidelity={stripEditorArtifactsFromDocument,editorArtifactReport,tryMinimalDirectTextPatch,tryInspectorMinimalPatch};
})();
