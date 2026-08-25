(() => {
  'use strict';
  const EDITOR_CLASS_NAMES=new Set(['table-cell-selected','viewport-object-drop-target']);
  const STARTUP_STATE_KEY='leaf-v0-5-16-state';
  const STARTUP_DEBUG_VERSION='source-fidelity-startup-debug-v3';
  const STARTUP_DEBUG_LIMIT=120;
  const RENDERER_BOOTSTRAP_RETRY_MS=120;
  const RENDERER_BOOTSTRAP_MAX_WAIT_MS=2200;
  const RENDERER_BOOTSTRAP_REQUIRED_IDS=['appRoot','workspace','tree','sourceEditor','singleFrame','leftFrame','rightFrame','codePreviewFrame'];
  const RENDERER_BOOTSTRAP_DEPENDENCIES=[
    {src:'./widget-registry.js',global:'WidgetRegistry'},
    {src:'./jira-compat.js',global:'JiraCompatibility'},
    {src:'./semantic-document.js',global:'SemanticDocument'},
    {src:'./jira-export.js',global:'JiraExport'}
  ];
  const startupDebugStartedAt=Number.isFinite(window.__leafStartupDebugStartedAt)
    ? window.__leafStartupDebugStartedAt
    : (performance?.now?.()||Date.now());
  window.__leafStartupDebugStartedAt=startupDebugStartedAt;
  window.__leafStartupDebugLog=Array.isArray(window.__leafStartupDebugLog)?window.__leafStartupDebugLog:[];

  function startupErrorDetail(error){
    if(!error)return 'Unknown startup error';
    if(typeof error==='string')return error;
    const name=error.name||'';
    const message=error.message||'';
    const detail=[name,message].filter(Boolean).join(': ');
    return detail||String(error);
  }

  function serializeStartupDebugValue(value){
    if(value==null)return '';
    if(typeof value==='string')return value;
    if(value instanceof Error)return startupErrorDetail(value);
    try{return JSON.stringify(value);}
    catch{return String(value);}
  }

  function ensureStartupDebugPanel(){
    const startup=document.getElementById('appStartup');
    if(!startup)return null;
    startup.style.pointerEvents='auto';
    let panel=document.getElementById('appStartupDebug');
    if(panel)return panel;
    panel=document.createElement('pre');
    panel.id='appStartupDebug';
    panel.setAttribute('aria-live','polite');
    panel.style.cssText=[
      'position:absolute',
      'left:50%',
      'top:calc(50% + 74px)',
      'transform:translateX(-50%)',
      'width:min(760px,calc(100vw - 48px))',
      'max-height:min(320px,calc(50vh - 42px))',
      'overflow:auto',
      'margin:0',
      'padding:10px 12px',
      'border:1px solid rgba(255,255,255,.14)',
      'border-radius:8px',
      'background:rgba(10,12,16,.88)',
      'box-shadow:0 12px 36px rgba(0,0,0,.36)',
      'color:#c9d3df',
      'font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace',
      'white-space:pre-wrap',
      'word-break:break-word',
      'cursor:text',
      'pointer-events:auto'
    ].join(';');
    startup.appendChild(panel);
    return panel;
  }

  function renderStartupDebugLog(){
    const panel=ensureStartupDebugPanel();
    if(!panel)return;
    panel.textContent=(window.__leafStartupDebugLog||[]).join('\n');
    panel.scrollTop=panel.scrollHeight;
  }

  function recordStartupDebug(message,detail){
    const elapsed=Math.max(0,Math.round((performance?.now?.()||Date.now())-startupDebugStartedAt));
    const detailText=serializeStartupDebugValue(detail);
    const line=`[+${elapsed}ms] ${message}${detailText?' '+detailText:''}`;
    window.__leafStartupDebugLog.push(line);
    if(window.__leafStartupDebugLog.length>STARTUP_DEBUG_LIMIT){
      window.__leafStartupDebugLog.splice(0,window.__leafStartupDebugLog.length-STARTUP_DEBUG_LIMIT);
    }
    renderStartupDebugLog();
    try{console.info(`[Leaf startup debug] ${message}`,detail??'');}catch{}
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
      'cursor:pointer',
      'pointer-events:auto',
      'position:relative',
      'z-index:2'
    ].join(';');
  }

  function clearLegacyStateKeys(){
    try{
      localStorage.removeItem(STARTUP_STATE_KEY);
      Object.keys(localStorage)
        .filter(key=>/^hbe-(?:v[\d-]+|v0-[\d-]+)-state$/.test(key))
        .forEach(key=>localStorage.removeItem(key));
      recordStartupDebug('local startup state reset requested');
    }catch(error){
      console.warn('Leaf startup state reset skipped',error);
      recordStartupDebug('local startup state reset failed',startupErrorDetail(error));
    }
  }

  function fallbackCopyStartupDebugLog(text){
    try{
      const area=document.createElement('textarea');
      area.value=text;
      area.setAttribute('readonly','');
      area.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(area);
      area.select();
      const ok=document.execCommand?.('copy');
      area.remove();
      recordStartupDebug(ok?'debug log copied with textarea fallback':'debug log textarea copy unavailable');
      return !!ok;
    }catch(error){
      recordStartupDebug('debug log textarea copy failed',startupErrorDetail(error));
      return false;
    }
  }

  function copyStartupDebugLog(){
    const text=(window.__leafStartupDebugLog||[]).join('\n')||'Leaf startup debug log is empty.';
    if(window.electronAPI?.writeTextClipboard){
      Promise.resolve(window.electronAPI.writeTextClipboard(text))
        .then(()=>recordStartupDebug('debug log copied through Electron clipboard'))
        .catch(error=>{
          recordStartupDebug('debug log Electron clipboard copy failed',startupErrorDetail(error));
          if(!navigator.clipboard?.writeText)fallbackCopyStartupDebugLog(text);
        });
      return;
    }
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(text)
        .then(()=>recordStartupDebug('debug log copied to clipboard'))
        .catch(error=>{
          recordStartupDebug('debug log clipboard copy failed',startupErrorDetail(error));
          fallbackCopyStartupDebugLog(text);
        });
      return;
    }
    fallbackCopyStartupDebugLog(text);
  }

  function hideStartupOverlay(reason='manual'){
    recordStartupDebug('startup overlay hide requested',reason);
    document.documentElement.dataset.leafReady='true';
    const startup=document.getElementById('appStartup');
    if(!startup)return;
    startup.style.pointerEvents='none';
    startup.classList.add('is-complete');
    setTimeout(()=>startup?.remove(),120);
  }

  function handleStartupAction(action){
    if(action==='continue'){
      hideStartupOverlay('manual continue');
      return;
    }
    if(action==='reset'){
      clearLegacyStateKeys();
      recordStartupDebug('startup reset reload requested');
      location.reload();
      return;
    }
    if(action==='copy'){
      copyStartupDebugLog();
    }
  }

  function startupActionButtonFromTarget(target){
    const element=target?.nodeType===1?target:target?.parentElement;
    const button=element?.closest?.('[data-leaf-startup-action]');
    if(!button||!document.getElementById('leafStartupActions')?.contains(button))return null;
    return button;
  }

  function handleStartupActionEvent(event){
    const button=startupActionButtonFromTarget(event.target);
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    handleStartupAction(button.dataset.leafStartupAction);
  }

  function installStartupActionCapture(){
    if(window.__leafStartupActionCaptureInstalled)return;
    Object.defineProperty(window,'__leafStartupActionCaptureInstalled',{value:true,configurable:false});
    document.addEventListener('pointerup',handleStartupActionEvent,true);
    document.addEventListener('click',handleStartupActionEvent,true);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      handleStartupActionEvent(event);
    },true);
    recordStartupDebug('startup action capture installed');
  }

  function ensureStartupActions(){
    const copy=document.querySelector('.app-startup-copy');
    if(!copy||document.getElementById('leafStartupActions'))return;
    const startup=document.getElementById('appStartup');
    if(startup){
      startup.style.pointerEvents='auto';
      startup.style.cursor='default';
    }
    const actions=document.createElement('div');
    actions.id='leafStartupActions';
    actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;pointer-events:auto;position:relative;z-index:2';

    const continueButton=document.createElement('button');
    continueButton.textContent='Continue';
    continueButton.dataset.leafStartupAction='continue';
    continueButton.title='Hide the startup overlay if the editor already rendered behind it.';
    styleStartupButton(continueButton);
    continueButton.addEventListener('click',()=>handleStartupAction('continue'));

    const resetButton=document.createElement('button');
    resetButton.textContent='Reset state';
    resetButton.dataset.leafStartupAction='reset';
    resetButton.title='Clear local Leaf startup state and reload.';
    styleStartupButton(resetButton,'danger');
    resetButton.addEventListener('click',()=>handleStartupAction('reset'));

    const copyButton=document.createElement('button');
    copyButton.textContent='Copy debug';
    copyButton.dataset.leafStartupAction='copy';
    copyButton.title='Copy the visible startup diagnostics.';
    styleStartupButton(copyButton);
    copyButton.addEventListener('click',()=>handleStartupAction('copy'));

    actions.append(continueButton,resetButton,copyButton);
    copy.appendChild(actions);
  }

  function reportStartupError(error,context='startup'){
    const detail=startupErrorDetail(error);
    const existing=window.__leafStartupError;
    if(existing&&context==='timeout'){
      recordStartupDebug(`startup issue (${context})`,`${detail} (existing ${existing.context}: ${existing.detail})`);
    }else{
      window.__leafStartupError={context,detail,at:new Date().toISOString()};
      recordStartupDebug(`startup issue (${context})`,detail);
    }
    console.error(`[Leaf startup] ${context}: ${detail}`,error);
    const message=document.getElementById('appStartupMessage');
    if(message)message.textContent=`Startup issue (${context}): ${detail}`;
    const startup=document.getElementById('appStartup');
    startup?.classList.add('startup-error');
    startup?.setAttribute('data-error-context',context);
    startup?.setAttribute('title',detail);
    ensureStartupActions();
  }

  function installStartupInfoProbe(){
    const api=window.electronAPI;
    recordStartupDebug('preload bridge probe',{hasElectronAPI:!!api,keys:api?Object.keys(api).sort():[]});
    if(api?.startupInfo){
      Promise.resolve(api.startupInfo())
        .then(info=>recordStartupDebug('app startup info',info))
        .catch(error=>recordStartupDebug('app startup info failed',startupErrorDetail(error)));
    }
    if(api?.runtimeConfig){
      Promise.resolve(api.runtimeConfig())
        .then(config=>recordStartupDebug('runtime config',config))
        .catch(error=>recordStartupDebug('runtime config failed',startupErrorDetail(error)));
    }
  }

  function rendererScriptSrc(script){
    return script?.getAttribute?.('src')||script?.src||'';
  }

  function isRendererScript(script){
    return /renderer\.js(?:$|[?#])/i.test(rendererScriptSrc(script));
  }

  function hasRendererBootstrapScript(){
    return [...document.querySelectorAll('script')].some(isRendererScript);
  }

  function rendererBootstrapMissing(){
    const missing=[];
    if(!document.body)missing.push('document.body');
    for(const id of RENDERER_BOOTSTRAP_REQUIRED_IDS){
      if(!document.getElementById(id))missing.push(`#${id}`);
    }
    return missing;
  }

  function startupDependencyReady(dep){
    return !dep.global||!!window[dep.global];
  }

  function loadStartupDependencyScript(dep){
    if(startupDependencyReady(dep)){
      recordStartupDebug('renderer startup dependency already ready',dep.global||dep.src);
      return Promise.resolve('ready');
    }
    if(document.querySelector(`script[data-leaf-startup-dependency="${dep.src}"]`)){
      recordStartupDebug('renderer startup dependency already queued',dep.src);
      return Promise.resolve('queued');
    }
    return new Promise(resolve=>{
      const script=document.createElement('script');
      let settled=false;
      const finish=status=>{
        if(settled)return;
        settled=true;
        recordStartupDebug(`renderer startup dependency ${status}`,{src:dep.src,global:dep.global,ready:startupDependencyReady(dep)});
        resolve(status);
      };
      script.src=dep.src;
      script.async=false;
      script.dataset.leafStartupDependency=dep.src;
      script.onload=()=>finish('loaded');
      script.onerror=()=>finish('error');
      setTimeout(()=>finish('timeout'),900);
      recordStartupDebug('renderer startup dependency queued',dep.src);
      document.body.appendChild(script);
    });
  }

  async function loadRendererScriptFromStartupRecovery(reason='startup-recovery'){
    if(isRendererReady()){
      recordStartupDebug('renderer startup recovery skipped; renderer already ready');
      return true;
    }
    if(hasRendererBootstrapScript()){
      recordStartupDebug('renderer startup recovery skipped; renderer script already present');
      return true;
    }
    const missing=rendererBootstrapMissing();
    if(missing.length){
      recordStartupDebug('renderer startup recovery missing DOM anchors',missing);
      return false;
    }
    if(window.__leafRendererBootstrapStarted){
      recordStartupDebug('renderer startup recovery already started');
      return true;
    }

    Object.defineProperty(window,'__leafRendererBootstrapStarted',{value:true,configurable:false});
    recordStartupDebug('renderer startup recovery loading dependencies',{reason});
    for(const dep of RENDERER_BOOTSTRAP_DEPENDENCIES){
      await loadStartupDependencyScript(dep);
    }
    if(isRendererReady()){
      recordStartupDebug('renderer startup recovery skipped after dependencies; renderer ready');
      return true;
    }
    if(hasRendererBootstrapScript()){
      recordStartupDebug('renderer startup recovery skipped after dependencies; renderer script appeared');
      return true;
    }

    const script=document.createElement('script');
    script.src='./renderer.js';
    script.async=true;
    script.dataset.leafRendererRecovery=reason;
    script.onload=()=>recordStartupDebug('renderer startup recovery load event fired');
    script.onerror=()=>reportStartupError('renderer.js failed to load from startup recovery.','renderer-recovery-load');
    recordStartupDebug('renderer startup recovery appended renderer.js',{reason});
    document.body.appendChild(script);
    return true;
  }

  function ensureRendererBootstrapRecovery(){
    if(window.__leafRendererBootstrapRecoveryInstalled)return;
    Object.defineProperty(window,'__leafRendererBootstrapRecoveryInstalled',{value:true,configurable:false});
    const startedAt=performance?.now?.()||Date.now();
    let lastMissing='';
    const tick=()=>{
      if(isRendererReady()){
        recordStartupDebug('renderer startup recovery stopped; renderer ready');
        return;
      }
      if(hasRendererBootstrapScript()){
        recordStartupDebug('renderer startup recovery stopped; renderer script observed');
        return;
      }
      const missing=rendererBootstrapMissing();
      const waited=(performance?.now?.()||Date.now())-startedAt;
      if(!missing.length){
        void loadRendererScriptFromStartupRecovery('startup-recovery');
        return;
      }
      const signature=missing.join(',');
      if(signature!==lastMissing){
        lastMissing=signature;
        recordStartupDebug('renderer startup recovery waiting for DOM anchors',missing);
      }
      if(waited>=RENDERER_BOOTSTRAP_MAX_WAIT_MS){
        reportStartupError(`Renderer recovery could not start because DOM anchors are missing: ${missing.join(', ')}`,'renderer-recovery-dom');
        return;
      }
      setTimeout(tick,RENDERER_BOOTSTRAP_RETRY_MS);
    };
    setTimeout(tick,160);
    recordStartupDebug('renderer startup recovery armed',{retryMs:RENDERER_BOOTSTRAP_RETRY_MS,maxWaitMs:RENDERER_BOOTSTRAP_MAX_WAIT_MS});
  }

  const observedRendererScripts=new WeakSet();
  function observeRendererScript(script){
    if(!script||observedRendererScripts.has(script))return;
    const src=rendererScriptSrc(script);
    if(!/renderer\.js(?:$|[?#])/i.test(src))return;
    if(window.__leafRendererBootstrapStarted&&!script.dataset.leafRendererRecovery){
      recordStartupDebug('duplicate renderer.js script removed after startup recovery',{src});
      script.remove();
      return;
    }
    observedRendererScripts.add(script);
    recordStartupDebug('renderer.js script element detected',{src,async:script.async,recovery:script.dataset.leafRendererRecovery||null});
    script.addEventListener('load',()=>recordStartupDebug('renderer.js load event fired'),{once:true});
    script.addEventListener('error',()=>reportStartupError('renderer.js failed to load.','renderer-load'),{once:true});
  }

  function installRendererScriptObserver(){
    document.querySelectorAll('script').forEach(observeRendererScript);
    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        mutation.addedNodes.forEach(node=>{
          if(node?.tagName==='SCRIPT')observeRendererScript(node);
          node?.querySelectorAll?.('script')?.forEach(observeRendererScript);
        });
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('load',()=>recordStartupDebug('window load event fired'),{once:true});
    document.addEventListener('DOMContentLoaded',()=>recordStartupDebug('DOMContentLoaded fired'),{once:true});
  }

  function installStartupDiagnostics(){
    const previous=window.LeafStartup||{};
    window.LeafStartup={
      ...previous,
      reportError:reportStartupError,
      clearLegacyStateKeys,
      record:recordStartupDebug,
      continue:()=>handleStartupAction('continue'),
      resetState:()=>handleStartupAction('reset'),
      copyDebug:()=>handleStartupAction('copy'),
      getDebugLog:()=>Array.from(window.__leafStartupDebugLog||[])
    };
    window.__leafStartupDiagnosticsVersion=STARTUP_DEBUG_VERSION;
    ensureStartupDebugPanel();
    installStartupActionCapture();
    ensureStartupActions();
    recordStartupDebug('startup diagnostics active',{
      version:STARTUP_DEBUG_VERSION,
      readyState:document.readyState,
      location:location.href,
      userAgent:navigator.userAgent
    });
    installStartupInfoProbe();
    installRendererScriptObserver();
    ensureRendererBootstrapRecovery();
    if(window.__leafStartupDiagnosticsInstalledBySourceFidelity)return;
    Object.defineProperty(window,'__leafStartupDiagnosticsInstalledBySourceFidelity',{value:true,configurable:false});
    window.addEventListener('error',event=>{
      const target=event.target;
      if(target?.tagName==='SCRIPT'){
        reportStartupError(`Script failed to load: ${target.getAttribute('src')||'unknown script'}`,'script-load');
        return;
      }
      reportStartupError(event.error||event.message,'runtime');
    },true);
    window.addEventListener('unhandledrejection',event=>{
      reportStartupError(event.reason,'promise');
    });
    setTimeout(()=>{
      if(document.documentElement.dataset.leafReady!=='true'){
        reportStartupError('Renderer did not signal ready within 12 seconds.','timeout');
      }else{
        recordStartupDebug('renderer ready before 12s timeout');
      }
    },12000);
  }

  function installStartupStorageGuard(){
    try{
      if(window.__leafStartupStorageGuard){
        recordStartupDebug('startup storage guard already installed');
        return;
      }
      const StorageApi=window.Storage;
      if(!StorageApi?.prototype?.setItem){
        recordStartupDebug('startup storage guard unavailable');
        return;
      }
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
      recordStartupDebug('startup storage guard installed');
    }catch(error){
      console.warn('Leaf startup storage guard not installed',error);
      recordStartupDebug('startup storage guard failed',startupErrorDetail(error));
    }
  }

  installStartupDiagnostics();
  installStartupStorageGuard();

  function stripEditorArtifactsFromDocument(doc){
    if(!doc) return doc;
    doc.querySelectorAll('[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line],[data-leaf-scrollbar-runtime],[data-leaf-html-canvas-runtime]').forEach(n=>n.remove());
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
    const patterns=['data-editor-overlay','data-adf-marker','data-hbe-drop-line','data-editor-element-id','data-leaf-scrollbar-runtime','data-leaf-html-canvas-runtime','data-leaf-image-drag','table-cell-selected','viewport-object-drop-target'];
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
    script.onload=()=>recordStartupDebug('extension loaded',src);
    script.onerror=()=>{
      recordStartupDebug('extension failed to load',src);
      console.warn(`Leaf extension failed to load: ${src}`);
    };
    recordStartupDebug('extension queued',src);
    document.body.appendChild(script);
  }

  function loadEarlyExtensions(){
    recordStartupDebug('loading early extensions');
    loadExtensionScript('./theme-policy.js');
  }

  function loadLeafExtensions(){
    recordStartupDebug('loading post-ready extensions');
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
    recordStartupDebug('renderer ready; loading Leaf extensions');
    loadLeafExtensions();
  }

  function waitForRendererReady(){
    if(isRendererReady()){
      recordStartupDebug('renderer already marked ready');
      loadLeafExtensionsOnce();
      return;
    }

    recordStartupDebug('waiting for renderer ready marker');
    const observer=new MutationObserver(()=>{
      if(!isRendererReady())return;
      observer.disconnect();
      recordStartupDebug('renderer ready marker observed');
      loadLeafExtensionsOnce();
    });
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-leaf-ready']});

    setTimeout(()=>{
      if(!extensionsLoaded&&!isRendererReady()){
        recordStartupDebug('extensions still waiting for renderer readiness after 2.5s');
        console.warn('Leaf extensions are waiting for renderer readiness.');
      }
    },2500);
  }

  function installExtensions(){
    recordStartupDebug('installExtensions entered',{readyState:document.readyState});
    loadEarlyExtensions();
    waitForRendererReady();
  }

  function canInstallExtensionsImmediately(){
    return !!document.body&&!!document.getElementById('appRoot');
  }

  if(document.readyState==='loading'&&!canInstallExtensionsImmediately()){
    recordStartupDebug('document still loading; deferring extensions to DOMContentLoaded');
    document.addEventListener('DOMContentLoaded',installExtensions,{once:true});
  }else{
    if(document.readyState==='loading')recordStartupDebug('document still loading; app shell parsed; installing extensions before DOMContentLoaded');
    installExtensions();
  }

  window.SourceFidelity={stripEditorArtifactsFromDocument,editorArtifactReport,tryMinimalDirectTextPatch,tryInspectorMinimalPatch};
  recordStartupDebug('SourceFidelity API exposed');
})();
