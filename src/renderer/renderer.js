(() => {
  performance.mark('leaf-renderer-start');
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const ROOT = null;
  const stateKey = 'leaf-v0-5-16-state';

  const refs = {
    workspace: $('#workspace'), tree: $('#tree'), inspector: $('#inspector'), projectSearch: $('#projectSearch'),
    sidebarToggleTop: $('#sidebarToggleTop'), inspectorToggleTop: $('#inspectorToggleTop'),
    inspectorBody: $('#inspectorBody'), inspectorActions: $('#inspectorActions'),
    inspectorPropertySearch: $('#inspectorPropertySearch'), inspectorPropertySearchStatus: $('#inspectorPropertySearchStatus'),
    sidebarResizer: $('#sidebarResizer'), inspectorResizer: $('#inspectorResizer'),
    splitDivider: $('#splitDivider'), codeDivider: $('#codeDivider'),
    resizeShield: $('#resizeShield'), source: $('#sourceEditor'),
    lineRail: $('#lineRail'), dirty: $('#dirtyMark'), crumbs: $('#crumbs'),
    codeSearch: $('#codeSearch'), codeSearchStatus: $('#codeSearchStatus'),
    singleFrame: $('#singleFrame'), leftFrame: $('#leftFrame'), rightFrame: $('#rightFrame'),
    codePreviewFrame: $('#codePreviewFrame'), codePageSelect: $('#codePageSelect'), toast: $('#toast'),
    ctx: $('#treeContextMenu'), colorPicker: $('#documentColorPicker'),
    resetInspectorBtn: $('#resetInspectorBtn'),
    viewportSizeModal: $('#viewportSizeModal'), viewportWidthInput: $('#viewportWidthInput'),
    viewportHeightInput: $('#viewportHeightInput'),
    clearHtmlModal: $('#clearHtmlModal'), clearHtmlTarget: $('#clearHtmlTarget'),
    cancelEditModal: $('#cancelEditModal'), cancelEditTarget: $('#cancelEditTarget'),
    groupTileView: $('#groupTileView'), groupTileGrid: $('#groupTileGrid'),
    groupTileTitle: $('#groupTileTitle'), groupTileCount: $('#groupTileCount'), groupTileClose: $('#groupTileClose'),
    replaceHtmlModal: $('#replaceHtmlModal'), replaceHtmlTarget: $('#replaceHtmlTarget'), replaceHtmlMessage: $('#replaceHtmlMessage'),
    replaceHtmlOpenNew: $('#replaceHtmlOpenNew'),
    jiraExportModal: $('#jiraExportModal'), jiraExportSource: $('#jiraExportSource'),
    jiraExportRuntime: $('#jiraExportRuntime'), jiraExportStats: $('#jiraExportStats'),
    jiraExportWarnings: $('#jiraExportWarnings'), jiraRichPreview: $('#jiraRichPreview'),
    jiraTextPreview: $('#jiraTextPreview'),
    leftHorizontalSplitter: $('#leftHorizontalSplitter'), hierarchyTree: $('#hierarchyTree'),
    objectsList: $('#objectsList'), usedComponentsList: $('#usedComponentsList'), usedComponentPreviewFrame: $('#usedComponentPreviewFrame'), usedComponentPreviewName: $('#usedComponentPreviewName'),
    usedPreviewSplitter: $('#usedPreviewSplitter'), toggleUsedPreview: $('#toggleUsedPreview'),
    objectContextMenu: $('#objectContextMenu'), usedContextMenu: $('#usedContextMenu'), treeAddMenu: $('#treeAddMenu'), jiraCheckPopover: $('#jiraCheckPopover'),
    tableToolbar: $('#tableToolbar'), exportElementBtn: $('#exportElementBtn'),
    objectExportModal: $('#objectExportModal'), objectExportFormat: $('#objectExportFormat'), objectExportScale: $('#objectExportScale'), objectExportSummary: $('#objectExportSummary'),
    savePageAsModal: $('#savePageAsModal'), savePageAsFormat: $('#savePageAsFormat'), aboutModal: $('#aboutModal'),
    splashModal: $('#splashModal'),
    githubModal: $('#githubModal'),
    driveModal: $('#driveModal'),
    reloadPageModal: $('#reloadPageModal'),
    githubCommitModal: $('#githubCommitModal'),
    atlassianPreviewToolbar: $('#atlassianPreviewToolbar'), atlassianPreviewActions: $('#atlassianPreviewActions'),
    atlassianPreviewSource: $('#atlassianPreviewSource'), atlassianFileInput: $('#atlassianFileInput')
  };

  // The project is a per-run workspace: every launch opens a clean one, so the
  // stored project is read only to salvage the parts that are app settings
  // rather than project content. preferences and layout are the user's chrome -
  // theme, UI scale, language, panel widths, split ratios - and wiping those on
  // every start would be a different, unasked-for reset. This is the same split
  // the "New Project" action already makes.
  // Read before the reset, then drop the stored copy: the discarded project must
  // not sit in storage until some later edit happens to overwrite it.
  const storedStateAtStartup = loadState();
  resetPersistedEditorState();
  let state = startFreshProject(storedStateAtStartup);
  let selectedTreeNode = state.selectedTreeNode || null;
  let activeSlots = state.activeSlots || { split:'left', code:'preview' };
  let selectedElement = null;
  let selectedElementFrame = null;
  let selectedElements = new Set();
  let selectedTableCells = new Set();
  const frameSelectionRenderers = new WeakMap();
  let inlineTextEditSession = null;
  let inlineTextEditStarting = false;

  const SelectionManager={
    source:null,
    items(){
      selectedElements=new Set([...selectedElements].filter(element=>element?.isConnected));
      return [...selectedElements];
    },
    has(element){ return selectedElements.has(element); },
    select(element,frame,source='unknown',{toggle=false}={}){
      if(!element || ['HTML','BODY'].includes(element.tagName)) return selectedElement;
      if(inlineTextEditSession && inlineTextEditSession.element!==element) endInlineTextEdit({commit:true,restoreSelection:false});
      const previousFrames=new Set([...selectedElements].map(item=>item?.ownerDocument?.defaultView?.frameElement).filter(Boolean));
      const sameFrame=selectedElementFrame===frame || !selectedElementFrame;

      if(toggle){
        if(!sameFrame) selectedElements.clear();
        if(selectedElements.has(element)) selectedElements.delete(element);
        else if(element) selectedElements.add(element);
      }else if(element && !(selectedElements.size===1 && selectedElements.has(element))){
        selectedElements.clear();
        selectedElements.add(element);
      }

      const remaining=[...selectedElements].filter(item=>item?.isConnected);
      selectedElement=element && selectedElements.has(element) ? element : (remaining.at(-1)||null);
      selectedElementFrame=selectedElement ? frame : null;
      this.source=source;
      clearSelectedCellMarker(selectedElementFrame);
      if(selectedElement && canInspectFrame(selectedElementFrame)) showInspector(selectedElement,selectedElementFrame);
      else if(!selectedElement) renderEmptyInspectorState();
      updateStructuredToolbar();
      renderHierarchy();
      syncUsedSelectionFromElement(selectedElement);
      previousFrames.add(frame);
      previousFrames.forEach(item=>frameSelectionRenderers.get(item)?.());
      return selectedElement;
    },
    restore(elements,frame,source='history'){
      const previousFrames=new Set([...selectedElements].map(item=>item?.ownerDocument?.defaultView?.frameElement).filter(Boolean));
      selectedElements=new Set((elements||[]).filter(element=>element?.isConnected&&!['HTML','BODY'].includes(element.tagName)));
      selectedElement=[...selectedElements].at(-1)||null;selectedElementFrame=selectedElement?frame:null;this.source=selectedElement?source:null;
      if(selectedElement&&canInspectFrame(frame))showInspector(selectedElement,frame);else renderEmptyInspectorState();
      updateStructuredToolbar();renderHierarchy();syncUsedSelectionFromElement(selectedElement);
      previousFrames.add(frame);previousFrames.forEach(item=>frameSelectionRenderers.get(item)?.());
      return selectedElement;
    },
    clear({render=false}={}){
      if(inlineTextEditSession) endInlineTextEdit();
      const previousFrames=new Set([...selectedElements].map(item=>item?.ownerDocument?.defaultView?.frameElement).filter(Boolean));
      selectedElements.clear();
      selectedElement=null;
      selectedElementFrame=null;
      this.source=null;
      syncUsedSelectionFromElement(null);
      previousFrames.forEach(frame=>frameSelectionRenderers.get(frame)?.());
      if(render){renderEmptyInspectorState();updateStructuredToolbar();renderHierarchy();}
    }
  };

  let treeClipboard = null;
  let undoStack = [];
  let redoStack = [];
  let modalAction = null;
  let activeDocumentForColor = null;
  let sidebarWidth = state.preferences?.sidebarWidth || 260;
  let inspectorWidth = state.preferences?.inspectorWidth || 290;
  let splitRatio = state.layout?.splitRatio ?? 0.5;
  let codeRatio = state.layout?.codeRatio ?? 0.5;
  let pendingViewportSizeSlot = null;
  let pendingClearPageId = null;
  let pendingHtmlDrop = null;
  let jiraExportState = null;
  let objectFilter='all';
  let usedComponentCatalog=new Map();
  let selectedUsedComponentToken=null;
  let usedDocumentSelectionSignature=null;
  let usedContextToken=null;
  let highlightedUsedComponentToken=null;
  let viewportElementDragContext=null;
  let componentClipboard=null;
  let objectContextFrame=null;
  let treeAddTarget=null;
  let jiraCheckState=null;
  let atlassianPreviewState=null;
  const pendingSelectionRestore=new WeakMap();
  let leftTopRatio=state.layout?.leftTopRatio ?? .58;
  let usedPreviewRatio=state.layout?.usedPreviewRatio ?? .42;
  let documentFullscreenSlot=null;
  let documentFullscreenRestoreEditSlot=null;
  let objectExportTarget=null;
  const renderedSnapshotCache = new WeakMap();
  const snapshotWaiters = new Map();
  const directSourceUndoTokens = new Set();
  const viewSearchState = new Map();
  const hierarchyObservers = new WeakMap();
  const hierarchyRefreshFrames = new WeakSet();

  // HTML Inspector editing session.
  // Editing is intentionally opt-in for every app launch.
  let htmlEditEnabled = false;
  let editOwnerSlot = null;
  let inspectorPreviewEnabled = true;
  let inspectorDraft = null;
  let lastSourceMutationReport=null;

  function reportUnexpectedSourceMutation(page,{kind='unknown',before='',after='',expected=null}={}){
    const leakage=window.SourceFidelity?.editorArtifactReport(after)||[];
    lastSourceMutationReport={pageId:page?.id||null,kind,beforeLength:String(before||'').length,afterLength:String(after||'').length,leakage,expected};
    if(leakage.length){
      console.error('Editor-state leakage blocked',lastSourceMutationReport);
      showToast('Unsafe editor metadata was blocked from source');
      return false;
    }
    return true;
  }


  function uid(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  let inspectorElementSequence=0;

  function createDefaultState(){
    const page = uid('page');
    return {
      version:'0.5.16',
      projectName:'Untitled Leaf Project',
      projectFilePath:null,
      mode:'preview',
      preferences:{ scale:1, theme:'light', sidebarCollapsed:false, inspectorCollapsed:false, sidebarWidth:260, inspectorWidth:290, inspectorPreview:true, hierarchyNameMode:true, usedPreviewVisible:true, tocVisible:false, splash:true },
      layout:{ splitRatio:0.5, codeRatio:0.5, usedPreviewRatio:0.42 },
      previewSizes:{
        single:{preset:'responsive',width:null,height:null},
        left:{preset:'responsive',width:null,height:null},
        right:{preset:'responsive',width:null,height:null},
        codePreview:{preset:'responsive',width:null,height:null}
      },
      recent:[],
      selectedDocumentId:'document_default',
      selectedTreeNode:page,
      activeSlots:{ split:'left', code:'preview' },
      views:{ single:page, left:page, right:page, codePreview:page, codePage:page },
      documents:[{
        id:'document_default', name:'Default Document', color:'#5873d4', filePath:null, expanded:true,
        nodes:[{
          id:page,type:'page',name:'Empty Page',fileName:'untitled.html',documentType:'html',parentId:null,order:0,
          source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true
        }]
      }]
    };
  }


  function normalizeState(input){
    const fallback=createDefaultState();
    const s=input && typeof input==='object' ? input : fallback;
    s.version='0.5.16';
    s.projectName=String(s.projectName||s.documentName||fallback.projectName);
    s.projectFilePath=typeof s.projectFilePath==='string'?s.projectFilePath:(typeof s.documentFilePath==='string'?s.documentFilePath:null);
    s.mode=['preview','split','code'].includes(s.mode) ? s.mode : 'preview';
    s.preferences={...fallback.preferences,...(s.preferences||{})};
    s.preferences.theme=['dark','light'].includes(s.preferences.theme)?s.preferences.theme:'light';
    s.layout={
      splitRatio:Number.isFinite(Number(s.layout?.splitRatio)) ? Math.min(.85,Math.max(.15,Number(s.layout.splitRatio))) : .5,
      codeRatio:Number.isFinite(Number(s.layout?.codeRatio)) ? Math.min(.85,Math.max(.15,Number(s.layout.codeRatio))) : .5,
      leftTopRatio:Number.isFinite(Number(s.layout?.leftTopRatio)) ? Math.min(.8,Math.max(.25,Number(s.layout.leftTopRatio))) : .58,
      usedPreviewRatio:Number.isFinite(Number(s.layout?.usedPreviewRatio)) ? Math.min(.7,Math.max(.2,Number(s.layout.usedPreviewRatio))) : .42
    };
    s.previewSizes={...fallback.previewSizes,...(s.previewSizes||{})};
    ['single','left','right','codePreview'].forEach(slot=>{
      const current=s.previewSizes[slot]||{};
      s.previewSizes[slot]={
        preset:typeof current.preset==='string'?current.preset:'responsive',
        width:Number.isFinite(Number(current.width))?Number(current.width):null,
        height:Number.isFinite(Number(current.height))?Number(current.height):null
      };
    });
    s.previewZoomMode={...(s.previewZoomMode||{})};
    ['single','left','right','codePreview'].forEach(slot=>{
      if(!['fit','manual'].includes(s.previewZoomMode[slot])) s.previewZoomMode[slot]='fit';
    });
    s.recent=Array.isArray(s.recent)?s.recent:[];
    const legacyDocuments=Array.isArray(s.projects)?s.projects:null;
    s.documents=Array.isArray(s.documents)&&s.documents.length?s.documents.slice(0,100):(legacyDocuments?.length?legacyDocuments.slice(0,100):fallback.documents);
    s.documents=s.documents.filter(project=>project&&typeof project==='object').map((project,index)=>{
      project.id=String(project.id||uid('document'));project.name=String(project.name||`Document ${index+1}`);project.nodes=Array.isArray(project.nodes)?project.nodes.filter(node=>node&&typeof node==='object').slice(0,10000):[];return project;
    });
    if(!s.documents.length)s.documents=fallback.documents;
    s.documents.forEach(project=>project.nodes.forEach(page=>{
      if(page.type==='group')page.container=true;
      if(page.type==='page'){
        page.source=String(page.source||'');page.name=String(page.name||'Untitled Page');page.fileName=String(page.fileName||'untitled.html');
        if(typeof page.loadedSource!=='string') page.loadedSource=String(page.source||'');
        if(!['html','markdown','json','xml','pdf','image'].includes(page.documentType)){
          page.documentType=/\.pdf$/i.test(page.fileName||'')?'pdf':/\.(png|jpe?g|webp|gif|svg)$/i.test(page.fileName||'')?'image':/\.json$/i.test(page.fileName||'')?'json':/\.xml$/i.test(page.fileName||'')?'xml':/\.(md|markdown)$/i.test(page.fileName||'')?'markdown':'html';
        }
        if((page.documentType==='pdf'||page.documentType==='image')&&page.sourcePath&&!page.previewUrl)page.previewUrl=`file:///${String(page.sourcePath).replace(/\\/g,'/')}`;
      }
    }));
    s.views={...fallback.views,...(s.views||{})};
    s.activeSlots={
      split:['left','right'].includes(s.activeSlots?.split)?s.activeSlots.split:'left',
      code:['preview','editor'].includes(s.activeSlots?.code)?s.activeSlots.code:'preview'
    };
    s.selectedDocumentId=s.selectedDocumentId||s.selectedProjectId||null;
    if(!s.selectedDocumentId || !s.documents.some(p=>p.id===s.selectedDocumentId)) s.selectedDocumentId=s.documents[0]?.id||null;
    return s;
  }

  function resetPersistedEditorState(){
    try{
      Object.keys(localStorage)
        .filter(key=>key===stateKey||/^hbe-(?:v[\d-]+|v0-[\d-]+)-state$/.test(key))
        .forEach(key=>localStorage.removeItem(key));
    }catch(error){
      console.warn('Editor state reset skipped',error);
    }
  }

  function startFreshProject(stored){
    const fresh=normalizeState(createDefaultState());
    if(!stored) return fresh;
    let carried=null;
    try{ carried=normalizeState(stored); }catch{ return fresh; }
    fresh.preferences=carried.preferences;
    fresh.layout=carried.layout;
    fresh.previewSizes=carried.previewSizes;
    // Recent is app history, not part of the project. Dropping it left
    // File > Recent permanently empty - it could never list anything, because
    // the list was wiped on the launch after the one that filled it.
    fresh.recent=carried.recent;
    return fresh;
  }

  function loadState(){
    try {
      const v = localStorage.getItem(stateKey) || localStorage.getItem('hbe-v0-5-3-state') || localStorage.getItem('hbe-v0-5-2-state') || localStorage.getItem('hbe-v0-5-0-state') || localStorage.getItem('hbe-v4-3-state') || localStorage.getItem('hbe-v4-2-state') || localStorage.getItem('hbe-v4-1-state') || localStorage.getItem('hbe-v4-0-state') || localStorage.getItem('hbe-v3-9-state') || localStorage.getItem('hbe-v3-8-state') || localStorage.getItem('hbe-v3-7-state') || localStorage.getItem('hbe-v3-6-state') || localStorage.getItem('hbe-v3-5-state') || localStorage.getItem('hbe-v3-4-state') || localStorage.getItem('hbe-v3-3-state') || localStorage.getItem('hbe-v3-2-state') || localStorage.getItem('hbe-v3-1-state') || localStorage.getItem('hbe-v3-state');
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }
  let persistTimer=null,persistWroteOnce=false;
  function writePersistedState(){
    try{
      localStorage.setItem(stateKey, JSON.stringify(state));
      persistWroteOnce=true;
    }catch(error){
      console.warn('Leaf state persist failed',error);
      try{ showToast(error?.name==='QuotaExceededError'?'Storage limit reached - state was not saved':'State could not be saved'); }catch{}
    }
  }
  // Serializing the whole project costs ~100ms at QA fixture scale, so bursts of
  // persist() coalesce into one write. Anything that reads the stored state back
  // (unload, edit-runtime handoff to the extensions) must flushPersist() first.
  function persist(){
    state.selectedTreeNode = selectedTreeNode;
    state.activeSlots = activeSlots;
    if(persistTimer!==null) return;
    persistTimer=setTimeout(()=>{persistTimer=null;writePersistedState();},250);
  }
  function flushPersist(){
    if(persistTimer===null) return;
    clearTimeout(persistTimer);persistTimer=null;
    // The startup "Reset state" action deletes this key and reloads; the unload
    // flush must not resurrect what the user just cleared.
    if(persistWroteOnce&&!Object.prototype.hasOwnProperty.call(localStorage,stateKey)) return;
    writePersistedState();
  }
  window.addEventListener('beforeunload',flushPersist);
  window.addEventListener('pagehide',flushPersist);

  function emitLifecycle(name,detail){
    try{ document.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(error){ console.warn('Leaf lifecycle event failed',name,error); }
  }

  function documentById(id){ return state.documents.find(p=>p.id===id) || null; }
  function activeDocument(){ return documentById(state.selectedDocumentId) || state.documents[0] || null; }
  function nodeById(id){
    for(const p of state.documents){ const n=p.nodes.find(n=>n.id===id); if(n) return {project:p,node:n}; }
    return null;
  }
  function pageById(id){ const x=nodeById(id); return x?.node.type==='page' ? x.node : null; }
  function children(project,parentId){ return project.nodes.filter(n=>n.parentId===parentId).sort((a,b)=>(a.order??0)-(b.order??0)); }
  function pageList(){ return state.documents.flatMap(p=>p.nodes.filter(n=>n.type==='page').map(n=>({project:p,page:n}))); }
  function selectedContext(){ return selectedTreeNode ? nodeById(selectedTreeNode) : {project:activeDocument(),node:null}; }

  function uniqueTreeName(base,names){
    const used=new Set(names.map(name=>String(name||'').trim().toLocaleLowerCase()));
    if(!used.has(base.toLocaleLowerCase()))return base;
    let suffix=2;
    while(used.has(`${base} ${suffix}`.toLocaleLowerCase()))suffix++;
    return `${base} ${suffix}`;
  }

  function pageDocumentKey(page){
    const sourcePath=String(page?.sourcePath||'').trim();
    return sourcePath?`path:${sourcePath.replace(/\//g,'\\').toLocaleLowerCase()}`:`page:${page?.id||''}`;
  }

  function samePageDocument(firstId,secondId){
    const first=pageById(firstId),second=pageById(secondId);
    return !!first&&!!second&&pageDocumentKey(first)===pageDocumentKey(second);
  }

  function loadedPageForPath(sourcePath){
    const normalized=String(sourcePath||'').trim().replace(/\//g,'\\').toLocaleLowerCase();
    if(!normalized)return null;
    return pageList().find(item=>String(item.page.sourcePath||'').trim().replace(/\//g,'\\').toLocaleLowerCase()===normalized)||null;
  }

  function showToast(text){
    refs.toast.textContent=text; refs.toast.classList.add('show');
    clearTimeout(showToast.t); showToast.t=setTimeout(()=>refs.toast.classList.remove('show'),1500);
  }

  function applyPreferences(){
    document.body.dataset.theme = state.preferences.theme || 'light';
    document.documentElement.style.setProperty('--ui-scale', state.preferences.scale || 1);
    $$('.theme-dark').forEach(e=>e.textContent=state.preferences.theme==='dark'?'✓':'');
    $$('.theme-light').forEach(e=>e.textContent=state.preferences.theme==='light'?'✓':'');
    const splashCheck=$('#prefSplashCheck');
    if(splashCheck)splashCheck.textContent=state.preferences.splash===false?'':'✓';
    sidebarWidth = state.preferences.sidebarWidth || 260;
    inspectorWidth = state.preferences.inspectorWidth || 290;
    splitRatio = state.layout?.splitRatio ?? 0.5;
    codeRatio = state.layout?.codeRatio ?? 0.5;
    usedPreviewRatio = state.layout?.usedPreviewRatio ?? 0.42;
    inspectorPreviewEnabled = true;
    state.preferences.inspectorPreview = true;
    updateWorkspaceColumns();
    updateInspectorEditControls();
    requestAnimationFrame(()=>['single','left','right','codePreview'].forEach(slot=>applyPreviewScrollbarCompensation(slot)));
  }

  function updateWorkspaceColumns(){
    refs.workspace.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
    refs.workspace.style.setProperty('--inspector-width', `${inspectorWidth}px`);
    $('#splitView')?.style.setProperty('--split-left', `${Math.round(splitRatio*10000)/100}%`);
    $('#codeView')?.style.setProperty('--code-preview-width', `${Math.round(codeRatio*10000)/100}%`);
    document.querySelector('.sidebar')?.style.setProperty('--left-top-height',`${(state.layout?.leftTopRatio??leftTopRatio)*100}%`);
    renderUsedPreviewLayout();

    if(state.preferences.inspectorCollapsed){
      refs.workspace.classList.add('inspector-collapsed');
    }else{
      refs.workspace.classList.remove('inspector-collapsed');
    }
    refs.workspace.classList.toggle('sidebar-collapsed',!!state.preferences.sidebarCollapsed);
    refs.sidebarToggleTop?.classList.toggle('is-collapsed',!!state.preferences.sidebarCollapsed);
    refs.sidebarToggleTop?.setAttribute('aria-expanded',String(!state.preferences.sidebarCollapsed));
    if(refs.sidebarToggleTop){
      refs.sidebarToggleTop.title=state.preferences.sidebarCollapsed?'Show left panel':'Hide left panel';
      refs.sidebarToggleTop.setAttribute('aria-label',refs.sidebarToggleTop.title);
    }
    refs.inspectorToggleTop?.classList.toggle('is-collapsed',!!state.preferences.inspectorCollapsed);
    refs.inspectorToggleTop?.setAttribute('aria-expanded',String(!state.preferences.inspectorCollapsed));
    if(refs.inspectorToggleTop){
      refs.inspectorToggleTop.title=state.preferences.inspectorCollapsed?'Show Inspector':'Hide Inspector';
      refs.inspectorToggleTop.setAttribute('aria-label',refs.inspectorToggleTop.title);
    }
  }

  // ----- Main menus -----
  function closeAllMenus(){
    $$('.menu').forEach(menu=>menu.classList.remove('open'));
  }

  $$('.menu-trigger').forEach(button=>{
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();

      const menu=button.closest('.menu');
      const shouldOpen=!menu.classList.contains('open');
      closeAllMenus();

      if(shouldOpen){
        menu.classList.add('open');
        if(button.textContent.trim()==='File') renderRecentMenu();
      }
    });
  });

  // Important: popup click propagation is intentionally stopped here, so
  // every command is bound DIRECTLY below instead of relying on #mainMenu delegation.
  $$('.menu-popup,.submenu-popup').forEach(popup=>{
    popup.addEventListener('click',event=>event.stopPropagation());
  });

  document.addEventListener('pointerdown',event=>{
    if(!event.target.closest('.menu')) closeAllMenus();
  });

  async function runMenuAction(action,button){
    if(button?.disabled) return;
    try{
      button?.setAttribute('aria-busy','true');
      await handleAction(action);
    }catch(error){
      console.error(`Menu action failed: ${action}`,error);
      showToast(`Action failed: ${error?.message || action}`);
    }finally{
      button?.removeAttribute('aria-busy');
      closeAllMenus();
    }
  }

  $$('[data-action]').forEach(button=>{
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      runMenuAction(button.dataset.action,button);
    });
  });

  $$('[data-pref-scale]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.preferences.scale=Number(button.dataset.prefScale);
      applyPreferences(); persist(); closeAllMenus();
    });
  });
  $$('[data-pref-theme]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.preferences.theme=['dark','light'].includes(button.dataset.prefTheme)?button.dataset.prefTheme:'light';
      applyPreferences(); persist(); closeAllMenus();
    });
  });
  $$('[data-pref-splash]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.preferences.splash=state.preferences.splash===false;
      applyPreferences(); persist(); closeAllMenus();
      showToast(state.preferences.splash?'The splash screen will open at startup':'The splash screen stays closed at startup');
    });
  });

  async function handleAction(action){
    switch(action){
      case 'new-project': return newProject();
      case 'new-page': return newPage();
      case 'new-document': return newDocument();
      case 'save-page': return savePage(false);
      case 'save-page-as': return savePage(true);
      case 'open-project': return openLeafProject();
      case 'save-project': return saveLeafProject(false);
      case 'save-project-as': return saveLeafProject(true);
      case 'open-leaf-project': return openLeafProject();
      case 'save-leaf-project': return saveLeafProject(false);
      case 'save-leaf-project-as': return saveLeafProject(true);
      case 'import': return importPages();
      case 'export': return exportHtml();
      case 'jira-export': return openJiraExportDialog('rich');
      case 'copy-jira': return copyCurrentPageForJira();
      case 'copy-markdown': return copyCurrentPageAsMarkdown();
      case 'export-adf': return exportCurrentPageAdf();
      case 'undo': return undo();
      case 'redo': return redo();
      case 'extract-fonts': return openFontExportDialog();
      case 'about': return openAboutDialog();
      case 'splash': return openSplash();
      case 'connect-github': return openGithubModal();
      case 'connect-drive': return openDriveModal();
      default: throw new Error(`Unknown menu action: ${action}`);
    }
  }

  function renderRecentMenu(){
    const element=$('#recentMenu');
    const recent=state.recent||[];

    element.innerHTML=recent.length
      ? recent.map((item,index)=>`
          <button type="button" data-recent="${index}" title="${esc(item.filePath||'')}">
            <span>${esc(item.name)}</span>
          </button>`).join('')
      : `<button type="button" disabled><span>No recent Leaf projects</span></button>`;

    element.querySelectorAll('[data-recent]').forEach(button=>{
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();

        const item=recent[Number(button.dataset.recent)];
        if(!item) return;
        openRecentItem(item);
      });
    });
  }

  // Both the Recent submenu and the splash screen open a recent project, so
  // they share one implementation - two copies is how one of them quietly
  // stops matching the other.
  function openRecentItem(item){
    if(!item) return;
    withUnsavedInspectorGuard(async()=>{
      try{
        const loaded=state.documents.find(project=>project.filePath===item.filePath);
        if(loaded){
          focusDocument(loaded);
          addRecent(item.filePath,loaded.name);
          renderAll(); persist();
          showToast('Recent document selected');
        }else{
          const result=await window.electronAPI.readProjectPath(item.filePath);
          loadLeafProjectPayload(result.project,result.filePath);
          showToast('Recent Leaf project opened');
        }
      }catch(error){
        console.error('Recent project open failed',error);
        state.recent=state.recent.filter(entry=>entry.filePath!==item.filePath);
        persist();
        renderRecentMenu();
        renderSplash();
        showToast('Recent project is no longer available');
      }finally{
        closeAllMenus();
      }
    });
  }

  // ----- Project / Documents / Pages -----
  function documentSerializable(project){
    const p=clone(project); return p;
  }

  function leafProjectSerializable(){
    return {format:'leaf-project',version:'0.5.16',name:state.projectName||'Leaf Project',documents:clone(state.documents)};
  }

  function loadLeafProjectPayload(payload,filePath){
    setHtmlEditEnabled(false);
    const documents=Array.isArray(payload?.documents)?payload.documents:(Array.isArray(payload?.projects)?payload.projects:null);
    if(documents&&(payload?.format==='leaf-project'||payload?.format==='leaf-document'||Array.isArray(payload?.documents))){
      const normalized=normalizeState({...createDefaultState(),documents:clone(documents),projectName:String(payload.name||'Leaf Project')});
      state.documents=normalized.documents;state.projectName=normalized.projectName;state.projectFilePath=filePath;
      state.selectedDocumentId=state.documents[0]?.id||null;focusDocument(state.documents[0]||null);repairViews();clearInspector();addRecent(filePath,state.projectName);renderAll();persist();return;
    }
    addLoadedDocument(payload,filePath);
  }

  async function openLeafProject(){
    withUnsavedInspectorGuard(async()=>{
      try{const result=await window.electronAPI.openProject();if(!result)return;loadLeafProjectPayload(result.project,result.filePath);showToast('Leaf project opened');}
      catch(error){console.error('Leaf project open failed',error);showToast(`Open failed: ${error.message}`);}
    });
  }

  async function saveLeafProject(forceAs){
    try{
      const payload=leafProjectSerializable();
      const requiresPrjPath=!/\.prj$/i.test(state.projectFilePath||'');
      const filePath=forceAs||!state.projectFilePath||requiresPrjPath
        ?await window.electronAPI.saveProjectAs({suggestedName:`${exportSafeName(state.projectName||'project')}.prj`,project:payload})
        :await window.electronAPI.saveProject({filePath:state.projectFilePath,project:payload});
      if(!filePath)return false;
      state.projectFilePath=filePath;state.projectName=filePath.split(/[\\/]/).pop().replace(/\.(?:prj|leaf)$/i,'')||state.projectName;
      addRecent(filePath,state.projectName);renderAll();persist();showToast('Leaf project saved');return true;
    }catch(error){console.error('Leaf project save failed',error);showToast(`Save failed: ${error.message}`);return false;}
  }

  function isNodeInActiveViewport(nodeId){
    return !!nodeId && nodeId===currentActivePageId();
  }

  function activePageSlot(){
    return state.mode==='preview'?'single':state.mode==='split'?activeSlots.split:(activeSlots.code==='preview'?'codePreview':'codePage');
  }

  function newProject(){
    withUnsavedInspectorGuard(()=>{
      openModal('New Project','Create a new Project saved as a .prj file.','Project name','Untitled Project',name=>{
        setHtmlEditEnabled(false);
        const fresh=createDefaultState();
        state.projectName=name;
        state.projectFilePath=null;
        state.documents=fresh.documents;
        state.selectedDocumentId=fresh.selectedDocumentId;
        state.views=fresh.views;
        state.mode='preview';
        activeSlots={split:'left',code:'preview'};
        state.activeSlots=activeSlots;
        selectedTreeNode=fresh.selectedTreeNode;
        clearInspector();activateLeftTab('project');renderAll();persist();showToast('New project created');
      });
    });
  }

  function newPage(){
    withUnsavedInspectorGuard(()=>{
      const project=activeDocument();
      if(!project){showToast('Create or select a document first');return;}
      const context=selectedContext();
      const parentId=context.project?.id===project.id&&context.node?context.node.id:null;
      const name=uniqueTreeName('New Page',children(project,parentId).map(node=>node.name));
      // Same scaffold the tree's New HTML Page uses - Ctrl+Shift+N must not be
      // the one path that still lands you on a blank, uneditable Page.
      const source=NEW_PAGE_TYPES.html.template(name);
      const page={
        id:uid('page'),type:'page',name,fileName:`${exportSafeName(name)}.${NEW_PAGE_TYPES.html.extension}`,documentType:'html',
        parentId,order:children(project,parentId).length,source,loadedSource:source,baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:!source.trim()
      };
      project.nodes.push(page);project.expanded=true;state.selectedDocumentId=project.id;selectedTreeNode=page.id;
      if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
      bindPageToSlot(activePageSlot(),page.id);
      clearInspector();activateLeftTab('project');renderAll();persist();showToast('New page created');
    });
  }

  async function newDocument(){
    withUnsavedInspectorGuard(()=>{
      const pageId=uid('page');
      const name=uniqueTreeName('New Document',state.documents.map(document=>document.name));
      const project={
        id:uid('document'),
        name,
        color:'#5873d4',
        filePath:null,
        expanded:true,
        nodes:[{
           id:pageId,type:'page',name:'Empty Page',fileName:'untitled.html',documentType:'html',
           parentId:null,order:0,source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true
        }]
      };

      state.documents=[...state.documents,project];
      state.selectedDocumentId=project.id;
      selectedTreeNode=pageId;
      state.views.single=pageId;
      state.views.left=pageId;
      state.views.right=pageId;
      state.views.codePreview=pageId;
      state.views.codePage=pageId;

      clearInspector();
      activateLeftTab('project');
      renderAll();
      persist();
      showToast('New document created');
    });
  }

  function focusDocument(project){
    if(!project) return;
    state.selectedDocumentId=project.id;
    const firstPage=project.nodes?.find(node=>node.type==='page')||null;
    selectedTreeNode=firstPage?.id||null;

    if(firstPage){
      state.views.single=firstPage.id;
      state.views.left=firstPage.id;
      state.views.right=firstPage.id;
      state.views.codePreview=firstPage.id;
      state.views.codePage=firstPage.id;
    }
    clearInspector();
  }

  async function saveProject(forceAs){
    const project=activeDocument();
    if(!project){
      showToast('No document selected');
      return false;
    }

    return new Promise(resolve=>{
      withUnsavedInspectorGuard(async()=>{
        try{
          if(forceAs || !project.filePath){
            const filePath=await window.electronAPI.saveProjectAs({
              suggestedName:`${project.name||'document'}.hbeproj`,
              project:documentSerializable(project)
            });
            if(!filePath){ resolve(false); return; }
            project.filePath=filePath;
          }else{
            await window.electronAPI.saveProject({
              filePath:project.filePath,
              project:documentSerializable(project)
            });
          }

          addRecent(project.filePath,project.name);
          persist();
          renderAll();
          showToast(forceAs?'Document saved as new file':'Document saved');
          resolve(true);
        }catch(error){
          console.error('Document save failed',error);
          showToast(`Save failed: ${error.message}`);
          resolve(false);
        }
      });
    });
  }

  function pageFormatKey(page){
    return page?.documentType==='markdown'?'markdown':page?.documentType==='json'?'json':page?.documentType==='xml'?'xml':page?.documentType==='pdf'?'pdf':page?.documentType==='image'?'image':'html';
  }

  function openSavePageAsDialog(){
    const page=pageById(currentActivePageId());
    if(!page){showToast('Select a page first');return false;}
    [...refs.savePageAsFormat.options].forEach(option=>{option.disabled=isBinaryPage(page)&&option.value!==page.documentType;});
    refs.savePageAsFormat.value=pageFormatKey(page);
    refs.savePageAsModal.classList.add('show');
    setTimeout(()=>refs.savePageAsFormat.focus(),0);
    return true;
  }

  function closeSavePageAsDialog(){refs.savePageAsModal.classList.remove('show');}

  function cleanRuntimeHtmlForExport(html){
    const doc=new DOMParser().parseFromString(String(html||''),'text/html');
    window.SourceFidelity?.stripEditorArtifactsFromDocument?.(doc);
    doc.querySelectorAll('script[data-hbe-export-bridge],style[data-hbe-search-style],meta[name="hbe-render-token"]').forEach(node=>node.remove());
    return `<!doctype html>${doc.documentElement.outerHTML}`;
  }

  async function pageExportSource(page,format){
    if(page.documentType==='pdf'){
      if(format!=='pdf')throw new Error('PDF Pages can only be saved as PDF.');
      return {source:'',sourcePath:page.sourcePath,baseUrl:page.baseUrl||null};
    }
    if(format==='html'){
      if(page.documentType==='html')return {source:page.source||'',baseUrl:page.baseUrl||null};
      return {source:buildPreviewSource(page,{allowScripts:false}),baseUrl:page.baseUrl||null};
    }
    if(format==='markdown'){
      if(page.documentType==='markdown')return {source:page.source||'',baseUrl:page.baseUrl||null};
      if(page.documentType==='json')return {source:`\`\`\`json\n${page.source||''}\n\`\`\``,baseUrl:null};
      if(page.documentType==='xml')return {source:`\`\`\`xml\n${page.source||''}\n\`\`\``,baseUrl:null};
      const payload=await htmlForSemanticExport(page);
      const semantic=window.SemanticDocument.fromHtml(payload.html,{baseUrl:page.baseUrl||null,title:page.name||page.fileName||'',sourceKind:payload.sourceKind});
      return {source:window.JiraExport.toMarkdown(semantic),baseUrl:null};
    }
    if(format==='json'){
      if(page.documentType==='json')return {source:page.source||'',baseUrl:null};
      return {source:JSON.stringify({format:'leaf-page-source',version:1,name:page.name||'',sourceType:page.documentType||'html',source:page.source||''},null,2),baseUrl:null};
    }
    if(format==='pdf'){
      if(page.documentType==='html'){
        const payload=await htmlForSemanticExport(page);
        return {source:payload.sourceKind==='source'?payload.html:cleanRuntimeHtmlForExport(payload.html),baseUrl:page.baseUrl||null};
      }
      return {source:buildPreviewSource(page,{allowScripts:false}),baseUrl:page.baseUrl||null};
    }
    throw new Error('Unsupported Page format.');
  }

  async function savePageAsFormat(format){
    const page=pageById(currentActivePageId());
    if(!page){showToast('Select a page first');return false;}
    const normalized=['html','markdown','json','xml','pdf'].includes(format)?format:null;
    if(!normalized)throw new Error('Unsupported Page format.');
    const extension={html:'html',markdown:'md',json:'json',pdf:'pdf'}[normalized];
    const base=exportSafeName((page.fileName||page.name||'page').replace(/\.(?:html?|md|markdown|json|xml|pdf)$/i,''));
    const payload=await pageExportSource(page,normalized);
    const filePath=await window.electronAPI.exportPageAs({
      format:normalized,suggestedName:`${base}.${extension}`,source:payload.source,
      sourcePath:payload.sourcePath||null,sourceType:page.documentType,baseUrl:payload.baseUrl||null
    });
    if(!filePath)return false;
    const sameFormat=normalized===pageFormatKey(page);
    if(sameFormat){
      page.sourcePath=filePath;page.fileName=filePath.split(/[\\/]/).pop()||page.fileName;
      if(page.documentType==='pdf')page.previewUrl=`file:///${String(filePath).replace(/\\/g,'/')}`;
      else page.loadedSource=page.source;
      renderAll();persist();
    }
    showToast(sameFormat?'Page saved as new file':`Page exported as ${normalized==='markdown'?'Markdown':normalized.toUpperCase()}`);
    return true;
  }

  async function savePage(forceAs){
    if(forceAs)return openSavePageAsDialog();
    const page=pageById(currentActivePageId());
    if(!page){showToast('Select a page first');return false;}
    if(isBinaryPage(page)&&!forceAs){showToast(`${page.documentType==='pdf'?'PDF':'Image'} pages are read-only. Use Save As to copy the file.`);return false;}
    if(page.remote?.driveId)return saveDrivePage(page);
    if(page.remote?.path&&githubProjectFor(page))return openGithubCommitDialog(page);
    return new Promise(resolve=>{
      withUnsavedInspectorGuard(async()=>{
        try{
          let filePath=null;
          if(isBinaryPage(page)){
            filePath=await window.electronAPI.copyDocumentAs({sourcePath:page.sourcePath,suggestedName:page.fileName||`${page.name}.${page.documentType==='pdf'?'pdf':'png'}`});
          }else if(isDirectSourceType(page)){
            const text=TEXT_PAGE_SAVE[page.documentType]||TEXT_PAGE_SAVE.markdown;
            const extension=page.documentType==='markdown'&&/\.markdown$/i.test(page.fileName||'')?'markdown':text.extension;
            filePath=forceAs||!page.sourcePath
              ?await window.electronAPI.exportText({title:text.title,suggestedName:page.fileName||`${page.name}.${text.extension}`,extension,source:page.source})
              :await window.electronAPI.saveTextPath({filePath:page.sourcePath,source:page.source});
          }else{
            filePath=forceAs||!page.sourcePath
              ?await window.electronAPI.exportHtml({suggestedName:page.fileName||`${page.name}.html`,source:page.source})
              :await window.electronAPI.saveHtmlPath({filePath:page.sourcePath,source:page.source});
          }
          if(!filePath){resolve(false);return;}
          page.sourcePath=filePath;
          page.fileName=filePath.split(/[\\/]/).pop()||page.fileName;
          if(page.documentType==='pdf')page.previewUrl=`file:///${String(filePath).replace(/\\/g,'/')}`;
          else page.loadedSource=page.source;
          renderAll();persist();showToast(forceAs?'Page saved as new file':'Page saved');resolve(true);
        }catch(error){console.error('Page save failed',error);showToast(`Save failed: ${error.message}`);resolve(false);}
      });
    });
  }

  function addRecent(filePath,name){
    state.recent=state.recent||[];
    state.recent=state.recent.filter(r=>r.filePath!==filePath);
    state.recent.unshift({filePath,name});
    state.recent=state.recent.slice(0,8);
  }

  function addLoadedDocument(project,filePath){
    const loadedProject=clone(project);
    loadedProject.id=uid('document');
    loadedProject.filePath=filePath;

    const remap=new Map();
    loadedProject.nodes=(loadedProject.nodes||[]).map(node=>{
      const oldId=node.id;
      const newId=uid(node.type);
      remap.set(oldId,newId);
      return {...node,id:newId};
    });
    loadedProject.nodes.forEach(node=>{
      if(node.parentId) node.parentId=remap.get(node.parentId)||null;
    });

    state.documents.push(loadedProject);
    focusDocument(loadedProject);
    addRecent(filePath,loadedProject.name);
    renderAll();
    persist();
  }

  async function addPageResultToDocument(result, targetSlot=null, targetProject=null, targetParentId=undefined){
    if(!result) return null;
    let {project,node}=selectedContext(); project=project||activeDocument();
    if(targetProject)project=targetProject;
    if(!project){
      project={id:uid('document'),name:'New Document',color:'#395a88',filePath:null,expanded:true,nodes:[]};
      state.documents.push(project); state.selectedDocumentId=project.id;
    }

    const slot=targetSlot || activePageSlot();
    const alreadyLoaded=loadedPageForPath(result.filePath);
    if(alreadyLoaded){
      state.selectedDocumentId=alreadyLoaded.project.id;
      selectedTreeNode=alreadyLoaded.page.id;
      bindPageToSlot(slot,alreadyLoaded.page.id);
      renderAll();persist();showToast('This document is already open. Focused the existing Page.');
      return alreadyLoaded.page;
    }
    const slotPage=pageById(state.views[slot]);

    // Drag & Drop onto an Empty Page fills that placeholder instead of creating another Page.
    if(targetSlot && slotPage && (slotPage.isEmpty || !(slotPage.source||'').trim())){
      const slotOwner=nodeById(slotPage.id);
      if(slotOwner){
        project=slotOwner.project;
        slotPage.name=result.title;
        slotPage.fileName=result.fileName;
        slotPage.source=result.source||'';
        slotPage.loadedSource=result.loadedSource??result.source??'';
        slotPage.baseUrl=result.baseUrl;
        slotPage.sourcePath=result.filePath;
        slotPage.previewUrl=result.previewUrl||null;
        slotPage.documentType=result.documentType||'html';
        slotPage.initialSnapshotPath=result.initialSnapshotPath||null;
        slotPage.isEmpty=false;
        state.selectedDocumentId=project.id;
        selectedTreeNode=slotPage.id;
        renderAll(); persist(); showToast('Page loaded into Empty Page');
        return slotPage;
      }
    }

    const inferredParent=node?.type==='group' && nodeById(node.id)?.project.id===project.id ? node.id : (nodeById(node?.id)?.project.id===project.id?node?.parentId||null:null);
    const parentId=targetParentId===undefined?inferredParent:targetParentId;
    const page={id:uid('page'),type:'page',name:result.title,fileName:result.fileName,documentType:result.documentType||'html',parentId,order:children(project,parentId).length,source:result.source||'',loadedSource:result.loadedSource??result.source??'',baseUrl:result.baseUrl,sourcePath:result.filePath,previewUrl:result.previewUrl||null,initialSnapshotPath:result.initialSnapshotPath||null,isEmpty:false};
    project.nodes.push(page); state.selectedDocumentId=project.id; selectedTreeNode=page.id;
    bindPageToSlot(slot,page.id);
    renderAll(); persist(); showToast('Page loaded');
    return page;
  }

  const addHtmlResultToDocument=addPageResultToDocument;

  async function importPages(){
    withUnsavedInspectorGuard(async()=>{
      try{
        const results=await window.electronAPI.importPages();
        if(!results?.length) return;
        for(const result of results)await addPageResultToDocument(result);
        showToast(`${results.length} page${results.length===1?'':'s'} imported`);
      }catch(error){
        console.error('Page import failed',error);
        showToast(`Import failed: ${error.message}`);
      }
    });
  }

  const importHtml=importPages;

  async function exportHtml(){
    withUnsavedInspectorGuard(async()=>{
      const page=pageById(currentActivePageId());
      if(!page) return showToast('Select a page first');
      if(page.isEmpty || !(page.source||'').trim()) return showToast('Current page is empty');

      try{
        const filePath=await window.electronAPI.exportHtml({
          suggestedName:page.fileName||`${page.name}.html`,
          source:page.source
        });
        if(filePath){page.sourcePath=filePath;page.loadedSource=page.source;persist();showToast('HTML exported');}
      }catch(error){
        console.error('HTML export failed',error);
        showToast(`Export failed: ${error.message}`);
      }
    });
  }

  // ----- Tree -----
  function treeSubtreeIds(project,rootId){
    const ids=new Set([rootId]);
    let changed=true;
    while(changed){changed=false;project.nodes.forEach(node=>{if(node.parentId&&ids.has(node.parentId)&&!ids.has(node.id)){ids.add(node.id);changed=true;}});}
    return ids;
  }

  function normalizeTreeOrders(project,parentId){
    children(project,parentId).forEach((node,index)=>{node.order=index;});
  }

  function clearDocumentTreeDropFeedback(){
    $$('.tree-row').forEach(row=>row.classList.remove('drop-before','drop-after','drop-inside','tree-dragging'));
    $$('.document-card').forEach(card=>card.classList.remove('drop-before','import-target'));
  }

  function isSupportedDocumentFile(file){return !!file&&/\.(html?|md|markdown|json|xml|pdf|png|jpe?g|webp|gif|svg)$/i.test(file.name||'');}

  async function importDroppedPages(event,project,parentId=null){
    const files=[...(event.dataTransfer?.files||[])].filter(isSupportedDocumentFile);
    if(!files.length){showToast('Drop HTML, Markdown, JSON, XML, PDF, or image pages');return;}
    try{
      for(const file of files){
        const result=await window.electronAPI.readDroppedPage(file);
        await addPageResultToDocument(result,null,project,parentId);
      }
      showToast(`${files.length} page${files.length===1?'':'s'} imported into ${project.name}`);
    }catch(error){console.error('Document page drop failed',error);showToast(`Import failed: ${error.message}`);}
  }

  function moveDocumentTreeNode(payload,targetProject,targetNode,mode='inside'){
    const sourceProject=documentById(payload?.documentId||payload?.projectId);
    const moving=sourceProject?.nodes.find(node=>node.id===payload?.nodeId);
    if(!sourceProject||!moving||!targetProject)return false;
    const subtreeIds=treeSubtreeIds(sourceProject,moving.id);
    if(targetNode && sourceProject===targetProject && subtreeIds.has(targetNode.id)) return false;

    const oldParentId=moving.parentId||null;
    const movedNodes=sourceProject.nodes.filter(node=>subtreeIds.has(node.id));
    sourceProject.nodes=sourceProject.nodes.filter(node=>!subtreeIds.has(node.id));
    if(sourceProject!==targetProject) targetProject.nodes.push(...movedNodes);
    else sourceProject.nodes.push(...movedNodes);

    const parentId=mode==='inside'?(targetNode?.id||null):(targetNode?.parentId||null);
    moving.parentId=parentId;
    normalizeTreeOrders(sourceProject,oldParentId);

    const siblings=children(targetProject,parentId).filter(node=>node.id!==moving.id);
    let index=siblings.length;
    if(targetNode && mode!=='inside'){
      const targetIndex=siblings.findIndex(node=>node.id===targetNode.id);
      index=Math.max(0,targetIndex+(mode==='after'?1:0));
    }
    siblings.splice(index,0,moving);
    siblings.forEach((node,order)=>{node.order=order;});
    state.selectedDocumentId=targetProject.id;selectedTreeNode=moving.id;
    renderAll();persist();showToast('Tree object moved');
    return true;
  }

  function openTreeAddMenu(project,node,button){
    const rect=button.getBoundingClientRect();
    treeAddTarget={documentId:project.id,nodeId:node?.id||null};
    state.selectedDocumentId=project.id;selectedTreeNode=node?.id||null;
    renderTree();persist();
    refs.treeAddMenu.hidden=false;
    refs.treeAddMenu.style.left=`${Math.min(window.innerWidth-190,rect.right+4)}px`;
    refs.treeAddMenu.style.top=`${Math.min(window.innerHeight-70,rect.top)}px`;
    refs.treeAddMenu.querySelector('button')?.focus();
  }

  function projectTreeSearchContext(project){
    const query=String(refs.projectSearch?.value||'').trim().toLocaleLowerCase();
    if(!query)return{query:'',projectMatch:false,visible:null};
    const projectMatch=String(project.name||'').toLocaleLowerCase().includes(query);
    const matches=new Set(project.nodes.filter(node=>[
      node.name,node.fileName,node.documentType,node.sourcePath
    ].some(value=>String(value||'').toLocaleLowerCase().includes(query))).map(node=>node.id));
    const visible=new Set(matches);
    matches.forEach(id=>{
      let current=project.nodes.find(node=>node.id===id);
      while(current?.parentId){visible.add(current.parentId);current=project.nodes.find(node=>node.id===current.parentId);}
    });
    return{query,projectMatch,visible};
  }

  const DIRECT_SOURCE_LABEL={markdown:'Markdown',json:'JSON',xml:'XML'};
  const TEXT_PAGE_SAVE={
    markdown:{title:'Save Markdown Page',extension:'md'},
    json:{title:'Save JSON Page',extension:'json'},
    xml:{title:'Save XML Page',extension:'xml'}
  };
  const VIEW_CHIPS=[
    {slot:'single',letter:'P',title:'Loaded in Preview'},
    {slot:'left',letter:'L',title:'Loaded in Compare left'},
    {slot:'right',letter:'R',title:'Loaded in Compare right'},
    {slot:'codePreview',letter:'V',title:'Loaded in Code preview'},
    {slot:'codePage',letter:'C',title:'Loaded in the Code editor'}
  ];
  // Only the Views the current mode actually puts on screen. repairViews binds
  // every slot to the first Page whenever one is unset, so without this filter a
  // single Page reported five bindings - including Compare and Code slots that
  // are not displaying anything - and those phantom chips crowded out the name.
  const MODE_CHIP_SLOTS={preview:['single'],split:['left','right'],code:['codePreview','codePage']};
  function chipSlotsForCurrentMode(){ return MODE_CHIP_SLOTS[state.mode]||MODE_CHIP_SLOTS.preview; }

  function renderTree(){
    refs.tree.innerHTML='';
    state.documents.forEach((project)=>{
      const search=projectTreeSearchContext(project);
      if(search.query&&!search.projectMatch&&!search.visible.size)return;
      const card=document.createElement('div');
      card.className='document-card';
      card.dataset.documentId=project.id;
      card.style.setProperty('--document-color', project.color || '#395a88');

      const row=document.createElement('div');
      row.className=`tree-row document ${state.selectedDocumentId===project.id && !selectedTreeNode?'selected':''}`;
      row.dataset.documentId=project.id; row.dataset.depth=0; row.draggable=true;
      row.innerHTML=`<span class="twisty">${project.expanded!==false?'▾':'▸'}</span><span class="document-swatch" style="background:${project.color}" title="Change document color"></span><span class="label">${esc(project.name)}</span><button class="tree-row-add" type="button" title="New Page or Section">＋</button>`;
      row.onclick=e=>{
        if(e.target.closest('.tree-row-add'))return;
        refs.tree.focus({preventScroll:true});
        if(e.target.classList.contains('document-swatch')){e.stopPropagation();activeDocumentForColor=project.id;refs.colorPicker.value=project.color;refs.colorPicker.click();return;}
        withUnsavedInspectorGuard(()=>{
          state.selectedDocumentId=project.id;
          selectedTreeNode=null;
          project.expanded=project.expanded===false;
          clearInspector();
          renderTree();
          renderCrumbs();
          persist();
        });
      };
      row.querySelector('.tree-row-add').onclick=e=>{e.preventDefault();e.stopPropagation();openTreeAddMenu(project,null,e.currentTarget);};
      row.oncontextmenu=e=>{
        e.preventDefault();
        refs.tree.focus({preventScroll:true});
        withUnsavedInspectorGuard(()=>{
          state.selectedDocumentId=project.id;selectedTreeNode=null;clearInspector();renderTree();openContextMenu(e.clientX,e.clientY);persist();
        });
      };
      row.ondragstart=e=>{e.dataTransfer.setData('text/leaf-document-id',project.id);row.classList.add('dragging');};
      row.ondragend=()=>{$$('.tree-row.document').forEach(x=>x.classList.remove('dragging'));$$('.document-card').forEach(x=>x.classList.remove('drop-before'));};
      card.ondragover=e=>{
        if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';card.classList.add('import-target');return;}
        if(e.dataTransfer.types.includes('application/x-hbe-tree-node')){e.preventDefault();row.classList.add('drop-inside');return;}
        if(e.dataTransfer.types.includes('text/leaf-document-id')){e.preventDefault();card.classList.add('drop-before');}
      };
      card.ondragleave=()=>card.classList.remove('drop-before','import-target');
      card.ondrop=e=>{
        if(e.dataTransfer.files?.length){e.preventDefault();e.stopPropagation();clearDocumentTreeDropFeedback();importDroppedPages(e,project,null);return;}
        const treeRaw=e.dataTransfer.getData('application/x-hbe-tree-node');
        if(treeRaw){e.preventDefault();let payload=null;try{payload=JSON.parse(treeRaw)}catch{}clearDocumentTreeDropFeedback();moveDocumentTreeNode(payload,project,null,'inside');return;}
        const dragged=e.dataTransfer.getData('text/leaf-document-id'); if(!dragged||dragged===project.id)return;
        e.preventDefault(); const from=state.documents.findIndex(p=>p.id===dragged),to=state.documents.findIndex(p=>p.id===project.id);
        const [moved]=state.documents.splice(from,1); state.documents.splice(to,0,moved); renderTree(); persist();
      };
      card.appendChild(row);
      if(project.expanded!==false||search.query) walkTree(project,null,1,card,search);
      refs.tree.appendChild(card);
    });
    if(!refs.tree.children.length&&refs.projectSearch?.value.trim())refs.tree.innerHTML='<div class="used-component-empty">No matching documents.</div>';
    renderGroupTileView();
    emitLifecycle('leaf-tree-rendered',{});
  }

  refs.projectSearch?.addEventListener('input',renderTree);

  refs.tree.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  });
  refs.tree.addEventListener('drop',event=>{
    if(!event.dataTransfer?.files?.length)return;
    event.preventDefault();event.stopPropagation();
    const project=activeDocument();if(project)importDroppedPages(event,project,null);
  });

  function walkTree(project,parentId,depth,container,search=null){
    children(project,parentId).filter(node=>!search?.query||search.projectMatch||search.visible.has(node.id)).forEach(node=>{
      const row=document.createElement('div');
      row.className='tree-row';
      row.dataset.nodeId=node.id; row.dataset.depth=Math.min(depth,5);
      if(node.id===selectedTreeNode) row.classList.add('selected');
      // Chips carry the binding state. They live in one container rather than
      // five loose children: as direct children each chip also multiplied the
      // row's 6px gap, which squeezed the file name out of the row.
      const visibleChipSlots=chipSlotsForCurrentMode();
      const boundChips=VIEW_CHIPS.filter(chip=>visibleChipSlots.includes(chip.slot)&&node.id===state.views[chip.slot]);
      const chipMarkup=boundChips
        .map(chip=>`<span class="view-chip view-chip-${chip.slot}" title="${esc(chip.title)}">${chip.letter}</span>`).join('');
      // The group carries the full list as its own title. A narrow sidebar
      // clips the trailing chips, and a clipped chip cannot be hovered for its
      // own tooltip - so without this the binding would be silently invisible,
      // which is the defect the ::after chips had in the first place.
      const chipsTitle=boundChips.map(chip=>chip.title).join(' · ');
      const viewChips=chipMarkup?`<span class="view-chips" title="${esc(chipsTitle)}">${chipMarkup}</span>`:'';
      if(isNodeInActiveViewport(node.id)) row.classList.add('active-viewport-node');
      const hasChildren=children(project,node.id).length;
      row.draggable=true;
      const documentIcon=node.documentType==='pdf'?'PDF':node.documentType==='image'?'IMG':node.documentType==='markdown'?'MD':node.documentType==='json'?'{}':node.documentType==='xml'?'XML':'◇';
      row.innerHTML=`<span class="twisty">${hasChildren?(node.expanded!==false?'▾':'▸'):''}</span><span class="ico ${node.type==='page'?'page-kind':''}">${node.type==='group'?'▰':documentIcon}</span><span class="label">${esc(node.name)}</span>${viewChips}<button class="tree-row-add" type="button" title="Add child">＋</button>`;
      row.onclick=e=>{
        e.stopPropagation();
        if(e.target.closest('.tree-row-add'))return;
        refs.tree.focus({preventScroll:true});
        if(e.target.closest('.twisty')&&hasChildren){node.expanded=node.expanded===false;renderTree();persist();return;}
        if(node.type==='group'){
          withUnsavedInspectorGuard(()=>{
            state.selectedDocumentId=project.id;
            selectedTreeNode=node.id;
            clearInspector();
            renderAll();
            persist();
          });
          return;
        }
        selectPageFromTree(node.id);
      };
      row.querySelector('.tree-row-add').onclick=e=>{e.preventDefault();e.stopPropagation();openTreeAddMenu(project,node,e.currentTarget);};
      row.oncontextmenu=e=>{
        e.preventDefault();e.stopPropagation();
        refs.tree.focus({preventScroll:true});
        withUnsavedInspectorGuard(()=>{
          state.selectedDocumentId=project.id;selectedTreeNode=node.id;clearInspector();renderTree();openContextMenu(e.clientX,e.clientY);persist();
        });
      };
      row.ondragstart=e=>{
        if(e.target.closest('.tree-row-add')){e.preventDefault();return;}
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('application/x-hbe-tree-node',JSON.stringify({documentId:project.id,nodeId:node.id}));
        row.classList.add('tree-dragging');
      };
      row.ondragend=clearDocumentTreeDropFeedback;
      row.ondragover=e=>{
        if(!e.dataTransfer.types.includes('application/x-hbe-tree-node'))return;
        e.preventDefault();e.stopPropagation();
        clearDocumentTreeDropFeedback();
        const rect=row.getBoundingClientRect(),local=e.clientY-rect.top;
        row.classList.add(local<rect.height*.25?'drop-before':local>rect.height*.75?'drop-after':'drop-inside');
      };
      row.ondragleave=e=>{if(!row.contains(e.relatedTarget))row.classList.remove('drop-before','drop-after','drop-inside');};
      row.ondrop=e=>{
        const raw=e.dataTransfer.getData('application/x-hbe-tree-node');if(!raw)return;
        e.preventDefault();e.stopPropagation();
        const mode=row.classList.contains('drop-before')?'before':row.classList.contains('drop-after')?'after':'inside';
        let payload=null;try{payload=JSON.parse(raw)}catch{}
        clearDocumentTreeDropFeedback();moveDocumentTreeNode(payload,project,node,mode);
      };
      container.appendChild(row);
      if(hasChildren && (node.expanded!==false||search?.query)) walkTree(project,node.id,depth+1,container,search);
    });
  }

  refs.colorPicker.oninput=e=>{
    const p=documentById(activeDocumentForColor);if(p){p.color=e.target.value;renderTree();persist();}
  };

  function visibleTreeEntries(){
    return $$('.tree-row').map(r=>({el:r,documentId:r.dataset.documentId||null,nodeId:r.dataset.nodeId||null}));
  }
  refs.tree.addEventListener('keydown',e=>{
    const entries=visibleTreeEntries(); if(!entries.length)return;
    const modifier=e.ctrlKey||e.metaKey;
    if(e.key==='F2'){e.preventDefault();e.stopPropagation();renameSelected();return;}
    if(modifier&&e.key.toLowerCase()==='c'){e.preventDefault();e.stopPropagation();handleContext('copy');return;}
    if(modifier&&e.key.toLowerCase()==='v'){e.preventDefault();e.stopPropagation();handleContext('paste');return;}
    if(modifier&&!e.repeat&&e.key.toLowerCase()==='d'){e.preventDefault();e.stopPropagation();handleContext('duplicate');return;}
    if(e.key==='Delete'||e.key==='Del'){e.preventDefault();e.stopPropagation();deleteSelectedTree();return;}
    let idx=entries.findIndex(x=>x.nodeId===selectedTreeNode || (!selectedTreeNode&&x.documentId===state.selectedDocumentId)); if(idx<0)idx=0;
    if(e.key==='ArrowDown'){e.preventDefault();idx=Math.min(entries.length-1,idx+1);selectTreeEntry(entries[idx]);}
    if(e.key==='ArrowUp'){e.preventDefault();idx=Math.max(0,idx-1);selectTreeEntry(entries[idx]);}
    if(e.key==='ArrowRight'){
      const ctx=selectedContext();if(ctx.node?.type==='group'){ctx.node.expanded=true;renderTree();persist();}
      else if(!selectedTreeNode){const p=activeDocument();if(p){p.expanded=true;renderTree();persist();}}
    }
    if(e.key==='ArrowLeft'){
      const ctx=selectedContext();
      if(ctx.node?.type==='group'&&ctx.node.expanded!==false){ctx.node.expanded=false;renderTree();persist();}
      else if(ctx.node?.parentId){selectedTreeNode=ctx.node.parentId;renderTree();persist();}
      else if(selectedTreeNode){selectedTreeNode=null;renderTree();persist();}
      else {const p=activeDocument();if(p){p.expanded=false;renderTree();persist();}}
    }
    if(e.key==='Enter'){const p=pageById(selectedTreeNode);if(p)selectPageFromTree(p.id);}
  });
  function selectTreeEntry(entry){
    if(entry.documentId){
      withUnsavedInspectorGuard(()=>{
        state.selectedDocumentId=entry.documentId;
        selectedTreeNode=null;
        clearInspector();
        renderAll();
        persist();
        entry.el.scrollIntoView({block:'nearest'});
      });
      return;
    }

    if(entry.nodeId){
      const x=nodeById(entry.nodeId);
      if(x?.node.type==='page'){
        selectPageFromTree(entry.nodeId,true);
      }else if(x){
        withUnsavedInspectorGuard(()=>{
          state.selectedDocumentId=x.project.id;
          selectedTreeNode=entry.nodeId;
          clearInspector();
          renderAll();
          persist();
          entry.el.scrollIntoView({block:'nearest'});
        });
      }
    }
  }

  // ----- Context menu -----
  function openContextMenu(x,y){
    refs.ctx.hidden=false;
    refs.ctx.style.left=`${x}px`;
    refs.ctx.style.top=`${y}px`;
    const first=refs.ctx.querySelector('button:not(:disabled)');
    first?.focus();
  }
  document.addEventListener('click',()=>{refs.ctx.hidden=true;refs.treeAddMenu.hidden=true;});
  refs.ctx.onclick=e=>{const action=e.target.closest('[data-context]')?.dataset.context;if(action)handleContext(action);};
  refs.ctx.addEventListener('keydown',e=>{
    const items=[...refs.ctx.querySelectorAll('button:not(:disabled)')];
    const index=items.indexOf(document.activeElement);
    const modifier=e.ctrlKey||e.metaKey;
    if(e.key==='F2'){e.preventDefault();handleContext('rename');refs.ctx.hidden=true;return;}
    if(modifier&&e.key.toLowerCase()==='c'){e.preventDefault();handleContext('copy');refs.ctx.hidden=true;return;}
    if(modifier&&e.key.toLowerCase()==='v'){e.preventDefault();handleContext('paste');refs.ctx.hidden=true;return;}
    if(modifier&&!e.repeat&&e.key.toLowerCase()==='d'){e.preventDefault();handleContext('duplicate');refs.ctx.hidden=true;return;}
    if(e.key==='Delete'||e.key==='Del'){e.preventDefault();handleContext('delete');refs.ctx.hidden=true;return;}
    if(e.key==='Escape'){e.preventDefault();refs.ctx.hidden=true;refs.tree.focus();return;}
    if(e.key==='ArrowDown'){e.preventDefault();items[(index+1+items.length)%items.length]?.focus();}
    if(e.key==='ArrowUp'){e.preventDefault();items[(index-1+items.length)%items.length]?.focus();}
    if(e.key==='Enter' || e.key===' '){document.activeElement?.click();}
  });
  refs.treeAddMenu.onclick=e=>{
    const action=e.target.closest('[data-tree-add]')?.dataset.treeAdd;if(!action||!treeAddTarget)return;
    const project=documentById(treeAddTarget.documentId);const node=project?.nodes.find(item=>item.id===treeAddTarget.nodeId)||null;
    refs.treeAddMenu.hidden=true;
    if(action.startsWith('page'))addEmptyPage(project,node,{asChild:true,documentType:action.slice(5)||'html'});
    if(action==='group')addGroup(project,node,{asChild:true});
  };
  function handleContext(action){
    const ctx=selectedContext(); const project=ctx.project;if(!project)return;
    if(action==='rename') return renameSelected();
    if(action==='copy'){treeClipboard=ctx.node?cloneSubtree(project,ctx.node.id):clone(project);return showToast('Copied');}
    if(action==='paste') return pasteTree(project,ctx.node);
    if(action==='duplicate') return duplicateSelected();
    if(action==='delete') return deleteSelectedTree();
    if(action==='add-page') return addEmptyPage(project,ctx.node);
    if(action==='add-group') return addGroup(project,ctx.node);
  }

  function renameSelected(){
    const ctx=selectedContext();if(!ctx.project)return;
    const target=ctx.node||ctx.project;
    openModal('Rename','Rename selected object.','Name',target.name,name=>{target.name=name;renderAll();persist();});
  }
  function cloneSubtree(project,id){
    const root=project.nodes.find(n=>n.id===id);if(!root)return null;
    const ids=new Set([id]);let changed=true;
    while(changed){changed=false;project.nodes.forEach(n=>{if(n.parentId&&ids.has(n.parentId)&&!ids.has(n.id)){ids.add(n.id);changed=true;}});}
    return {kind:'nodes',nodes:project.nodes.filter(n=>ids.has(n.id)).map(clone),rootId:id};
  }
  function pasteTree(project,targetNode){
    if(!treeClipboard)return showToast('Clipboard is empty');
    if(treeClipboard.kind!=='nodes')return showToast('Only tree objects can be pasted here');
    const parentId=targetNode?.id||null;
    pasteNodeBundle(project,treeClipboard,parentId);
  }
  function pasteNodeBundle(project,bundle,parentId){
    const map=new Map();bundle.nodes.forEach(n=>map.set(n.id,uid(n.type)));
    const rootOld=bundle.rootId;
    bundle.nodes.forEach(n=>{
      const nn=clone(n);nn.id=map.get(n.id);
      if(n.id===rootOld)nn.parentId=parentId;else nn.parentId=map.get(n.parentId)||parentId;
      nn.name=n.id===rootOld?`${n.name} Copy`:n.name;project.nodes.push(nn);
    });
    selectedTreeNode=map.get(rootOld);state.selectedDocumentId=project.id;
    if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
    renderAll();persist();showToast('Pasted');
  }
  function duplicateSelected(){
    const ctx=selectedContext();if(!ctx.node)return showToast('Select a group or page');
    const bundle=cloneSubtree(ctx.project,ctx.node.id);pasteNodeBundle(ctx.project,bundle,ctx.node.parentId||null);
  }
  function deleteSelectedTree(){
    withUnsavedInspectorGuard(()=>{
      const ctx=selectedContext();if(!ctx.project)return;
      if(!ctx.node){
        if(state.documents.length<=1)return showToast('At least one document is required');
        state.documents=state.documents.filter(p=>p.id!==ctx.project.id);state.selectedDocumentId=state.documents[0]?.id;selectedTreeNode=null;
      }else{
        const bundle=cloneSubtree(ctx.project,ctx.node.id);const ids=new Set(bundle.nodes.map(n=>n.id));
        ctx.project.nodes=ctx.project.nodes.filter(n=>!ids.has(n.id));selectedTreeNode=null;
      }
      clearInspector();
      repairViews();renderAll();persist();
    });
  }
  // Templates for New Page. HTML gets a minimal doctype/head/body scaffold so the
  // Page renders and is editable the moment it exists; the text formats start
  // blank, because there is no equivalent of "valid but empty" to scaffold and a
  // blank Page is authorable on its own now.
  // A new Page opens straight into the preview, so the scaffold brings its own
  // baseline instead of the browser's: without one a new Page renders in Times
  // New Roman, edge to edge, which is the first thing anyone would have had to
  // undo. Custom properties keep it retheme-able from one block.
  // The scaffold commits to light rather than following prefers-color-scheme.
  // The author stares at this page inside light app chrome the whole time they
  // are writing it; a scaffold that flipped to dark on a dark-mode machine
  // would just be the same "first thing to undo" problem inverted. A dark
  // block over these same properties is a short paste when a Page wants one.
  // <main> is deliberate: WidgetRegistry.canContain accepts it, so a component
  // dropped from the palette lands inside the measured column rather than
  // full-bleed against the viewport edge.
  const NEW_PAGE_STYLES=[
    '      :root {',
    '        color-scheme: light;',
    '        --measure: 68ch;',
    '        --bg: #ffffff;',
    '        --fg: #1f2328;',
    '        --muted: #5b6570;',
    '        --rule: #d8dde3;',
    '        --link: #2f6fed;',
    '      }',
    '      *, *::before, *::after { box-sizing: border-box; }',
    '      body {',
    '        margin: 0;',
    '        background: var(--bg);',
    '        color: var(--fg);',
    '        font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;',
    '      }',
    '      main { max-width: var(--measure); margin: 0 auto; padding: 56px 24px 96px; }',
    '      h1, h2, h3, h4 { line-height: 1.25; margin: 2.2em 0 0.6em; font-weight: 600; }',
    '      h1 { margin-top: 0; font-size: 2.1rem; letter-spacing: -0.01em; }',
    '      h2 { font-size: 1.5rem; }',
    '      h3 { font-size: 1.2rem; }',
    '      p, ul, ol, blockquote, pre, figure, table { margin: 0 0 1.15em; }',
    '      a { color: var(--link); }',
    '      blockquote {',
    '        margin-left: 0;',
    '        padding-left: 1em;',
    '        border-left: 3px solid var(--rule);',
    '        color: var(--muted);',
    '      }',
    '      pre {',
    '        padding: 14px 16px;',
    '        border: 1px solid var(--rule);',
    '        border-radius: 6px;',
    '        overflow: auto;',
    '      }',
    '      code, pre { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.9em; }',
    '      img { max-width: 100%; height: auto; }',
    '      table { border-collapse: collapse; width: 100%; }',
    '      th, td {',
    '        border: 1px solid var(--rule);',
    '        padding: 8px 10px;',
    '        text-align: left;',
    '        vertical-align: top;',
    '      }',
    '      hr { border: 0; border-top: 1px solid var(--rule); margin: 2em 0; }',
    '      @media (max-width: 640px) { main { padding: 32px 18px 64px; } }'
  ];

  const NEW_PAGE_TYPES={
    html:{label:'HTML',extension:'html',template:name=>[
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      `  <title>${esc(name)}</title>`,
      '  <style>',
      ...NEW_PAGE_STYLES,
      '  </style>',
      '</head>',
      '<body>',
      '  <main>',
      `    <h1>${esc(name)}</h1>`,
      '    <p>Write the first paragraph here.</p>',
      '  </main>',
      '</body>',
      '</html>',
      ''
    ].join('\n')},
    // Each template is the least a document of that format needs to be valid and
    // immediately editable. Blank was fine for Markdown but wrong for the other
    // two: JSON.parse('') throws and an XML document with no root element is a
    // parse error, so a new JSON or XML Page opened in a state its own source
    // editor reports as broken.
    // The escaping differs per format and has to: esc() would corrupt a JSON
    // string and Markdown wants the name verbatim.
    markdown:{label:'Markdown',extension:'md',template:name=>[
      `# ${name}`,
      '',
      'Write the first paragraph here.',
      ''
    ].join('\n')},
    json:{label:'JSON',extension:'json',template:name=>[
      '{',
      `  "title": ${JSON.stringify(String(name ?? ''))}`,
      '}',
      ''
    ].join('\n')},
    xml:{label:'XML',extension:'xml',template:name=>[
      '<?xml version="1.0" encoding="utf-8"?>',
      '<document>',
      `  <title>${esc(name)}</title>`,
      '</document>',
      ''
    ].join('\n')}
  };

  function addEmptyPage(project,targetNode,{asChild=false,documentType='html'}={}){
    if(!project)return;
    const type=NEW_PAGE_TYPES[documentType]?documentType:'html';
    withUnsavedInspectorGuard(()=>{
      const parentId=asChild?(targetNode?.id||null):(targetNode?.type==='group'?targetNode.id:(targetNode?.parentId||null));
      const name=uniqueTreeName(`New ${NEW_PAGE_TYPES[type].label} Page`,children(project,parentId).map(node=>node.name));
      const source=NEW_PAGE_TYPES[type].template(name);
      const page={id:uid('page'),type:'page',name,fileName:`${exportSafeName(name)}.${NEW_PAGE_TYPES[type].extension}`,documentType:type,parentId,order:children(project,parentId).length,source,loadedSource:source,baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:!source.trim()};
      project.nodes.push(page);selectedTreeNode=page.id;state.selectedDocumentId=project.id;
      if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
      bindPageToSlot(activePageSlot(),page.id);
      clearInspector();activateLeftTab('project');
      renderAll();persist();showToast('New page created');
    });
  }
  function addGroup(project,targetNode,{asChild=false}={}){
    if(!project)return;
    withUnsavedInspectorGuard(()=>{
      const parentId=asChild?(targetNode?.id||null):(targetNode?.type==='group'?targetNode.id:(targetNode?.parentId||null));
      const name=uniqueTreeName('New Section',children(project,parentId).map(node=>node.name));
      const group={id:uid('group'),type:'group',name,parentId,order:children(project,parentId).length,expanded:true,container:true};
      project.nodes.push(group);selectedTreeNode=group.id;state.selectedDocumentId=project.id;
      if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
      clearInspector();activateLeftTab('project');renderAll();persist();showToast('New section created');
    });
  }


  // ----- Viewport zoom -----
  const PREVIEW_ZOOM_MIN=5;
  const PREVIEW_ZOOM_MAX=200;
  const PREVIEW_ZOOM_STEP=10;
  const PREVIEW_SCROLLBAR_VISUAL_SIZE=8;

  function runtimePreviewScrollbarCss(zoom=100){
    const scale=Math.max(.05,Number(zoom)/100||1);
    const px=value=>`${Math.round((value/scale)*1000)/1000}px`;
    const muted=getComputedStyle(document.body).getPropertyValue('--muted').trim()||'#8e98a5';
    return `*::-webkit-scrollbar{width:${px(PREVIEW_SCROLLBAR_VISUAL_SIZE)};height:${px(PREVIEW_SCROLLBAR_VISUAL_SIZE)}}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:color-mix(in srgb,${muted} 42%,transparent);border:${px(2)} solid transparent;border-radius:${px(8)};background-clip:padding-box}*::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,${muted} 66%,transparent);border:${px(2)} solid transparent;background-clip:padding-box}*::-webkit-scrollbar-corner{background:transparent}`;
  }

  function applyPreviewScrollbarCompensation(slot,zoom=previewZoomForSlot(slot)){
    const frame=frameForEditSlot(slot);
    if(!frame)return false;
    const css=runtimePreviewScrollbarCss(zoom);
    let applied=false;
    try{
      const style=frame.contentDocument?.querySelector('[data-leaf-scrollbar-runtime]');
      if(style){style.textContent=css;applied=true;}
    }catch{}
    const token=frame.dataset.directSourceToken||frame.dataset.snapshotToken;
    if(token){
      try{frame.contentWindow.postMessage({__leafViewportChromeScale:true,token,css},'*');applied=true;}catch{}
    }
    frame.dataset.scrollbarVisualSize=String(PREVIEW_SCROLLBAR_VISUAL_SIZE);
    frame.dataset.scrollbarCompensation=applied?'inverse-zoom':'native';
    return applied;
  }

  function previewZoomForSlot(slot){
    state.previewZoom=state.previewZoom||{};
    const value=Number(state.previewZoom[slot]);
    if(!Number.isFinite(value)) state.previewZoom[slot]=100;
    state.previewZoom[slot]=Math.min(PREVIEW_ZOOM_MAX,Math.max(PREVIEW_ZOOM_MIN,state.previewZoom[slot]));
    return state.previewZoom[slot];
  }

  function updatePreviewZoomIndicator(slot){
    const indicator=$(`[data-preview-zoom="${slot}"]`);
    if(!indicator) return;
    const zoom=Math.round(previewZoomForSlot(slot));
    indicator.value=`${zoom}%`;
    indicator.title=`Viewport zoom: ${zoom}%`;
    const control=indicator.closest('.viewport-zoom-control');
    control?.querySelector('[data-zoom-out]')?.toggleAttribute('disabled',zoom<=PREVIEW_ZOOM_MIN);
    control?.querySelector('[data-zoom-in]')?.toggleAttribute('disabled',zoom>=PREVIEW_ZOOM_MAX);
    control?.parentElement?.querySelector(`[data-zoom-fit="${slot}"]`)?.classList.toggle('active',state.previewZoomMode?.[slot]==='fit');
  }

  function updateAllPreviewZoomIndicators(){
    ['single','left','right','codePreview'].forEach(updatePreviewZoomIndicator);
  }

  function updateViewportFloatingInsets(slot){
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    const frame=frameForEditSlot(slot);
    const pane=canvas?.closest('.view-pane');
    if(!canvas||!pane)return;
    const outerInline=Math.max(0,canvas.offsetWidth-canvas.clientWidth);
    const outerBlock=Math.max(0,canvas.offsetHeight-canvas.clientHeight);
    let innerInline=0,innerBlock=0;
    try{
      const view=frame?.contentWindow,root=frame?.contentDocument?.scrollingElement;
      const visual=Math.max(0,Number(frame?.dataset?.scrollbarVisualSize)||PREVIEW_SCROLLBAR_VISUAL_SIZE);
      if(root&&view){
        if(root.scrollHeight>view.innerHeight+1)innerInline=visual;
        if(root.scrollWidth>view.innerWidth+1)innerBlock=visual;
      }
    }catch{}
    const inline=Math.ceil(Math.max(outerInline,innerInline));
    const block=Math.ceil(Math.max(outerBlock,innerBlock));
    pane.style.setProperty('--viewport-scrollbar-inline',`${inline}px`);
    pane.style.setProperty('--viewport-scrollbar-block',`${block}px`);
    pane.dataset.floatingScrollbarInset=`${inline}x${block}`;
  }

  function applyPreviewZoom(slot){
    const surface=$(`[data-preview-surface="${slot}"]`);
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    if(!surface || !canvas) return false;
    const zoom=previewZoomForSlot(slot);
    surface.style.zoom=String(zoom/100);
    applyPreviewScrollbarCompensation(slot,zoom);
    canvas.classList.toggle('is-zoomed',zoom!==100);
    canvas.classList.toggle('is-fit',state.previewZoomMode?.[slot]==='fit');
    updatePreviewZoomIndicator(slot);
    requestAnimationFrame(()=>updateViewportFloatingInsets(slot));
    return true;
  }

  function capturePreviewZoomAnchor(slot,point,oldZoom){
    if(!point||!Number.isFinite(point.clientX)||!Number.isFinite(point.clientY))return null;
    const surface=$(`[data-preview-surface="${slot}"]`);
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    if(!surface||!canvas)return null;
    const canvasRect=canvas.getBoundingClientRect();
    if(point.clientX<canvasRect.left||point.clientX>canvasRect.right||point.clientY<canvasRect.top||point.clientY>canvasRect.bottom)return null;
    const rect=surface.getBoundingClientRect();
    const scale=Math.max(.0001,oldZoom/100);
    return {surface,canvas,clientX:point.clientX,clientY:point.clientY,localX:(point.clientX-rect.left)/scale,localY:(point.clientY-rect.top)/scale};
  }

  function restorePreviewZoomAnchor(anchor,newZoom){
    if(!anchor)return;
    const rect=anchor.surface.getBoundingClientRect();
    const scale=newZoom/100;
    anchor.canvas.scrollLeft+=rect.left+(anchor.localX*scale)-anchor.clientX;
    anchor.canvas.scrollTop+=rect.top+(anchor.localY*scale)-anchor.clientY;
  }

  function setPreviewZoom(slot,nextZoom,{mode='manual',save=true,anchor=null}={}){
    state.previewZoom=state.previewZoom||{};
    state.previewZoomMode=state.previewZoomMode||{};
    const oldZoom=previewZoomForSlot(slot);
    const capturedAnchor=capturePreviewZoomAnchor(slot,anchor,oldZoom);
    state.previewZoom[slot]=Math.min(PREVIEW_ZOOM_MAX,Math.max(PREVIEW_ZOOM_MIN,Math.round(nextZoom)));
    state.previewZoomMode[slot]=mode;
    applyPreviewZoom(slot);
    restorePreviewZoomAnchor(capturedAnchor,state.previewZoom[slot]);
    if(save) persist();
  }

  function outerPointForFrameEvent(frame,event){
    const rect=frame.getBoundingClientRect();
    const width=Math.max(1,frame.clientWidth||rect.width);
    const height=Math.max(1,frame.clientHeight||rect.height);
    return {clientX:rect.left+(event.clientX*(rect.width/width)),clientY:rect.top+(event.clientY*(rect.height/height))};
  }

  function fitPreviewZoom(slot,{save=true}={}){
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    const config=previewSizeForSlot(slot);
    if(!canvas) return false;
    if(config.preset==='responsive'){
      setPreviewZoom(slot,100,{mode:'fit',save});
      return true;
    }
    const preset=PREVIEW_SIZE_PRESETS[config.preset];
    const width=Math.round(preset?.[0]||config.width||1280);
    const height=Math.round(preset?.[1]||config.height||720);
    const availableWidth=Math.max(1,canvas.clientWidth-34);
    const availableHeight=Math.max(1,canvas.clientHeight-34);
    const fitPercent=Math.min(100,(availableWidth/width)*100,(availableHeight/height)*100);
    setPreviewZoom(slot,fitPercent,{mode:'fit',save});
    return true;
  }

  // ----- Contents (document outline) -----
  // The panel floats over the viewport and is scoped to the node that holds the
  // View's Page - its Group, or the Document when the Page sits at the top
  // level - so a sibling Page's outline can be previewed without loading it.
  const TOC_HEADING_SELECTOR='h1,h2,h3,h4,h5,h6';
  const TOC_SLOTS=['single','left','right','codePreview'];
  const tocSelection=new Map();

  function headingsFromDocument(doc){
    if(!doc?.body)return[];
    return [...doc.body.querySelectorAll(TOC_HEADING_SELECTOR)]
      .filter(el=>!el.closest('[data-editor-overlay],[data-adf-marker]'))
      .map((el,index)=>({level:Number(el.tagName[1])||1,text:(el.textContent||'').trim().replace(/\s+/g,' '),index,el}));
  }

  // Parsing the stored source is what makes an unopened Page previewable. It
  // runs through DOMParser, which builds a document without executing anything
  // in it, and it never writes back - the outline is derived, not stored.
  function headingsFromSource(page){
    if(!page||isBinaryPage(page))return[];
    const source=String(page.source||'');
    if(!source.trim())return[];
    let markup='';
    if(page.documentType==='markdown')markup=window.JiraExport?.markdownToRichHtml?.(source)||'';
    else if(page.documentType==='html')markup=source;
    else return[];
    let doc=null;
    try{doc=new DOMParser().parseFromString(markup,'text/html');}catch{return[];}
    return headingsFromDocument(doc).map(({el,...rest})=>rest);
  }

  // A reachable preview is the better source: the heading element itself becomes
  // the scroll target, so no index has to be matched up afterwards.
  function reachableTocDocument(slot,pageId){
    const frame=frameForEditSlot(slot);
    if(!frame||!pageId||pageIdForSlot(slot)!==pageId)return null;
    if(['interactive-isolated','direct-source-editor','pdf-native-editor'].includes(frame.dataset.previewRuntime))return null;
    if(isBinaryPage(pageById(pageId)))return null;
    try{return frame.contentDocument?.body?frame.contentDocument:null;}catch{return null;}
  }

  function tocHeadings(slot,pageId){
    const doc=reachableTocDocument(slot,pageId);
    return doc?headingsFromDocument(doc):headingsFromSource(pageById(pageId));
  }

  function tocScope(slot){
    const found=pageIdForSlot(slot)?nodeById(pageIdForSlot(slot)):null;
    if(!found||found.node.type!=='page')return null;
    const {project,node}=found;
    const container=node.parentId?project.nodes.find(item=>item.id===node.parentId):null;
    return {
      scopeName:container?.name||project.name,
      viewPageId:node.id,
      pages:children(project,node.parentId).filter(item=>item.type==='page')
    };
  }

  function tocSelectedPageId(slot){
    const scope=tocScope(slot);
    if(!scope)return null;
    const chosen=tocSelection.get(slot);
    return scope.pages.some(page=>page.id===chosen)?chosen:scope.viewPageId;
  }

  function tocVisible(){return state.preferences.tocVisible===true;}

  function setTocVisible(visible){
    state.preferences.tocVisible=!!visible;
    TOC_SLOTS.forEach(renderTocPanel);
    persist();
  }

  function renderTocPanel(slot){
    const panel=$(`[data-toc-panel="${slot}"]`);
    if(!panel)return;
    const scope=tocScope(slot);
    const toggle=$(`[data-toc-toggle="${slot}"]`);
    if(toggle){
      toggle.classList.toggle('active',tocVisible());
      toggle.setAttribute('aria-pressed',tocVisible()?'true':'false');
    }
    if(!tocVisible()||!scope){panel.hidden=true;return;}
    panel.hidden=false;
    const selectedId=tocSelectedPageId(slot);
    const headings=tocHeadings(slot,selectedId);
    const minLevel=headings.length?Math.min(...headings.map(item=>item.level)):1;
    panel.querySelector('.toc-panel-scope').textContent=scope.scopeName;
    const select=panel.querySelector('.toc-panel-pages');
    select.innerHTML=scope.pages.map(page=>
      `<option value="${esc(page.id)}"${page.id===selectedId?' selected':''}>${esc(page.name)}${page.id===scope.viewPageId?' · in View':''}</option>`).join('');
    const list=panel.querySelector('.toc-panel-list');
    if(!headings.length){
      const page=pageById(selectedId);
      list.innerHTML=`<div class="toc-panel-empty">${esc(
        isBinaryPage(page)?`${page.documentType==='pdf'?'PDF':'Image'} Pages have no headings to extract`
        :page&&!['html','markdown'].includes(page.documentType)?'Contents is extracted from HTML and Markdown Pages'
        :'No headings in this Page')}</div>`;
      return;
    }
    const activeIndex=tocHighlight&&tocHighlight.slot===slot&&tocHighlight.pageId===selectedId?tocHighlight.index:-1;
    list.innerHTML=headings.map(item=>
      `<button type="button" class="toc-entry${item.index===activeIndex?' is-active':''}" data-toc-index="${item.index}" style="padding-left:${8+Math.min(item.level-minLevel,5)*13}px" title="${esc(item.text)}">
         <span class="toc-entry-level">H${item.level}</span><span class="toc-entry-text">${esc(item.text||'(untitled heading)')}</span>
       </button>`).join('');
  }

  function renderAllTocPanels(){TOC_SLOTS.forEach(renderTocPanel);}

  // A runtime overlay, never a change to the Page. It carries data-editor-overlay
  // so stripEditorArtifactsFromDocument removes it from every export and Save,
  // and so the edit-session mutation check does not read it as a change. The
  // heading element's own style is left alone for the same reason.
  const TOC_HIGHLIGHT_MARK='toc-heading-highlight';
  let tocHighlight=null;

  function clearTocHighlight({keepState=false}={}){
    [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>{
      try{frame?.contentDocument?.querySelectorAll(`[data-editor-overlay="${TOC_HIGHLIGHT_MARK}"]`).forEach(node=>node.remove());}catch{}
      const token=frame?.dataset.snapshotToken;
      if(token&&frame.dataset.previewRuntime==='interactive-isolated'){
        try{frame.contentWindow.postMessage({__leafViewTocHighlight:true,token,index:-1},'*');}catch{}
      }
    });
    if(!keepState)tocHighlight=null;
    $$('.toc-entry.is-active').forEach(entry=>entry.classList.remove('is-active'));
  }

  function paintTocHighlight(doc,element){
    if(!doc?.body||!element)return;
    const rect=element.getBoundingClientRect();
    if(!rect.width&&!rect.height)return;
    const marker=doc.createElement('div');
    marker.dataset.editorOverlay=TOC_HIGHLIGHT_MARK;
    Object.assign(marker.style,{position:'absolute',zIndex:2147483644,pointerEvents:'none',
      left:`${rect.left+doc.defaultView.scrollX-4}px`,top:`${rect.top+doc.defaultView.scrollY-3}px`,
      width:`${rect.width+8}px`,height:`${rect.height+6}px`,
      border:'2px solid #2f6fed',background:'rgba(47,111,237,.14)',
      borderRadius:'4px',boxSizing:'border-box'});
    doc.body.appendChild(marker);
  }

  function scrollSlotToHeading(slot,index,text){
    const frame=frameForEditSlot(slot);
    if(!frame)return;
    if(frame.dataset.previewRuntime==='interactive-isolated'){
      const token=frame.dataset.snapshotToken;
      if(token)frame.contentWindow.postMessage({__leafViewTocScroll:true,token,index},'*');
      return;
    }
    let doc=null;try{doc=frame.contentDocument;}catch{}
    const headings=headingsFromDocument(doc);
    if(!headings.length)return;
    // Index first, but only when the text still agrees. A scripted page can add
    // headings after the outline was parsed from source, which shifts everything
    // below them; the text match is what survives that.
    const byIndex=headings[index];
    const target=(byIndex&&(!text||byIndex.text===text))?byIndex:(text?headings.find(item=>item.text===text):null)||byIndex;
    target?.el?.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});
    // After the scroll, so the rect is the one the reader is looking at.
    if(target?.el)paintTocHighlight(doc,target.el);
  }

  async function jumpToHeading(slot,pageId,index,text){
    if(pageIdForSlot(slot)!==pageId){
      if(!bindPageToSlot(slot,pageId))return;
      selectedTreeNode=pageId;
      renderAll();persist();
      const frame=frameForEditSlot(slot);
      if(frame)await new Promise(resolve=>{
        const timer=setTimeout(resolve,1500);
        frame.addEventListener('load',()=>{clearTimeout(timer);resolve();},{once:true});
      });
    }
    clearTocHighlight();
    tocHighlight={slot,pageId,index};
    scrollSlotToHeading(slot,index,text);
    renderTocPanel(slot);
  }

  function buildTocPanel(slot,pane){
    if(!pane||pane.querySelector(`[data-toc-panel="${slot}"]`))return;
    const panel=document.createElement('div');
    panel.className='toc-panel';panel.dataset.tocPanel=slot;panel.hidden=true;
    panel.setAttribute('aria-label','Contents');
    panel.innerHTML=`
      <div class="toc-panel-head"><span class="toc-panel-title">Contents</span><span class="toc-panel-scope"></span>
        <button type="button" class="toc-panel-close" title="Hide Contents">✕</button></div>
      <select class="toc-panel-pages" aria-label="Page to outline"></select>
      <div class="toc-panel-list"></div>`;
    // The panel sits over the preview; clicks in it must not be read as the
    // viewport activation gesture underneath.
    panel.addEventListener('pointerdown',event=>event.stopPropagation());
    panel.querySelector('.toc-panel-close').addEventListener('click',event=>{event.stopPropagation();clearTocHighlight();setTocVisible(false);});
    panel.querySelector('.toc-panel-pages').addEventListener('change',event=>{
      event.stopPropagation();clearTocHighlight();tocSelection.set(slot,event.target.value);renderTocPanel(slot);
    });
    panel.querySelector('.toc-panel-list').addEventListener('click',event=>{
      const entry=event.target.closest('[data-toc-index]');
      if(!entry)return;
      event.stopPropagation();
      const index=Number(entry.dataset.tocIndex);
      const text=entry.querySelector('.toc-entry-text')?.textContent||'';
      jumpToHeading(slot,tocSelectedPageId(slot),index,text);
    });
    pane.appendChild(panel);
  }

  function installPreviewZoomControls(){
    ['single','left','right','codePreview'].forEach(slot=>{
      const indicator=$(`[data-preview-zoom="${slot}"]`);
      if(!indicator || indicator.closest('.viewport-zoom-control')) return;
      const control=document.createElement('div');
      control.className='viewport-zoom-control';
      control.setAttribute('aria-label','Viewport zoom controls');
      const out=document.createElement('button');
      out.type='button';out.textContent='−';out.dataset.zoomOut=slot;out.title='Zoom out';
      const inputIndicator=indicator;
      const inside=document.createElement('button');
      inside.type='button';inside.textContent='+';inside.dataset.zoomIn=slot;inside.title='Zoom in';
      const fit=document.createElement('button');
      fit.type='button';fit.textContent='Fit';fit.className='viewport-zoom-fit';fit.dataset.zoomFit=slot;fit.title='Fit preview to Window';
      const contents=document.createElement('button');
      contents.type='button';contents.textContent='Contents';contents.className='viewport-toc-toggle';
      contents.dataset.tocToggle=slot;contents.title='Show or hide Contents';contents.setAttribute('aria-pressed','false');
      const canvas=$(`[data-preview-canvas="${slot}"]`);
      const pane=canvas?.closest('.view-pane');
      const layer=document.createElement('div');
      layer.className='viewport-floating-controls';layer.dataset.floatingControls=slot;
      layer.setAttribute('aria-label','Viewport floating controls');
      indicator.replaceWith(control);
      control.append(out,inputIndicator,inside);
      control.insertAdjacentElement('afterend',fit);
      layer.append(contents,control,fit);pane?.appendChild(layer);
      buildTocPanel(slot,pane);
      contents.addEventListener('click',e=>{e.stopPropagation();setTocVisible(!tocVisible());});
      out.addEventListener('click',e=>{e.stopPropagation();setPreviewZoom(slot,previewZoomForSlot(slot)-PREVIEW_ZOOM_STEP);});
      inside.addEventListener('click',e=>{e.stopPropagation();setPreviewZoom(slot,previewZoomForSlot(slot)+PREVIEW_ZOOM_STEP);});
      fit.addEventListener('click',e=>{e.stopPropagation();fitPreviewZoom(slot);});
      const applyTypedZoom=()=>{
        const value=Number.parseFloat(inputIndicator.value);
        if(Number.isFinite(value)) setPreviewZoom(slot,value);
        else updatePreviewZoomIndicator(slot);
      };
      inputIndicator.addEventListener('pointerdown',event=>event.stopPropagation());
      inputIndicator.addEventListener('change',applyTypedZoom);
      inputIndicator.addEventListener('blur',applyTypedZoom);
      inputIndicator.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyTypedZoom();inputIndicator.blur();}});
      canvas?.addEventListener('wheel',event=>{
        if(!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        const direction=event.deltaY<0?1:-1;
        setPreviewZoom(slot,previewZoomForSlot(slot)+(direction*PREVIEW_ZOOM_STEP),{anchor:{clientX:event.clientX,clientY:event.clientY}});
      },{passive:false});
      canvas?.addEventListener('scroll',()=>updateViewportFloatingInsets(slot),{passive:true});
      updateViewportFloatingInsets(slot);
    });
    updateAllPreviewZoomIndicators();

    if('ResizeObserver' in window){
      const observer=new ResizeObserver(entries=>{
        entries.forEach(entry=>{
          const slot=entry.target.dataset.previewCanvas;
          if(slot)updateViewportFloatingInsets(slot);
          if(slot && state.previewZoomMode?.[slot]==='fit') fitPreviewZoom(slot,{save:false});
        });
      });
      $$('[data-preview-canvas]').forEach(canvas=>observer.observe(canvas));
    }
  }

  // ----- Preview render size -----
  const PREVIEW_DEVICE_PRESETS=[
    {group:'General',id:'responsive',label:'Responsive',size:null},
    {group:'General',id:'1920x1080',label:'Full HD · 1920 × 1080',size:[1920,1080]},
    {group:'General',id:'2560x1440',label:'QHD · 2560 × 1440',size:[2560,1440]},
    {group:'General',id:'3840x2160',label:'4K UHD · 3840 × 2160',size:[3840,2160]},

    {group:'Mobile · Apple',id:'iphone17pro',label:'iPhone 17 Pro · 1206 × 2622',size:[1206,2622]},
    {group:'Mobile · Apple',id:'iphone17promax',label:'iPhone 17 Pro Max · 1320 × 2868',size:[1320,2868]},

    {group:'MacBook',id:'macbookair13m4',label:'MacBook Air 13″ M4 · 2560 × 1664',size:[2560,1664]},
    {group:'MacBook',id:'macbookpro14m4',label:'MacBook Pro 14″ M4 · 3024 × 1964',size:[3024,1964]},

    {group:'Mac',id:'imac24m4',label:'iMac 24″ M4 · 4480 × 2520',size:[4480,2520]},

    {group:'Custom',id:'custom',label:'Custom…',size:null}
  ];

  const PREVIEW_SIZE_PRESETS=Object.fromEntries(
    PREVIEW_DEVICE_PRESETS
      .filter(item=>Array.isArray(item.size))
      .map(item=>[item.id,item.size])
  );

  function renderPreviewDevicePresetOptions(){
    $$('[data-preview-size-slot]').forEach(select=>{
      const previous=select.value;
      const groups=new Map();
      PREVIEW_DEVICE_PRESETS.forEach(item=>{
        if(!groups.has(item.group)) groups.set(item.group,[]);
        groups.get(item.group).push(item);
      });

      select.innerHTML=[...groups.entries()].map(([group,items])=>
        `<optgroup label="${esc(group)}">${items.map(item=>
          `<option value="${esc(item.id)}">${esc(item.label)}</option>`
        ).join('')}</optgroup>`
      ).join('');

      if([...select.options].some(option=>option.value===previous)) select.value=previous;
    });
  }

  function installPreviewOrientationButtons(){
    $$('[data-preview-size-slot]').forEach(select=>{
      const slot=select.dataset.previewSizeSlot;
      if(select.parentElement?.querySelector(`[data-preview-orientation="${slot}"]`)) return;

      const button=document.createElement('button');
      button.type='button';
      button.className='viewport-orientation-btn';
      button.dataset.previewOrientation=slot;
      button.textContent='↔';
      button.title='Swap portrait / landscape';
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();

        const config=previewSizeForSlot(slot);
        if(config.preset==='responsive') return;

        const preset=PREVIEW_SIZE_PRESETS[config.preset];
        const width=Math.round(preset?.[0] || config.width || 1280);
        const height=Math.round(preset?.[1] || config.height || 720);
        config.preset='custom';
        config.width=height;
        config.height=width;
        applyPreviewSize(slot);
        requestAnimationFrame(()=>fitPreviewZoom(slot));
        persist();
      });

      select.insertAdjacentElement('afterend',button);
    });
  }

  function previewSizeForSlot(slot){
    state.previewSizes=state.previewSizes||{};
    state.previewSizes[slot]=state.previewSizes[slot]||{preset:'responsive',width:null,height:null};
    return state.previewSizes[slot];
  }

  function applyPreviewSize(slot){
    applyPreviewZoom(slot);
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    const orientationButton=$(`[data-preview-orientation="${slot}"]`);
    const surface=$(`[data-preview-surface="${slot}"]`);
    const select=$(`[data-preview-size-slot="${slot}"]`);
    if(!canvas || !surface) return false;

    const config=previewSizeForSlot(slot);
    const preset=config.preset||'responsive';

    if(select){
      const hasPreset=[...select.options].some(option=>option.value===preset);
      select.value=hasPreset?preset:'custom';
    }

    if(preset==='responsive'){
      if(orientationButton) orientationButton.hidden=true;
      canvas.classList.add('is-responsive');
      canvas.dataset.renderSize='responsive';
      surface.style.width='100%';
      surface.style.height='100%';
      surface.style.minWidth='0';
      surface.style.minHeight='0';
      surface.title='Responsive preview';
      applyPreviewZoom(slot);
      return true;
    }

    canvas.classList.remove('is-responsive');
    if(orientationButton) orientationButton.hidden=false;
    const presetSize=PREVIEW_SIZE_PRESETS[preset];
    const width=Math.round(presetSize?.[0] || config.width || 1280);
    const height=Math.round(presetSize?.[1] || config.height || 720);

    config.width=width;
    config.height=height;
    canvas.dataset.renderSize=`${width}x${height}`;
    surface.style.width=`${width}px`;
    surface.style.height=`${height}px`;
    surface.style.minWidth=`${width}px`;
    surface.style.minHeight=`${height}px`;
    surface.title=`${width} × ${height} CSS px`;
    applyPreviewZoom(slot);

    // Force layout to observe the new iframe CSS viewport before the next paint.
    void surface.offsetWidth;
    return true;
  }

  function renderAllPreviewSizes(){
    ['single','left','right','codePreview'].forEach(slot=>{
      applyPreviewSize(slot);
      if(state.previewZoomMode?.[slot]==='fit') requestAnimationFrame(()=>fitPreviewZoom(slot,{save:false}));
    });
  }

  function openCustomViewportSize(slot){
    const current=previewSizeForSlot(slot);
    const preset=PREVIEW_SIZE_PRESETS[current.preset];
    const width=preset?.[0] || current.width || 1280;
    const height=preset?.[1] || current.height || 720;
    pendingViewportSizeSlot=slot;
    refs.viewportWidthInput.value=width;
    refs.viewportHeightInput.value=height;
    refs.viewportSizeModal.classList.add('show');
    setTimeout(()=>refs.viewportWidthInput.focus(),0);
  }

  function closeCustomViewportSize(){
    refs.viewportSizeModal.classList.remove('show');
    pendingViewportSizeSlot=null;
  }

  $$('[data-preview-size-slot]').forEach(select=>{
    select.addEventListener('change',()=>{
      const slot=select.dataset.previewSizeSlot;
      const value=select.value;
      if(value==='custom'){
        openCustomViewportSize(slot);
        return;
      }

      const config=previewSizeForSlot(slot);
      config.preset=value;
      const preset=PREVIEW_SIZE_PRESETS[value];
      config.width=preset?.[0]||null;
      config.height=preset?.[1]||null;
      applyPreviewSize(slot);
      requestAnimationFrame(()=>{applyPreviewSize(slot);fitPreviewZoom(slot);});
      persist();
    });

    // Size controls belong to the current view toolbar, not to the viewport
    // activation gesture underneath them.
    select.addEventListener('pointerdown',e=>e.stopPropagation());
    select.addEventListener('click',e=>e.stopPropagation());
  });

  $('#viewportSizeApply').onclick=()=>{
    if(!pendingViewportSizeSlot) return;
    const width=Math.round(Number(refs.viewportWidthInput.value));
    const height=Math.round(Number(refs.viewportHeightInput.value));
    if(!Number.isFinite(width) || !Number.isFinite(height) || width<240 || width>3840 || height<240 || height>2160){
      showToast('Preview size must be 240–3840 × 240–2160');
      return;
    }

    const config=previewSizeForSlot(pendingViewportSizeSlot);
    config.preset='custom';
    config.width=width;
    config.height=height;
    const slot=pendingViewportSizeSlot;
    applyPreviewSize(slot);
    requestAnimationFrame(()=>{applyPreviewSize(slot);fitPreviewZoom(slot);});
    persist();
    closeCustomViewportSize();
  };
  $('#viewportSizeCancel').onclick=()=>{
    if(pendingViewportSizeSlot) applyPreviewSize(pendingViewportSizeSlot);
    closeCustomViewportSize();
  };
  refs.viewportSizeModal.addEventListener('keydown',e=>{
    if(e.key==='Escape') closeCustomViewportSize();
    if(e.key==='Enter') $('#viewportSizeApply').click();
  });


  function renderObjectsPalette(){
    const q=($('#objectSearch')?.value||'').toLowerCase().trim();
    const defs=window.WidgetRegistry.all().filter(d=>objectFilter==='all'||window.WidgetRegistry.isJiraSafe(d)).filter(d=>!q||d.label.toLowerCase().includes(q)||d.type.toLowerCase().includes(q));
    const groups={};defs.forEach(d=>(groups[d.category]??=[]).push(d));
    refs.objectsList.innerHTML=Object.entries(groups).map(([cat,items])=>`<div class="object-category">${esc(cat)}</div>${items.map(d=>{const s=d.jira.support==='native'?'native':d.jira.fidelity==='low'?'lossy':'converted';return `<div class="object-item" draggable="true" data-object-type="${d.type}"><div class="object-icon">${d.kind==='panel'?'▣':'◇'}</div><div><div class="object-name">${esc(d.label)}</div><div class="object-kind">${d.kind}</div></div><div class="object-jira ${s}">${s==='native'?'ADF':s==='lossy'?'Lossy':'Convert'}</div></div>`}).join('')}`).join('');
    refs.objectsList.querySelectorAll('.object-item').forEach(item=>item.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-hbe-object-template',JSON.stringify({kind:'hbe-object-template',type:item.dataset.objectType,version:1}));}));
  }

  function sanitizedUsedComponentHtml(element){
    const clone=element.cloneNode(true);
    const all=[clone,...clone.querySelectorAll('*')];
    all.forEach(node=>{
      [...node.attributes].forEach(attribute=>{
        if(/^on/i.test(attribute.name) || ['id','data-editor-overlay','data-adf-marker','data-hbe-drop-line','data-editor-element-id'].includes(attribute.name)) node.removeAttribute(attribute.name);
      });
      node.classList?.remove('table-cell-selected','viewport-object-drop-target');
    });
    clone.querySelectorAll('script,base').forEach(node=>node.remove());
    clone.querySelectorAll('[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line]').forEach(node=>node.remove());
    return clone.outerHTML;
  }

  function usedComponentSignature(element){
    if(!element||['HTML','BODY'].includes(element.tagName))return null;
    return sanitizedUsedComponentHtml(element).replace(/\s+/g,' ').trim();
  }

  function usedComponentCandidates(){
    const frame=activeStaticFrame();
    let doc=null;try{doc=frame?.contentDocument}catch{}
    if(!doc?.body || frame?.dataset.previewRuntime==='interactive-isolated')return[];
    const selector='[data-hbe-object],[data-hbe-name],main,article,section,aside,header,footer,nav,figure,table,blockquote,pre,button,h1,h2,h3,h4,h5,h6,p';
    return [...new Set([...doc.body.children,...doc.body.querySelectorAll(selector)])]
      .filter(element=>!element.dataset?.editorOverlay && !['SCRIPT','STYLE','BASE','LINK','META'].includes(element.tagName));
  }

  function extractUsedComponents(){
    const candidates=usedComponentCandidates();
    const groups=new Map();
    candidates.forEach(element=>{
      const html=sanitizedUsedComponentHtml(element);
      if(!html.trim()) return;
      const signature=html.replace(/\s+/g,' ').trim();
      const existing=groups.get(signature);
      if(existing){existing.count+=1;existing.elements.push(element);return;}
      groups.set(signature,{signature,html,label:objectDisplayName(element),tag:element.tagName.toLowerCase(),count:1,elements:[element]});
    });
    return [...groups.values()];
  }

  function renderUsedPreviewLayout(){
    const panel=document.querySelector('[data-left-panel="used"]');
    if(!panel)return;
    const visible=state.preferences.usedPreviewVisible!==false;
    panel.classList.toggle('preview-collapsed',!visible);
    panel.style.setProperty('--used-preview-height',`${Math.round(usedPreviewRatio*10000)/100}%`);
    if(refs.toggleUsedPreview){
      refs.toggleUsedPreview.classList.toggle('active',visible);
      refs.toggleUsedPreview.setAttribute('aria-pressed',visible?'true':'false');
      refs.toggleUsedPreview.textContent=visible?'Preview':'Preview off';
    }
    refs.usedPreviewSplitter?.setAttribute('aria-valuenow',String(Math.round(usedPreviewRatio*100)));
  }

  refs.toggleUsedPreview?.addEventListener('click',()=>{
    state.preferences.usedPreviewVisible=state.preferences.usedPreviewVisible===false;
    renderUsedPreviewLayout();persist();
  });

  function renderUsedComponentPreview(){
    const component=usedComponentCatalog.get(selectedUsedComponentToken);
    if(refs.usedComponentPreviewName)refs.usedComponentPreviewName.textContent=component?.label||'No component selected';
    if(!refs.usedComponentPreviewFrame)return;
    const content=component?.html||'<div style="color:#7b8494;font:12px system-ui">Select a component from the list.</div>';
    refs.usedComponentPreviewFrame.srcdoc=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{min-height:100%;margin:0}body{box-sizing:border-box;display:grid;place-items:center;padding:14px;background:#fff;color:#17202a;font-family:system-ui,sans-serif}body>*{max-width:100%;box-sizing:border-box}</style></head><body>${content}</body></html>`;
  }

  // The Used list scrolls on its own inside the panel. scrollIntoView would also
  // move every scrollable ancestor - the left panel, the window - so the offset
  // is measured against the list and applied to its own scrollTop, and nothing
  // else on the page moves. An already-visible row works out to no change.
  function revealUsedComponentRow(token){
    const list=refs.usedComponentsList;
    if(!list||!token)return;
    const row=list.querySelector(`[data-used-component="${CSS.escape(token)}"]`);
    if(!row||!list.clientHeight)return;
    const listBox=list.getBoundingClientRect(),rowBox=row.getBoundingClientRect();
    if(rowBox.top<listBox.top)list.scrollTop+=rowBox.top-listBox.top;
    else if(rowBox.bottom>listBox.bottom)list.scrollTop+=rowBox.bottom-listBox.bottom;
  }

  function renderUsedComponents(){
    if(!refs.usedComponentsList) return;
    usedComponentCatalog=new Map();
    const components=extractUsedComponents();
    if(!components.length){
      refs.usedComponentsList.innerHTML='<div class="used-component-empty">Load an HTML page to extract reusable components.</div>';
      selectedUsedComponentToken=null;renderUsedComponentPreview();
      return;
    }
    components.forEach((component,index)=>usedComponentCatalog.set(`used-${index+1}`,component));
    if(usedDocumentSelectionSignature){
      selectedUsedComponentToken=[...usedComponentCatalog].find(([,component])=>component.signature===usedDocumentSelectionSignature)?.[0]||null;
    }else if(!usedComponentCatalog.has(selectedUsedComponentToken))selectedUsedComponentToken=null;
    refs.usedComponentsList.innerHTML=[...usedComponentCatalog].map(([token,component])=>`
      <div class="object-item used-component-item ${token===selectedUsedComponentToken?'selected':''} ${token===highlightedUsedComponentToken?'instance-highlighted':''}" draggable="true" data-used-component="${token}" title="Drag to reuse this component">
        <div class="object-icon">◇</div><div><div class="object-name">${esc(component.label)}</div><div class="object-kind">&lt;${esc(component.tag)}&gt;</div></div><div class="used-component-count">${component.count}</div>
      </div>`).join('');
    refs.usedComponentsList.querySelectorAll('[data-used-component]').forEach(item=>item.addEventListener('dragstart',event=>{
      event.dataTransfer.effectAllowed='copy';
      event.dataTransfer.setData('application/x-hbe-used-component',JSON.stringify({kind:'hbe-used-component',token:item.dataset.usedComponent,version:1}));
    }));
    refs.usedComponentsList.querySelectorAll('[data-used-component]').forEach(item=>item.addEventListener('click',()=>{
      usedDocumentSelectionSignature=null;selectedUsedComponentToken=item.dataset.usedComponent;
      refs.usedComponentsList.querySelectorAll('[data-used-component]').forEach(row=>row.classList.toggle('selected',row===item));
      renderUsedComponentPreview();
    }));
    refs.usedComponentsList.querySelectorAll('[data-used-component]').forEach(item=>item.addEventListener('contextmenu',event=>{
      event.preventDefault();event.stopPropagation();
      usedContextToken=item.dataset.usedComponent;selectedUsedComponentToken=usedContextToken;
      refs.usedComponentsList.querySelectorAll('[data-used-component]').forEach(row=>row.classList.toggle('selected',row===item));
      renderUsedComponentPreview();
      if(!refs.usedContextMenu)return;
      refs.usedContextMenu.hidden=false;
      refs.usedContextMenu.style.left=`${Math.min(innerWidth-190,event.clientX)}px`;
      refs.usedContextMenu.style.top=`${Math.min(innerHeight-72,event.clientY)}px`;
      refs.usedContextMenu.querySelector('button')?.focus();
    }));
    renderUsedComponentPreview();
    requestAnimationFrame(()=>revealUsedComponentRow(selectedUsedComponentToken));
  }

  function syncUsedSelectionFromElement(element){
    if(!document.querySelector('[data-left-panel="used"]')?.classList.contains('active'))return;
    usedDocumentSelectionSignature=usedComponentSignature(element);
    renderUsedComponents();
  }

  function clearUsedInstanceHighlights(){
    [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>{
      try{frame.contentDocument?.querySelectorAll('[data-editor-overlay="used-instance-highlight"]').forEach(node=>node.remove())}catch{}
    });
    highlightedUsedComponentToken=null;
    refs.usedComponentsList?.querySelectorAll('[data-used-component]').forEach(item=>item.classList.remove('instance-highlighted'));
  }

  function highlightUsedInstances(token){
    if(!document.querySelector('[data-left-panel="used"]')?.classList.contains('active'))return;
    const component=usedComponentCatalog.get(token);if(!component)return;
    clearUsedInstanceHighlights();
    const elements=(component.elements||[]).filter(element=>element?.isConnected);
    elements.forEach(element=>{
      const doc=element.ownerDocument,rect=element.getBoundingClientRect(),marker=doc.createElement('div');
      marker.dataset.editorOverlay='used-instance-highlight';
      Object.assign(marker.style,{position:'absolute',zIndex:2147483645,pointerEvents:'none',left:`${rect.left+doc.defaultView.scrollX}px`,top:`${rect.top+doc.defaultView.scrollY}px`,width:`${rect.width}px`,height:`${rect.height}px`,border:'2px solid #f4c542',background:'rgba(244,197,66,.16)',boxShadow:'0 0 0 1px rgba(25,20,0,.25)',borderRadius:'2px',boxSizing:'border-box'});
      doc.body.appendChild(marker);
    });
    highlightedUsedComponentToken=token;
    refs.usedComponentsList?.querySelector(`[data-used-component="${CSS.escape(token)}"]`)?.classList.add('instance-highlighted');
    revealUsedComponentRow(token);
    elements[0]?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});
    showToast(`${elements.length} instance${elements.length===1?'':'s'} highlighted`);
  }

  refs.usedContextMenu?.addEventListener('click',event=>{
    const action=event.target.closest('[data-used-context]')?.dataset.usedContext;if(!action)return;
    if(action==='highlight')highlightUsedInstances(usedContextToken);
    if(action==='clear')clearUsedInstanceHighlights();
    refs.usedContextMenu.hidden=true;
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#usedContextMenu'))refs.usedContextMenu&&(refs.usedContextMenu.hidden=true);},true);

  function createUsedComponent(payload,doc){
    const component=usedComponentCatalog.get(payload?.token);
    if(!component) return null;
    const template=doc.createElement('template');template.innerHTML=component.html.trim();
    const element=template.content.firstElementChild;
    if(!element) return null;
    const currentName=element.getAttribute('data-hbe-name')||component.label;
    element.setAttribute('data-hbe-name',`${currentName} Copy`);
    return element;
  }

  function activateLeftTab(name){
    $$('.left-tab').forEach(button=>button.classList.toggle('active',button.dataset.leftTab===name));
    $$('[data-left-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.leftPanel===name));
    if(name==='objects') renderObjectsPalette();
    if(name==='used'){
      usedDocumentSelectionSignature=usedComponentSignature(selectedElement);
      renderUsedComponents();
    }else{
      usedDocumentSelectionSignature=null;
      clearUsedInstanceHighlights();
    }
  }
  $$('.left-tab').forEach(b=>b.addEventListener('click',()=>activateLeftTab(b.dataset.leftTab)));
  $('#objectSearch')?.addEventListener('input',renderObjectsPalette);
  $('#refreshUsedComponents')?.addEventListener('click',renderUsedComponents);
  $$('[data-object-filter]').forEach(b=>b.addEventListener('click',()=>{objectFilter=b.dataset.objectFilter;$$('[data-object-filter]').forEach(x=>x.classList.toggle('active',x===b));renderObjectsPalette();}));

  function activeStaticFrame(){if(state.mode==='preview')return refs.singleFrame;if(state.mode==='split')return activeSlots.split==='right'?refs.rightFrame:refs.leftFrame;if(state.mode==='code'&&activeSlots.code==='preview')return refs.codePreviewFrame;return null;}
  const hierarchyExpanded=new Set();
  let hierarchyRenameElement=null;

  function defaultObjectName(el){
    if(!el) return 'Object';
    if(el.tagName==='BODY') return 'Root';
    const labels={DIV:'Container',MAIN:'Main',ARTICLE:'Article',SECTION:'Section',ASIDE:'Aside',P:'Text',SPAN:'Text',H1:'Heading 1',H2:'Heading 2',H3:'Heading 3',H4:'Heading 4',H5:'Heading 5',H6:'Heading 6',UL:'List',OL:'List',LI:'List Item',TABLE:'Table',IMG:'Image',BUTTON:'Button',PRE:'Code',BLOCKQUOTE:'Quote',FIGURE:'Figure',HR:'Divider'};
    const base=labels[el.tagName]||el.getAttribute('data-hbe-object')||el.tagName.toLowerCase();
    const siblings=[...(el.parentElement?.children||[])].filter(item=>item.tagName===el.tagName && !item.dataset?.editorOverlay);
    return siblings.length>1 ? `${base} ${siblings.indexOf(el)+1}` : base;
  }

  function objectDisplayName(el){
    return el?.getAttribute?.('data-hbe-name')?.trim() || defaultObjectName(el);
  }

  function hierarchyObjectType(el){
    if(!el)return 'object';
    if(el.tagName==='BODY')return 'body';
    return (el.getAttribute('data-hbe-object')||el.tagName||'object').toLocaleLowerCase();
  }

  function hierarchyNodeId(el){
    return el.getAttribute('data-hbe-id') || ensureInspectorElementId(el);
  }

  function hierarchyChildren(el){
    // Rows and cells are listed so the Hierarchy can show what a cell holds and
    // accept a drop into one. TR is structure only - canContain leaves it out,
    // because a row may hold cells and nothing else.
    const meaningful=new Set(['MAIN','ARTICLE','SECTION','ASIDE','H1','H2','H3','H4','H5','H6','P','UL','OL','TABLE','TR','TD','TH','PRE','BLOCKQUOTE','IMG','DIV','FIGURE','HR']);
    const result=[];
    [...el.children].forEach(child=>{
      if(child.dataset?.editorOverlay || child.dataset?.adfMarker) return;
      if(meaningful.has(child.tagName)||child.hasAttribute('data-hbe-object')) result.push(child);
      else result.push(...hierarchyChildren(child));
    });
    return result;
  }

  function disconnectHierarchyObserver(frame){
    hierarchyObservers.get(frame)?.disconnect();
    hierarchyObservers.delete(frame);
  }

  function scheduleHierarchyRefresh(frame){
    if(hierarchyRefreshFrames.has(frame))return;
    hierarchyRefreshFrames.add(frame);
    queueMicrotask(()=>{
      hierarchyRefreshFrames.delete(frame);
      if(activeStaticFrame()===frame)renderHierarchy();
      const slot=previewSlotForFrame(frame);if(slot)updateViewportFloatingInsets(slot);
    });
  }

  function bindHierarchyObserver(frame){
    disconnectHierarchyObserver(frame);
    let doc=null;try{doc=frame.contentDocument}catch{}
    const page=pageById(frameToPageId(frame));
    if(!doc?.body||isBinaryPage(page)||['interactive-isolated','direct-source-editor'].includes(frame.dataset.previewRuntime))return;
    const observer=new doc.defaultView.MutationObserver(records=>{
      const authorChange=records.some(record=>{
        if(record.type==='attributes'&&/^(data-editor-|data-adf-marker)/.test(record.attributeName||''))return false;
        const target=record.target?.nodeType===Node.ELEMENT_NODE?record.target:record.target?.parentElement;
        if(target?.closest?.('[data-editor-overlay],[data-adf-marker]'))return false;
        if(record.type==='childList'){
          const changed=[...record.addedNodes,...record.removedNodes];
          if(changed.length&&changed.every(node=>node.nodeType===Node.ELEMENT_NODE&&node.matches?.('[data-editor-overlay],[data-adf-marker]')))return false;
        }
        return true;
      });
      if(authorChange)scheduleHierarchyRefresh(frame);
    });
    observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true});
    hierarchyObservers.set(frame,observer);
    scheduleHierarchyRefresh(frame);
  }

  function renderHierarchy(){
    const frame=activeStaticFrame();
    if(!frame||['interactive-isolated','direct-source-editor','pdf-native-editor'].includes(frame.dataset.previewRuntime)||pageById(frameToPageId(frame))?.documentType==='pdf'){
      refs.hierarchyTree.innerHTML='<div class="edit-mode-message"><strong>Hierarchy unavailable</strong>Script-generated runtime remains inspect-only.</div>';
      return;
    }

    let doc=null;try{doc=frame.contentDocument}catch{}
    if(!doc?.body){refs.hierarchyTree.innerHTML='';return;}

    // The hierarchy always exposes a stable Root node. This represents BODY;
    // semantic MAIN/ARTICLE elements remain visible beneath it.
    const root=doc.body;
    const flat=[];

    function addNode(el,depth){
      const id=hierarchyNodeId(el);
      const children=hierarchyChildren(el);
      const expanded=depth===0 || hierarchyExpanded.has(id) || children.some(c=>[...selectedElements].some(selected=>c===selected || c.contains?.(selected)));
      flat.push({el,depth,id,children,expanded});
      if(expanded) children.forEach(c=>addNode(c,depth+1));
    }

    addNode(root,0);

    const nameMode=!!state.preferences.hierarchyNameMode;
    const modeToggle=$('#hierarchyNameModeToggle');
    if(modeToggle){modeToggle.textContent=nameMode?'Name':'Tag';modeToggle.classList.toggle('active',nameMode);modeToggle.setAttribute('aria-pressed',nameMode?'true':'false');}
    refs.hierarchyTree.innerHTML=flat.map((n,i)=>{
      const contentLabel=n.depth===0?'Root':(n.el.textContent.trim().replace(/\s+/g,' ').slice(0,40)||n.el.getAttribute('data-hbe-object')||n.el.tagName.toLowerCase());
      const label=nameMode?objectDisplayName(n.el):contentLabel;
      const renameInput=nameMode && hierarchyRenameElement===n.el ? `<input class="hierarchy-rename-input" data-hierarchy-rename="${i}" value="${esc(objectDisplayName(n.el))}" aria-label="Object name">` : `<span class="hierarchy-label">${esc(label)}</span>`;
      return `<div class="hierarchy-row ${n.depth===0?'hierarchy-root':''} ${selectedElements.has(n.el)?'selected':''}" draggable="${n.depth===0||hierarchyRenameElement===n.el?'false':'true'}" data-hidx="${i}" style="padding-left:${6+n.depth*14}px">
        <span class="hierarchy-twisty" data-twisty="${i}">${n.children.length?(n.expanded?'▾':'▸'):''}</span>
        ${nameMode?'':`<span class="hierarchy-tag">&lt;${n.el.tagName.toLowerCase()}&gt;</span>`}
        ${renameInput}
        <span class="hierarchy-type">${esc(hierarchyObjectType(n.el))}</span>
      </div>`;
    }).join('');

    refs.hierarchyTree.querySelectorAll('[data-hierarchy-rename]').forEach(input=>{
      const node=flat[Number(input.dataset.hierarchyRename)];
      const finish=commit=>{
        if(hierarchyRenameElement!==node.el) return;
        const value=input.value.trim();
        hierarchyRenameElement=null;
        if(commit && value && value!==objectDisplayName(node.el)){
          node.el.setAttribute('data-hbe-name',value);
          const page=pageById(frameToPageId(frame));
          if(page) commitDomMutation(frame,page,node.el,'hierarchy-rename');
          else renderHierarchy();
        }else renderHierarchy();
      };
      input.addEventListener('keydown',event=>{
        event.stopPropagation();
        if(event.key==='Enter'){event.preventDefault();finish(true);}
        if(event.key==='Escape'){event.preventDefault();finish(false);}
      });
      input.addEventListener('blur',()=>finish(true));
      queueMicrotask(()=>{input.focus();input.select();});
    });

    refs.hierarchyTree.querySelectorAll('[data-twisty]').forEach(t=>t.addEventListener('click',e=>{
      e.stopPropagation();
      const n=flat[Number(t.dataset.twisty)];
      if(!n?.children.length)return;
      hierarchyExpanded.has(n.id)?hierarchyExpanded.delete(n.id):hierarchyExpanded.add(n.id);
      renderHierarchy();
    }));

    refs.hierarchyTree.querySelectorAll('[data-hidx]').forEach(row=>{
      const node=flat[Number(row.dataset.hidx)];

      row.addEventListener('mousedown',event=>{
        if(node.depth===0)return;
        if(event.button!==0 || event.target.closest('[data-twisty],[data-hierarchy-rename]')) return;
        if(state.preferences.hierarchyNameMode && selectedElements.has(node.el) && !event.ctrlKey && !event.metaKey){
          event.preventDefault();event.stopPropagation();
          hierarchyRenameElement=node.el;
          renderHierarchy();
        }
      });

      row.addEventListener('click',event=>{
        if(node.depth===0)return;
        if(event.target.closest('[data-hierarchy-rename]') || hierarchyRenameElement===node.el) return;
        SelectionManager.select(node.el,frame,'hierarchy',{toggle:event.ctrlKey||event.metaKey});
        try{node.el.scrollIntoView({block:'center',behavior:'smooth'})}catch{}
      });

      row.addEventListener('dragstart',e=>{
        if(node.depth===0){e.preventDefault();return;}
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('application/x-hbe-existing-element',node.id);
      });
      row.addEventListener('dragend',()=>row.classList.remove('dragging'));

      row.addEventListener('dragover',e=>{
        const hasTemplate=e.dataTransfer.types.includes('application/x-hbe-object-template');
        const hasUsed=e.dataTransfer.types.includes('application/x-hbe-used-component');
        const hasExisting=e.dataTransfer.types.includes('application/x-hbe-existing-element');
        if(!hasTemplate&&!hasUsed&&!hasExisting)return;
        e.preventDefault();
        row.classList.remove('drop-before','drop-after','drop-inside');
        const r=row.getBoundingClientRect(),local=e.clientY-r.top;
        const inside=local>r.height*.25&&local<r.height*.75&&window.WidgetRegistry.canContain(node.el);
        row.classList.add(inside?'drop-inside':local<r.height*.5?'drop-before':'drop-after');
      });
      row.addEventListener('dragleave',()=>row.classList.remove('drop-before','drop-after','drop-inside'));
      row.addEventListener('drop',e=>{
        e.preventDefault();
        const mode=row.classList.contains('drop-inside')?'inside':row.classList.contains('drop-before')?'before':'after';
        row.classList.remove('drop-before','drop-after','drop-inside');
        handleHierarchyDrop(e,node.el,mode,frame);
      });
    });
  }

  function beginHierarchyRename(){
    if(!state.preferences.hierarchyNameMode || !selectedElement || selectedElementFrame!==activeStaticFrame()) return false;
    hierarchyRenameElement=selectedElement;
    renderHierarchy();
    return true;
  }

  $('#hierarchyNameModeToggle')?.addEventListener('click',()=>{
    state.preferences.hierarchyNameMode=!state.preferences.hierarchyNameMode;
    hierarchyRenameElement=null;
    renderHierarchy();persist();
  });

  function commitDomMutation(frame,page,selected=null,source='authoring'){
    if(!page||!frame)return;
    pushUndo(page);
    syncFrameToPage(frame,page,{mutationKind:source});
    markJiraCheckStale();
    persist();
    renderVisibleFramesForPage(page.id,frame);
    if(state.mode==='code'&&state.views.codePage===page.id)loadCodePage();
    if(selected)SelectionManager.select(selected,frame,source);
    renderHierarchy();
    if(document.querySelector('[data-left-panel="used"]')?.classList.contains('active')) renderUsedComponents();
  }

  function insertElementAt(target,element,mode){
    if(mode==='inside'&&window.WidgetRegistry.canContain(target)){target.appendChild(element);return true;}
    if(mode==='before'){target.parentNode?.insertBefore(element,target);return !!element.parentNode;}
    if(mode==='after'){target.parentNode?.insertBefore(element,target.nextSibling);return !!element.parentNode;}
    return false;
  }

  function handleHierarchyDrop(event,target,mode,frame){
    const page=pageById(frameToPageId(frame));
    if(!page||frame.dataset.previewRuntime==='interactive-isolated')return;

    const template=event.dataTransfer.getData('application/x-hbe-object-template');
    if(template){
      let payload=null;try{payload=JSON.parse(template)}catch{}
      const element=window.WidgetRegistry.create(payload?.type,frame.contentDocument);
      if(!element)return;
      if(insertElementAt(target,element,mode))commitDomMutation(frame,page,element,'palette');
      return;
    }

    const used=event.dataTransfer.getData('application/x-hbe-used-component');
    if(used){
      let payload=null;try{payload=JSON.parse(used)}catch{}
      const element=createUsedComponent(payload,frame.contentDocument);
      if(element && insertElementAt(target,element,mode)) commitDomMutation(frame,page,element,'used-component');
      return;
    }

    const existingId=event.dataTransfer.getData('application/x-hbe-existing-element');
    if(existingId){
      const element=frame.contentDocument.querySelector(`[data-hbe-id="${CSS.escape(existingId)}"],[data-editor-element-id="${CSS.escape(existingId)}"]`);
      if(!element||element===target||element.contains(target))return;
      if(insertElementAt(target,element,mode))commitDomMutation(frame,page,element,'hierarchy-move');
    }
  }

  function clearViewportDropFeedback(doc){
    doc?.querySelectorAll('.viewport-object-drop-target').forEach(el=>el.classList.remove('viewport-object-drop-target'));
    doc?.querySelectorAll('[data-hbe-drop-line],[data-editor-overlay="placement-preview"]').forEach(el=>el.remove());
    if(doc)doc.__leafViewportPlacement=null;
  }

  function viewportDropData(event){
    const types=event.dataTransfer?.types||[];
    return{
      template:types.includes('application/x-hbe-object-template'),
      used:types.includes('application/x-hbe-used-component'),
      existing:types.includes('application/x-hbe-existing-element')
    };
  }

  function viewportAuthorTarget(event,doc,existingElement=null){
    // td and th come before table in the walk up from the drop point, so a drop
    // on a cell resolves to that cell rather than to the whole table. Without
    // them canContain never sees the cell and the component lands beside the
    // table instead of in it.
    let target=event.target?.closest?.('[data-hbe-object],main,article,section,aside,div,p,h1,h2,h3,h4,h5,h6,td,th,table,pre,blockquote,figure,img,ul,ol')||doc.body;
    if(target?.dataset?.editorOverlay)target=doc.body;
    if(existingElement&&(target===existingElement||existingElement.contains(target)))target=existingElement.parentElement||doc.body;
    return target;
  }

  function calculateViewportPlacement(event,doc,existingElement=null){
    const target=viewportAuthorTarget(event,doc,existingElement);
    const freeContainer=target.closest?.('[data-hbe-layout="overlay"],[data-hbe-layout="canvas"]');
    if(freeContainer&&freeContainer!==existingElement&&!existingElement?.contains(freeContainer)){
      const rect=freeContainer.getBoundingClientRect();
      const offset=viewportElementDragContext?.element===existingElement?viewportElementDragContext:{offsetX:16,offsetY:16};
      return{mode:'free',target:freeContainer,x:Math.max(0,Math.round(event.clientX-rect.left-(offset.offsetX||0))),y:Math.max(0,Math.round(event.clientY-rect.top-(offset.offsetY||0)))};
    }
    if(target===doc.body)return{mode:'inside',target};
    const rect=target.getBoundingClientRect(),localY=event.clientY-rect.top;
    const canContain=window.WidgetRegistry.canContain(target);
    const mode=canContain&&localY>rect.height*.25&&localY<rect.height*.75?'inside':localY<rect.height*.5?'before':'after';
    return{mode,target};
  }

  function renderViewportPlacementPreview(doc,placement,existingElement=null){
    clearViewportDropFeedback(doc);
    if(!placement?.target)return;
    doc.__leafViewportPlacement=placement;
    const preview=doc.createElement('div');preview.dataset.editorOverlay='placement-preview';
    const targetRect=placement.target.getBoundingClientRect(),view=doc.defaultView;
    const label=doc.createElement('span');label.textContent=placement.mode==='free'?'Free position':placement.mode==='inside'?'Place inside':placement.mode==='before'?'Insert before':'Insert after';
    Object.assign(label.style,{position:'absolute',left:'0',bottom:'100%',marginBottom:'4px',padding:'2px 6px',borderRadius:'3px',background:'#315fae',color:'#fff',font:'10px/1.4 Arial,sans-serif',whiteSpace:'nowrap'});
    const common={position:'absolute',zIndex:2147483500,pointerEvents:'none',boxSizing:'border-box',border:'2px solid #4f8bff',background:'rgba(79,139,255,.14)',boxShadow:'0 0 0 1px rgba(255,255,255,.35)'};
    if(placement.mode==='free'){
      const size=existingElement?.getBoundingClientRect();
      Object.assign(preview.style,common,{left:`${targetRect.left+view.scrollX+placement.x}px`,top:`${targetRect.top+view.scrollY+placement.y}px`,width:`${Math.max(48,Math.round(size?.width||150))}px`,height:`${Math.max(28,Math.round(size?.height||48))}px`,borderRadius:'4px'});
    }else if(placement.mode==='inside'){
      placement.target.classList.add('viewport-object-drop-target');
      Object.assign(preview.style,common,{left:`${targetRect.left+view.scrollX+4}px`,top:`${targetRect.top+view.scrollY+4}px`,width:`${Math.max(12,targetRect.width-8)}px`,height:`${Math.max(12,targetRect.height-8)}px`,borderStyle:'dashed',borderRadius:'4px'});
    }else{
      const top=targetRect[placement.mode==='before'?'top':'bottom']+view.scrollY-2;
      Object.assign(preview.style,common,{left:`${targetRect.left+view.scrollX}px`,top:`${top}px`,width:`${Math.max(16,targetRect.width)}px`,height:'4px',background:'#4f8bff',border:'0',borderRadius:'2px'});
    }
    preview.appendChild(label);doc.body.appendChild(preview);
  }

  function placeViewportElement(element,placement){
    if(!element||!placement?.target)return false;
    if(placement.mode==='free'){
      const container=placement.target;
      if(container.ownerDocument.defaultView.getComputedStyle(container).position==='static')container.style.position='relative';
      if(element.parentElement!==container)container.appendChild(element);
      Object.assign(element.style,{position:'absolute',left:`${placement.x}px`,top:`${placement.y}px`,margin:'0'});
      return true;
    }
    if(element.style.position==='absolute'){
      element.style.removeProperty('position');element.style.removeProperty('left');element.style.removeProperty('top');element.style.removeProperty('margin');
    }
    return insertElementAt(placement.target,element,placement.mode);
  }

  function bindObjectDropToFrame(frame){
    frame.addEventListener('load',()=>{
      if(frame.dataset.previewRuntime==='interactive-isolated')return;
      let doc=null;try{doc=frame.contentDocument}catch{}if(!doc)return;

      doc.addEventListener('dragover',e=>{
        const data=viewportDropData(e);if(!data.template&&!data.used&&!data.existing)return;
        e.preventDefault();e.dataTransfer.dropEffect=data.existing?'move':'copy';
        let existingElement=null;
        if(data.existing&&viewportElementDragContext?.frame===frame)existingElement=viewportElementDragContext.element;
        renderViewportPlacementPreview(doc,calculateViewportPlacement(e,doc,existingElement),existingElement);
      },true);

      doc.addEventListener('dragleave',e=>{if(!e.relatedTarget||e.target===doc.documentElement)clearViewportDropFeedback(doc)},true);

      doc.addEventListener('drop',e=>{
        const raw=e.dataTransfer.getData('application/x-hbe-object-template');
        const usedRaw=e.dataTransfer.getData('application/x-hbe-used-component');
        const existingId=e.dataTransfer.getData('application/x-hbe-existing-element');
        if(!raw&&!usedRaw&&!existingId)return;
        e.preventDefault();
        const existingElement=existingId?doc.querySelector(`[data-hbe-id="${CSS.escape(existingId)}"],[data-editor-element-id="${CSS.escape(existingId)}"]`):null;
        const placement=doc.__leafViewportPlacement||calculateViewportPlacement(e,doc,existingElement);
        clearViewportDropFeedback(doc);
        let payload=null;try{payload=JSON.parse(raw||usedRaw)}catch{}
        const element=existingElement||(raw?window.WidgetRegistry.create(payload?.type,doc):createUsedComponent(payload,doc));
        if(!element)return;
        if(element===placement.target||element.contains(placement.target))return;
        if(!placeViewportElement(element,placement))return;
        const page=pageById(frameToPageId(frame));
        commitDomMutation(frame,page,element,existingElement?'viewport-move':raw?'viewport-palette-drop':'viewport-used-drop');
      },true);
    });
  }

  [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(bindObjectDropToFrame);

  function markJiraCheckStale(){if(!jiraCheckState)return;jiraCheckState.stale=true;$$('[data-jira-check-slot]').forEach(b=>b.classList.add('stale'));}
  function clearJiraMarkers(){[refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(f=>{try{f.contentDocument?.querySelectorAll('[data-adf-marker]').forEach(x=>x.remove())}catch{}});jiraCheckState=null;$$('[data-jira-check-slot]').forEach(b=>{b.textContent='Check Atlassian';b.classList.remove('stale','blocked')});refs.jiraCheckPopover.hidden=true;}
  function applyJiraMarkers(result){const f=activeStaticFrame();if(!f||f.dataset.previewRuntime==='interactive-isolated')return;let d;try{d=f.contentDocument}catch{}if(!d?.body)return;d.querySelectorAll('[data-adf-marker]').forEach(x=>x.remove());const candidates=[...d.body.querySelectorAll('[data-hbe-object],svg,img')];for(const issue of result.issues){const matches=candidates.filter(el=>issue.objectType==='svg'?el.tagName==='SVG':issue.objectType==='image'?(el.tagName==='IMG'||el.getAttribute('data-hbe-object')==='image'):el.getAttribute('data-hbe-object')===issue.objectType);
      const t=issue.objectId?candidates.find(el=>el.getAttribute('data-hbe-id')===issue.objectId):matches[issue.occurrence||0];if(!t)continue;const r=t.getBoundingClientRect(),m=d.createElement('div');m.dataset.adfMarker='1';m.className=`adf-marker ${issue.severity}`;Object.assign(m.style,{left:`${r.left+d.defaultView.scrollX}px`,top:`${r.top+d.defaultView.scrollY}px`,width:`${r.width}px`,height:`${r.height}px`});d.body.appendChild(m);}}
  function renderJiraCheckPopover(r){const c=r.counts;refs.jiraCheckPopover.hidden=false;$('#jiraCheckSummary').innerHTML=`✓ Safe ${c.safe} &nbsp; ◐ Converted ${c.converted} &nbsp; △ Lossy ${c.lossy} &nbsp; ✕ Blocked ${c.blocked}`;$('#jiraCheckList').innerHTML=r.issues.length?r.issues.map(i=>`<div class="jira-issue-row ${i.severity}"><strong>${i.severity.toUpperCase()}</strong> ${esc(i.label)}<br>${esc(i.message)}${i.lostProperties?.length?`<br>Not preserved: ${esc(i.lostProperties.join(', '))}`:''}</div>`).join(''):'<div class="jira-issue-row">No Jira compatibility issues found.</div>';}

  function jiraTicketPreviewDocument(title,bodyHtml,format){
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: file: https: http:;"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172b4d;background:#f4f5f7}*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f5f7}.issue{max-width:920px;margin:0 auto;background:#fff;border:1px solid #dfe1e6;border-radius:8px;box-shadow:0 1px 2px #091e4226}.issue-head{padding:20px 28px 16px;border-bottom:1px solid #dfe1e6}.crumb{color:#6b778c;font-size:12px;margin-bottom:8px}.key{color:#0052cc;font-weight:600}.issue h1{margin:0;font-size:24px;line-height:1.3;color:#172b4d}.field{padding:22px 28px 34px}.field-label{font-size:12px;font-weight:700;color:#44546f;margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em}.description{font-size:14px;line-height:1.6;color:#172b4d}.description p{margin:0 0 12px}.description h1,.description h2,.description h3,.description h4,.description h5,.description h6{margin:22px 0 10px;color:#172b4d}.description h1{font-size:24px}.description h2{font-size:20px}.description h3{font-size:16px}.description ul,.description ol{padding-left:26px}.description blockquote{margin:14px 0;padding:10px 14px;border-left:4px solid #4c9aff;background:#deebff;border-radius:3px}.description blockquote[data-panel="warning"]{border-color:#ffab00;background:#fffae6}.description blockquote[data-panel="error"]{border-color:#de350b;background:#ffebe6}.description pre{padding:13px;overflow:auto;background:#f4f5f7;border-radius:4px;border:1px solid #dfe1e6}.description code{font-family:"SFMono-Regular",Consolas,monospace;background:#f4f5f7;border-radius:3px;padding:1px 4px}.description pre code{padding:0}.description table{width:100%;border-collapse:collapse;margin:14px 0}.description th,.description td{border:1px solid #dfe1e6;padding:8px;vertical-align:top}.description th{background:#f4f5f7;text-align:left}.description a{color:#0052cc}.mention{color:#0052cc;background:#deebff;border-radius:10px;padding:1px 6px}.status{display:inline-block;background:#dfe1e6;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700;text-transform:uppercase}.format{display:inline-block;margin-left:8px;padding:2px 6px;background:#e9f2ff;color:#0052cc;border-radius:3px;font-size:10px;vertical-align:middle}
    </style></head><body><article class="issue"><header class="issue-head"><div class="crumb"><span class="key">LEAF-PREVIEW</span> / Jira issue</div><h1>${esc(title||'Untitled')} <span class="format">${esc(format||'RICH')}</span></h1></header><section class="field"><div class="field-label">Description</div><div class="description">${bodyHtml||'<p></p>'}</div></section></article></body></html>`;
  }

  function atlassianBodyForState(){
    const preview=atlassianPreviewState;
    if(!preview)return {html:'',label:'RICH'};
    if(preview.loadedText!=null){
      if(preview.format==='markdown')return {html:window.JiraExport.markdownToRichHtml(preview.loadedText),label:'MARKDOWN'};
      if(preview.format==='adf')return {html:window.JiraExport.adfToRichHtml(JSON.parse(preview.loadedText)),label:'ADF JSON'};
    }
    if(preview.format==='markdown')return {html:window.JiraExport.markdownToRichHtml(window.JiraExport.toMarkdown(preview.semantic)),label:'MARKDOWN'};
    if(preview.format==='adf')return {html:window.JiraExport.adfToRichHtml(window.JiraExport.toAdf(preview.semantic)),label:'ADF JSON'};
    return {html:window.JiraExport.toRichHtml(preview.semantic),label:'RICH TEXT'};
  }

  function setAtlassianPreviewChrome(active){
    const pane=$('#splitView [data-view-slot="right"]');
    pane?.classList.toggle('atlassian-preview-active',!!active);
    if(refs.atlassianPreviewToolbar)refs.atlassianPreviewToolbar.hidden=!active;
    if(refs.atlassianPreviewActions)refs.atlassianPreviewActions.hidden=!active;
  }

  function renderAtlassianPreview(){
    if(!atlassianPreviewState)return false;
    setAtlassianPreviewChrome(true);
    refs.rightFrame.closest('.view-pane')?.classList.remove('is-empty');
    refs.atlassianPreviewSource.textContent=atlassianPreviewState.sourceLabel||'';
    $$('[data-atlassian-format]').forEach(button=>{
      const unavailable=atlassianPreviewState.loadedText!=null&&button.dataset.atlassianFormat!==atlassianPreviewState.format;
      button.disabled=unavailable;
      button.classList.toggle('active',button.dataset.atlassianFormat===atlassianPreviewState.format);
    });
    let body;
    try{body=atlassianBodyForState();}
    catch(error){body={html:`<blockquote data-panel="error"><p><strong>Cannot render this file.</strong></p><p>${esc(error.message)}</p></blockquote>`,label:'ERROR'};}
    refs.rightFrame.setAttribute('sandbox','allow-same-origin');
    refs.rightFrame.dataset.previewRuntime='atlassian-preview';
    refs.rightFrame.dataset.snapshotPageId='';
    refs.rightFrame.srcdoc=jiraTicketPreviewDocument(atlassianPreviewState.title,body.html,body.label);
    applyPreviewSize('right');
    return true;
  }

  function openAtlassianSplitPreview(page,{semantic,sourceKind,diagnostics}){
    atlassianPreviewState={pageId:page.id,title:page.name||page.fileName||'Jira ticket',sourceLabel:`${page.fileName||page.name||'Page'} · ${sourceKind}`,semantic,diagnostics,format:'rich',loadedText:null};
    setHtmlEditEnabled(false);
    state.mode='split';
    state.views.left=page.id;
    activeSlots.split='left';
    renderViewMode();
    persist();
  }

  function closeAtlassianSplitPreview(){
    if(!atlassianPreviewState)return;
    atlassianPreviewState=null;
    setAtlassianPreviewChrome(false);
    renderViewMode();
    persist();
  }

  async function loadAtlassianPreviewFile(file){
    if(!file)return;
    const name=String(file.name||'');
    const format=/\.json$/i.test(name)?'adf':/\.(md|markdown)$/i.test(name)?'markdown':null;
    if(!format)return showToast('Atlassian Preview supports .md, .markdown, and .json files');
    try{
      const text=await file.text();
      if(format==='adf')window.JiraExport.adfToRichHtml(JSON.parse(text));
      if(!atlassianPreviewState)atlassianPreviewState={pageId:null,semantic:null,diagnostics:null};
      Object.assign(atlassianPreviewState,{title:name.replace(/\.(md|markdown|json)$/i,''),sourceLabel:name,format,loadedText:text});
      renderAtlassianPreview();
      showToast(`${name} rendered as a Jira ticket body`);
    }catch(error){showToast(`Atlassian preview failed: ${error.message}`);}
  }

  async function runJiraCheck(slot=null){
    if(slot)activateViewportSlot(slot);
    const page=pageById(slot?pageIdForSlot(slot):currentActivePageId());
    if(!page||page.isEmpty||!(page.source||'').trim())return showToast('Select a non-empty page first');
    $$('[data-jira-check-slot]').forEach(b=>b.textContent='Checking…');
    await new Promise(requestAnimationFrame);

    try{
      const {semantic,sourceKind,diagnostics}=await buildJiraExportDocument(page);
      jiraCheckState={pageId:page.id,slot:slot||null,sourceKind,...diagnostics};
      applyJiraMarkers(jiraCheckState);
      renderJiraCheckPopover(jiraCheckState);
      openAtlassianSplitPreview(page,{semantic,sourceKind,diagnostics});
      $$('[data-jira-check-slot]').forEach(b=>{
        b.textContent=jiraCheckState.issues.length?`${jiraCheckState.issues.length} Atlassian Issues`:'Atlassian Safe';
        b.classList.toggle('blocked',jiraCheckState.counts.blocked>0);
        b.classList.remove('stale');
      });
    }catch(error){
      console.error('Atlassian check failed',error);
      $$('[data-jira-check-slot]').forEach(button=>button.textContent='Check Atlassian');
      showToast(`Atlassian check failed: ${error.message}`);
    }
  }

  $$('[data-jira-check-slot]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();runJiraCheck(button.dataset.jiraCheckSlot);
  }));
  $('#jiraCheckRecheck')?.addEventListener('click',()=>runJiraCheck(jiraCheckState?.slot||null));
  $('#jiraCheckClear')?.addEventListener('click',clearJiraMarkers);
  $('#jiraCheckClose')?.addEventListener('click',()=>{refs.jiraCheckPopover.hidden=true;});
  $$('[data-atlassian-format]').forEach(button=>button.addEventListener('click',()=>{
    if(!atlassianPreviewState||button.disabled)return;
    atlassianPreviewState.format=button.dataset.atlassianFormat;
    renderAtlassianPreview();
  }));
  $('#atlassianOpenFile')?.addEventListener('click',()=>refs.atlassianFileInput?.click());
  refs.atlassianFileInput?.addEventListener('change',async()=>{
    await loadAtlassianPreviewFile(refs.atlassianFileInput.files?.[0]);
    refs.atlassianFileInput.value='';
  });
  $('#atlassianPreviewClose')?.addEventListener('click',closeAtlassianSplitPreview);

  // Group Tile View: selecting a Group covers the viewport with its descendants
  // as square thumbnails. Thumbnails are scripts-off, non-same-origin iframes
  // filled only once a tile scrolls into view - opening a 200-Page Group must
  // never spawn 200 live documents at once.
  const GROUP_TILE_LOGICAL_SIZE=1280;
  let groupTileIntersection=null;
  let groupTileResize=null;
  let groupTileSignature='';

  function selectedGroupContext(){
    if(!selectedTreeNode) return null;
    const found=nodeById(selectedTreeNode);
    return found?.node?.type==='group' ? found : null;
  }

  function teardownGroupTileObservers(){
    groupTileIntersection?.disconnect();groupTileIntersection=null;
    groupTileResize?.disconnect();groupTileResize=null;
  }

  function scaleGroupTileThumbs(){
    if(!refs.groupTileGrid) return;
    refs.groupTileGrid.querySelectorAll('.group-tile-thumb iframe').forEach(frame=>{
      const width=frame.parentElement?.clientWidth||0;
      if(!width) return;
      frame.style.transform=`scale(${width/GROUP_TILE_LOGICAL_SIZE})`;
    });
  }

  function fillGroupTileThumb(thumb){
    if(thumb.dataset.tileFilled==='true') return;
    thumb.dataset.tileFilled='true';
    const page=pageById(thumb.dataset.pageId);
    if(!pageHasRenderableContent(page)||isBinaryPage(page)) return;
    const frame=document.createElement('iframe');
    frame.setAttribute('sandbox','');
    frame.setAttribute('scrolling','no');
    frame.setAttribute('tabindex','-1');
    frame.setAttribute('aria-hidden','true');
    frame.title=`${page.name} thumbnail`;
    frame.srcdoc=buildPreviewSource(page,{allowScripts:false});
    thumb.querySelector('.group-tile-placeholder')?.remove();
    thumb.appendChild(frame);
    scaleGroupTileThumbs();
  }

  function groupTilePlaceholderLabel(node){
    if(node.type==='group') return 'GROUP';
    if(node.documentType==='pdf') return 'PDF';
    if(!pageHasRenderableContent(node)) return 'EMPTY';
    return '';
  }

  function buildGroupTile(project,node){
    const tile=document.createElement('button');
    tile.type='button';
    tile.className=`group-tile${node.type==='group'?' is-group':''}`;
    tile.dataset.tileNodeId=node.id;
    tile.title=node.name;
    const thumb=document.createElement('div');
    thumb.className='group-tile-thumb';
    const label=groupTilePlaceholderLabel(node);
    if(node.type==='page'&&!label) thumb.dataset.pageId=node.id;
    if(label){
      const placeholder=document.createElement('div');
      placeholder.className='group-tile-placeholder';
      placeholder.textContent=node.type==='group'?'▰':label;
      thumb.appendChild(placeholder);
    }
    if(node.type==='page'&&node.documentType&&node.documentType!=='html'){
      const badge=document.createElement('span');
      badge.className='group-tile-badge';
      badge.textContent=node.documentType.toUpperCase();
      thumb.appendChild(badge);
    }
    const name=document.createElement('span');
    name.className='group-tile-name';
    name.textContent=node.name;
    tile.append(thumb,name);
    tile.addEventListener('click',()=>{
      if(node.type==='group'){
        withUnsavedInspectorGuard(()=>{
          state.selectedDocumentId=project.id;
          selectedTreeNode=node.id;
          clearInspector();renderAll();persist();
        });
        return;
      }
      selectPageFromTree(node.id);
      persist();
    });
    return tile;
  }

  function renderGroupTileView(){
    const view=refs.groupTileView,grid=refs.groupTileGrid;
    if(!view||!grid) return;
    const found=selectedGroupContext();
    if(!found){
      teardownGroupTileObservers();
      groupTileSignature='';
      document.body.classList.remove('group-tiles-open');
      if(!view.hidden){view.hidden=true;grid.textContent='';}
      return;
    }
    const {project,node}=found;
    const items=children(project,node.id);
    // renderTree() runs on every search keystroke; rebuilding the grid there
    // would discard every already-loaded thumbnail for nothing.
    const signature=[node.id,node.name,items.map(item=>`${item.id}:${item.name}:${item.documentType||''}:${pageHasRenderableContent(item)?1:0}`).join('|')].join('#');
    if(signature===groupTileSignature&&!view.hidden) return;
    groupTileSignature=signature;
    teardownGroupTileObservers();
    grid.textContent='';
    view.hidden=false;
    document.body.classList.add('group-tiles-open');
    refs.groupTileTitle.textContent=node.name;
    refs.groupTileCount.textContent=items.length?`${items.length} item${items.length===1?'':'s'}`:'';
    if(!items.length){
      const empty=document.createElement('div');
      empty.className='group-tile-empty';
      empty.textContent='This Group has no Pages yet.';
      grid.appendChild(empty);
      emitLifecycle('leaf-group-tiles-rendered',{groupId:node.id,count:0});
      return;
    }
    items.forEach(item=>grid.appendChild(buildGroupTile(project,item)));
    groupTileIntersection=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting) return;
        groupTileIntersection?.unobserve(entry.target);
        fillGroupTileThumb(entry.target);
      });
    },{root:grid,rootMargin:'150px'});
    grid.querySelectorAll('.group-tile-thumb[data-page-id]').forEach(thumb=>groupTileIntersection.observe(thumb));
    groupTileResize=new ResizeObserver(()=>scaleGroupTileThumbs());
    groupTileResize.observe(grid);
    emitLifecycle('leaf-group-tiles-rendered',{groupId:node.id,count:items.length});
  }

  refs.groupTileClose?.addEventListener('click',()=>{
    const found=selectedGroupContext();
    if(!found) return;
    withUnsavedInspectorGuard(()=>{
      selectedTreeNode=null;
      renderAll();persist();
    });
  });

  function setModePanelVisibility(){
    $$('[data-mode-panel]').forEach(panel=>{
      panel.classList.toggle('is-active', panel.dataset.modePanel===state.mode);
    });
  }

  function ensureDistinctSplitBindings(preferredLeftId){
    const leftId=pageById(preferredLeftId)?preferredLeftId:(pageList()[0]?.page.id||null);
    state.views.left=leftId;
    if(pageById(state.views.right)&&!samePageDocument(state.views.right,leftId))return;
    const alternate=pageList().map(item=>item.page).find(page=>!samePageDocument(page.id,leftId));
    if(alternate){state.views.right=alternate.id;return;}
    const project=nodeById(leftId)?.project||activeDocument();
    if(!project)return;
    const page={id:uid('page'),type:'page',name:'Split Right',fileName:'untitled.html',documentType:'html',parentId:null,order:children(project,null).length,source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true};
    project.nodes.push(page);state.views.right=page.id;
  }

  function bindPageToSlot(slot,nextPageId){
    const nextPage=pageById(nextPageId);
    if(!nextPage)return false;
    // A repository Page is a stub until it is first opened. Fetching it here
    // rather than making this function async keeps every existing caller
    // unchanged; the render happens again once the text arrives.
    if(nextPage.remote&&!nextPage.remote.loaded){
      ensureGithubPageLoaded(nextPage).then(loaded=>{if(loaded)renderAll();});
      ensureDrivePageLoaded(nextPage).then(loaded=>{if(loaded)renderAll();});
    }
    if(slot==='codePreview'||slot==='codePage'){
      state.views.codePreview=nextPageId;
      state.views.codePage=nextPageId;
      return true;
    }
    if(slot==='left'||slot==='right'){
      const other=slot==='left'?'right':'left';
      const previous=state.views[slot];
      if(samePageDocument(nextPageId,state.views[other])){
        if(pageById(previous)&&!samePageDocument(previous,nextPageId))state.views[other]=previous;
        else{
          const alternate=pageList().map(item=>item.page).find(page=>!samePageDocument(page.id,nextPageId));
          state.views[other]=alternate?.id||null;
        }
      }
      state.views[slot]=nextPageId;
      if(!pageById(state.views[other])||samePageDocument(state.views[slot],state.views[other]))ensureDistinctSplitBindings(state.views.left);
      return true;
    }
    state.views.single=nextPageId;
    return true;
  }

  function renderViewMode(){
    repairViews();
    $$('#viewSeg button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
    setModePanelVisibility();

    if(state.mode==='preview'){
      renderPageSelects();
      renderFrame(refs.singleFrame,state.views.single);
    }

    if(state.mode==='split'){
      renderPageSelects();
      if(atlassianPreviewState){
        state.views.left=atlassianPreviewState.pageId||state.views.left;
        renderFrame(refs.leftFrame,state.views.left);
        renderAtlassianPreview();
      }else{
        setAtlassianPreviewChrome(false);
        renderFrame(refs.leftFrame,state.views.left);
        renderFrame(refs.rightFrame,state.views.right);
      }
    }

    if(state.mode==='code'){
      renderPageSelects();
      renderFrame(refs.codePreviewFrame,state.views.codePreview);
      loadCodePage();
    }

    renderAllPreviewSizes();
    applyActiveViewOutline();
    setTimeout(renderHierarchy,0);
    renderTree();
    renderCrumbs();
    renderGroupTileView();
    emitLifecycle('leaf-view-mode-changed',{mode:state.mode});
  }

  $$('#viewSeg button[data-mode]').forEach(button=>{
    button.addEventListener('click',()=>{
      const nextMode=button.dataset.mode;
      if(!['preview','split','code'].includes(nextMode) || nextMode===state.mode) return;
      withUnsavedInspectorGuard(()=>{
        const currentPageId=currentActivePageId();
        atlassianPreviewState=null;
        setAtlassianPreviewChrome(false);
        if(nextMode==='split'){
          // Split always owns two independent document bindings.
          ensureDistinctSplitBindings(currentPageId);
          activeSlots.split='left';
        }
        if(nextMode==='code'){
          // Code always follows the visual View that was active at transition time.
          state.views.codePreview=currentPageId;
          state.views.codePage=currentPageId;
          activeSlots.code='editor';
        }
        setHtmlEditEnabled(false);
        state.mode=nextMode;
        clearInspector();
        renderViewMode();
        persist();
      });
    });
  });

  function renderPageSelects(){
    const pages=pageList();
    const options=pages.map(x=>`<option value="${x.page.id}">${esc(x.project.name)} / ${esc(x.page.name)}${x.page.documentType&&x.page.documentType!=='html'?` [${x.page.documentType.toUpperCase()}]`:''}</option>`).join('');

    const bindings=[
      ['#singlePageName','single',refs.singleFrame],
      ['#leftPageSelect','left',refs.leftFrame],
      ['#rightPageSelect','right',refs.rightFrame],
      ['#codePreviewSelect','codePreview',refs.codePreviewFrame],
      ['#codePageSelect','codePage',null]
    ];

    bindings.forEach(([selector,key,frame])=>{
      const el=$(selector);
      if(!el) return;
      el.innerHTML=options;
      el.value=state.views[key]||pages[0]?.page.id||'';
      el.onchange=()=>{
        const nextPageId=el.value;
        const previousPageId=state.views[key];
        if(nextPageId===previousPageId) return;
        withUnsavedInspectorGuard(()=>{
          bindPageToSlot(key,nextPageId);
          selectedTreeNode=nextPageId;
          const found=nodeById(nextPageId);
          if(found) state.selectedDocumentId=found.project.id;

          clearInspector();
          if(key==='codePreview'||key==='codePage'){
            renderFrame(refs.codePreviewFrame,nextPageId);
            loadCodePage();
            $('#codePreviewSelect').value=nextPageId;
            $('#codePageSelect').value=nextPageId;
          }else if(state.mode==='split'&&(key==='left'||key==='right')){
            if(atlassianPreviewState){atlassianPreviewState=null;setAtlassianPreviewChrome(false);}
            renderPageSelects();renderFrame(refs.leftFrame,state.views.left);renderFrame(refs.rightFrame,state.views.right);
          }else if(frame){
            renderFrame(frame,nextPageId);
          }

          renderTree();
          renderCrumbs();
          persist();
        }, ()=>{
          el.value=previousPageId || '';
        });
      };
    });
    emitLifecycle('leaf-page-selects-rendered',{});
  }

  function currentActivePageId(){
    if(state.mode==='preview') return state.views.single;
    if(state.mode==='split') return activeSlots.split==='right' ? state.views.right : state.views.left;
    return activeSlots.code==='preview' ? state.views.codePreview : state.views.codePage;
  }

  function selectPageFromTree(pageId,rerender=true){
    const currentPageId=currentActivePageId();
    if(pageId===currentPageId){
      selectedTreeNode=pageId;
      const found=nodeById(pageId);
      if(found) state.selectedDocumentId=found.project.id;
      if(rerender) renderAll();
      return;
    }

    withUnsavedInspectorGuard(()=>{
      if(state.mode==='preview') bindPageToSlot('single',pageId);
      else if(state.mode==='split') bindPageToSlot(activeSlots.split==='right'?'right':'left',pageId);
      else if(state.mode==='code') bindPageToSlot(activeSlots.code==='preview'?'codePreview':'codePage',pageId);

      selectedTreeNode=pageId;
      const found=nodeById(pageId);
      if(found) state.selectedDocumentId=found.project.id;
      clearInspector();
      if(rerender) renderAll();
    });
  }

  function activateViewportSlot(slot){
    if(slot==='right'&&atlassianPreviewState){
      activeSlots.split='left';
      applyActiveViewOutline();
      return;
    }
    if(slot==='left'||slot==='right') activeSlots.split=slot;
    if(slot==='codePreview') activeSlots.code='preview';
    if(slot==='codePage') activeSlots.code='editor';

    const pageId=pageIdForSlot(slot);
    const found=pageId ? nodeById(pageId) : null;
    if(found){
      selectedTreeNode=pageId;
      state.selectedDocumentId=found.project.id;
    }

    applyActiveViewOutline();
    renderTree();
    renderCrumbs();
    persist();
  }

  [
    ['#singleView','single'],
    ['#splitView [data-view-slot="left"]','left'],
    ['#splitView [data-view-slot="right"]','right'],
    ['#codeView [data-view-slot="code-preview"]','codePreview'],
    ['.code-editor-pane','codePage']
  ].forEach(([selector,slot])=>{
    $(selector)?.addEventListener('pointerdown',()=>activateViewportSlot(slot),true);
  });

  // Page selector changes are guarded; the pane becomes active only after the selection change is accepted.

  function applyActiveViewOutline(){
    $$('.view-pane,.code-editor-pane').forEach(p=>p.classList.remove('active-view'));

    if(state.mode==='preview'){
      $('#singleView').classList.add('active-view');
      return;
    }

    if(state.mode==='split'){
      $(`#splitView [data-view-slot="${activeSlots.split==='right'?'right':'left'}"]`)?.classList.add('active-view');
      return;
    }

    if(activeSlots.code==='preview'){
      $('#codeView [data-view-slot="code-preview"]')?.classList.add('active-view');
    }else{
      $('.code-editor-pane')?.classList.add('active-view');
    }
  }

  function pageRequiresScripts(page){
    return !!page && page.documentType==='html' && /<script\b[^>]*>/i.test(page.source||'');
  }

  function pageHasRenderableContent(page){
    return !!page && !page.isEmpty && (isBinaryPage(page)?!!(page.previewUrl||page.sourcePath):!!String(page.source||'').trim());
  }

  function scrollFrameToFragment(doc,fragment){
    if(!fragment){doc.scrollingElement?.scrollTo({top:0,behavior:'auto'});return;}
    const target=doc.getElementById(fragment)||[...doc.getElementsByName(fragment)][0];
    target?.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});
  }

  const EXTERNAL_LINK_SCHEME=/^(https?|mailto|tel):/i;

  // Every link in a preview is handled here, and every one of them is
  // preventDefault()ed. Letting one through navigates the iframe itself: the
  // srcdoc preview is replaced - by chrome-error:// for a missing file, or by
  // the live site for an external link - and the View is dead until the user
  // switches modes, because re-picking the same Page in the select is a no-op.
  async function followPreviewLink(frame,doc,anchor,raw){
    const slot=previewSlotForFrame(frame);
    const page=pageById(frameToPageId(frame));
    if(EXTERNAL_LINK_SCHEME.test(raw)){
      try{
        await window.electronAPI.openExternalLink(anchor.href||raw);
        showToast('Opened in your browser');
      }catch(error){ showToast(`Could not open the link: ${error.message}`); }
      return;
    }
    if(!page?.baseUrl){ showToast('This Page has no folder to resolve the link against'); return; }
    let target=null;
    try{ target=await window.electronAPI.resolveLinkTarget({href:raw,baseUrl:page.baseUrl}); }
    catch(error){ showToast(`Could not resolve the link: ${error.message}`); return; }
    if(!target?.filePath){ showToast('That link does not point at a local page'); return; }
    if(!target.documentType){ showToast(`Leaf opens HTML, Markdown, JSON, XML, PDF and images - not ${target.filePath.split(/[\\/]/).pop()}`); return; }

    const already=loadedPageForPath(target.filePath);
    if(already){
      bindPageToSlot(slot,already.page.id);
      selectedTreeNode=already.page.id;
      state.selectedDocumentId=already.project.id;
      clearInspector();renderAll();persist();
      showToast(`Opened ${already.page.name}`);
      return;
    }
    if(!target.exists){ showToast(`Linked file not found: ${target.filePath.split(/[\\/]/).pop()}`); return; }
    try{
      const result=await window.electronAPI.readPageAtPath(target.filePath);
      const added=await addPageResultToDocument(result,slot);
      if(added) showToast(`Opened ${added.name}`);
    }catch(error){ showToast(`Could not open the linked page: ${error.message}`); }
  }

  function installLocalAnchorNavigation(frame){
    let doc=null;try{doc=frame?.contentDocument}catch{}
    if(!doc||doc.__leafLocalAnchorNavigation)return false;
    doc.__leafLocalAnchorNavigation=true;
    doc.addEventListener('click',event=>{
      if(canInspectFrame(frame))return;
      const anchor=event.target?.closest?.('a[href]');
      const raw=anchor?.getAttribute('href')?.trim()||'';
      if(!raw)return;
      event.preventDefault();event.stopPropagation();
      if(raw.startsWith('#')){
        let fragment='';try{fragment=decodeURIComponent(raw.slice(1))}catch{fragment=raw.slice(1)}
        scrollFrameToFragment(doc,fragment);
        return;
      }
      withUnsavedInspectorGuard(()=>{followPreviewLink(frame,doc,anchor,raw);});
    },true);
    return true;
  }


  function snapshotBridgeScript(token){
    const safeToken=JSON.stringify(String(token||''));
    return `<script data-hbe-export-bridge>
      (() => {
        const TOKEN=${safeToken};
        const sendSnapshot=() => {
          try {
            parent.postMessage({
              __hbeRenderedSnapshot:true,
              token:TOKEN,
              html:document.documentElement.outerHTML,
              title:document.title || ''
            }, '*');
          } catch {}
        };
        const runSearch=(query,requestedIndex=0) => {
          try {
            CSS.highlights?.delete('leaf-search-all');CSS.highlights?.delete('leaf-search-current');
            document.querySelector('[data-hbe-search-style]')?.remove();
            const ranges=[];const needle=String(query||'').toLocaleLowerCase();
            if(needle){
              const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;return node.data&&parent&&!parent.closest('script,style,noscript,textarea,input,select')&&node.data.toLocaleLowerCase().includes(needle)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
              let node;while((node=walker.nextNode())){const text=node.data.toLocaleLowerCase();let from=0;while(from<=text.length-needle.length){const at=text.indexOf(needle,from);if(at<0)break;const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+needle.length);ranges.push(range);from=at+Math.max(1,needle.length);}}
            }
            const index=ranges.length?((Number(requestedIndex)||0)%ranges.length+ranges.length)%ranges.length:0;
            if(ranges.length&&CSS.highlights&&window.Highlight){const style=document.createElement('style');style.dataset.hbeSearchStyle='1';style.textContent='::highlight(leaf-search-all){background:#ffe36e;color:#172033}::highlight(leaf-search-current){background:#ff963d;color:#111827;text-decoration:underline 2px}';document.head.appendChild(style);CSS.highlights.set('leaf-search-all',new Highlight(...ranges));CSS.highlights.set('leaf-search-current',new Highlight(ranges[index]));ranges[index].startContainer.parentElement?.scrollIntoView({block:'center',inline:'nearest'});}
            parent.postMessage({__leafViewSearchResult:true,token:TOKEN,count:ranges.length,index},'*');
          } catch { parent.postMessage({__leafViewSearchResult:true,token:TOKEN,count:0,index:0},'*'); }
        };
        addEventListener('message', event => {
          if(event.data && event.data.__leafViewportChromeScale===true && event.data.token===TOKEN){const style=document.querySelector('[data-leaf-scrollbar-runtime]');if(style&&typeof event.data.css==='string'&&event.data.css.length<1200)style.textContent=event.data.css;return;}
          if(event.data && event.data.__leafViewSearch===true && event.data.token===TOKEN){runSearch(event.data.query,event.data.index);return;}
          if((event.data && event.data.__leafViewTocScroll===true || event.data && event.data.__leafViewTocHighlight===true) && event.data.token===TOKEN){
            try{
              document.querySelectorAll('[data-editor-overlay="toc-heading-highlight"]').forEach(node=>node.remove());
              const target=document.querySelectorAll('h1,h2,h3,h4,h5,h6')[event.data.index];
              if(!target)return;
              if(event.data.__leafViewTocScroll===true)target.scrollIntoView({block:'start',inline:'nearest'});
              const rect=target.getBoundingClientRect();
              if(!rect.width && !rect.height)return;
              const marker=document.createElement('div');
              marker.dataset.editorOverlay='toc-heading-highlight';
              Object.assign(marker.style,{position:'absolute',zIndex:2147483644,pointerEvents:'none',
                left:(rect.left+scrollX-4)+'px',top:(rect.top+scrollY-3)+'px',
                width:(rect.width+8)+'px',height:(rect.height+6)+'px',
                border:'2px solid #2f6fed',background:'rgba(47,111,237,.14)',
                borderRadius:'4px',boxSizing:'border-box'});
              document.body.appendChild(marker);
            }catch{}
            return;
          }
          if(event.data && event.data.__hbeSnapshotRequest===TOKEN) sendSnapshot();
        });
        addEventListener('pointerdown', () => {
          parent.postMessage({__hbeViewportInput:true,token:TOKEN,kind:'activate'}, '*');
        }, true);
        addEventListener('click', event => {
          const anchor=event.target&&event.target.closest&&event.target.closest('a[href]');
          const raw=anchor&&String(anchor.getAttribute('href')||'').trim();
          if(!raw||raw[0]!=='#')return;
          event.preventDefault();event.stopPropagation();
          let fragment='';try{fragment=decodeURIComponent(raw.slice(1))}catch{fragment=raw.slice(1)}
          if(!fragment){scrollTo({top:0,behavior:'auto'});return;}
          const target=document.getElementById(fragment)||document.getElementsByName(fragment)[0];
          if(target)target.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});
        }, true);
        addEventListener('wheel', event => {
          if(!event.ctrlKey) return;
          event.preventDefault();
          event.stopPropagation();
          parent.postMessage({
            __hbeViewportInput:true,
            token:TOKEN,
            kind:'zoom',
            direction:event.deltaY<0?1:-1,
            clientX:event.clientX,
            clientY:event.clientY
          }, '*');
        }, {capture:true,passive:false});
        if(document.readyState==='loading'){
          addEventListener('DOMContentLoaded', () => {
            setTimeout(sendSnapshot,0);
            setTimeout(sendSnapshot,120);
          }, {once:true});
        }else{
          setTimeout(sendSnapshot,0);
        }
        addEventListener('load', () => setTimeout(sendSnapshot,0), {once:true});
      })();
    <\/script>`;
  }

  function buildPreviewSource(page,{allowScripts=false,bridgeToken=''}={}){
    if(!page) return '<!doctype html><html><body></body></html>';
    if(page.documentType==='markdown'){
      const rich=window.JiraExport?.markdownToRichHtml?.(page.source||'')||`<pre>${esc(page.source||'')}</pre>`;
      return `<!doctype html><html><head><base href="${esc(page.baseUrl||'')}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data: blob: https: http:; style-src 'unsafe-inline'; font-src file: data: https: http:;"><style>html{color-scheme:light}body{max-width:920px;margin:0 auto;padding:42px 48px;color:#20242a;background:#fff;font:15px/1.65 system-ui,-apple-system,'Segoe UI',sans-serif}img{max-width:100%}pre{overflow:auto;padding:14px;background:#f4f5f7;border-radius:6px}code{font-family:Consolas,monospace}table{border-collapse:collapse}th,td{border:1px solid #d9dde3;padding:7px 9px}</style></head><body>${rich}</body></html>`;
    }
    if(page.documentType==='json'){
      let formatted=String(page.source||''),error='';
      try{formatted=JSON.stringify(JSON.parse(formatted),null,2);}catch(parseError){error=parseError.message||'Invalid JSON';}
      const diagnostic=error?`<div class="json-error"><strong>JSON validation error</strong>${esc(error)}</div>`:'<div class="json-valid">Valid JSON</div>';
      return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>html{color-scheme:light}body{margin:0;padding:30px 36px;color:#20242a;background:#fff;font:14px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}.json-valid,.json-error{position:sticky;top:0;margin:0 0 14px;padding:9px 12px;border-radius:6px}.json-valid{color:#176b3a;background:#e7f6ed}.json-error{display:flex;gap:10px;color:#9b2525;background:#fdecec}pre{margin:0;padding:18px;overflow:auto;border:1px solid #d9dde3;border-radius:7px;background:#f7f8fa;color:#172033;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 Consolas,'SFMono-Regular',monospace}</style></head><body>${diagnostic}<pre>${esc(formatted)}</pre></body></html>`;
    }
    if(page.documentType==='image'){
      // Rendered through the normal srcdoc path rather than pointing the frame
      // at the file: a bare image document is laid out by the browser on its own
      // background, which ignores the View's zoom and fit chrome. The wrapper
      // keeps it centred and scaled like every other Page.
      const href=page.previewUrl||`file:///${String(page.sourcePath||'').replace(/\\/g,'/')}`;
      const alt=esc(page.name||page.fileName||'Image');
      return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data: blob:; style-src 'unsafe-inline';"><style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:#fff;color-scheme:light}img{max-width:100%;max-height:100%;object-fit:contain;image-rendering:auto}</style></head><body><img src="${esc(href)}" alt="${alt}"></body></html>`;
    }
    if(page.documentType==='xml'){
      // Shown as written, not reformatted. Whitespace inside XML can be
      // significant (mixed content, xml:space), so pretty-printing the preview
      // would misrepresent the file. Well-formedness is still reported.
      const raw=String(page.source||'');
      let error='';
      try{
        const parsed=new DOMParser().parseFromString(raw,'application/xml');
        const failure=parsed.querySelector('parsererror');
        if(failure)error=(failure.textContent||'Malformed XML').trim().split('\n')[0];
      }catch(parseError){ error=parseError.message||'Malformed XML'; }
      const diagnostic=error?`<div class="json-error"><strong>XML validation error</strong>${esc(error)}</div>`:'<div class="json-valid">Well-formed XML</div>';
      return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>html{color-scheme:light}body{margin:0;padding:30px 36px;color:#20242a;background:#fff;font:14px/1.55 system-ui,-apple-system,'Segoe UI',sans-serif}.json-valid,.json-error{position:sticky;top:0;margin:0 0 14px;padding:9px 12px;border-radius:6px}.json-valid{color:#176b3a;background:#e7f6ed}.json-error{display:flex;gap:10px;color:#9b2525;background:#fdecec}pre{margin:0;padding:18px;overflow:auto;border:1px solid #d9dde3;border-radius:7px;background:#f7f8fa;color:#172033;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 Consolas,'SFMono-Regular',monospace}</style></head><body>${diagnostic}<pre>${esc(raw)}</pre></body></html>`;
    }
    const base=page.baseUrl?`<base href="${esc(page.baseUrl)}">`:'';
    // A Page fetched from the web is a live page, and the live web is external
    // scripts and fetch. The strict policy below was written when Leaf only
    // opened local files, where refusing both was a cheap default; applied to a
    // fetched page it renders most of the web as a blank frame - which is
    // exactly what it did.
    //
    // What isolates a scripted preview is not this policy but the sandbox: the
    // frame runs with allow-scripts and WITHOUT allow-same-origin, so its
    // scripts live on an opaque origin with no reach into Leaf, the app's
    // storage, or any cookie. Letting such a page load its own scripts and call
    // its own APIs is what "show me this page" means, and is what a browser tab
    // does. A local file gets no such widening: there, blocking them still
    // costs nothing.
    const remote=/^https?:/i.test(String(page.baseUrl||''));
    const scriptSources=remote
      ? `script-src 'unsafe-inline' 'unsafe-eval' https: http:; connect-src https: http: data: blob:;`
      : `script-src 'unsafe-inline'; connect-src 'none';`;
    const csp=allowScripts
      ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${scriptSources} img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; object-src 'none'; frame-src 'none';">`
      : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; object-src 'none'; frame-src 'none';">`;
    const bridge=allowScripts && bridgeToken ? snapshotBridgeScript(bridgeToken) : '';
    let source=page.source||'';
    if(/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i,`<head$1>${base}${csp}${bridge}`);
    if(/<html[\s>]/i.test(source)) return source.replace(/<html([^>]*)>/i,`<html$1><head>${base}${csp}${bridge}</head>`);
    return `<!doctype html><html><head>${base}${csp}${bridge}</head><body>${source}</body></html>`;
  }

  // PDF and images are the same kind of Page: a binary the app shows but cannot
  // edit as source. Everywhere that means "binary, preview-only, read-only"
  // asks this rather than naming a type, so a third such format is one entry.
  function isBinaryPage(page){return page?.documentType==='pdf'||page?.documentType==='image';}
  function isDirectSourceType(page){return page?.documentType==='markdown'||page?.documentType==='json'||page?.documentType==='xml';}
  function isDirectSourceEdit(page,slot){return !!htmlEditEnabled&&editOwnerSlot===slot&&!!frameForEditSlot(slot)&&isDirectSourceType(page);}
  function isPdfNativeEdit(page,slot){return !!htmlEditEnabled&&editOwnerSlot===slot&&!!frameForEditSlot(slot)&&page?.documentType==='pdf';}

  function buildDirectSourceEditor(page,token,zoom=100){
    const initial=JSON.stringify(String(page.source||'')).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const label=DIRECT_SOURCE_LABEL[page.documentType]||'Markdown';
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;color-scheme:dark}body{display:grid;grid-template-rows:38px 1fr 26px;background:#12161d;color:#d8dee9;font:12px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}.source-head,.source-foot{display:flex;align-items:center;gap:9px;padding:0 12px;background:#181e27;color:#9ba8ba}.source-head{border-bottom:1px solid #2b3442}.source-head strong{color:#f2f5f9}.source-foot{justify-content:space-between;border-top:1px solid #2b3442}.status.valid{color:#78d39a}.status.invalid{color:#ff8b8b}textarea{box-sizing:border-box;width:100%;height:100%;resize:none;border:0;outline:0;padding:18px 20px;background:#0f1319;color:#e4e9f0;tab-size:2;white-space:pre;overflow:auto;font:13px/1.58 Consolas,'SFMono-Regular',monospace;caret-color:#8ab4ff}textarea::selection{background:#315b96}</style><style data-leaf-scrollbar-runtime>${runtimePreviewScrollbarCss(zoom)}</style></head><body><div class="source-head"><strong>${label} Source</strong><span>Edit is applied immediately</span></div><textarea id="source" spellcheck="false" aria-label="${label} source editor"></textarea><div class="source-foot"><span id="status" class="status"></span><span>Tab: indent · Esc: finish</span></div><script>(()=>{const TOKEN=${JSON.stringify(token)};const INITIAL=${initial};const TYPE=${JSON.stringify(page.documentType)};const editor=document.getElementById('source');const status=document.getElementById('status');const send=(kind,extra={})=>parent.postMessage({__leafDirectSourceEdit:true,token:TOKEN,kind,...extra},'*');const validate=()=>{if(TYPE==='xml'){try{const d=new DOMParser().parseFromString(editor.value,'application/xml');const bad=d.querySelector('parsererror');if(bad)throw new Error((bad.textContent||'Malformed XML').trim().split('\\n')[0]);status.className='status valid';status.textContent='Well-formed XML';return true}catch(error){status.className='status invalid';status.textContent=error.message||'Malformed XML';return false}}if(TYPE!=='json'){status.className='status';status.textContent=editor.value.split('\\n').length+' lines';return true}try{JSON.parse(editor.value);status.className='status valid';status.textContent='Valid JSON';return true}catch(error){status.className='status invalid';status.textContent=error.message||'Invalid JSON';return false}};editor.value=INITIAL;validate();editor.addEventListener('pointerdown',()=>send('activate'),true);editor.addEventListener('input',()=>{validate();send('input',{source:editor.value})});editor.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');editor.dispatchEvent(new Event('input'))}else if(event.key==='Escape'){event.preventDefault();send('exit')}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();send('save')}});addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();event.stopPropagation();send('zoom',{direction:event.deltaY<0?1:-1,clientX:event.clientX,clientY:event.clientY})},{capture:true,passive:false});addEventListener('message',event=>{const data=event.data;if(!data||data.token!==TOKEN)return;if(data.__leafViewportChromeScale===true){const style=document.querySelector('[data-leaf-scrollbar-runtime]');if(style&&typeof data.css==='string'&&data.css.length<1200)style.textContent=data.css;return}if(data.__leafDirectSourceSearch===true){const query=String(data.query||''),needle=query.toLocaleLowerCase(),matches=[];if(needle){const text=editor.value.toLocaleLowerCase();let from=0;while(from<=text.length-needle.length){const at=text.indexOf(needle,from);if(at<0)break;matches.push(at);from=at+Math.max(1,needle.length)}}const index=matches.length?((Number(data.index)||0)%matches.length+matches.length)%matches.length:0;if(matches.length){editor.focus();editor.setSelectionRange(matches[index],matches[index]+query.length)}send('search-result',{count:matches.length,index});return}if(data.__leafDirectSourceReply!==true)return;editor.value=String(data.source||'');validate();if(data.message){status.className='status invalid';status.textContent=data.message}});setTimeout(()=>{editor.focus();send('activate');send('ready')},0)})();<\/script></body></html>`;
  }

  function configureFrameRuntime(frame,page,slot){
    if(isDirectSourceEdit(page,slot)){
      frame.closest('.view-pane')?.classList.remove('scripted-preview');
      frame.dataset.previewRuntime='direct-source-editor';
      const badge=$(`[data-runtime-badge="${slot}"]`);if(badge)badge.hidden=true;
      frame.setAttribute('sandbox','allow-scripts');
      return false;
    }
    if(page?.documentType==='image'){
      frame.closest('.view-pane')?.classList.remove('scripted-preview');
      frame.dataset.previewRuntime='document-readonly';
      const imageBadge=$(`[data-runtime-badge="${slot}"]`);if(imageBadge)imageBadge.hidden=true;
      frame.setAttribute('sandbox','allow-same-origin');
      return false;
    }
    if(page?.documentType==='pdf'){
      frame.closest('.view-pane')?.classList.remove('scripted-preview');
      frame.dataset.previewRuntime=isPdfNativeEdit(page,slot)?'pdf-native-editor':'document-readonly';
      const badge=$(`[data-runtime-badge="${slot}"]`);if(badge)badge.hidden=true;
      frame.removeAttribute('sandbox');
      return false;
    }
    if(page?.documentType&&page.documentType!=='html'){
      frame.closest('.view-pane')?.classList.remove('scripted-preview');
      frame.dataset.previewRuntime='document-readonly';
      const badge=$(`[data-runtime-badge="${slot}"]`);if(badge)badge.hidden=true;
      if(isDirectSourceType(page))frame.setAttribute('sandbox','allow-same-origin');
      else frame.removeAttribute('sandbox');
      return false;
    }
    const scripted=pageRequiresScripts(page);
    frame.closest('.view-pane')?.classList.toggle('scripted-preview',scripted);
    const badge=$(`[data-runtime-badge="${slot}"]`);
    if(badge){
      badge.hidden=!scripted;
      badge.textContent=scripted?'Interactive':'';
      badge.classList.toggle('interactive',scripted);
      badge.title=scripted?'JavaScript runs in an isolated opaque-origin sandbox.':'';
    }
    if(scripted){
      frame.setAttribute('sandbox','allow-scripts');
      frame.dataset.previewRuntime='interactive-isolated';
    }else{
      frame.setAttribute('sandbox','allow-same-origin');
      frame.dataset.previewRuntime='static-editable';
    }
    return scripted;
  }

  function previewSlotForFrame(frame){
    if(frame===refs.singleFrame) return 'single';
    if(frame===refs.leftFrame) return 'left';
    if(frame===refs.rightFrame) return 'right';
    if(frame===refs.codePreviewFrame) return 'codePreview';
    return null;
  }

  function renderFrame(frame,pageId){
    renderFrameContent(frame,pageId);
    emitLifecycle('leaf-frame-rendered',{frameId:frame?.id||null,pageId:pageId||null,slot:previewSlotForFrame(frame)});
  }

  function renderFrameContent(frame,pageId){
    const page=pageById(pageId);
    const pane=frame.closest('.view-pane');
    const empty=!pageHasRenderableContent(page);
    if(pane) pane.classList.toggle('is-empty',empty);
    const slot=previewSlotForFrame(frame);
    if(slot) applyPreviewSize(slot);
    updateClearButtons();
    if(empty){
      configureFrameRuntime(frame,null,slot);
      updateInspectorEditControls();
      delete frame.dataset.pdfLoadedKey;
      frame.srcdoc='<!doctype html><html style="background:transparent;color-scheme:dark"><body></body></html>';
      return;
    }
    const scripted=configureFrameRuntime(frame,page,slot);
    updateInspectorEditControls();
    if(page.documentType==='pdf'){
      frame.dataset.snapshotToken='';frame.dataset.snapshotPageId=page.id;
      frame.removeAttribute('srcdoc');
      const targetUrl=page.previewUrl||`file:///${String(page.sourcePath||'').replace(/\\/g,'/')}`;
      const forceReload=frame.dataset.pdfForceReload==='1';
      if(forceReload)delete frame.dataset.pdfForceReload;
      // renderAll() runs from roughly forty unrelated actions - rename, paste,
      // tree move, save, a GitHub commit - and every one of them used to force
      // a full re-read of a possibly huge PDF from disk even though it was
      // already open and unchanged. Skip the reassignment when nothing this
      // frame is showing has actually changed; markPageFramesForForceReload
      // is the one legitimate way to insist anyway.
      const loadKey=`${page.id}\u0000${targetUrl}`;
      if(!forceReload&&frame.dataset.pdfLoadedKey===loadKey)return;
      frame.dataset.pdfLoadedKey=loadKey;
      frame.src=targetUrl;
      return;
    }
    frame.removeAttribute('src');
    delete frame.dataset.pdfLoadedKey;
    if(isDirectSourceEdit(page,slot)){
      const directToken=uid('direct-source');
      frame.dataset.directSourceToken=directToken;
      frame.dataset.directSourcePageId=page.id;
      frame.dataset.directSourceReady='false';
      frame.dataset.snapshotToken='';
      frame.dataset.snapshotPageId=page.id;
      renderedSnapshotCache.delete(frame);
      frame.srcdoc=buildDirectSourceEditor(page,directToken,previewZoomForSlot(slot));
      return;
    }
    frame.dataset.directSourceToken='';
    frame.dataset.directSourcePageId='';
    const snapshotToken=scripted ? uid('snapshot') : '';
    frame.dataset.snapshotToken=snapshotToken;
    frame.dataset.snapshotPageId=page.id;
    renderedSnapshotCache.delete(frame);
    const nextSource=buildPreviewSource(page,{allowScripts:scripted,bridgeToken:snapshotToken});
    const renderToken=`render-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const runtimeSource=nextSource.replace('</head>',`<meta data-editor-overlay="1" name="hbe-render-token" content="${renderToken}"><style data-editor-overlay="1" data-leaf-scrollbar-runtime="1">${runtimePreviewScrollbarCss(previewZoomForSlot(slot))}</style></head>`);
    frame.srcdoc=runtimeSource;
  }

  function onPreviewFrameLoad(frame){
    const slot=previewSlotForFrame(frame);
    if(slot)applyPreviewScrollbarCompensation(slot);
    if(slot)requestAnimationFrame(()=>updateViewportFloatingInsets(slot));
    if(slot&&tocHighlight&&tocHighlight.slot===slot&&tocHighlight.pageId!==pageIdForSlot(slot))tocHighlight=null;
    if(slot)renderTocPanel(slot);
    installLocalAnchorNavigation(frame);
    if(frame.dataset.previewRuntime==='direct-source-editor'){
      disconnectHierarchyObserver(frame);
      updateInspectorEditControls();
      refreshViewSearch(slot);
      if(activeStaticFrame()===frame)renderHierarchy();
      return;
    }
    const page=pageById(frameToPageId(frame));
    if(frame.dataset.previewRuntime==='pdf-native-editor'||isBinaryPage(page)){
      disconnectHierarchyObserver(frame);
      updateInspectorEditControls();
      refreshViewSearch(slot);
      if(activeStaticFrame()===frame)renderHierarchy();
      return;
    }
    if(frame.dataset.previewRuntime==='interactive-isolated'){
      disconnectHierarchyObserver(frame);
      if(htmlEditEnabled && frameForEditSlot(editOwnerSlot)===frame)setHtmlEditEnabled(false);
      updateInspectorEditControls();refreshViewSearch(slot);
      if(activeStaticFrame()===frame)renderHierarchy();
      return;
    }
    if(frame.dataset.previewRuntime==='document-readonly'){
      bindHierarchyObserver(frame);updateInspectorEditControls();refreshViewSearch(slot);
      return;
    }
    try{
      const doc=frame.contentDocument;
      doc?.addEventListener('pointerdown',()=>activateViewportSlot(slot),true);
      doc?.addEventListener('wheel',event=>{
        if(!event.ctrlKey || !slot) return;
        event.preventDefault();
        event.stopPropagation();
        const direction=event.deltaY<0?1:-1;
        setPreviewZoom(slot,previewZoomForSlot(slot)+(direction*PREVIEW_ZOOM_STEP),{anchor:outerPointForFrameEvent(frame,event)});
      },{capture:true,passive:false});
    }catch(error){
      console.warn('Static preview input bridge unavailable',error);
    }
    bindInspector(frame);
    bindHierarchyObserver(frame);
    restorePendingSelection(frame);
    updateInspectorEditControls();
    refreshViewSearch(slot);
  }

  [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>frame.addEventListener('load',()=>onPreviewFrameLoad(frame)));


  window.addEventListener('message', event => {
    const frame=[refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame]
      .find(candidate => candidate.contentWindow===event.source);
    const data=event.data;
    if(!frame || !data) return;
    if(data.__leafViewSearchResult===true){
      if(!data.token||data.token!==frame.dataset.snapshotToken)return;
      updateViewSearchStatus(previewSlotForFrame(frame),Number(data.index)||0,Number(data.count)||0);
      return;
    }
    if(data.__leafDirectSourceEdit===true){
      if(!data.token||data.token!==frame.dataset.directSourceToken)return;
      const page=pageById(frame.dataset.directSourcePageId);
      const slot=previewSlotForFrame(frame);
      if(!page||!isDirectSourceEdit(page,slot))return;
      if(data.kind==='search-result'){
        updateViewSearchStatus(slot,Number(data.index)||0,Number(data.count)||0);
        return;
      }
      if(data.kind==='ready')frame.dataset.directSourceReady='true';
      if(data.kind==='activate')activateViewportSlot(slot);
      if(data.kind==='zoom'&&(data.direction===1||data.direction===-1)){
        const anchor=Number.isFinite(data.clientX)&&Number.isFinite(data.clientY)?outerPointForFrameEvent(frame,{clientX:data.clientX,clientY:data.clientY}):null;
        setPreviewZoom(slot,previewZoomForSlot(slot)+(data.direction*PREVIEW_ZOOM_STEP),{anchor});
      }
      if(data.kind==='exit')setHtmlEditEnabled(false,slot);
      if(data.kind==='save')saveLeafProject(false);
      if(data.kind==='input'&&typeof data.source==='string'){
        if(data.source.length>50_000_000){
          frame.contentWindow.postMessage({__leafDirectSourceReply:true,token:data.token,source:page.source,message:'Source exceeds the 50 MB limit'},'*');
          return;
        }
        const leakage=window.SourceFidelity?.editorArtifactReport?.(data.source)||[];
        if(leakage.length){
          frame.contentWindow.postMessage({__leafDirectSourceReply:true,token:data.token,source:page.source,message:'Editor metadata is not allowed in Page source'},'*');
          return;
        }
        if(!directSourceUndoTokens.has(data.token)){pushUndo(page);directSourceUndoTokens.add(data.token);}
        page.source=data.source;
        page.isEmpty=!data.source.trim();
        if(state.views.codePage===page.id){refs.source.value=page.source;updateLineRail();updateCodeSearchStatus();}
        updateClearButtons();markJiraCheckStale();persist();renderVisibleFramesForPage(page.id,frame);
      }
      return;
    }
    if(data.__hbeViewportInput===true){
      if(!data.token || data.token!==frame.dataset.snapshotToken) return;
      const slot=previewSlotForFrame(frame);
      if(data.kind==='activate') activateViewportSlot(slot);
      if(data.kind==='zoom' && slot && (data.direction===1||data.direction===-1)){
        const anchor=Number.isFinite(data.clientX)&&Number.isFinite(data.clientY)
          ? outerPointForFrameEvent(frame,{clientX:data.clientX,clientY:data.clientY})
          : null;
        setPreviewZoom(slot,previewZoomForSlot(slot)+(data.direction*PREVIEW_ZOOM_STEP),{anchor});
      }
      return;
    }
    if(data.__hbeRenderedSnapshot!==true) return;
    if(!data.token || data.token!==frame.dataset.snapshotToken) return;
    if(typeof data.html!=='string') return;

    renderedSnapshotCache.set(frame,{
      html:data.html,
      title:data.title||'',
      pageId:frame.dataset.snapshotPageId||null,
      at:Date.now()
    });

    const waiter=snapshotWaiters.get(data.token);
    if(waiter){
      snapshotWaiters.delete(data.token);
      waiter.resolve(data.html);
    }
  });

  function requestFrameSnapshot(frame,timeoutMs=1600){
    const token=frame?.dataset?.snapshotToken;
    if(!frame || !token) return Promise.resolve(null);

    const cached=renderedSnapshotCache.get(frame);
    if(cached && cached.pageId===frame.dataset.snapshotPageId) return Promise.resolve(cached.html);

    return new Promise(resolve => {
      const timeout=setTimeout(()=>{
        snapshotWaiters.delete(token);
        resolve(renderedSnapshotCache.get(frame)?.html || null);
      },timeoutMs);

      snapshotWaiters.set(token,{
        resolve:html=>{
          clearTimeout(timeout);
          resolve(html);
        }
      });

      try{
        frame.contentWindow.postMessage({__hbeSnapshotRequest:token},'*');
      }catch{
        clearTimeout(timeout);
        snapshotWaiters.delete(token);
        resolve(null);
      }
    });
  }

  async function renderScriptedPageForExport(page){
    const frame=document.createElement('iframe');
    const token=uid('export-snapshot');
    frame.dataset.snapshotToken=token;
    frame.dataset.snapshotPageId=page.id;
    frame.setAttribute('sandbox','allow-scripts');
    Object.assign(frame.style,{
      position:'fixed',left:'-10000px',top:'0',width:'1280px',height:'900px',
      opacity:'0',pointerEvents:'none'
    });
    document.body.appendChild(frame);

    try{
      const promise=requestFrameSnapshot(frame,2200);
      frame.srcdoc=buildPreviewSource(page,{allowScripts:true,bridgeToken:token});
      return await promise;
    }finally{
      snapshotWaiters.delete(token);
      frame.remove();
    }
  }

  async function htmlForSemanticExport(page){
    if(!pageRequiresScripts(page)){
      return {html:page.source||'',sourceKind:'source'};
    }

    const visibleFrame=[refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame]
      .find(frame => frame.dataset.snapshotPageId===page.id && frame.dataset.previewRuntime==='interactive-isolated');
    if(visibleFrame){
      const html=await requestFrameSnapshot(visibleFrame);
      if(html) return {html,sourceKind:'rendered'};
    }

    const rendered=await renderScriptedPageForExport(page);
    return rendered
      ? {html:rendered,sourceKind:'rendered'}
      : {html:page.source||'',sourceKind:'source-fallback'};
  }

  // ----- Clear loaded HTML -----
  function pageIdForSlot(slot){
    if(slot==='single') return state.views.single;
    if(slot==='left') return state.views.left;
    if(slot==='right') return state.views.right;
    if(slot==='codePreview') return state.views.codePreview;
    if(slot==='codePage') return state.views.codePage;
    return null;
  }
  function updateClearButtons(){
    $$('[data-clear-slot]').forEach(button=>{
      const page=pageById(pageIdForSlot(button.dataset.clearSlot));
      button.disabled=!pageHasRenderableContent(page);
    });
    // Reload is offered only where there is somewhere to reload from. A page
    // typed into Leaf and never saved has no origin, and a button that looks
    // available but always answers "nothing to reload" is worse than a dim one.
    $$('[data-refresh-slot]').forEach(button=>{
      const page=pageById(pageIdForSlot(button.dataset.refreshSlot));
      const origin=pageReloadOrigin(page);
      button.disabled=!origin;
      button.title=origin
        ? `Reload from ${origin.label}`
        : 'This page was not opened from a file or a remote, so there is nothing to reload';
    });
  }

  // ----- Reloading a document from where it came from -----------------------
  //
  // A Page remembers its origin in whichever field the thing that opened it
  // filled in, so this reads them in the order that makes one answer right:
  // a GitHub Page also carries an https baseUrl pointing at raw.githubusercontent,
  // and re-fetching that URL instead of asking GitHub would lose the ref and the
  // sha the Page is pinned to.
  function pageReloadOrigin(page){
    if(!page) return null;
    if(page.remote?.driveId) return {kind:'drive',label:'Google Drive'};
    const project=state.documents.find(document=>document.nodes?.some(node=>node.id===page.id));
    if(project?.remote&&page.remote?.path){
      const remote=project.remote;
      return {kind:'github',label:`${remote.owner}/${remote.repo}`,project};
    }
    if(/^https?:/i.test(String(page.baseUrl||''))) return {kind:'url',label:page.baseUrl,url:page.baseUrl};
    if(page.sourcePath) return {kind:'file',label:page.fileName||page.sourcePath,filePath:page.sourcePath};
    return null;
  }

  // Returns the fields to write onto the Page, rather than writing them here:
  // the Page may have been closed or replaced while the read was in flight, so
  // the caller re-checks before anything is applied.
  async function readPageFromOrigin(page,origin){
    if(origin.kind==='drive'){
      const file=await drive(window.electronAPI.drive.read({fileId:page.remote.driveId}));
      return {source:file.text,loadedSource:file.text,
        remote:{...page.remote,readOnly:!!file.readOnly,loaded:true}};
    }
    if(origin.kind==='github'){
      const remote=origin.project.remote;
      const file=await github(window.electronAPI.github.read({
        owner:remote.owner,repo:remote.repo,ref:remote.ref,path:page.remote.path
      }));
      return {source:file.text,loadedSource:file.text,baseUrl:file.baseUrl,
        remote:{...page.remote,sha:file.sha,size:file.size,loaded:true}};
    }
    if(origin.kind==='url'){
      const result=await window.electronAPI.fetchPageAtUrl(origin.url);
      return {source:result.source||'',loadedSource:result.loadedSource??result.source??'',
        baseUrl:result.baseUrl||origin.url,fileName:result.fileName||page.fileName};
    }
    const result=await window.electronAPI.readPageAtPath(origin.filePath);
    return {source:result.source||'',loadedSource:result.loadedSource??result.source??'',
      baseUrl:result.baseUrl??page.baseUrl,fileName:result.fileName||page.fileName,
      documentType:result.documentType||page.documentType,
      previewUrl:result.previewUrl??page.previewUrl};
  }

  const reloadingSlots=new Set();
  let pendingReload=null;

  async function reloadPage(slot){
    const page=pageById(pageIdForSlot(slot));
    const origin=pageReloadOrigin(page);
    if(!origin) return showToast('This page was not opened from a file or a remote');
    if(reloadingSlots.has(slot)) return;
    // Reloading throws away edits, so it asks first - and only when there is
    // something to lose.
    if(pageHasUnsavedChanges(page)){
      pendingReload={pageId:page.id,slot};
      $('#reloadPageTarget').textContent=page.name||page.fileName||'Current Page';
      $('#reloadPageMessage').textContent=`This page has unsaved changes. Reloading replaces them with what is stored in ${origin.label}.`;
      refs.reloadPageModal.classList.add('show');
      setTimeout(()=>$('#reloadPageCancel')?.focus(),0);
      return;
    }
    await performReload(page,origin,slot);
  }

  function closeReloadDialog(){ refs.reloadPageModal.classList.remove('show'); pendingReload=null; }

  async function performReload(page,origin,slot){
    reloadingSlots.add(slot);
    $$(`[data-refresh-slot="${slot}"]`).forEach(button=>button.classList.add('is-busy'));
    try{
      const next=await readPageFromOrigin(page,origin);
      // The View may have moved on while the read was in flight.
      const current=pageById(page.id);
      if(!current) return;
      // Undoable: a reload that silently ate an hour of work with no way back
      // would be the worst thing this button could do.
      pushUndo(current);
      Object.assign(current,next);
      current.isEmpty=!String(current.source||'').trim();
      markPageFramesForForceReload(current.id);
      if(state.views.codePage===current.id) loadCodePage();
      renderAll();persist();
      showToast(`Reloaded from ${origin.label}`);
    }catch(error){
      showToast(`Could not reload: ${error.message}`);
    }finally{
      reloadingSlots.delete(slot);
      $$(`[data-refresh-slot="${slot}"]`).forEach(button=>button.classList.remove('is-busy'));
    }
  }
  function openClearHtmlDialog(slot){
    const pageId=pageIdForSlot(slot);
    const page=pageById(pageId);
    if(!pageHasRenderableContent(page)) return showToast('Nothing to clear');
    pendingClearPageId=pageId;
    if(!pageHasUnsavedChanges(page)){
      clearLoadedHtml();
      return;
    }
    refs.clearHtmlTarget.textContent=page.name || page.fileName || 'Current Page';
    $('#clearHtmlMessage').textContent='This page has unsaved changes. Save it before clearing?';
    refs.clearHtmlModal.classList.add('show');
    setTimeout(()=>$('#clearHtmlCancel').focus(),0);
  }
  function closeClearHtmlDialog(){ refs.clearHtmlModal.classList.remove('show'); pendingClearPageId=null; }
  function pageHasUnsavedChanges(page){ return page?.documentType!=='pdf'&&String(page?.source||'')!==String(page?.loadedSource||''); }
  function clearLoadedHtml(){
    const page=pageById(pendingClearPageId);
    if(!page){ closeClearHtmlDialog(); return; }
    const selectionBelongsToPage=selectedElementFrame&&frameToPageId(selectedElementFrame)===page.id;
    pushUndo(page);
    page.source=''; page.loadedSource=''; page.baseUrl=null; page.sourcePath=null; page.previewUrl=null;page.documentType='html';page.fileName='untitled.html'; page.isEmpty=true;
    if(selectionBelongsToPage)clearInspector();
    closeClearHtmlDialog();
    if(state.views.codePage===page.id) loadCodePage();
    renderVisibleFramesForPage(page.id);renderTree();renderCrumbs();updateClearButtons();persist();showToast('Loaded page cleared');
  }
  $$('[data-clear-slot]').forEach(button=>{
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('click',event=>{ event.preventDefault(); event.stopPropagation(); openClearHtmlDialog(button.dataset.clearSlot); });
  });
  $$('[data-refresh-slot]').forEach(button=>{
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('click',event=>{ event.preventDefault(); event.stopPropagation(); reloadPage(button.dataset.refreshSlot); });
  });
  $('#reloadPageCancel').onclick=closeReloadDialog;
  $('#reloadPageConfirm').onclick=()=>{
    const pending=pendingReload;
    closeReloadDialog();
    if(!pending) return;
    const page=pageById(pending.pageId);
    const origin=pageReloadOrigin(page);
    if(page&&origin) performReload(page,origin,pending.slot);
  };
  refs.reloadPageModal.addEventListener('keydown',event=>{ trapDialogFocus(refs.reloadPageModal,event); if(event.key==='Escape') closeReloadDialog(); });
  $('#clearHtmlCancel').onclick=closeClearHtmlDialog;
  $('#clearHtmlConfirm').onclick=clearLoadedHtml;
  $('#clearHtmlSave').onclick=async()=>{
    const page=pageById(pendingClearPageId);
    if(!page) return closeClearHtmlDialog();
    try{
      const isTextPage=isDirectSourceType(page);
      const isJson=page.documentType==='json';
      const filePath=isTextPage
        ?(page.sourcePath?await window.electronAPI.saveTextPath({filePath:page.sourcePath,source:page.source}):await window.electronAPI.exportText({title:isJson?'Save JSON Page':'Save Markdown Page',suggestedName:page.fileName||`${page.name}.${isJson?'json':'md'}`,extension:isJson?'json':'md',source:page.source}))
        :(page.sourcePath?await window.electronAPI.saveHtmlPath({filePath:page.sourcePath,source:page.source}):await window.electronAPI.exportHtml({suggestedName:page.fileName||`${page.name}.html`,source:page.source}));
      if(!filePath) return;
      page.sourcePath=filePath;page.loadedSource=page.source;
      clearLoadedHtml();
    }catch(error){console.error('Save before clear failed',error);showToast(`Save failed: ${error.message}`);}
  };
  refs.clearHtmlModal.addEventListener('keydown',event=>{ trapDialogFocus(refs.clearHtmlModal,event); if(event.key==='Escape') closeClearHtmlDialog(); });

  // ----- Code editor -----
  function loadCodePage(){
    const page=pageById(state.views.codePage);
    const pane=$('.code-editor-pane');
    const empty=!page || page.isEmpty;
    pane?.classList.toggle('is-empty', empty);
    const pdfNotice=isBinaryPage(page)?`${page.documentType==='pdf'?'PDF':'Image'} page (read-only)\n${page.sourcePath||page.fileName||''}`:'';
    refs.source.value=pdfNotice||(page?.source||'');
    refs.source.readOnly=isBinaryPage(page);
    refs.source.classList.toggle('read-only',isBinaryPage(page));
    const codeFileName=$('#codeFileName');if(codeFileName)codeFileName.textContent=page?.fileName||'No page selected';
    refs.dirty.hidden=true;
    updateLineRail();syncLineRailScroll();updateCodeSearchStatus();
    updateClearButtons();
  }
  refs.source.addEventListener('focus',()=>{
    if(activeSlots.code==='editor') return;
    if(hasUnsavedInspectorDraft()){
      refs.source.blur();
      withUnsavedInspectorGuard(()=>{
        activeSlots.code='editor';clearInspector();applyActiveViewOutline();renderTree();renderCrumbs();persist();refs.source.focus();
      });
      return;
    }
    activeSlots.code='editor';clearInspector();applyActiveViewOutline();renderTree();renderCrumbs();persist();
  });
  refs.source.oninput=()=>{
    const page=pageById(state.views.codePage);if(!page)return;
    if(isBinaryPage(page))return;
    pushUndo(page);page.source=refs.source.value;page.isEmpty=!(page.source||'').trim();$('.code-editor-pane')?.classList.toggle('is-empty',page.isEmpty);refs.dirty.hidden=false;updateLineRail();updateClearButtons();persist();
    updateCodeSearchStatus();
    if(state.views.codePreview===page.id)setTimeout(()=>renderFrame(refs.codePreviewFrame,page.id),220);
    if(state.views.single===page.id)renderFrame(refs.singleFrame,page.id);
    if(state.views.left===page.id)renderFrame(refs.leftFrame,page.id);
    if(state.views.right===page.id)renderFrame(refs.rightFrame,page.id);
  };
  refs.source.onkeydown=e=>{if(e.key==='Tab'&&!refs.source.readOnly){e.preventDefault();const s=refs.source.selectionStart,en=refs.source.selectionEnd;refs.source.value=refs.source.value.slice(0,s)+'  '+refs.source.value.slice(en);refs.source.selectionStart=refs.source.selectionEnd=s+2;refs.source.dispatchEvent(new Event('input'));}};
  function updateLineRail(){refs.lineRail.innerHTML=`<div class="line-rail-lines">${Array.from({length:refs.source.value.split('\n').length},(_,i)=>`<span>${i+1}</span>`).join('')}</div>`;syncLineRailScroll();}
  function syncLineRailScroll(){const lines=refs.lineRail.querySelector('.line-rail-lines');if(lines)lines.style.transform=`translateY(${-refs.source.scrollTop}px)`;}
  refs.source.addEventListener('scroll',syncLineRailScroll,{passive:true});

  function codeSearchMatches(query){
    if(!query)return[];
    const source=refs.source.value.toLocaleLowerCase();const needle=query.toLocaleLowerCase();const matches=[];
    let from=0;while(from<=source.length-needle.length){const index=source.indexOf(needle,from);if(index<0)break;matches.push(index);from=index+Math.max(1,needle.length);}
    return matches;
  }
  function updateCodeSearchStatus(){
    if(!refs.codeSearch||!refs.codeSearchStatus)return;
    const matches=codeSearchMatches(refs.codeSearch.value);refs.codeSearchStatus.textContent=refs.codeSearch.value?`${matches.length}`:'';
  }
  function findCodeMatch({backward=false,retainSearchFocus=false}={}){
    const query=refs.codeSearch?.value||'';const matches=codeSearchMatches(query);updateCodeSearchStatus();if(!matches.length)return false;
    const cursor=backward?refs.source.selectionStart:refs.source.selectionEnd;
    let index=backward?[...matches].reverse().find(value=>value<cursor):matches.find(value=>value>=cursor);
    if(index===undefined)index=backward?matches.at(-1):matches[0];
    refs.source.focus();refs.source.setSelectionRange(index,index+query.length);if(retainSearchFocus)refs.codeSearch.focus();return true;
  }
  refs.codeSearch?.addEventListener('input',()=>{updateCodeSearchStatus();findCodeMatch({retainSearchFocus:true});});
  refs.codeSearch?.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();findCodeMatch({backward:event.shiftKey});}
    if(event.key==='Escape'){event.preventDefault();refs.codeSearch.value='';updateCodeSearchStatus();refs.source.focus();}
  });

  function viewSearchControl(slot){return $(`[data-view-search="${slot}"]`);}
  function updateViewSearchStatus(slot,index,count){
    const control=viewSearchControl(slot);if(!control)return;
    const status=control.querySelector('[data-view-search-status]');
    const query=control.querySelector('input')?.value||'';
    if(status)status.textContent=query?(count?`${index+1}/${count}`:'0'):'';
    const stateForSlot=viewSearchState.get(slot)||{};
    viewSearchState.set(slot,{...stateForSlot,query,index:count?index:0,count});
  }

  function clearStaticViewSearch(frame){
    try{
      const css=frame.contentDocument?.defaultView?.CSS;
      css?.highlights?.delete('leaf-search-all');
      css?.highlights?.delete('leaf-search-current');
      frame.contentDocument?.querySelector('[data-editor-overlay="search-style"]')?.remove();
    }catch{}
  }

  function staticViewSearchRanges(frame,query){
    const doc=frame.contentDocument,view=doc?.defaultView;
    if(!doc?.body||!view||!query)return[];
    const ranges=[];const needle=query.toLocaleLowerCase();
    const walker=doc.createTreeWalker(doc.body,view.NodeFilter.SHOW_TEXT,{acceptNode(node){
      const parent=node.parentElement;
      if(!node.data||!parent||parent.closest('[data-editor-overlay],script,style,noscript,textarea,input,select'))return view.NodeFilter.FILTER_REJECT;
      return node.data.toLocaleLowerCase().includes(needle)?view.NodeFilter.FILTER_ACCEPT:view.NodeFilter.FILTER_REJECT;
    }});
    let node;
    while((node=walker.nextNode())){
      const text=node.data.toLocaleLowerCase();let from=0;
      while(from<=text.length-needle.length){
        const index=text.indexOf(needle,from);if(index<0)break;
        const range=doc.createRange();range.setStart(node,index);range.setEnd(node,index+query.length);ranges.push(range);from=index+Math.max(1,query.length);
      }
    }
    return ranges;
  }

  function applyStaticViewSearch(slot,frame,query,index){
    clearStaticViewSearch(frame);
    if(!query){updateViewSearchStatus(slot,0,0);return;}
    const doc=frame.contentDocument,view=doc?.defaultView;
    if(!doc||!view?.CSS?.highlights||!view.Highlight){updateViewSearchStatus(slot,0,0);return;}
    const ranges=staticViewSearchRanges(frame,query);
    const normalized=ranges.length?((index%ranges.length)+ranges.length)%ranges.length:0;
    const style=doc.createElement('style');style.dataset.editorOverlay='search-style';
    style.textContent='::highlight(leaf-search-all){background:#ffe36e;color:#172033}::highlight(leaf-search-current){background:#ff963d;color:#111827;text-decoration:underline 2px}';
    doc.head?.appendChild(style);
    if(ranges.length){
      view.CSS.highlights.set('leaf-search-all',new view.Highlight(...ranges));
      view.CSS.highlights.set('leaf-search-current',new view.Highlight(ranges[normalized]));
      ranges[normalized].startContainer.parentElement?.scrollIntoView({block:'center',inline:'nearest'});
    }
    updateViewSearchStatus(slot,normalized,ranges.length);
  }

  function refreshViewSearch(slot,{advance=false,backward=false}={}){
    if(!slot)return;
    const control=viewSearchControl(slot),input=control?.querySelector('input');
    const frame=frameForEditSlot(slot);if(!control||!input||!frame)return;
    const previous=viewSearchState.get(slot)||{query:'',index:0,count:0};
    const query=input.value;
    let index=query===previous.query?previous.index:0;
    if(advance)index+=backward?-1:1;
    viewSearchState.set(slot,{query,index,count:previous.count});
    if(frame.dataset.previewRuntime==='interactive-isolated'){
      const token=frame.dataset.snapshotToken;
      if(token)frame.contentWindow.postMessage({__leafViewSearch:true,token,query,index},'*');
      else updateViewSearchStatus(slot,0,0);
      return;
    }
    if(frame.dataset.previewRuntime==='direct-source-editor'){
      const token=frame.dataset.directSourceToken;
      if(token)frame.contentWindow.postMessage({__leafDirectSourceSearch:true,token,query,index},'*');
      else updateViewSearchStatus(slot,0,0);
      return;
    }
    if(frame.dataset.previewRuntime==='document-readonly'&&isBinaryPage(pageById(pageIdForSlot(slot)))){
      updateViewSearchStatus(slot,0,0);return;
    }
    try{applyStaticViewSearch(slot,frame,query,index);}catch(error){console.warn('View search unavailable',error);updateViewSearchStatus(slot,0,0);}
  }

  $$('[data-view-search]').forEach(control=>{
    const slot=control.dataset.viewSearch,input=control.querySelector('input');
    input.addEventListener('input',()=>{viewSearchState.set(slot,{query:input.value,index:0,count:0});refreshViewSearch(slot);});
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();refreshViewSearch(slot,{advance:true,backward:event.shiftKey});}
      if(event.key==='Escape'){event.preventDefault();input.value='';viewSearchState.set(slot,{query:'',index:0,count:0});refreshViewSearch(slot);input.blur();}
    });
  });

  function activeViewSearchInput(){
    if(state.mode==='preview')return viewSearchControl('single')?.querySelector('input');
    if(state.mode==='split')return viewSearchControl(activeSlots.split)?.querySelector('input');
    return activeSlots.code==='preview'?viewSearchControl('codePreview')?.querySelector('input'):refs.codeSearch;
  }
  function selectionPathForElement(element){
    if(!element?.isConnected||['HTML','BODY'].includes(element.tagName))return null;
    const path=[];let current=element;
    while(current&&current.parentElement&&current.parentElement.tagName!=='HTML'){
      const parent=current.parentElement;
      const siblings=[...parent.children].filter(child=>!child.dataset?.editorOverlay&&!child.dataset?.adfMarker);
      const index=siblings.indexOf(current);if(index<0)return null;
      path.unshift(index);if(parent.tagName==='BODY')break;current=parent;
    }
    return path;
  }
  function elementForSelectionPath(doc,path){
    let current=doc?.body;
    for(const index of path||[]){
      const children=[...(current?.children||[])].filter(child=>!child.dataset?.editorOverlay&&!child.dataset?.adfMarker);
      current=children[index];if(!current)return null;
    }
    return current&&!['HTML','BODY'].includes(current.tagName)?current:null;
  }
  function captureSelectionSnapshot(pageId){
    if(!selectedElementFrame||frameToPageId(selectedElementFrame)!==pageId)return null;
    const paths=SelectionManager.items().map(selectionPathForElement).filter(Boolean);
    if(!paths.length)return null;
    return {slot:previewSlotForFrame(selectedElementFrame),paths,source:SelectionManager.source||'history'};
  }
  function queueSelectionRestore(pageId,snapshot){
    if(!snapshot?.paths?.length)return;
    const frame=frameForEditSlot(snapshot.slot)||activeStaticFrame();
    if(frame&&frameToPageId(frame)===pageId)pendingSelectionRestore.set(frame,snapshot);
  }
  function restorePendingSelection(frame){
    const snapshot=pendingSelectionRestore.get(frame);if(!snapshot)return;
    pendingSelectionRestore.delete(frame);
    const elements=snapshot.paths.map(path=>elementForSelectionPath(frame.contentDocument,path)).filter(Boolean);
    if(elements.length)SelectionManager.restore(elements,frame,snapshot.source||'history');
  }
  function historyItem(page){return{pageId:page.id,source:page.source,selection:captureSelectionSnapshot(page.id)};}
  function pushUndo(page){
    const item=historyItem(page),last=undoStack.at(-1);
    if(last&&last.pageId===item.pageId&&last.source===item.source)last.selection=item.selection;
    else{undoStack.push(item);if(undoStack.length>80)undoStack.shift();}
    redoStack=[];
  }
  function undo(){
    withUnsavedInspectorGuard(()=>{
      const item=undoStack.pop();if(!item)return showToast('Nothing to undo');
      const page=pageById(item.pageId);if(!page)return;
      redoStack.push(historyItem(page));
      page.source=item.source;
      clearInspector();
      queueSelectionRestore(page.id,item.selection);
      if(state.views.codePage===page.id)loadCodePage();
      renderViewMode();persist();showToast(`Undo: ${page.name}`);
    });
  }
  function redo(){
    withUnsavedInspectorGuard(()=>{
      const item=redoStack.pop();if(!item)return showToast('Nothing to redo');
      const page=pageById(item.pageId);if(!page)return;
      undoStack.push(historyItem(page));
      page.source=item.source;
      clearInspector();
      queueSelectionRestore(page.id,item.selection);
      if(state.views.codePage===page.id)loadCodePage();
      renderViewMode();persist();showToast(`Redo: ${page.name}`);
    });
  }

  // ----- Explorer Page Drag & Drop -----
  function isHtmlFile(file){ return !!file && /\.(html?|md|markdown|json|xml|pdf|png|jpe?g|webp|gif|svg)$/i.test(file.name || ''); }
  function isAtlassianPreviewFile(file){return !!file&&/\.(md|markdown|json)$/i.test(file.name||'');}
  // ----- Fonts the Page actually uses ---------------------------------------
  // @font-face is the only place a font's URL is written down. document.fonts
  // reports the families but carries no src, so the stylesheets are the route.
  const FONT_SRC_ENTRY=/(url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|local\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\))(?:\s*format\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\))?/gi;

  function parseFontSrc(src){
    const entries=[];
    for(const match of String(src||'').matchAll(FONT_SRC_ENTRY)){
      const url=match[2]??match[3]??match[4];
      const localName=match[5]??match[6]??match[7];
      const format=(match[8]??match[9]??match[10]??'').trim().replace(/["']/g,'');
      if(url!==undefined&&url!=='')entries.push({kind:'url',value:url.trim(),format});
      else if(localName!==undefined&&localName!=='')entries.push({kind:'local',value:localName.trim(),format});
    }
    return entries;
  }

  // A relative src resolves against the stylesheet that declared it, not against
  // the Page - a sheet on a CDN pointing at /f/x.woff2 means the CDN's root.
  function resolveAgainst(base,value){
    try{ return new URL(value,base||undefined).href; }catch{ return ''; }
  }

  const FONT_FORMAT_RANK={woff2:0,woff:1,opentype:2,truetype:3,collection:4,'embedded-opentype':5,svg:6};
  function preferredFontSource(entries){
    const urls=entries.filter(entry=>entry.kind==='url');
    if(!urls.length)return null;
    return [...urls].sort((a,b)=>
      (FONT_FORMAT_RANK[a.format?.toLowerCase()]??9)-(FONT_FORMAT_RANK[b.format?.toLowerCase()]??9))[0];
  }

  function normalizeFamilyName(value){
    return String(value||'').split(',')[0].replace(/["']/g,'').trim().toLocaleLowerCase();
  }

  // Only families the document actually renders with. A stylesheet often
  // declares far more faces than a given page uses, and shipping the unused
  // ones is both slower and a bigger licence surface.
  function renderedFamilies(doc){
    const families=new Set();
    const elements=[doc.documentElement,doc.body,...doc.body.querySelectorAll('*')]
      .filter(element=>element&&!element.closest?.('[data-editor-overlay]'));
    for(const element of elements){
      const stack=doc.defaultView.getComputedStyle(element).fontFamily||'';
      for(const part of stack.split(',')){
        const name=normalizeFamilyName(part);
        if(name)families.add(name);
      }
    }
    return families;
  }

  function fontFacesFromRules(rules,sheetBase,out){
    for(const rule of rules){
      if(rule.cssRules&&!rule.style){ fontFacesFromRules(rule.cssRules,sheetBase,out); continue; }
      if(!rule.style||typeof rule.style.getPropertyValue!=='function')continue;
      const family=rule.style.getPropertyValue('font-family');
      const src=rule.style.getPropertyValue('src');
      if(!family||!src)continue;
      out.push({
        family:String(family).replace(/["']/g,'').trim(),
        weight:(rule.style.getPropertyValue('font-weight')||'400').trim(),
        style:(rule.style.getPropertyValue('font-style')||'normal').trim(),
        entries:parseFontSrc(src),
        sheetBase
      });
    }
  }

  function parseFontFacesFromText(cssText,sheetBase,out){
    for(const block of String(cssText||'').matchAll(/@font-face\s*\{([^}]*)\}/gi)){
      const body=block[1];
      const pick=name=>{
        const found=new RegExp(`${name}\\s*:\\s*([^;]+)`,'i').exec(body);
        return found?found[1].trim():'';
      };
      const family=pick('font-family').replace(/["']/g,'').trim();
      const src=pick('src');
      if(!family||!src)continue;
      out.push({family,weight:pick('font-weight')||'400',style:pick('font-style')||'normal',
        entries:parseFontSrc(src),sheetBase});
    }
  }

  async function collectPageFonts(slot){
    const pageId=pageIdForSlot(slot);
    const doc=reachableTocDocument(slot,pageId);
    if(!doc)return {ok:false,reason:'Fonts can be read from an HTML or Markdown Page shown in a View.'};
    const page=pageById(pageId);
    const faces=[];
    const unreadable=[];
    for(const sheet of [...doc.styleSheets]){
      const sheetBase=sheet.href||page?.baseUrl||'';
      let rules=null;
      try{ rules=sheet.cssRules; }catch{ if(sheet.href)unreadable.push(sheet.href); continue; }
      fontFacesFromRules(rules,sheetBase,faces);
    }
    // A sheet the renderer could not read is fetched as text instead, so a
    // cross-origin stylesheet does not silently drop its faces.
    for(const href of unreadable){
      try{
        const fetched=await window.electronAPI.fetchStylesheetText(href);
        parseFontFacesFromText(fetched.text,fetched.finalUrl||href,faces);
      }catch{ /* reported as a skipped sheet below */ }
    }

    const used=renderedFamilies(doc);
    const rows=[];
    const seen=new Set();
    for(const face of faces){
      if(!used.has(normalizeFamilyName(face.family)))continue;
      const chosen=preferredFontSource(face.entries);
      const localOnly=!chosen&&face.entries.some(entry=>entry.kind==='local');
      const url=chosen?(chosen.value.startsWith('data:')?chosen.value:resolveAgainst(face.sheetBase,chosen.value)):'';
      const key=`${normalizeFamilyName(face.family)}|${face.weight}|${face.style}|${url}`;
      if(seen.has(key))continue;
      seen.add(key);
      rows.push({
        family:face.family,weight:face.weight,style:face.style,
        format:chosen?.format||'',url,
        kind:url.startsWith('data:')?'embedded':localOnly?'system':url?'network':'unknown'
      });
    }
    const systemOnly=[...used].filter(name=>name&&!rows.some(row=>normalizeFamilyName(row.family)===name));
    return {ok:true,rows,systemOnly,skippedSheets:unreadable.length&&!faces.length?unreadable.length:0};
  }

  // ----- Download Page Fonts dialog -----------------------------------------
  let pendingFontRows=[];

  function fontKindLabel(kind){
    return kind==='embedded'?'Embedded in the page'
      :kind==='system'?'System font - nothing to download'
      :kind==='network'?'Downloadable':'Source unknown';
  }

  function renderFontExportList(result){
    const list=$('#fontExportList');
    if(!list)return;
    // The checkbox index addresses this list, so it stays the full list - a
    // filtered copy would make every index off by the rows it dropped.
    const rows=result.rows||[];
    pendingFontRows=rows;
    if(!rows.length){
      const extra=result.systemOnly?.length
        ? ` This Page renders with system fonts only (${esc(result.systemOnly.slice(0,4).join(', '))}).`
        : '';
      list.innerHTML=`<div class="font-export-empty">No downloadable web fonts were found.${extra}</div>`;
      return;
    }
    list.innerHTML=rows.map((row,index)=>{
      const selectable=row.kind==='network'||row.kind==='embedded';
      // The source is worth showing: it is how someone tells a self-hosted face
      // from one pulled off a CDN, which is what the licence question turns on.
      const source=row.kind==='embedded'?'Embedded data URI':row.url||'';
      return `<label class="font-export-row${selectable?'':' is-unavailable'}" title="${esc(source)}"
          data-font-kind="${esc(row.kind)}" data-font-url="${esc(row.url||'')}">
        <input type="checkbox" data-font-index="${index}" ${selectable?'checked':'disabled'}>
        <span class="font-export-name">${esc(row.family)}</span>
        <span class="font-export-meta">${esc(row.weight)}${row.style&&row.style!=='normal'?` · ${esc(row.style)}`:''}${row.format?` · ${esc(row.format)}`:''}</span>
        <span class="font-export-kind">${esc(fontKindLabel(row.kind))}</span>
      </label>`;
    }).join('');
  }

  async function openFontExportDialog(){
    const slot=activePageSlot();
    const result=await collectPageFonts(slot);
    if(!result.ok)return showToast(result.reason);
    renderFontExportList(result);
    const confirm=$('#fontExportConfirm');
    if(confirm)confirm.disabled=!(result.rows||[]).some(row=>row.kind==='network'||row.kind==='embedded');
    $('#fontExportModal')?.classList.add('show');
  }

  function closeFontExportDialog(){ $('#fontExportModal')?.classList.remove('show'); }

  $('#fontExportCancel')?.addEventListener('click',closeFontExportDialog);
  $('#fontExportModal')?.addEventListener('click',event=>{ if(event.target===$('#fontExportModal'))closeFontExportDialog(); });
  $('#fontExportConfirm')?.addEventListener('click',async()=>{
    const fonts=[...document.querySelectorAll('#fontExportList [data-font-index]')]
      .filter(box=>box.checked&&!box.disabled)
      .map(box=>pendingFontRows[Number(box.dataset.fontIndex)])
      .filter(row=>row&&(row.kind==='network'||row.kind==='embedded'));
    if(!fonts.length)return showToast('Select at least one font');
    closeFontExportDialog();
    showToast(`Downloading ${fonts.length} font${fonts.length===1?'':'s'}…`);
    try{
      const report=await window.electronAPI.downloadFonts({fonts});
      if(report?.canceled)return;
      const saved=report?.saved?.length||0;
      const failed=report?.failed?.length||0;
      showToast(failed
        ? `Saved ${saved} font${saved===1?'':'s'}; ${failed} could not be fetched`
        : `Saved ${saved} font${saved===1?'':'s'} and fonts.css`);
    }catch(error){ showToast(`Font download failed: ${error.message}`); }
  });

  // ----- Following a preview that navigated itself --------------------------
  // A fetched Page is a live page: its scripts run and its links really move the
  // frame. The frame is opaque-origin, so the renderer cannot read where it
  // went; main reports it. Without this the app keeps describing the page the
  // View started on - the outline, the Code view and Save As all stay on the old
  // document, and the next re-render throws the navigation away.
  let followingFrameNavigation=false;

  async function followFrameNavigation({slot,url}){
    if(!slot||!url||followingFrameNavigation)return;
    const page=pageById(pageIdForSlot(slot));
    // Only a Page that was already remote follows. A local file whose frame
    // navigated is not something this should rewrite.
    if(!page||!/^https?:/i.test(String(page.baseUrl||'')))return;
    if(String(page.baseUrl)===String(url))return;
    followingFrameNavigation=true;
    try{
      const result=await window.electronAPI.fetchPageAtUrl(url);
      const current=pageById(pageIdForSlot(slot));
      // The View may have moved on while the fetch was in flight.
      if(!current||current.id!==page.id)return;
      current.source=result.source||'';
      current.loadedSource=result.loadedSource??result.source??'';
      current.baseUrl=result.baseUrl||url;
      current.name=result.title||current.name;
      current.fileName=result.fileName||current.fileName;
      current.isEmpty=!String(current.source||'').trim();
      // Deliberately not renderAll(): that rebuilds the frame from source and
      // would throw away the very navigation this is following, along with any
      // state the page's own scripts hold. Only what reads the model is
      // refreshed; the frame is already showing the right document.
      renderTree();renderPageSelects();renderCrumbs();renderTocPanel(slot);
      persist();
    }catch(error){
      showToast(`Could not follow that link: ${error.message}`);
    }finally{ followingFrameNavigation=false; }
  }

  window.electronAPI.onPreviewFrameNavigated?.(payload=>{followFrameNavigation(payload||{});});

  // ----- Opening a Page by URL ----------------------------------------------
  // The drop zone already means "put a Page here", so the URL field belongs in
  // it rather than in a menu somewhere else.
  const REMOTE_URL_SCHEME=/^https?:\/\//i;

  function loadedPageForUrl(url){
    const normalized=String(url||'').trim();
    if(!normalized)return null;
    return pageList().find(item=>String(item.page.baseUrl||'').trim()===normalized)||null;
  }

  async function openPageFromUrl(rawUrl,slot){
    let candidate=String(rawUrl||'').trim();
    if(!candidate)return;
    // A bare host is what people paste; only add a scheme, never change one.
    if(!/^[a-z][a-z0-9+.-]*:/i.test(candidate))candidate=`https://${candidate}`;
    if(!REMOTE_URL_SCHEME.test(candidate))return showToast('Only http and https URLs can be opened as a Page');

    const already=loadedPageForUrl(candidate);
    if(already){
      bindPageToSlot(slot||activePageSlot(),already.page.id);
      selectedTreeNode=already.page.id;state.selectedDocumentId=already.project.id;
      renderAll();persist();
      return showToast(`Already open: ${already.page.name}`);
    }
    showToast('Fetching…');
    try{
      const result=await window.electronAPI.fetchPageAtUrl(candidate);
      const page=await addPageResultToDocument(result,slot||activePageSlot());
      if(page)showToast(`Opened ${page.name}`);
    }catch(error){
      showToast(`Could not open that URL: ${error.message}`);
    }
  }

  function urlFromDataTransfer(dataTransfer){
    if(!dataTransfer)return '';
    const list=dataTransfer.getData('text/uri-list')||'';
    const first=list.split(/\r?\n/).map(line=>line.trim()).find(line=>line&&!line.startsWith('#'));
    const candidate=first||dataTransfer.getData('text/plain')||'';
    return REMOTE_URL_SCHEME.test(candidate.trim())?candidate.trim():'';
  }

  function installDropZoneUrlFields(){
    $$('.html-drop-zone').forEach(zone=>{
      if(zone.querySelector('.drop-url'))return;
      // The Code pane's zone only appears mid-drag, so a field inside it could
      // never be typed into. That pane takes a URL through its Preview half.
      if(zone.classList.contains('code-drop-zone'))return;
      const slot=zone.dataset.dropSlot||null;
      const row=document.createElement('div');
      row.className='drop-url';
      row.innerHTML=`<input type="url" class="drop-url-input" spellcheck="false" placeholder="https://example.com/page.html" aria-label="Open a page by URL">
        <button type="button" class="drop-url-open">Open</button>`;
      const input=row.querySelector('.drop-url-input');
      const button=row.querySelector('.drop-url-open');
      const submit=()=>{const value=input.value;input.value='';openPageFromUrl(value,slot);};
      // The zone itself opens the file picker on click, so the field has to keep
      // its own clicks and keys to itself.
      ['click','pointerdown','dblclick'].forEach(type=>row.addEventListener(type,event=>event.stopPropagation()));
      input.addEventListener('keydown',event=>{
        event.stopPropagation();
        if(event.key==='Enter'){event.preventDefault();submit();}
      });
      button.addEventListener('click',event=>{event.preventDefault();submit();});
      zone.appendChild(row);
    });
  }

  async function handleHtmlDrop(event, slot){
    event.preventDefault(); event.stopPropagation();
    if(slot==='right'&&atlassianPreviewState){
      $('#splitView [data-view-slot="right"]')?.removeAttribute('data-atlassian-drag');
      const previewFile=[...(event.dataTransfer?.files||[])].find(isAtlassianPreviewFile);
      if(previewFile)return loadAtlassianPreviewFile(previewFile);
      return showToast('Drop a .md, .markdown, or ADF .json file into Atlassian Preview');
    }
    const zone=event.currentTarget.querySelector?.('.html-drop-zone') || event.currentTarget;
    zone?.classList.remove('drag-over');
    const file=[...(event.dataTransfer?.files||[])].find(isHtmlFile);
    if(!file){
      const droppedUrl=urlFromDataTransfer(event.dataTransfer);
      if(droppedUrl)return withUnsavedInspectorGuard(()=>{openPageFromUrl(droppedUrl,slot);});
      return showToast('Drop a page, a link, or paste a URL below');
    }

    withUnsavedInspectorGuard(async()=>{
      try{
        const result=await window.electronAPI.readDroppedPage(file);
        const page=pageById(pageIdForSlot(slot));
        if(pageHasRenderableContent(page)){
          pendingHtmlDrop={slot,pageId:page.id,result};
          refs.replaceHtmlTarget.textContent=`${page.name || page.fileName} → ${result.fileName}`;
          if(refs.replaceHtmlMessage)refs.replaceHtmlMessage.textContent=page.source!==page.loadedSource
            ?'The current Page has unsaved changes. Open the dropped file as a new Page to keep them, or replace the current Page.'
            :'Open the dropped file as a new Page or replace the current Page.';
          refs.replaceHtmlModal.classList.add('show');
          setTimeout(()=>$('#replaceHtmlCancel').focus(),0);
        }else{
          await addHtmlResultToDocument(result, slot);
        }
      }catch(err){ showToast(`Drop failed: ${err.message}`); }
    });
  }

  function closeReplaceHtmlDialog(){refs.replaceHtmlModal.classList.remove('show');pendingHtmlDrop=null;}
  $('#replaceHtmlCancel').onclick=closeReplaceHtmlDialog;
  refs.replaceHtmlOpenNew.onclick=async()=>{
    const pending=pendingHtmlDrop;
    if(!pending)return closeReplaceHtmlDialog();
    closeReplaceHtmlDialog();
    await addHtmlResultToDocument(pending.result,pending.slot);
    showToast('Dropped file opened as a new Page');
  };
  $('#replaceHtmlConfirm').onclick=()=>{
    const pending=pendingHtmlDrop;
    if(!pending) return closeReplaceHtmlDialog();
    const page=pageById(pending.pageId);
    if(!page) return closeReplaceHtmlDialog();
    pushUndo(page);
    page.name=pending.result.title;page.fileName=pending.result.fileName;
    page.source=pending.result.source||'';page.loadedSource=pending.result.loadedSource??pending.result.source??'';
    page.baseUrl=pending.result.baseUrl;page.sourcePath=pending.result.filePath;page.previewUrl=pending.result.previewUrl||null;page.documentType=pending.result.documentType||'html';page.initialSnapshotPath=pending.result.initialSnapshotPath||null;page.isEmpty=false;
    selectedTreeNode=page.id;
    closeReplaceHtmlDialog();clearInspector();renderAll();persist();showToast('Page replaced');
  };
  refs.replaceHtmlModal.addEventListener('keydown',event=>{trapDialogFocus(refs.replaceHtmlModal,event);if(event.key==='Escape')closeReplaceHtmlDialog();});

  async function openPagesIntoSlot(slot){
    withUnsavedInspectorGuard(async()=>{
      try{
        const results=await window.electronAPI.importPages();
        if(!results?.length) return;
        await addPageResultToDocument(results[0], slot);
        for(const result of results.slice(1)) await addPageResultToDocument(result);
        showToast(`${results.length} page${results.length===1?'':'s'} imported`);
      }catch(error){
        console.error('Page import failed',error);
        showToast(`Import failed: ${error.message}`);
      }
    });
  }

  function bindDropZoneHit(pane, slot){
    const zone=pane.querySelector('.html-drop-zone'); if(!zone) return;
    zone.setAttribute('role','button');
    zone.setAttribute('tabindex','0');
    zone.setAttribute('title','Open a Page in this View');
    zone.addEventListener('click',()=>openPagesIntoSlot(slot));
    zone.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();openPagesIntoSlot(slot);
    });
  }

  function bindDropTarget(selector, slot){
    const pane=$(selector); if(!pane) return;
    bindDropZoneHit(pane, slot);
    pane.addEventListener('dragenter',e=>{if([...(e.dataTransfer?.files||[])].some(isHtmlFile)||e.dataTransfer?.types?.includes('Files')){e.preventDefault();if(slot==='right'&&atlassianPreviewState)pane.dataset.atlassianDrag='true';else pane.querySelector('.html-drop-zone')?.classList.add('drag-over');}});
    pane.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';if(slot==='right'&&atlassianPreviewState)pane.dataset.atlassianDrag='true';else pane.querySelector('.html-drop-zone')?.classList.add('drag-over');}});
    pane.addEventListener('dragleave',e=>{if(!pane.contains(e.relatedTarget)){pane.querySelector('.html-drop-zone')?.classList.remove('drag-over');pane.removeAttribute('data-atlassian-drag');}});
    pane.addEventListener('drop',e=>handleHtmlDrop(e,slot));
  }
  bindDropTarget('#singleView','single');
  bindDropTarget('#splitView [data-view-slot="left"]','left');
  bindDropTarget('#splitView [data-view-slot="right"]','right');
  bindDropTarget('#codeView [data-view-slot="code-preview"]','codePreview');
  bindDropTarget('#codeView .code-editor-pane','codePage');

  // ----- Visual inspector -----
  const TEXT_CSS_FIELDS=[
    {key:'color',label:'Color',property:'color'},
    {key:'backgroundColor',label:'Background Color',property:'backgroundColor'},
    {key:'lineHeight',label:'Line Height',property:'lineHeight'},
    {key:'letterSpacing',label:'Letter Spacing',property:'letterSpacing'},
    {key:'wordSpacing',label:'Word Spacing',property:'wordSpacing'},
    {key:'textAlign',label:'Text Align',property:'textAlign',options:['start','end','left','right','center','justify','match-parent']},
    {key:'textAlignLast',label:'Text Align Last',property:'textAlignLast',options:['auto','start','end','left','right','center','justify']},
    {key:'textIndent',label:'Text Indent',property:'textIndent'},
    {key:'textTransform',label:'Text Transform',property:'textTransform',options:['none','capitalize','uppercase','lowercase','full-width']},
    {key:'textDecorationLine',label:'Decoration Line',property:'textDecorationLine',options:['none','underline','overline','line-through']},
    {key:'textDecorationStyle',label:'Decoration Style',property:'textDecorationStyle',options:['solid','double','dotted','dashed','wavy']},
    {key:'textDecorationColor',label:'Decoration Color',property:'textDecorationColor'},
    {key:'textDecorationThickness',label:'Decoration Thickness',property:'textDecorationThickness'},
    {key:'textUnderlineOffset',label:'Underline Offset',property:'textUnderlineOffset'},
    {key:'textShadow',label:'Text Shadow',property:'textShadow'},
    {key:'whiteSpace',label:'White Space',property:'whiteSpace',options:['normal','nowrap','pre','pre-wrap','pre-line','break-spaces']},
    {key:'wordBreak',label:'Word Break',property:'wordBreak',options:['normal','break-all','keep-all','break-word']},
    {key:'overflowWrap',label:'Overflow Wrap',property:'overflowWrap',options:['normal','break-word','anywhere']},
    {key:'hyphens',label:'Hyphens',property:'hyphens',options:['none','manual','auto']},
    {key:'textOverflow',label:'Text Overflow',property:'textOverflow',options:['clip','ellipsis']},
    {key:'direction',label:'Direction',property:'direction',options:['ltr','rtl']},
    {key:'unicodeBidi',label:'Unicode Bidi',property:'unicodeBidi'},
    {key:'writingMode',label:'Writing Mode',property:'writingMode',options:['horizontal-tb','vertical-rl','vertical-lr']},
    {key:'textOrientation',label:'Text Orientation',property:'textOrientation',options:['mixed','upright','sideways']},
    {key:'verticalAlign',label:'Vertical Align',property:'verticalAlign'},
    {key:'fontVariant',label:'Font Variant',property:'fontVariant'},
    {key:'fontStretch',label:'Font Stretch',property:'fontStretch'},
    {key:'fontKerning',label:'Font Kerning',property:'fontKerning',options:['auto','normal','none']},
    {key:'fontFeatureSettings',label:'Font Feature Settings',property:'fontFeatureSettings'},
    {key:'fontVariationSettings',label:'Font Variation Settings',property:'fontVariationSettings'},
    {key:'tabSize',label:'Tab Size',property:'tabSize'},
    {key:'webkitTextFillColor',label:'Text Fill Color',property:'webkitTextFillColor'},
    {key:'webkitTextStrokeColor',label:'Text Stroke Color',property:'webkitTextStrokeColor'},
    {key:'webkitTextStrokeWidth',label:'Text Stroke Width',property:'webkitTextStrokeWidth'}
  ];
  const INSPECTOR_KEYS=[
    'objectName','text','linkHref','linkTarget','fontFamily','fontSize','fontWeight','fontStyle',
    ...TEXT_CSS_FIELDS.map(field=>field.key),
    'marginTop','marginRight','marginBottom','marginLeft'
  ];

  function frameForEditSlot(slot){
    return slot==='single'?refs.singleFrame:slot==='left'?refs.leftFrame:slot==='right'?refs.rightFrame:slot==='codePreview'?refs.codePreviewFrame:null;
  }

  function canInspectFrame(frame){
    const page=pageById(frameToPageId(frame));
    return !!htmlEditEnabled && page?.documentType==='html' && !!editOwnerSlot && frameForEditSlot(editOwnerSlot)===frame;
  }

  function updateInspectorEditControls(){
    $$('[data-edit-slot]').forEach(button=>{
      const slot=button.dataset.editSlot;
      const frame=frameForEditSlot(slot);
      const page=pageById(pageIdForSlot(slot));
      const active=htmlEditEnabled && editOwnerSlot===slot;
      const directAvailable=isDirectSourceType(page)&&!!frame;
      const pdfAvailable=page?.documentType==='pdf'&&!!frame;
      const scriptedHtmlAvailable=pageRequiresScripts(page)&&!!frame;
      const htmlAvailable=page?.documentType==='html'&&!!frame&&
        (frame.dataset.previewRuntime!=='interactive-isolated'||scriptedHtmlAvailable);
      const unavailable=(!pageHasRenderableContent(page)&&!(active&&isDirectSourceType(page)))||!(htmlAvailable||directAvailable||pdfAvailable);
      button.classList.toggle('active',active);
      button.closest('.view-pane')?.classList.toggle('edit-active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
      button.disabled=unavailable;
      button.textContent=active?'Apply':'Edit';
      const cancelButton=document.querySelector(`[data-edit-cancel="${slot}"]`);
      if(cancelButton)cancelButton.hidden=!active;
      const saveButton=document.querySelector(`[data-edit-save="${slot}"]`);
      if(saveButton){
        saveButton.hidden=!active;
        // A Page that was never read from disk has nowhere to save back to.
        const savable=!!page?.sourcePath;
        saveButton.disabled=!savable;
        saveButton.title=savable
          ?(page.documentType==='pdf'
             ?'Apply, then save the annotated PDF over the original file'
             :`Apply and save to ${page.sourcePath}`)
          :'This Page has no original file yet - use Save As';
      }
      const standardEditTitle=active?'Apply changes and leave Edit for this Window':'Enable Edit for this Window';
      button.title=unavailable
        ?'Edit is unavailable for this Page in the current View'
        :pdfAvailable&&!active?'Enable PDF annotation tools in the native viewer'
        :directAvailable&&!active?`Edit ${page.documentType==='json'?'JSON':'Markdown'} source directly in this View`:standardEditTitle;
      if(scriptedHtmlAvailable&&!active)button.title='Enable scripts-off DOM Edit for this scripted Page';
    });

    if(refs.resetInspectorBtn){
      refs.resetInspectorBtn.disabled=!(htmlEditEnabled && inspectorDraft?.dirty);
    }

    if(refs.exportElementBtn)refs.exportElementBtn.disabled=!(htmlEditEnabled && SelectionManager.items().some(element=>!['BODY','HTML'].includes(element.tagName)));
  }

  function paneForDocumentFullscreen(slot){
    if(slot==='single')return $('#singleView');
    if(slot==='left'||slot==='right')return document.querySelector(`[data-view-slot="${slot}"]`);
    if(slot==='codePreview')return document.querySelector('[data-view-slot="code-preview"]');
    return null;
  }

  function updateDocumentFullscreenControls(){
    $$('[data-document-fullscreen]').forEach(button=>{
      const active=documentFullscreenSlot===button.dataset.documentFullscreen;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
      button.textContent=active?'◫':'⛶';
      button.setAttribute('aria-label',active?'Show Leaf UI':'View page without app UI');
      button.title=active?'Show Leaf UI':'View page without app UI';
    });
  }

  function setDocumentFullscreen(slot,{skipNative=false}={}){
    const previous=documentFullscreenSlot;
    const next=slot&&documentFullscreenSlot!==slot?slot:null;
    if(next&&!previous){
      documentFullscreenRestoreEditSlot=htmlEditEnabled?editOwnerSlot:null;
      if(htmlEditEnabled)setHtmlEditEnabled(false);
    }
    documentFullscreenSlot=next;
    document.body.classList.toggle('document-view-only',!!next);
    document.body.dataset.documentFullscreenSlot=next||'';
    $$('.document-fullscreen-target').forEach(pane=>pane.classList.remove('document-fullscreen-target'));
    paneForDocumentFullscreen(next)?.classList.add('document-fullscreen-target');
    updateDocumentFullscreenControls();
    if(!skipNative)window.electronAPI.setDocumentFullscreen(!!next).catch(error=>{
      console.error('Native fullscreen failed',error);showToast(`Fullscreen failed: ${error.message}`);
    });
    if(!next){
      const restoreSlot=documentFullscreenRestoreEditSlot;documentFullscreenRestoreEditSlot=null;
      if(restoreSlot)setHtmlEditEnabled(true,restoreSlot);
    }
  }

  window.electronAPI.onPdfAnnotationSaved?.(result=>{
    if(!result?.ok){ showToast(`PDF save failed: ${result?.error||'unknown error'}`); return; }
    const found=loadedPageForPath(result.sourcePath);
    if(!found){ showToast('Annotated PDF saved'); return; }
    // The file on disk changed underneath the frame, so the preview has to be
    // re-pointed with a fresh token or the viewer keeps showing the cached copy.
    found.page.previewUrl=`file:///${String(result.sourcePath).replace(/\\/g,'/')}?t=${Date.now()}`;
    renderVisibleFramesForPage(found.page.id,null);
    persist();
    showToast(`Saved annotations to ${found.page.name}`);
  });

  window.electronAPI.onDocumentFullscreenChanged?.(enabled=>{
    if(!enabled&&documentFullscreenSlot)setDocumentFullscreen(null,{skipNative:true});
  });

  $$('[data-document-fullscreen]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    setDocumentFullscreen(button.dataset.documentFullscreen);
  }));

  function hideAllEditorOverlays(){
    [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>{
      try{
        frame.contentDocument?.querySelectorAll('[data-editor-overlay]').forEach(el=>{el.style.display='none';});
      }catch{}
    });
  }

  let editSessionSnapshot=null;
  let pendingEditCancel=null;

  function editSessionIsDirty(){
    if(!editSessionSnapshot)return false;
    const page=pageById(editSessionSnapshot.pageId);
    return !!page&&String(page.source||'')!==editSessionSnapshot.source;
  }

  function restoreEditSessionSnapshot(){
    const snapshot=editSessionSnapshot;
    if(!snapshot)return;
    const page=pageById(snapshot.pageId);
    if(page&&String(page.source||'')!==snapshot.source){
      pushUndo(page);
      page.source=snapshot.source;
      markJiraCheckStale();
      persist();
      renderVisibleFramesForPage(page.id,null);
      if(state.mode==='code'&&state.views.codePage===page.id)loadCodePage();
    }
  }

  function cancelHtmlEdit(slot){
    if(!(htmlEditEnabled&&editOwnerSlot===slot))return;
    if(editSessionIsDirty()){
      pendingEditCancel=slot;
      const page=pageById(editSessionSnapshot.pageId);
      if(refs.cancelEditTarget)refs.cancelEditTarget.textContent=page?.name||page?.fileName||'';
      refs.cancelEditModal?.classList.add('show');
      setTimeout(()=>$('#cancelEditKeep')?.focus(),0);
      return;
    }
    setHtmlEditEnabled(false,slot);
  }

  function closeCancelEditDialog(){refs.cancelEditModal?.classList.remove('show');pendingEditCancel=null;}

  function setHtmlEditEnabled(enabled,slot=editOwnerSlot){
    const affectedSlot=slot||editOwnerSlot;
    const affectedFrame=frameForEditSlot(affectedSlot);
    const affectedPage=pageById(pageIdForSlot(affectedSlot));
    const rerenderDirect=isDirectSourceType(affectedPage)&&!!affectedFrame;
    if(!enabled&&affectedFrame?.dataset.directSourceToken)directSourceUndoTokens.delete(affectedFrame.dataset.directSourceToken);
    if(affectedSlot){
      if(enabled&&affectedPage)editSessionSnapshot={slot:affectedSlot,pageId:affectedPage.id,source:String(affectedPage.source||'')};
      else if(!enabled)editSessionSnapshot=null;
      flushPersist();
      document.dispatchEvent(new CustomEvent('leaf-edit-runtime-transition',{detail:{
        enabled:!!enabled,
        slot:affectedSlot,
        pageId:affectedPage?.id||null,
        documentType:affectedPage?.documentType||null
      }}));
    }
    htmlEditEnabled=!!enabled;
    editOwnerSlot=htmlEditEnabled?slot:null;
    if(!htmlEditEnabled){
      if(inspectorDraft?.dirty) restoreDraftOriginalLive();
      hideAllEditorOverlays();
      clearInspector();
    }else{
      clearInspector();
      const activeFrame=frameForEditSlot(editOwnerSlot);
      if(activeFrame?.dataset.previewRuntime==='interactive-isolated'){
        refs.inspectorBody.innerHTML='<div class="edit-mode-message"><strong>Interactive Preview</strong>This page uses JavaScript to render its content. It runs in an isolated sandbox, so direct DOM HTML Edit is disabled for this page.</div>';
      }else if(affectedPage?.documentType==='pdf'){
        refs.inspectorBody.innerHTML='<div class="edit-mode-message"><strong>PDF Edit</strong>Use the native PDF toolbar to highlight, draw, annotate, fill, sign, undo, redo, and download the edited PDF.</div>';
      }
    }
    if(affectedPage?.documentType==='pdf'&&affectedFrame)configureFrameRuntime(affectedFrame,affectedPage,affectedSlot);
    if(rerenderDirect&&affectedFrame)renderFrame(affectedFrame,affectedPage.id);
    else updateInspectorEditControls();
  }

  $$('[data-edit-slot]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const slot=button.dataset.editSlot;
    const nextEnabled=!(htmlEditEnabled && editOwnerSlot===slot);
    const transition=()=>{
      if(slot==='left'||slot==='right') activeSlots.split=slot;
      if(slot==='codePreview') activeSlots.code='preview';
      setHtmlEditEnabled(nextEnabled,slot);
      applyActiveViewOutline();renderTree();renderCrumbs();persist();
    };
    if(hasUnsavedInspectorDraft()) withUnsavedInspectorGuard(transition);
    else transition();
  }));

  function setInspectorPreviewEnabled(enabled){
    inspectorPreviewEnabled=true;
    state.preferences.inspectorPreview=true;

    if(inspectorDraft){
      validateInspectorDraft();
      if(!hasInspectorValidationErrors()) applyDraftPreview();
    }

    persist();
    updateInspectorDraftUI();
  }

  refs.resetInspectorBtn.onclick=resetInspectorDraft;

  function ensureInspectorElementId(el){
    if(!el.dataset.editorElementId){
      inspectorElementSequence+=1;
      el.dataset.editorElementId=`runtime-element-${inspectorElementSequence}`;
    }
    return el.dataset.editorElementId;
  }

  function bindInspector(frame){
    if(frame.dataset.previewRuntime==='interactive-isolated') return;
    let doc=null;
    try{ doc=frame.contentDocument; }catch{ return; }
    if(!doc?.body) return;

    const overlay=doc.createElement('div');
    overlay.dataset.editorOverlay='1';
    Object.assign(overlay.style,{
      position:'absolute',zIndex:2147483647,pointerEvents:'none',
      border:'1px solid rgba(110,136,232,.8)',
      background:'rgba(110,136,232,.045)',
      borderRadius:'2px',display:'none',boxSizing:'border-box'
    });
    doc.body.appendChild(overlay);

    // Hover inspection is intentionally separate from the persistent
    // selection overlay. Moving the pointer can therefore inspect another
    // object without clearing or visually replacing the current selection.
    const hoverOverlay=doc.createElement('div');
    hoverOverlay.dataset.editorOverlay='hover-highlight';
    Object.assign(hoverOverlay.style,{
      position:'absolute',zIndex:2147483644,pointerEvents:'none',
      border:'1px solid rgba(67,132,222,.95)',
      background:'rgba(75,145,222,.26)',
      boxShadow:'inset 0 0 0 1px rgba(255,255,255,.16)',
      display:'none',boxSizing:'border-box'
    });
    doc.body.appendChild(hoverOverlay);

    const hoverTooltip=doc.createElement('div');
    hoverTooltip.dataset.editorOverlay='hover-tooltip';
    hoverTooltip.setAttribute('role','tooltip');
    Object.assign(hoverTooltip.style,{
      position:'absolute',zIndex:2147483647,pointerEvents:'none',
      minWidth:'210px',maxWidth:'320px',padding:'10px 12px',
      border:'1px solid rgba(15,23,42,.16)',borderRadius:'5px',
      background:'rgba(255,255,255,.98)',color:'#202124',
      boxShadow:'0 5px 18px rgba(15,23,42,.24)',
      font:'12px/1.35 Arial,sans-serif',display:'none',boxSizing:'border-box'
    });
    const hoverTooltipArrow=doc.createElement('span');
    Object.assign(hoverTooltipArrow.style,{
      position:'absolute',width:'0',height:'0',borderLeft:'7px solid transparent',
      borderRight:'7px solid transparent'
    });
    const hoverTooltipHeader=doc.createElement('div');
    Object.assign(hoverTooltipHeader.style,{display:'flex',alignItems:'baseline',gap:'8px',whiteSpace:'nowrap'});
    const hoverTooltipIcon=doc.createElement('span');
    hoverTooltipIcon.textContent='▦';
    Object.assign(hoverTooltipIcon.style,{color:'#5688de',fontSize:'16px',lineHeight:'1'});
    const hoverTooltipTag=doc.createElement('strong');
    Object.assign(hoverTooltipTag.style,{minWidth:'0',overflow:'hidden',textOverflow:'ellipsis',color:'#7b246f',fontSize:'13px'});
    const hoverTooltipSize=doc.createElement('span');
    Object.assign(hoverTooltipSize.style,{marginLeft:'auto',color:'#30343b',fontVariantNumeric:'tabular-nums'});
    hoverTooltipHeader.append(hoverTooltipIcon,hoverTooltipTag,hoverTooltipSize);
    const hoverTooltipSection=doc.createElement('div');
    hoverTooltipSection.textContent='PROPERTIES';
    Object.assign(hoverTooltipSection.style,{display:'flex',alignItems:'center',gap:'8px',margin:'10px 0 6px',color:'#667085',fontSize:'9px',letterSpacing:'.45px'});
    const hoverTooltipRule=doc.createElement('span');
    Object.assign(hoverTooltipRule.style,{height:'1px',flex:'1',background:'#d8dce3'});
    hoverTooltipSection.appendChild(hoverTooltipRule);
    const hoverTooltipRows=doc.createElement('div');
    Object.assign(hoverTooltipRows.style,{display:'grid',gridTemplateColumns:'72px minmax(0,1fr)',gap:'3px 10px'});
    hoverTooltip.append(hoverTooltipArrow,hoverTooltipHeader,hoverTooltipSection,hoverTooltipRows);
    doc.body.appendChild(hoverTooltip);

    const implicitRole=el=>{
      const explicit=el.getAttribute('role')?.trim();
      if(explicit)return explicit;
      if(/^H[1-6]$/.test(el.tagName))return 'heading';
      const roles={A:'link',BUTTON:'button',IMG:'img',INPUT:'textbox',TEXTAREA:'textbox',SELECT:'combobox',NAV:'navigation',MAIN:'main',ASIDE:'complementary',ARTICLE:'article',SECTION:'region',UL:'list',OL:'list',LI:'listitem',TABLE:'table',TH:'columnheader',TD:'cell',FORM:'form'};
      return roles[el.tagName]||'generic';
    };
    const isKeyboardFocusable=el=>{
      if(el.matches?.(':disabled,[inert]'))return false;
      const tabIndex=el.getAttribute('tabindex');
      if(tabIndex!==null)return Number(tabIndex)>=0;
      if(el.tagName==='A')return el.hasAttribute('href');
      return ['BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY'].includes(el.tagName)||el.isContentEditable;
    };
    const hoverSelectorLabel=el=>{
      const tag=el.tagName.toLowerCase();
      const id=el.id?`#${el.id}`:'';
      const classes=[...el.classList].filter(name=>!['table-cell-selected','viewport-object-drop-target','hbe-inline-editing'].includes(name)).slice(0,2);
      return `${tag}${id}${classes.length?`.${classes.join('.')}`:''}`;
    };
    const setHoverTooltipRows=rows=>{
      hoverTooltipRows.replaceChildren();
      rows.forEach(([label,value])=>{
        const key=doc.createElement('span');key.textContent=label;key.style.color='#6b7280';
        const field=doc.createElement('span');field.textContent=value;Object.assign(field.style,{minWidth:'0',overflow:'hidden',textOverflow:'ellipsis',textAlign:'right',color:'#30343b'});
        hoverTooltipRows.append(key,field);
      });
    };
    let hoveredElement=null;
    const hideHoverOverlay=()=>{
      hoveredElement=null;
      hoverOverlay.style.display='none';
      hoverTooltip.style.display='none';
    };
    const elementCanHover=el=>!!el && el.nodeType===1 && !['HTML','BODY'].includes(el.tagName) && !el.dataset?.editorOverlay;
    const positionHoverOverlay=el=>{
      if(!canInspectFrame(frame)||!elementCanHover(el)){hideHoverOverlay();return;}
      hoveredElement=el;
      const rect=el.getBoundingClientRect();
      if(rect.width<.5||rect.height<.5){hideHoverOverlay();return;}
      const view=doc.defaultView;
      const scrollX=view.scrollX,scrollY=view.scrollY;
      Object.assign(hoverOverlay.style,{
        display:'block',left:`${rect.left+scrollX}px`,top:`${rect.top+scrollY}px`,
        width:`${rect.width}px`,height:`${rect.height}px`
      });
      const computed=view.getComputedStyle(el);
      hoverTooltipTag.textContent=hoverSelectorLabel(el);
      hoverTooltipSize.textContent=`${Math.round(rect.width*100)/100} × ${Math.round(rect.height*100)/100}`;
      setHoverTooltipRows([
        ['Name',objectDisplayName(el)],
        ['Role',implicitRole(el)],
        ['Display',computed.display||'—'],
        ['Focusable',isKeyboardFocusable(el)?'Yes':'No']
      ]);
      hoverTooltip.style.display='block';
      const tooltipRect=hoverTooltip.getBoundingClientRect();
      const gap=10;
      const placeAbove=rect.top>=tooltipRect.height+gap+8;
      const viewportLeft=scrollX+8;
      const viewportRight=scrollX+view.innerWidth-tooltipRect.width-8;
      const desiredLeft=scrollX+rect.left;
      const left=Math.max(viewportLeft,Math.min(desiredLeft,Math.max(viewportLeft,viewportRight)));
      const desiredTop=placeAbove
        ? scrollY+rect.top-tooltipRect.height-gap
        : scrollY+rect.bottom+gap;
      const viewportTop=scrollY+8;
      const viewportBottom=scrollY+view.innerHeight-tooltipRect.height-8;
      const top=Math.max(viewportTop,Math.min(desiredTop,Math.max(viewportTop,viewportBottom)));
      Object.assign(hoverTooltip.style,{left:`${left}px`,top:`${top}px`});
      const anchorX=Math.max(14,Math.min(tooltipRect.width-14,scrollX+rect.left+Math.min(rect.width/2,28)-left));
      Object.assign(hoverTooltipArrow.style,{left:`${anchorX-7}px`,borderTop:'',borderBottom:''});
      if(placeAbove){
        Object.assign(hoverTooltipArrow.style,{bottom:'-7px',top:'auto',borderTop:'7px solid rgba(255,255,255,.98)'});
      }else{
        Object.assign(hoverTooltipArrow.style,{top:'-7px',bottom:'auto',borderBottom:'7px solid rgba(255,255,255,.98)'});
      }
    };

    const sizeLabel=doc.createElement('div');
    sizeLabel.dataset.editorOverlay='1';
    Object.assign(sizeLabel.style,{
      position:'absolute',left:'0',top:'100%',marginTop:'5px',padding:'2px 5px',
      borderRadius:'3px',background:'#5873d4',color:'#fff',font:'10px/1.3 Arial,sans-serif',
      whiteSpace:'nowrap',display:'none',pointerEvents:'none'
    });
    overlay.appendChild(sizeLabel);

    const moveHandle=doc.createElement('button');
    moveHandle.type='button';moveHandle.draggable=true;moveHandle.dataset.editorOverlay='move-handle';
    moveHandle.textContent='✥';moveHandle.title='Move object';moveHandle.setAttribute('aria-label','Move selected object');
    Object.assign(moveHandle.style,{position:'absolute',left:'0',top:'-27px',width:'24px',height:'22px',padding:'0',display:'none',placeItems:'center',border:'1px solid #fff',borderRadius:'4px',background:'#315fae',color:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,.28)',pointerEvents:'auto',cursor:'grab',font:'14px/1 Arial,sans-serif'});
    overlay.appendChild(moveHandle);
    moveHandle.addEventListener('pointerdown',event=>{event.stopPropagation();});
    moveHandle.addEventListener('dragstart',event=>{
      const element=selectedElement;if(!element||selectedElementFrame!==frame){event.preventDefault();return;}
      const rect=element.getBoundingClientRect(),id=element.getAttribute('data-hbe-id')||ensureInspectorElementId(element);
      viewportElementDragContext={element,frame,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top};
      event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-hbe-existing-element',id);
    });
    moveHandle.addEventListener('dragend',()=>{
      [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(item=>{try{clearViewportDropFeedback(item.contentDocument)}catch{}});
      viewportElementDragContext=null;
    });

    const handlePlacements={
      nw:{top:'-6px',left:'-6px'},
      n:{top:'-5px',left:'-2px',right:'-2px'},
      ne:{top:'-6px',right:'-6px'},
      e:{top:'-2px',bottom:'-2px',right:'-5px'},
      se:{bottom:'-6px',right:'-6px'},
      s:{bottom:'-5px',left:'-2px',right:'-2px'},
      sw:{bottom:'-6px',left:'-6px'},
      w:{top:'-2px',bottom:'-2px',left:'-5px'}
    };
    const scaleHandles=['nw','n','ne','e','se','s','sw','w'].map(direction=>{
      const handle=doc.createElement('button');
      handle.type='button';
      handle.dataset.editorOverlay='1';
      handle.dataset.scaleHandle=direction;
      handle.setAttribute('aria-label',`Resize ${direction.toUpperCase()}`);
      const edge=direction.length===1;
      const verticalEdge=direction==='e'||direction==='w';
      Object.assign(handle.style,{
        position:'absolute',width:edge?(verticalEdge?'8px':'auto'):'10px',
        height:edge?(verticalEdge?'auto':'8px'):'10px',padding:'0',display:'none',
        ...handlePlacements[direction],border:edge?'0':'1px solid #fff',borderRadius:edge?'0':'2px',
        background:edge?'transparent':'#5873d4',boxShadow:edge?'none':'0 0 0 1px #5873d4',pointerEvents:'auto',
        cursor:`${direction}-resize`,zIndex:edge?'1':'2'
      });
      overlay.appendChild(handle);
      return handle;
    });

    const elementCanScale=el=>!!el && !['HTML','BODY'].includes(el.tagName) && !el.dataset?.editorOverlay;

    const tableOverlayToolbar=doc.createElement('div');
    tableOverlayToolbar.dataset.editorOverlay='table-toolbar';
    tableOverlayToolbar.setAttribute('role','toolbar');
    tableOverlayToolbar.setAttribute('aria-label','Table editing');
    Object.assign(tableOverlayToolbar.style,{
      position:'absolute',zIndex:2147483647,display:'none',alignItems:'center',gap:'3px',
      minHeight:'32px',padding:'4px',border:'1px solid rgba(15,23,42,.28)',borderRadius:'6px',
      background:'rgba(24,27,33,.96)',color:'#f5f7fb',boxShadow:'0 5px 18px rgba(15,23,42,.3)',
      font:'11px/1 Arial,sans-serif',whiteSpace:'nowrap',boxSizing:'border-box',pointerEvents:'auto'
    });
    const tableToolbarActions=[
      ['add-row','Row +','Add row after selected row',addTableRow],
      ['delete-row','Row −','Delete selected row',deleteTableRow],
      ['add-column','Column +','Add column after selected column',addTableColumn],
      ['delete-column','Column −','Delete selected column',deleteTableColumn],
      ['merge-right','Merge →','Merge selected cell with the cell to its right',mergeCellRight],
      ['unmerge','Split','Split the selected merged cell',unmergeCell]
    ];
    const tableOverlayButtons=new Map();
    tableToolbarActions.forEach(([name,label,title,action],index)=>{
      if(index===2||index===4){
        const divider=doc.createElement('span');
        divider.dataset.editorOverlay='table-toolbar';
        Object.assign(divider.style,{width:'1px',height:'18px',margin:'0 1px',background:'rgba(255,255,255,.2)'});
        tableOverlayToolbar.appendChild(divider);
      }
      const button=doc.createElement('button');
      button.type='button';button.textContent=label;button.title=title;
      button.dataset.editorOverlay='table-toolbar';button.dataset.tableOverlayAction=name;
      button.setAttribute('aria-label',title);
      Object.assign(button.style,{
        height:'24px',padding:'0 7px',border:'1px solid rgba(255,255,255,.17)',borderRadius:'4px',
        background:'rgba(255,255,255,.07)',color:'inherit',font:'inherit',cursor:'pointer'
      });
      button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!button.disabled)action();});
      tableOverlayToolbar.appendChild(button);tableOverlayButtons.set(name,button);
    });
    doc.body.appendChild(tableOverlayToolbar);

    const positionTableOverlayToolbar=()=>{
      const localSelection=selectedElementFrame===frame&&selectedElement?.ownerDocument===doc;
      const table=localSelection?selectedTable():null;
      if(!table){tableOverlayToolbar.style.display='none';return;}
      const cell=selectedTableCell();
      const anchor=cell||table;
      const rect=anchor.getBoundingClientRect();
      if(rect.width<1||rect.height<1){tableOverlayToolbar.style.display='none';return;}
      const logicalColumns=tableLogicalColumnCount(table);
      const buttonState={
        'delete-row':table.rows.length<=1,
        'delete-column':logicalColumns<=1,
        'merge-right':!cell||!cell.nextElementSibling||!['TD','TH'].includes(cell.nextElementSibling.tagName),
        unmerge:!cell||(cell.colSpan||1)<=1
      };
      tableOverlayButtons.forEach((button,name)=>{
        button.disabled=!!buttonState[name];
        button.style.opacity=button.disabled?'.38':'1';
        button.style.cursor=button.disabled?'default':'pointer';
      });
      tableOverlayToolbar.style.display='flex';
      tableOverlayToolbar.style.visibility='hidden';
      const view=doc.defaultView,scrollX=view.scrollX,scrollY=view.scrollY;
      const toolbarRect=tableOverlayToolbar.getBoundingClientRect();
      const left=Math.max(scrollX+6,Math.min(scrollX+rect.left,scrollX+view.innerWidth-toolbarRect.width-6));
      const above=scrollY+rect.top-toolbarRect.height-7;
      const desiredTop=above>=scrollY+6?above:scrollY+rect.bottom+7;
      const top=Math.max(scrollY+6,Math.min(desiredTop,scrollY+view.innerHeight-toolbarRect.height-6));
      Object.assign(tableOverlayToolbar.style,{left:`${left}px`,top:`${top}px`,visibility:'visible'});
    };

    const positionOverlay=(el,stateName='hover')=>{
      if(!canInspectFrame(frame) || !el || el.dataset?.editorOverlay) return;
      const r=el.getBoundingClientRect();
      const selected=stateName==='selected';
      const scalable=selected && elementCanScale(el);
      Object.assign(overlay.style,{
        display:'block',
        left:`${r.left+doc.defaultView.scrollX}px`,
        top:`${r.top+doc.defaultView.scrollY}px`,
        width:`${r.width}px`,
        height:`${r.height}px`,
        border:selected?'2px solid #6e88e8':'1px solid rgba(110,136,232,.78)',
        background:selected?'rgba(110,136,232,.09)':'rgba(110,136,232,.035)'
      });
      scaleHandles.forEach(handle=>{handle.style.display=scalable?'block':'none';});
      moveHandle.style.display=selected?'grid':'none';
      sizeLabel.style.display=scalable?'block':'none';
      if(scalable) sizeLabel.textContent=`${Math.round(r.width)} × ${Math.round(r.height)}`;
    };

    const secondaryOverlays=new Map();
    const syncSelectionOverlays=()=>{
      const selectedInFrame=SelectionManager.items().filter(item=>item.ownerDocument===doc);
      secondaryOverlays.forEach((marker,item)=>{
        if(!selectedInFrame.includes(item) || item===selectedElement){marker.remove();secondaryOverlays.delete(item);}
      });
      selectedInFrame.forEach(item=>{
        if(item===selectedElement){positionOverlay(item,'selected');return;}
        let marker=secondaryOverlays.get(item);
        if(!marker){
          marker=doc.createElement('div');
          marker.dataset.editorOverlay='1';
          Object.assign(marker.style,{position:'absolute',zIndex:2147483646,pointerEvents:'none',border:'2px solid #6e88e8',background:'rgba(110,136,232,.07)',borderRadius:'2px',boxSizing:'border-box'});
          doc.body.appendChild(marker);secondaryOverlays.set(item,marker);
        }
        const rect=item.getBoundingClientRect();
        Object.assign(marker.style,{display:'block',left:`${rect.left+doc.defaultView.scrollX}px`,top:`${rect.top+doc.defaultView.scrollY}px`,width:`${rect.width}px`,height:`${rect.height}px`});
      });
      if(!selectedInFrame.includes(selectedElement)) overlay.style.display='none';
      positionTableOverlayToolbar();
    };
    frameSelectionRenderers.set(frame,syncSelectionOverlays);

    scaleHandles.forEach(handle=>handle.addEventListener('pointerdown',event=>{
      if(!canInspectFrame(frame) || selectedElementFrame!==frame || !elementCanScale(selectedElement)) return;
      event.preventDefault();
      event.stopPropagation();

      const target=selectedElement;
      const page=pageById(frameToPageId(frame));
      const startRect=target.getBoundingClientRect();
      if(!page || startRect.width<1 || startRect.height<1) return;

      const direction=handle.dataset.scaleHandle;
      const startX=event.clientX;
      const startY=event.clientY;
      const computed=doc.defaultView.getComputedStyle(target);
      const startWidth=parseFloat(computed.width)||startRect.width;
      const startHeight=parseFloat(computed.height)||startRect.height;
      const startMarginLeft=parseFloat(computed.marginLeft)||0;
      const startMarginTop=parseFloat(computed.marginTop)||0;
      const snapRects=[...doc.body.querySelectorAll('[data-hbe-object],main,article,section,aside,div,figure,img,h1,h2,h3,h4,h5,h6,p,ul,ol,table,pre,blockquote,hr')]
        .filter(element=>element!==target&&!target.contains(element)&&!element.closest('[data-editor-overlay],[data-adf-marker]'))
        .map(element=>element.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
      const horizontalGuides=[0,doc.defaultView.innerWidth,...snapRects.flatMap(rect=>[rect.left,rect.left+(rect.width/2),rect.right])];
      const verticalGuides=[0,doc.defaultView.innerHeight,...snapRects.flatMap(rect=>[rect.top,rect.top+(rect.height/2),rect.bottom])];
      const snapAdjustment=(position,guides)=>{
        let nearest=0,distance=7;
        guides.forEach(guide=>{const next=Math.abs(guide-position);if(next<distance){distance=next;nearest=guide-position;}});
        return distance<=6?nearest:0;
      };
      let changed=false;

      const move=moveEvent=>{
        moveEvent.preventDefault();
        const deltaX=moveEvent.clientX-startX;
        const deltaY=moveEvent.clientY-startY;
        let appliedX=deltaX;
        let appliedY=deltaY;
        if(moveEvent.shiftKey&&(direction.includes('e')||direction.includes('w'))){
          const movingEdge=direction.includes('e')?startRect.right+deltaX:startRect.left+deltaX;
          appliedX+=snapAdjustment(movingEdge,horizontalGuides);
        }
        if(moveEvent.shiftKey&&(direction.includes('n')||direction.includes('s'))){
          const movingEdge=direction.includes('s')?startRect.bottom+deltaY:startRect.top+deltaY;
          appliedY+=snapAdjustment(movingEdge,verticalGuides);
        }

        if(direction.includes('e')){
          target.style.width=`${Math.max(1,Math.round(startWidth+appliedX))}px`;
        }else if(direction.includes('w')){
          const width=Math.max(1,startWidth-appliedX);
          const appliedDelta=startWidth-width;
          target.style.width=`${Math.round(width)}px`;
          target.style.marginLeft=`${Math.round(startMarginLeft+appliedDelta)}px`;
        }

        if(direction.includes('s')){
          target.style.height=`${Math.max(1,Math.round(startHeight+appliedY))}px`;
        }else if(direction.includes('n')){
          const height=Math.max(1,startHeight-appliedY);
          const appliedDelta=startHeight-height;
          target.style.height=`${Math.round(height)}px`;
          target.style.marginTop=`${Math.round(startMarginTop+appliedDelta)}px`;
        }

        changed=changed
          || ((direction.includes('e')||direction.includes('w')) && Math.abs(appliedX)>.001)
          || ((direction.includes('n')||direction.includes('s')) && Math.abs(appliedY)>.001);
        positionOverlay(target,'selected');
      };

      const finish=finishEvent=>{
        finishEvent?.preventDefault();
        doc.defaultView.removeEventListener('pointermove',move,true);
        doc.defaultView.removeEventListener('pointerup',finish,true);
        doc.defaultView.removeEventListener('pointercancel',finish,true);
        if(changed) commitDomMutation(frame,page,target,'viewport-scale');
        else positionOverlay(target,'selected');
      };

      doc.defaultView.addEventListener('pointermove',move,true);
      doc.defaultView.addEventListener('pointerup',finish,true);
      doc.defaultView.addEventListener('pointercancel',finish,true);
    }));

    doc.addEventListener('mouseover',e=>{
      if(!canInspectFrame(frame) || e.target.dataset?.editorOverlay){hideHoverOverlay();return;}
      positionHoverOverlay(e.target);
      if(SelectionManager.items().some(item=>item.ownerDocument===doc)) syncSelectionOverlays();
    },true);

    doc.addEventListener('mouseout',event=>{
      if(!canInspectFrame(frame)){
        hideHoverOverlay();
        overlay.style.display='none';
        return;
      }
      if(elementCanHover(event.relatedTarget))positionHoverOverlay(event.relatedTarget);
      else hideHoverOverlay();
      if(SelectionManager.items().some(item=>item.ownerDocument===doc)) syncSelectionOverlays();
      else overlay.style.display='none';
    },true);

    doc.addEventListener('scroll',()=>{if(hoveredElement?.isConnected)positionHoverOverlay(hoveredElement);else hideHoverOverlay();},true);
    doc.defaultView.addEventListener('resize',()=>{
      if(hoveredElement?.isConnected)positionHoverOverlay(hoveredElement);
      if(SelectionManager.items().some(item=>item.ownerDocument===doc))syncSelectionOverlays();
    });

    doc.addEventListener('pointerdown',e=>{
      if(!canInspectFrame(frame) || e.target.dataset?.editorOverlay) return;
      if(inlineTextEditSession?.element?.contains(e.target)) return;
      hideHoverOverlay();
      e.preventDefault();
      e.stopPropagation();

      const target=e.target;
      SelectionManager.select(target,frame,'viewport',{toggle:e.ctrlKey||e.metaKey});
      const tableCell=target.closest?.('td,th');
      if(tableCell&&!e.ctrlKey&&!e.metaKey)beginTableRangeDrag(tableCell,frame,e);
      syncSelectionOverlays();
    },true);

    doc.addEventListener('click',e=>{
      if(!canInspectFrame(frame) || e.target.dataset?.editorOverlay) return;
      if(!inlineTextEditSession?.element?.contains(e.target)) e.preventDefault();
      e.stopPropagation();
    },true);

    doc.addEventListener('dblclick',event=>{
      if(!canInspectFrame(frame) || event.target.dataset?.editorOverlay) return;
      const target=event.target;
      if(!isTextWidget(target)) return;
      event.preventDefault();event.stopPropagation();
      SelectionManager.select(target,frame,'viewport');
      beginInlineTextEdit(target,frame);
      syncSelectionOverlays();
    },true);

    doc.addEventListener('contextmenu',event=>{
      if(!canInspectFrame(frame) || event.target.dataset?.editorOverlay)return;
      event.preventDefault();event.stopPropagation();
      openObjectContextMenu(frame,event.target,event.clientX,event.clientY);
      syncSelectionOverlays();
    },true);

    doc.addEventListener('keydown',event=>{
      const editing=event.target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName);
      const modifier=event.ctrlKey||event.metaKey;
      if(event.key==='Escape' && inlineTextEditSession?.frame===frame){
        event.preventDefault();event.stopImmediatePropagation();
        endInlineTextEdit({commit:false});
      }else if(event.key==='Escape'){
        event.preventDefault();
        clearInspector();
      }else if((event.key==='Delete'||event.key==='Del') && !editing){
        event.preventDefault();deleteSelectedElements();
      }else if(event.key==='Enter' && !editing && !modifier){
        event.preventDefault();event.stopImmediatePropagation();editSelectedText();
      }else if(event.key==='F2' && !editing){
        event.preventDefault();editSelectedText();
      }else if(event.key.toLowerCase()==='f' && !editing && !modifier){
        event.preventDefault();revealSelectedObject();
      }else if(modifier && !editing && event.key.toLowerCase()==='c'){
        event.preventDefault();copySelectedElements();
      }else if(modifier && !editing && event.key.toLowerCase()==='v'){
        event.preventDefault();pasteSelectedElements();
      }else if(modifier && !editing && event.key.toLowerCase()==='d'){
        event.preventDefault();duplicateSelectedElements();
      }
    },true);

    doc.addEventListener('scroll',()=>{
      if(canInspectFrame(frame)) syncSelectionOverlays();
    },true);
  }

  function isTextWidget(element){
    if(!element || ['HTML','BODY','INPUT','TEXTAREA','SELECT','IMG','TABLE'].includes(element.tagName)) return false;
    if(element.getAttribute('data-hbe-object')==='text') return true;
    return ['P','SPAN','LABEL','BUTTON','A','LI','TD','TH','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','FIGCAPTION'].includes(element.tagName)
      && [...element.childNodes].some(node=>node.nodeType===Node.TEXT_NODE);
  }

  function beginInlineTextEdit(element,frame){
    if(!isTextWidget(element) || !canInspectFrame(frame)) return false;
    if(inlineTextEditSession?.element===element) return true;
    if(inlineTextEditSession) endInlineTextEdit();
    const page=pageById(frameToPageId(frame));
    if(!page) return false;
    inlineTextEditSession={element,frame,page,originalContentEditable:element.getAttribute('contenteditable'),originalHtml:element.innerHTML,composing:false,listeners:null};
    inlineTextEditStarting=true;
    element.setAttribute('contenteditable','plaintext-only');
    element.focus({preventScroll:true});
    const selection=frame.contentWindow.getSelection();
    selection?.selectAllChildren(element);
    const updateLiveState=()=>{
      const session=inlineTextEditSession;
      if(!session || session.element!==element) return;
      if(inspectorDraft?.element===element){
        const value=element.innerText;
        inspectorDraft.values.text=value;
        const control=refs.inspectorBody.querySelector('[data-draft-key="text"]');if(control)control.value=value;
      }
      frameSelectionRenderers.get(frame)?.();
    };
    const compositionStart=()=>{if(inlineTextEditSession)inlineTextEditSession.composing=true;};
    const compositionEnd=()=>{if(inlineTextEditSession){inlineTextEditSession.composing=false;updateLiveState();}};
    const keydown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();endInlineTextEdit({commit:false});return;
      }
      if(event.key!=='Enter' || event.isComposing || inlineTextEditSession?.composing) return;
      if(event.shiftKey){
        event.preventDefault();event.stopPropagation();
        const selection=frame.contentWindow.getSelection();
        if(selection?.rangeCount){
          const range=selection.getRangeAt(0);range.deleteContents();
          const br=frame.contentDocument.createElement('br');range.insertNode(br);
          const caret=frame.contentDocument.createTextNode('\u200b');br.after(caret);
          range.setStart(caret,caret.data.length);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
          updateLiveState();
        }
        return;
      }
      event.preventDefault();event.stopPropagation();endInlineTextEdit({commit:true});
    };
    const blur=()=>{if(inlineTextEditSession?.element===element)endInlineTextEdit({commit:true});};
    element.addEventListener('input',updateLiveState);
    element.addEventListener('compositionstart',compositionStart);
    element.addEventListener('compositionend',compositionEnd);
    element.addEventListener('keydown',keydown);
    element.addEventListener('blur',blur);
    inlineTextEditSession.listeners={updateLiveState,compositionStart,compositionEnd,keydown,blur};
    inlineTextEditStarting=false;
    return true;
  }

  function endInlineTextEdit({commit=true,restoreSelection=true}={}){
    // focus() during setup re-enters through pane activation; the edit the user
    // just started must not be torn down by its own focus.
    if(inlineTextEditStarting) return;
    const session=inlineTextEditSession;
    if(!session) return;
    const {element,frame,page,listeners}=session;
    // beginInlineTextEdit focuses the element before its listeners are attached,
    // and focus can re-enter here, so the session may not carry them yet.
    if(listeners){
      element.removeEventListener('input',listeners.updateLiveState);
      element.removeEventListener('compositionstart',listeners.compositionStart);
      element.removeEventListener('compositionend',listeners.compositionEnd);
      element.removeEventListener('keydown',listeners.keydown);
      element.removeEventListener('blur',listeners.blur);
    }
    if(session.originalContentEditable===null) session.element.removeAttribute('contenteditable');
    else session.element.setAttribute('contenteditable',session.originalContentEditable);
    const walker=element.ownerDocument.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    const textNodes=[];while(walker.nextNode())textNodes.push(walker.currentNode);
    textNodes.forEach(node=>{node.data=node.data.replace(/\u200b/g,'');if(!node.data)node.remove();});
    inlineTextEditSession=null;
    const changed=element.innerHTML!==session.originalHtml;
    if(!commit && changed) element.innerHTML=session.originalHtml;
    if(commit && changed){
      pushUndo(page);
      syncFrameToPage(frame,page,{mutationKind:'inline-text-edit'});
      renderVisibleFramesForPage(page.id,frame);markJiraCheckStale();persist();renderHierarchy();
    }
    if(restoreSelection&&element.isConnected){
      SelectionManager.select(element,frame,'inline-text');
      if(!commit)setTimeout(()=>{
        if(element.isConnected&&!inlineTextEditSession)SelectionManager.select(element,frame,'inline-text-cancel');
      },0);
    }
  }

  function directText(el){
    return [...el.childNodes]
      .filter(n=>n.nodeType===Node.TEXT_NODE || n.nodeName==='BR')
      .map(n=>n.nodeName==='BR'?'\n':n.textContent)
      .join('')
      .trim();
  }

  function replaceDirectTextWithBreaks(el,value,doc=el?.ownerDocument){
    if(!el||!doc)return;
    const editable=[...el.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE||node.nodeName==='BR');
    const before=editable[0]||el.firstChild;
    const fragment=doc.createDocumentFragment();
    String(value??'').replace(/\r\n?/g,'\n').split('\n').forEach((part,index,array)=>{
      if(part)fragment.appendChild(doc.createTextNode(part));
      if(index<array.length-1)fragment.appendChild(doc.createElement('br'));
    });
    el.insertBefore(fragment,before);editable.forEach(node=>node.remove());
  }

  function hyperlinkAnchorForElement(el){
    if(!el)return null;
    if(el.tagName==='A')return el;
    const parent=el.parentElement;
    return parent?.tagName==='A'&&parent.children.length===1?parent:null;
  }

  function setOptionalAttribute(element,name,value){
    if(value===null||value===undefined||value==='')element.removeAttribute(name);
    else element.setAttribute(name,String(value));
  }

  function restoreDraftHyperlink(draft){
    const el=draft?.element;if(!el?.isConnected)return;
    const current=hyperlinkAnchorForElement(el);
    const original=draft.originalLinkAnchor;
    if(current&&current!==el&&current!==original&&current.children.length===1)current.replaceWith(el);
    if(original?.isConnected){
      setOptionalAttribute(original,'href',draft.originalLinkHref);
      setOptionalAttribute(original,'target',draft.originalLinkTarget);
      setOptionalAttribute(original,'rel',draft.originalLinkRel);
    }
  }

  function applyDraftHyperlink(draft,rawHref,rawTarget){
    const el=draft?.element;if(!el?.isConnected)return false;
    const href=String(rawHref||'').trim();
    let anchor=hyperlinkAnchorForElement(el);
    if(!href){
      if(anchor&&anchor!==el&&anchor.children.length===1)anchor.replaceWith(el);
      else if(anchor){anchor.removeAttribute('href');anchor.removeAttribute('target');anchor.removeAttribute('rel');}
      return true;
    }
    if(!anchor){
      anchor=el.ownerDocument.createElement('a');
      el.parentNode?.insertBefore(anchor,el);anchor.appendChild(el);
    }
    const target=rawTarget==='_blank'?'_blank':'_self';
    anchor.setAttribute('href',href);anchor.setAttribute('target',target);
    if(target==='_blank')anchor.setAttribute('rel','noopener noreferrer');
    else anchor.removeAttribute('rel');
    return true;
  }

  function getInspectorValues(el,frame){
    const cs=frame.contentWindow.getComputedStyle(el);
    const link=hyperlinkAnchorForElement(el);
    const values={
      objectName:objectDisplayName(el),
      text:directText(el),
      linkHref:link?.getAttribute('href')||'',
      linkTarget:link?.getAttribute('target')||'_self',
      fontFamily:cs.fontFamily.split(',')[0].replace(/["']/g,'').trim(),
      fontSize:String(parseFloat(cs.fontSize)||0),
      fontWeight:String(cs.fontWeight||'400'),
      fontStyle:String(cs.fontStyle||'normal'),
      marginTop:String(parseFloat(cs.marginTop)||0),
      marginRight:String(parseFloat(cs.marginRight)||0),
      marginBottom:String(parseFloat(cs.marginBottom)||0),
      marginLeft:String(parseFloat(cs.marginLeft)||0)
    };
    TEXT_CSS_FIELDS.forEach(field=>{values[field.key]=String(cs[field.property]??el.style[field.property]??'');});
    return values;
  }

  function createInspectorDraft(el,frame){
    const savedValues=getInspectorValues(el,frame);
    const link=hyperlinkAnchorForElement(el);
    return {
      selectedElementId:ensureInspectorElementId(el),
      pageId:frameToPageId(frame),
      element:el,
      frame,
      savedValues:clone(savedValues),
      baselineValues:clone(savedValues),
      values:clone(savedValues),
      dirty:false,
      dirtyFields:[],
      validationErrors:{},
      originalStyleAttr:el.getAttribute('style'),
      originalDirectText:directText(el),
      originalObjectNameAttr:el.getAttribute('data-hbe-name'),
      originalLinkAnchor:link,
      originalLinkHref:link?.getAttribute('href')??null,
      originalLinkTarget:link?.getAttribute('target')??null,
      originalLinkRel:link?.getAttribute('rel')??null,
      transactionStarted:false
    };
  }

  function propertyRow(key,label,value,{unit='',type='text',options=null}={}){
    const optionValues=options&&value&&!options.includes(String(value))?[String(value),...options]:options;
    const control=optionValues
      ? `<select data-draft-key="${key}">${optionValues.map(v=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(v[0].toUpperCase()+v.slice(1))}</option>`).join('')}</select>`
      : type==='textarea'
        ? `<textarea data-draft-key="${key}">${esc(value)}</textarea>`
        : `<input data-draft-key="${key}" type="text" ${type==='number'?'inputmode="decimal"':''} value="${esc(value)}">`;

    return `
      <div class="property-row" data-property-row="${key}">
        <div class="property-name">${label}</div>
        <div class="property-value ${unit?'property-unit':''}" ${unit?`data-unit="${unit}"`:''}>
          ${control}
          <div class="property-error" data-property-error="${key}"></div>
        </div>
      </div>`;
  }

  function inspectorSubgroup(path,title,content,open=true){
    return `<details class="property-subgroup" data-inspector-group="${esc(path)}" ${inspectorGroupIsOpen(path,open)?'open':''}><summary class="property-subgroup-title"><span class="fold-chevron"></span><span>${esc(title)}</span><span class="group-error-count" hidden></span></summary><div class="property-subgroup-content">${content}</div></details>`;
  }


  // ----- Structured selection helpers -----
  function selectedTableCell(){
    if(!selectedElement) return null;
    if(['TD','TH'].includes(selectedElement.tagName)) return selectedElement;
    return selectedElement.closest?.('td,th')||null;
  }

  function selectedTable(){
    if(!selectedElement) return null;
    if(selectedElement.tagName==='TABLE') return selectedElement;
    return selectedElement.closest?.('table[data-hbe-object="table"],table')||null;
  }

  function clearSelectedCellMarker(frame){
    const frames=[refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame];
    frames.forEach(item=>{try{item?.contentDocument?.querySelectorAll('.table-cell-selected').forEach(el=>el.classList.remove('table-cell-selected'))}catch{}});
    selectedTableCells.clear();
  }

  function markSelectedCell(cell,frame){
    clearSelectedCellMarker(frame);
    if(cell){cell.classList.add('table-cell-selected');selectedTableCells.add(cell);}
  }

  function markSelectedTableCells(cells,frame){
    clearSelectedCellMarker(frame);
    cells.filter(cell=>cell?.isConnected).forEach(cell=>{
      cell.classList.add('table-cell-selected');selectedTableCells.add(cell);
    });
    updateStructuredToolbar();
  }

  function tableRangeCells(startCell,endCell){
    const table=startCell?.closest('table');
    if(!table||endCell?.closest('table')!==table)return[];
    const rows=[...table.rows],startRow=rows.indexOf(startCell.parentElement),endRow=rows.indexOf(endCell.parentElement);
    const startCol=tableCellLogicalStart(startCell),endCol=tableCellLogicalStart(endCell);
    const rowDistance=Math.abs(endRow-startRow),columnDistance=Math.abs(endCol-startCol);
    if(rowDistance>columnDistance){
      const from=Math.min(startRow,endRow),to=Math.max(startRow,endRow);
      return rows.slice(from,to+1).flatMap(row=>[...row.cells]);
    }
    const from=Math.min(startCol,endCol),to=Math.max(startCol+(startCell.colSpan||1)-1,endCol+(endCell.colSpan||1)-1);
    return rows.flatMap(row=>[...row.cells].filter(cell=>{
      const start=tableCellLogicalStart(cell),end=start+Math.max(1,cell.colSpan||1)-1;
      return end>=from&&start<=to;
    }));
  }

  function beginTableRangeDrag(cell,frame,event){
    if(!cell||event.button!==0)return;
    const doc=cell.ownerDocument,table=cell.closest('table');if(!table)return;
    const startX=event.clientX,startY=event.clientY;
    let moved=false,lastCell=cell;
    const move=moveEvent=>{
      if(Math.hypot(moveEvent.clientX-startX,moveEvent.clientY-startY)<5&&!moved)return;
      const next=doc.elementFromPoint(moveEvent.clientX,moveEvent.clientY)?.closest?.('td,th');
      if(!next||next.closest('table')!==table)return;
      moveEvent.preventDefault();moved=true;
      if(next===lastCell)return;lastCell=next;
      markSelectedTableCells(tableRangeCells(cell,next),frame);
      frameSelectionRenderers.get(frame)?.();
    };
    const finish=()=>{
      doc.defaultView.removeEventListener('pointermove',move,true);
      doc.defaultView.removeEventListener('pointerup',finish,true);
      doc.defaultView.removeEventListener('pointercancel',finish,true);
      if(!moved)markSelectedCell(cell,frame);
    };
    doc.defaultView.addEventListener('pointermove',move,true);
    doc.defaultView.addEventListener('pointerup',finish,true);
    doc.defaultView.addEventListener('pointercancel',finish,true);
  }

  function setElementStyleProperty(el,property,value){
    if(!el) return;
    el.style[property]=value;
    const page=pageById(frameToPageId(selectedElementFrame));
    if(page) commitDomMutation(selectedElementFrame,page,el,'inspector-style');
  }

  function appendInspectorGroup(container,title,rows){
    const group=document.createElement('details');
    group.className='property-group';
    group.dataset.inspectorGroup=title;
    group.open=inspectorGroupIsOpen(title);
    group.innerHTML=`<summary class="property-group-title"><span class="fold-chevron"></span><span>${esc(title)}</span><span class="group-error-count" hidden></span></summary><div class="property-group-content">${rows.join('')}</div>`;
    container.appendChild(group);
    return group;
  }

  function inspectorGroupIsOpen(title,defaultOpen=null){
    const saved=state.preferences?.inspectorFolds?.[title];
    return typeof saved==='boolean'?saved:(typeof defaultOpen==='boolean'?defaultOpen:!['Alignment','Table','Advanced'].includes(title));
  }

  function bindInspectorFolds(){
    refs.inspectorBody.querySelectorAll('details[data-inspector-group]').forEach(group=>{
      group.addEventListener('toggle',()=>{
        state.preferences.inspectorFolds=state.preferences.inspectorFolds||{};
        state.preferences.inspectorFolds[group.dataset.inspectorGroup]=group.open;
        persist();
      });
    });
  }

  function renderAlignmentInspector(container,el){
    if(!el) return;

    const rows=[
      `<div class="inspector-property-row">
        <label>Horizontal</label>
        <select data-align-horizontal>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </div>`,
      `<div class="inspector-property-row">
        <label>Vertical</label>
        <select data-align-vertical>
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>`
    ];

    const group=appendInspectorGroup(container,'Alignment',rows);
    const h=group.querySelector('[data-align-horizontal]');
    const v=group.querySelector('[data-align-vertical]');
    h.value=el.style.textAlign || getComputedStyle(el).textAlign || 'left';
    const computedVertical=el.style.verticalAlign || getComputedStyle(el).verticalAlign || 'middle';
    v.value=['top','middle','bottom'].includes(computedVertical)?computedVertical:'middle';

    h.addEventListener('change',()=>setElementStyleProperty(el,'textAlign',h.value));
    v.addEventListener('change',()=>setElementStyleProperty(el,'verticalAlign',v.value));
  }

  function renderTableInspectorExtras(container,table,cell){
    if(!table) return;

    const rows=[
      `<div class="inspector-property-row"><label>Table Align</label>
        <select data-table-align>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select></div>`,
      `<div class="inspector-property-row"><label>Rows</label><input data-table-rows readonly></div>`,
      `<div class="inspector-property-row"><label>Columns</label><input data-table-cols readonly></div>`
    ];
    const group=appendInspectorGroup(container,'Table',rows);
    const align=group.querySelector('[data-table-align]');
    const rowsInput=group.querySelector('[data-table-rows]');
    const colsInput=group.querySelector('[data-table-cols]');

    const bodyRows=[...table.rows];
    rowsInput.value=bodyRows.length;
    colsInput.value=Math.max(0,...bodyRows.map(r=>r.cells.length));
    const marginLeft=getComputedStyle(table).marginLeft;
    const marginRight=getComputedStyle(table).marginRight;
    align.value=(marginLeft==='auto'&&marginRight==='auto')?'center':marginLeft==='auto'?'right':'left';

    align.addEventListener('change',()=>{
      if(align.value==='center'){table.style.marginLeft='auto';table.style.marginRight='auto';}
      else if(align.value==='right'){table.style.marginLeft='auto';table.style.marginRight='0';}
      else {table.style.marginLeft='0';table.style.marginRight='auto';}
      const page=pageById(frameToPageId(selectedElementFrame));
      if(page) commitDomMutation(selectedElementFrame,page,table,'table-align');
    });

    if(cell){
      appendInspectorGroup(container,'Cell',[
        `<div class="inspector-property-row"><label>Row Span</label><input data-cell-rowspan type="number" min="1" value="${Math.max(1,cell.rowSpan||1)}"></div>`,
        `<div class="inspector-property-row"><label>Column Span</label><input data-cell-colspan type="number" min="1" value="${Math.max(1,cell.colSpan||1)}"></div>`,
        `<div class="inspector-property-row"><label>Padding</label><input data-cell-padding value="${esc(cell.style.padding||'8px')}"></div>`
      ]);
      const rs=container.querySelector('[data-cell-rowspan]');
      const cs=container.querySelector('[data-cell-colspan]');
      const pad=container.querySelector('[data-cell-padding]');
      rs?.addEventListener('change',()=>{cell.rowSpan=Math.max(1,Number(rs.value)||1);const p=pageById(frameToPageId(selectedElementFrame));if(p)commitDomMutation(selectedElementFrame,p,cell,'cell-rowspan')});
      cs?.addEventListener('change',()=>{cell.colSpan=Math.max(1,Number(cs.value)||1);const p=pageById(frameToPageId(selectedElementFrame));if(p)commitDomMutation(selectedElementFrame,p,cell,'cell-colspan')});
      pad?.addEventListener('change',()=>setElementStyleProperty(cell,'padding',pad.value||'0'));
    }
  }

  function updateStructuredToolbar(){
    const table=selectedTable();
    refs.tableToolbar.hidden=!table;
    const title=refs.tableToolbar.querySelector('.structured-toolbar-title');
    if(title)title.textContent=table&&selectedTableCells.size>1?`Table · ${selectedTableCells.size} cells`:'Table';
  }

  function selectedTableRowIndexes(table){
    const rows=[...table.rows];
    return [...new Set([...selectedTableCells].filter(cell=>cell.closest('table')===table).map(cell=>rows.indexOf(cell.parentElement)).filter(index=>index>=0))].sort((a,b)=>a-b);
  }

  function selectedTableColumnIndexes(table){
    const result=new Set();
    [...selectedTableCells].filter(cell=>cell.closest('table')===table).forEach(cell=>{
      const start=tableCellLogicalStart(cell);for(let index=0;index<Math.max(1,cell.colSpan||1);index++)result.add(start+index);
    });
    return [...result].sort((a,b)=>a-b);
  }

  function tableLogicalColumnCount(table){
    return Math.max(0,...[...table.rows].map(row=>[...row.cells].reduce((total,item)=>total+Math.max(1,item.colSpan||1),0)));
  }

  function tableCellLogicalStart(cell){
    if(!cell)return 0;
    return [...cell.parentElement.cells].slice(0,cell.cellIndex)
      .reduce((total,item)=>total+Math.max(1,item.colSpan||1),0);
  }

  function tableCellAtLogicalColumn(row,column){
    let start=0;
    for(const cell of row.cells){
      const span=Math.max(1,cell.colSpan||1);
      if(column>=start&&column<start+span)return{cell,start,end:start+span};
      start+=span;
    }
    return null;
  }

  function createTableCell(row,text='Cell'){
    const doc=row.ownerDocument;
    const header=row.parentElement?.tagName==='THEAD'||(row.cells.length>0&&[...row.cells].every(cell=>cell.tagName==='TH'));
    const cell=doc.createElement(header?'th':'td');
    cell.textContent=header?(text==='Cell'?'Header':text):text;
    cell.style.cssText='border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle';
    return cell;
  }

  function mutateSelectedTable(mutator,source){
    const table=selectedTable();
    const frame=selectedElementFrame;
    if(!table||!frame) return;
    const page=pageById(frameToPageId(frame));
    if(!page) return;
    const cell=selectedTableCell();
    const result=mutator(table,cell);
    if(result===false)return;
    const nextSelection=result?.selection?.isConnected
      ?result.selection
      :(cell?.isConnected?cell:(table.querySelector('th,td')||table));
    commitDomMutation(frame,page,nextSelection,source);
    updateStructuredToolbar();
  }

  function addTableRow(){
    mutateSelectedTable((table,cell)=>{
      const columnCount=Math.max(1,tableLogicalColumnCount(table));
      const selectedRows=selectedTableRowIndexes(table);
      const reference=table.rows[selectedRows.at(-1)]||cell?.parentElement||table.rows[table.rows.length-1]||null;
      const section=reference?.parentElement||table.tBodies[0]||table.createTBody();
      const row=table.ownerDocument.createElement('tr');
      if(reference?.nextSibling)section.insertBefore(row,reference.nextSibling);
      else section.appendChild(row);
      for(let i=0;i<columnCount;i++){
        row.appendChild(createTableCell(row));
      }
      return{selection:row.cells[0]};
    },'table-add-row');
  }

  function deleteTableRow(){
    mutateSelectedTable((table,cell)=>{
      const rows=[...table.rows];
      const selectedRows=selectedTableRowIndexes(table);
      const indexes=(selectedRows.length?selectedRows:[rows.indexOf(cell?.parentElement)]).filter(index=>index>=0).slice(0,Math.max(0,rows.length-1));
      if(!indexes.length||table.rows.length<=1)return false;
      const first=indexes[0];indexes.slice().sort((a,b)=>b-a).forEach(index=>rows[index]?.remove());
      const fallback=table.rows[Math.min(first,table.rows.length-1)]?.cells[0]||table;
      return{selection:fallback};
    },'table-delete-row');
  }

  function addTableColumn(){
    mutateSelectedTable((table,selectedCell)=>{
      const selectedColumns=selectedTableColumnIndexes(table);
      const insertAt=selectedColumns.length
        ?selectedColumns.at(-1)+1
        :selectedCell
        ?tableCellLogicalStart(selectedCell)+Math.max(1,selectedCell.colSpan||1)
        :tableLogicalColumnCount(table);
      let nextSelection=null;
      [...table.rows].forEach(row=>{
        const covering=tableCellAtLogicalColumn(row,Math.max(0,insertAt-1));
        if(covering&&insertAt>covering.start&&insertAt<covering.end){
          covering.cell.colSpan=Math.max(1,covering.cell.colSpan||1)+1;
          if(row===selectedCell?.parentElement)nextSelection=covering.cell;
          return;
        }
        const before=[...row.cells].find(cell=>tableCellLogicalStart(cell)>=insertAt)||null;
        const added=createTableCell(row);
        row.insertBefore(added,before);
        if(row===selectedCell?.parentElement||!nextSelection)nextSelection=added;
      });
      return{selection:nextSelection};
    },'table-add-column');
  }

  function deleteTableColumn(){
    mutateSelectedTable((table,cell)=>{
      const total=tableLogicalColumnCount(table);
      if(total<=1)return false;
      const selectedColumns=selectedTableColumnIndexes(table);
      const indexes=(selectedColumns.length?selectedColumns:[cell?tableCellLogicalStart(cell):total-1]).slice(0,total-1).sort((a,b)=>b-a);
      let nextSelection=null;
      indexes.forEach(index=>[...table.rows].forEach(row=>{
          const hit=tableCellAtLogicalColumn(row,index);
          if(!hit)return;
          if((hit.cell.colSpan||1)>1)hit.cell.colSpan-=1;
          else hit.cell.remove();
          if(row===cell?.parentElement)nextSelection=tableCellAtLogicalColumn(row,Math.min(index,Math.max(0,tableLogicalColumnCount(table)-1)))?.cell||row.cells[row.cells.length-1]||null;
        })
      );
      return{selection:nextSelection||table.querySelector('th,td')||table};
    },'table-delete-column');
  }

  function toggleTableHeaderRow(){
    mutateSelectedTable((table)=>{
      const hasHead=!!table.tHead;
      if(hasHead){
        const headRows=[...table.tHead.rows];
        let body=table.tBodies[0]||table.createTBody();
        headRows.reverse().forEach(row=>{
          const tr=document.createElement('tr');
          [...row.cells].forEach(th=>{
            const td=document.createElement('td');
            td.innerHTML=th.innerHTML;
            td.style.cssText=th.style.cssText;
            tr.appendChild(td);
          });
          body.insertBefore(tr,body.firstChild);
        });
        table.tHead.remove();
        table.setAttribute('data-hbe-table-header-row','false');
      }else{
        const sourceRow=table.tBodies[0]?.rows[0]||table.rows[0];
        if(!sourceRow) return;
        const thead=table.createTHead();
        const tr=thead.insertRow();
        [...sourceRow.cells].forEach(td=>{
          const th=document.createElement('th');
          th.innerHTML=td.innerHTML;
          th.style.cssText=td.style.cssText;
          tr.appendChild(th);
        });
        sourceRow.remove();
        table.setAttribute('data-hbe-table-header-row','true');
      }
    },'table-toggle-header');
  }

  function mergeCellRight(){
    mutateSelectedTable((table,cell)=>{
      if(!cell) return false;
      const next=cell.nextElementSibling;
      if(!next || !['TD','TH'].includes(next.tagName)) return false;
      cell.innerHTML=`${cell.innerHTML}<br>${next.innerHTML}`;
      cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);
      next.remove();
      return{selection:cell};
    },'table-merge-right');
  }

  function unmergeCell(){
    mutateSelectedTable((table,cell)=>{
      if(!cell || cell.colSpan<=1) return false;
      const count=cell.colSpan-1;
      cell.colSpan=1;
      for(let i=0;i<count;i++){
        const newCell=table.ownerDocument.createElement(cell.tagName.toLowerCase());
        newCell.textContent='Cell';
        newCell.style.cssText=cell.style.cssText;
        cell.parentElement.insertBefore(newCell,cell.nextSibling);
      }
      return{selection:cell};
    },'table-unmerge');
  }

  function showInspector(el,frame){
    inspectorDraft=createInspectorDraft(el,frame);
    const objectName=objectDisplayName(el);

    refs.inspectorBody.innerHTML=`
      <div class="selection-card" id="selectionCard">
        <div class="tagline">
          <span class="tag-badge">&lt;${el.tagName.toLowerCase()}&gt;</span>
          <span class="node-name">${esc(objectName)}</span>
          <span class="draft-label">● Modified</span>
        </div>
        <div class="mini">${Math.round(el.getBoundingClientRect().width)} × ${Math.round(el.getBoundingClientRect().height)} px</div>
      </div>

      <details class="property-group" data-inspector-group="General" ${inspectorGroupIsOpen('General')?'open':''}>
        <summary class="property-group-title"><span class="fold-chevron"></span><span>General</span><span class="group-error-count" hidden></span></summary>
        <div class="property-group-content nested-groups">
          ${inspectorSubgroup('General/Identity','Identity',propertyRow('objectName','Object Name',inspectorDraft.values.objectName))}
          ${inspectorSubgroup('General/Content','Content',propertyRow('text','Text',inspectorDraft.values.text,{type:'textarea'}))}
          ${inspectorSubgroup('General/Hyperlink','Hyperlink',`
            ${propertyRow('linkHref','Link URL',inspectorDraft.values.linkHref)}
            ${propertyRow('linkTarget','Open In',inspectorDraft.values.linkTarget,{options:['_self','_blank']})}`,false)}
        </div>
      </details>

      <details class="property-group" data-inspector-group="Appearance" ${inspectorGroupIsOpen('Appearance')?'open':''}>
        <summary class="property-group-title"><span class="fold-chevron"></span><span>Appearance</span><span class="group-error-count" hidden></span></summary>
        <div class="property-group-content nested-groups">
          ${inspectorSubgroup('Appearance/Typography','Typography',`
            ${propertyRow('fontFamily','Font Family',inspectorDraft.values.fontFamily)}
            ${propertyRow('fontSize','Font Size',inspectorDraft.values.fontSize,{unit:'px',type:'number'})}
            ${propertyRow('fontWeight','Font Weight',inspectorDraft.values.fontWeight)}
            ${propertyRow('fontStyle','Font Style',inspectorDraft.values.fontStyle,{options:['normal','italic','oblique']})}`)}
          ${inspectorSubgroup('Appearance/Text CSS','Text CSS',TEXT_CSS_FIELDS.map(field=>propertyRow(field.key,field.label,inspectorDraft.values[field.key],{options:field.options||null})).join(''),false)}
        </div>
      </details>

      <details class="property-group" data-inspector-group="Layout" ${inspectorGroupIsOpen('Layout')?'open':''}>
        <summary class="property-group-title"><span class="fold-chevron"></span><span>Layout</span><span class="group-error-count" hidden></span></summary>
        <div class="property-group-content nested-groups">
          ${inspectorSubgroup('Layout/Spacing','Spacing',`
            ${propertyRow('marginTop','Margin Top',inspectorDraft.values.marginTop,{unit:'px',type:'number'})}
            ${propertyRow('marginRight','Margin Right',inspectorDraft.values.marginRight,{unit:'px',type:'number'})}
            ${propertyRow('marginBottom','Margin Bottom',inspectorDraft.values.marginBottom,{unit:'px',type:'number'})}
            ${propertyRow('marginLeft','Margin Left',inspectorDraft.values.marginLeft,{unit:'px',type:'number'})}`)}
        </div>
      </details>
    `;

    refs.inspectorActions.hidden=false;
    bindInspectorDraftInputs();
    validateInspectorDraft();
    updateInspectorDraftUI();
    updateStructuredToolbar();
    const table=selectedTable();
    const cell=selectedTableCell();
    if(cell) markSelectedCell(cell,frame);
    if(cell) renderAlignmentInspector(refs.inspectorBody,cell);
    else if(['P','H1','H2','H3','H4','H5','H6','BUTTON'].includes(el.tagName)) renderAlignmentInspector(refs.inspectorBody,el);
    if(table) renderTableInspectorExtras(refs.inspectorBody,table,cell);
    bindInspectorFolds();
    if(refs.inspectorPropertySearch)refs.inspectorPropertySearch.disabled=false;
    filterInspectorProperties();

  }

  function filterInspectorProperties(){
    const query=String(refs.inspectorPropertySearch?.value||'').trim().toLocaleLowerCase();
    const rows=[...refs.inspectorBody.querySelectorAll('.property-row,.inspector-property-row')];
    let visible=0;
    rows.forEach(row=>{
      const name=(row.querySelector('.property-name,label')?.textContent||'').trim().toLocaleLowerCase();
      const match=!query||name.includes(query);
      row.hidden=!match;if(match)visible++;
    });
    [...refs.inspectorBody.querySelectorAll('details[data-inspector-group]')].reverse().forEach(group=>{
      if(!query){group.hidden=false;return;}
      const hasVisible=[...group.querySelectorAll('.property-row,.inspector-property-row')].some(row=>!row.hidden);
      group.hidden=!hasVisible;if(hasVisible)group.open=true;
    });
    if(refs.inspectorPropertySearchStatus)refs.inspectorPropertySearchStatus.textContent=query?`${visible}/${rows.length}`:'';
  }

  refs.inspectorPropertySearch?.addEventListener('input',filterInspectorProperties);

  function bindInspectorDraftInputs(){
    refs.inspectorBody.querySelectorAll('[data-draft-key]').forEach(control=>{
      const update=()=>{
        if(!inspectorDraft) return;
        inspectorDraft.values[control.dataset.draftKey]=control.value;
        updateDirtyFields();
        validateInspectorDraft();

        // Inspector values are live transactions. Valid values are reflected
        // in the document and source immediately; invalid input remains local.
        if(inspectorPreviewEnabled && !hasInspectorValidationErrors()){
          applyDraftPreview();
          commitInspectorDraft({immediate:true});
        }else restoreDraftOriginalLive();

        updateInspectorDraftUI();
      };

      control.addEventListener('input',update);
      control.addEventListener('change',update);
    });
  }

  function handleInspectorNumberWheel(event){
    const control=event.target?.closest?.('input');
    if(!control||control.disabled||control.readOnly)return;
    if(control.type!=='number'&&control.inputMode!=='decimal')return;
    const current=Number.parseFloat(control.value);
    if(!Number.isFinite(current))return;
    event.preventDefault();event.stopPropagation();
    const declared=Number.parseFloat(control.step);
    const baseStep=Number.isFinite(declared)&&declared>0?declared:1;
    const step=event.altKey?baseStep/10:event.shiftKey?baseStep*10:baseStep;
    const min=Number.parseFloat(control.min),max=Number.parseFloat(control.max);
    let next=current+(event.deltaY<0?step:-step);
    if(Number.isFinite(min))next=Math.max(min,next);
    if(Number.isFinite(max))next=Math.min(max,next);
    const precision=step<1?Math.min(4,String(step).split('.')[1]?.length||1):0;
    control.value=String(Number(next.toFixed(precision)));
    control.dispatchEvent(new Event(control.dataset.draftKey?'input':'change',{bubbles:true}));
  }

  refs.inspectorBody.addEventListener('wheel',handleInspectorNumberWheel,{passive:false});

  function updateDirtyFields(){
    if(!inspectorDraft) return;
    inspectorDraft.dirtyFields=INSPECTOR_KEYS.filter(
      key=>String(inspectorDraft.values?.[key]??'')!==String(inspectorDraft.baselineValues?.[key]??'')
    );
    inspectorDraft.dirty=inspectorDraft.dirtyFields.length>0;
  }

  function validateNumber(raw,{min=-Infinity,max=Infinity,label='Value'}={}){
    const value=String(raw??'').trim();
    if(value==='') return `${label} is required.`;
    const number=Number(value);
    if(!Number.isFinite(number)) return `${label} must be a number.`;
    if(number<min || number>max) return `${label} must be between ${min} and ${max}.`;
    return null;
  }

  function validateInspectorDraft(){
    if(!inspectorDraft) return {};
    const v=inspectorDraft.values;
    const errors={};

    if(!String(v.objectName??'').trim()) errors.objectName='Object Name is required.';

    const href=String(v.linkHref??'').trim();
    if(href){
      if(/[\u0000-\u001f\u007f]/.test(href))errors.linkHref='Link contains unsupported control characters.';
      else{
        try{
          const url=new URL(href,'https://leaf.invalid/');
          if(!['http:','https:','mailto:','tel:'].includes(url.protocol))errors.linkHref='Use a relative, #anchor, HTTP(S), mailto, or tel link.';
        }catch{errors.linkHref='Enter a valid link.';}
      }
    }
    if(!['_self','_blank'].includes(String(v.linkTarget||'_self')))errors.linkTarget='Choose Same View or New Window.';

    if(!String(v.fontFamily??'').trim()) errors.fontFamily='Font Family is required.';

    const fontSizeError=validateNumber(v.fontSize,{min:0,max:512,label:'Font Size'});
    if(fontSizeError) errors.fontSize=fontSizeError;

    const weight=String(v.fontWeight??'').trim().toLowerCase();
    const weightKeywords=['normal','bold','bolder','lighter'];
    const numericWeight=/^\d+$/.test(weight)?Number(weight):NaN;
    if(!(weightKeywords.includes(weight) || (Number.isInteger(numericWeight)&&numericWeight>=1&&numericWeight<=1000))){
      errors.fontWeight='Use 1–1000 or normal/bold/bolder/lighter.';
    }

    if(!['normal','italic','oblique'].includes(String(v.fontStyle??''))){
      errors.fontStyle='Choose Normal, Italic, or Oblique.';
    }

    for(const [key,label] of [
      ['marginTop','Margin Top'],['marginRight','Margin Right'],
      ['marginBottom','Margin Bottom'],['marginLeft','Margin Left']
    ]){
      const error=validateNumber(v[key],{min:-10000,max:10000,label});
      if(error) errors[key]=error;
    }

    inspectorDraft.validationErrors=errors;
    return errors;
  }

  function hasInspectorValidationErrors(){
    return !!inspectorDraft && Object.keys(inspectorDraft.validationErrors||{}).length>0;
  }

  function renderValidationErrors(){
    if(!inspectorDraft) return;

    refs.inspectorBody.querySelectorAll('[data-property-row]').forEach(row=>{
      const key=row.dataset.propertyRow;
      const message=inspectorDraft.validationErrors?.[key]||'';
      row.classList.toggle('invalid',!!message);
      const control=row.querySelector('[data-draft-key]');
      control?.setAttribute('aria-invalid',message?'true':'false');
      const error=row.querySelector('[data-property-error]');
      if(error) error.textContent=message;
    });
    refs.inspectorBody.querySelectorAll('details[data-inspector-group]').forEach(group=>{
      const count=group.querySelectorAll('[aria-invalid="true"]').length;
      const badge=group.querySelector('.group-error-count');
      if(badge){badge.hidden=!count;badge.textContent=count?String(count):'';}
      group.classList.toggle('has-errors',count>0);
    });
  }

  function restoreElementOriginal(draft){
    const el=draft?.element;
    if(!el?.isConnected) return;

    if(draft.originalStyleAttr===null) el.removeAttribute('style');
    else el.setAttribute('style',draft.originalStyleAttr);
    if(draft.originalObjectNameAttr===null) el.removeAttribute('data-hbe-name');
    else el.setAttribute('data-hbe-name',draft.originalObjectNameAttr);

    restoreDraftHyperlink(draft);

    replaceDirectTextWithBreaks(el,draft.originalDirectText,draft.frame.contentDocument);
  }

  function applyValuesOverOriginal(draft){
    if(!draft?.element?.isConnected || hasInspectorValidationErrors()) return false;
    restoreElementOriginal(draft);

    const el=draft.element;
    const v=draft.values;
    const s=draft.savedValues;

    if(String(v.objectName)!==String(s.objectName)) el.setAttribute('data-hbe-name',String(v.objectName).trim());

    if(String(v.text)!==String(s.text)){
      replaceDirectTextWithBreaks(el,v.text,draft.frame.contentDocument);
    }

    if(String(v.linkHref)!==String(s.linkHref)||String(v.linkTarget)!==String(s.linkTarget)){
      applyDraftHyperlink(draft,v.linkHref,v.linkTarget);
    }

    if(String(v.fontFamily)!==String(s.fontFamily)) el.style.fontFamily=v.fontFamily.trim();
    if(String(v.fontSize)!==String(s.fontSize)) el.style.fontSize=`${Number(v.fontSize)}px`;
    if(String(v.fontWeight)!==String(s.fontWeight)) el.style.fontWeight=v.fontWeight.trim();
    if(String(v.fontStyle)!==String(s.fontStyle)) el.style.fontStyle=v.fontStyle;
    TEXT_CSS_FIELDS.forEach(field=>{
      if(String(v[field.key])!==String(s[field.key]))el.style[field.property]=String(v[field.key]??'').trim();
    });
    if(String(v.marginTop)!==String(s.marginTop)) el.style.marginTop=`${Number(v.marginTop)}px`;
    if(String(v.marginRight)!==String(s.marginRight)) el.style.marginRight=`${Number(v.marginRight)}px`;
    if(String(v.marginBottom)!==String(s.marginBottom)) el.style.marginBottom=`${Number(v.marginBottom)}px`;
    if(String(v.marginLeft)!==String(s.marginLeft)) el.style.marginLeft=`${Number(v.marginLeft)}px`;
    return true;
  }

  function applyDraftPreview(){
    if(!htmlEditEnabled || !inspectorDraft) return;
    validateInspectorDraft();
    if(hasInspectorValidationErrors()){
      restoreDraftOriginalLive();
      return;
    }
    applyValuesOverOriginal(inspectorDraft);
  }

  function restoreDraftOriginalLive(){
    if(inspectorDraft) restoreElementOriginal(inspectorDraft);
  }

  function updateInspectorDraftUI(){
    const card=$('#selectionCard');
    card?.classList.toggle('draft-dirty',!!inspectorDraft?.dirty);
    renderValidationErrors();
    updateInspectorEditControls();
  }

  function resetInspectorDraft(){
    if(!inspectorDraft) return;
    restoreDraftOriginalLive();
    inspectorDraft.values=clone(inspectorDraft.baselineValues);
    updateDirtyFields();
    inspectorDraft.validationErrors={};

    refs.inspectorBody.querySelectorAll('[data-draft-key]').forEach(control=>{
      control.value=inspectorDraft.values[control.dataset.draftKey] ?? '';
    });

    applyDraftPreview();
    commitInspectorDraft({immediate:true});
    updateInspectorDraftUI();
    showToast('Object reset to its selection baseline');
  }

  function focusFirstInvalidInspectorField(){
    const firstKey=Object.keys(inspectorDraft?.validationErrors||{})[0];
    if(!firstKey) return;
    const control=refs.inspectorBody.querySelector(`[data-draft-key="${firstKey}"]`);
    const group=control?.closest('details');
    if(group) group.open=true;
    control?.focus();
  }

  function pendingInspectorFields(){
    if(!inspectorDraft) return [];
    return INSPECTOR_KEYS.filter(key=>String(inspectorDraft.values?.[key]??'')!==String(inspectorDraft.savedValues?.[key]??''));
  }

  function commitInspectorDraft({immediate=false}={}){
    if(!inspectorDraft || !pendingInspectorFields().length) return true;

    validateInspectorDraft();
    updateInspectorDraftUI();
    if(hasInspectorValidationErrors()){
      focusFirstInvalidInspectorField();
      showToast('Fix invalid Inspector values');
      return false;
    }

    const page=pageById(inspectorDraft.pageId);
    if(!page || !inspectorDraft.frame || !inspectorDraft.element?.isConnected) return false;

    // One Inspector selection session = one Undo transaction, while every
    // valid field value is synchronized to the source immediately.
    const beforeSource=page.source||'';
    if(!inspectorDraft.transactionStarted){pushUndo(page);inspectorDraft.transactionStarted=true;}
    if(!applyValuesOverOriginal(inspectorDraft)) return false;

    const minimalPatch=window.SourceFidelity.tryInspectorMinimalPatch({
      source:beforeSource,
      savedValues:inspectorDraft.savedValues,
      nextValues:inspectorDraft.values,
      keys:INSPECTOR_KEYS
    });

    if(minimalPatch.ok){
      const leakage=window.SourceFidelity.editorArtifactReport(minimalPatch.source);
      if(leakage.length) return false;
      page.source=minimalPatch.source;
      page.isEmpty=false;
      reportUnexpectedSourceMutation(page,{kind:`minimal-${minimalPatch.kind}`,before:beforeSource,after:page.source,expected:minimalPatch.changedRange||null});
    }else{
      if(!syncFrameToPage(inspectorDraft.frame,page,{mutationKind:`fallback:${minimalPatch.reason}`})) return false;
    }

    inspectorDraft.savedValues=clone(inspectorDraft.values);
    inspectorDraft.originalStyleAttr=inspectorDraft.element.getAttribute('style');
    inspectorDraft.originalDirectText=directText(inspectorDraft.element);
    inspectorDraft.originalObjectNameAttr=inspectorDraft.element.getAttribute('data-hbe-name');
    const link=hyperlinkAnchorForElement(inspectorDraft.element);
    inspectorDraft.originalLinkAnchor=link;
    inspectorDraft.originalLinkHref=link?.getAttribute('href')??null;
    inspectorDraft.originalLinkTarget=link?.getAttribute('target')??null;
    inspectorDraft.originalLinkRel=link?.getAttribute('rel')??null;
    updateDirtyFields();
    inspectorDraft.validationErrors={};

    persist();
    renderVisibleFramesForPage(page.id,inspectorDraft.frame);
    if(state.mode==='code' && state.views.codePage===page.id) loadCodePage();
    markJiraCheckStale();
    renderHierarchy();
    const name=$('#selectionCard .node-name');if(name)name.textContent=objectDisplayName(inspectorDraft.element);
    frameSelectionRenderers.get(inspectorDraft.frame)?.();
    updateInspectorDraftUI();
    if(!immediate) showToast('HTML changes applied');
    return true;
  }

  function renderEmptyInspectorState(){
    inspectorDraft=null;
    refs.inspectorActions.hidden=true;
    refs.inspectorBody.innerHTML=htmlEditEnabled
      ?'<div class="edit-mode-message"><strong>Edit enabled</strong>Hover to inspect. Click an HTML object to start an edit session.</div>'
      :'<div class="edit-mode-message"><strong>Preview only</strong>Use Edit in a Viewport title bar to inspect and modify HTML.</div>';
    if(refs.inspectorPropertySearch){refs.inspectorPropertySearch.disabled=true;refs.inspectorPropertySearchStatus.textContent='';}
    updateInspectorEditControls();
  }

  function clearInspector(){
    hideAllEditorOverlays();
    SelectionManager.clear();
    renderEmptyInspectorState();
    updateStructuredToolbar();
    renderHierarchy();
  }

  function selectedComponentRoots(){
    const items=SelectionManager.items().filter(element=>element?.isConnected && !['HTML','BODY'].includes(element.tagName));
    return items.filter(element=>!items.some(other=>other!==element && other.contains(element)));
  }

  function copySelectedElements(){
    const roots=selectedComponentRoots();
    if(!roots.length){showToast('Select an object to copy');return false;}
    componentClipboard={items:roots.map(sanitizedUsedComponentHtml),source:'selection'};
    showToast(`${roots.length} object${roots.length>1?'s':''} copied`);
    return true;
  }

  function instantiateComponentHtml(html,doc){
    const template=doc.createElement('template');template.innerHTML=String(html||'').trim();
    const element=template.content.firstElementChild;
    if(!element) return null;
    const name=element.getAttribute('data-hbe-name');
    if(name) element.setAttribute('data-hbe-name',`${name} Copy`);
    return element;
  }

  function insertComponentBundle(bundle,{source='paste'}={}){
    const frame=selectedElementFrame||activeStaticFrame();
    const page=pageById(frameToPageId(frame));
    let doc=null;try{doc=frame?.contentDocument}catch{}
    if(!frame||!page||!doc?.body||!bundle?.items?.length){showToast('Nothing to paste');return false;}
    const anchor=selectedElement?.isConnected&&selectedElement.ownerDocument===doc?selectedElement:null;
    const parent=anchor?.parentNode||doc.body;
    let cursor=anchor;
    const inserted=[];
    bundle.items.forEach(html=>{
      const element=instantiateComponentHtml(html,doc);if(!element)return;
      if(cursor){parent.insertBefore(element,cursor.nextSibling);cursor=element;}else{parent.appendChild(element);cursor=element;}
      inserted.push(element);
    });
    if(!inserted.length)return false;
    pushUndo(page);
    syncFrameToPage(frame,page,{mutationKind:`component-${source}`});
    renderVisibleFramesForPage(page.id,frame);markJiraCheckStale();persist();
    SelectionManager.select(inserted[0],frame,source);
    inserted.slice(1).forEach(element=>SelectionManager.select(element,frame,source,{toggle:true}));
    renderHierarchy();
    if(document.querySelector('[data-left-panel="used"]')?.classList.contains('active'))renderUsedComponents();
    showToast(`${inserted.length} object${inserted.length>1?'s':''} ${source==='duplicate'?'duplicated':'pasted'}`);
    return true;
  }

  function pasteSelectedElements(){return insertComponentBundle(componentClipboard,{source:'paste'});}

  function duplicateSelectedElements(){
    const roots=selectedComponentRoots();
    if(!roots.length){showToast('Select an object to duplicate');return false;}
    return insertComponentBundle({items:roots.map(sanitizedUsedComponentHtml)},{source:'duplicate'});
  }

  function editSelectedText(){
    if(!selectedElement || !selectedElementFrame || !isTextWidget(selectedElement)){showToast('Selected object has no directly editable text');return false;}
    return beginInlineTextEdit(selectedElement,selectedElementFrame);
  }

  function revealSelectedObject(){
    const element=selectedElement?.isConnected?selectedElement:SelectionManager.items().at(-1);
    if(!element){showToast('Select an object to locate');return false;}
    element.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
    const view=element.ownerDocument?.defaultView;
    const rect=element.getBoundingClientRect();
    if(view){
      const top=Math.max(0,view.scrollY+rect.top-((view.innerHeight-rect.height)/2));
      const left=Math.max(0,view.scrollX+rect.left-((view.innerWidth-rect.width)/2));
      view.scrollTo({
        top,
        left,
        behavior:'smooth'
      });
      const scrolling=element.ownerDocument.scrollingElement||element.ownerDocument.documentElement;
      if(scrolling){scrolling.scrollTop=top;scrolling.scrollLeft=left;}
    }
    const frame=element.ownerDocument?.defaultView?.frameElement||selectedElementFrame;
    requestAnimationFrame(()=>{
      if(frame){selectedElementFrame=frame;frameSelectionRenderers.get(frame)?.();}
      syncSelectionOverlays();
    });
    showToast(`Located ${objectDisplayName(element)}`);return true;
  }

  function exportSafeName(value){
    return String(value||'leaf-object').trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g,'-').replace(/[. ]+$/,'').slice(0,80)||'leaf-object';
  }

  function exportCloneWithComputedStyles(element){
    const clone=element.cloneNode(true);
    const sourceElements=[element,...element.querySelectorAll('*')];
    const cloneElements=[clone,...clone.querySelectorAll('*')];
    sourceElements.forEach((source,index)=>{
      const target=cloneElements[index];if(!target)return;
      const computed=source.ownerDocument.defaultView.getComputedStyle(source);
      const style=[];
      for(const property of computed){
        const value=computed.getPropertyValue(property);
        if(value)style.push(`${property}:${value}`);
      }
      target.setAttribute('style',style.join(';'));
      [...target.attributes].forEach(attribute=>{
        if(/^on/i.test(attribute.name)||/^data-editor-/i.test(attribute.name)||['contenteditable','draggable'].includes(attribute.name.toLowerCase()))target.removeAttribute(attribute.name);
      });
      target.classList.remove('table-cell-selected','viewport-object-drop-target','hbe-inline-editing');
      if(source.tagName==='INPUT'){target.setAttribute('value',source.value);if(source.checked)target.setAttribute('checked','');else target.removeAttribute('checked');}
      if(source.tagName==='TEXTAREA')target.textContent=source.value;
      if(source.tagName==='SELECT')[...target.options].forEach((option,i)=>option.toggleAttribute('selected',i===source.selectedIndex));
    });
    clone.querySelectorAll('script,base,meta,link[rel="preload"],link[rel="modulepreload"],[data-editor-overlay]').forEach(node=>node.remove());
    clone.style.margin='0';
    return clone;
  }

  async function exportAssetDataUrl(url){
    if(!url||/^data:/i.test(url))return url;
    if(/^file:/i.test(url))return window.electronAPI.readLocalAssetDataUrl(url);
    if(/^blob:/i.test(url)||/^https?:/i.test(url)){
      const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error(`Asset request failed (${response.status})`);
      const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    }
    return url;
  }

  async function inlineExportAssets(element,clone){
    const sourceElements=[element,...element.querySelectorAll('*')];
    const cloneElements=[clone,...clone.querySelectorAll('*')];
    await Promise.all(sourceElements.map(async(source,index)=>{
      const target=cloneElements[index];if(!target)return;
      if(source.tagName==='IMG'){
        const url=source.currentSrc||source.src;try{if(url)target.src=await exportAssetDataUrl(url);}catch(error){console.warn('Image export asset could not be embedded',url,error);}
      }
      if(source.tagName==='IMAGE'){
        const url=source.href?.baseVal||source.getAttribute('href')||source.getAttribute('xlink:href');
        try{if(url){const data=await exportAssetDataUrl(new URL(url,source.baseURI).href);target.setAttribute('href',data);target.removeAttribute('xlink:href');}}catch(error){console.warn('SVG image export asset could not be embedded',url,error);}
      }
    }));
  }

  async function createObjectSvgSnapshot(element,scale=1){
    if(!element?.isConnected)throw new Error('The selected object is no longer available.');
    const rect=element.getBoundingClientRect();
    const width=Math.max(1,Math.ceil(rect.width));
    const height=Math.max(1,Math.ceil(rect.height));
    const normalizedScale=clamp(Number(scale)||1,.5,4);
    const outputWidth=Math.max(1,Math.ceil(width*normalizedScale));
    const outputHeight=Math.max(1,Math.ceil(height*normalizedScale));
    if(outputWidth>16384||outputHeight>16384||outputWidth*outputHeight>80_000_000)throw new Error('Export dimensions are too large. Choose a smaller scale.');
    const clone=exportCloneWithComputedStyles(element);
    await inlineExportAssets(element,clone);
    clone.style.width=`${width}px`;clone.style.height=`${height}px`;clone.style.boxSizing='border-box';
    const serialized=new XMLSerializer().serializeToString(clone);
    const source=`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">${serialized}</div></foreignObject></svg>`;
    return{source,width,height,outputWidth,outputHeight,scale:normalizedScale};
  }

  async function rasterizeObjectSnapshot(snapshot,format){
    const blob=new Blob([snapshot.source],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The selected object could not be rendered.'));image.src=url;});
      const canvas=document.createElement('canvas');
      canvas.width=snapshot.outputWidth;canvas.height=snapshot.outputHeight;
      const context=canvas.getContext('2d',{alpha:format==='png'});
      if(!context)throw new Error('Canvas export is unavailable.');
      if(format==='jpg'){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);}
      context.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL(format==='jpg'?'image/jpeg':'image/png',format==='jpg'?.92:undefined);
    }finally{URL.revokeObjectURL(url);}
  }

  async function captureRenderedObject(element,snapshot,format){
    const frame=element.ownerDocument?.defaultView?.frameElement;
    if(!frame)throw new Error('The selected object is not inside a page View.');
    const view=element.ownerDocument.defaultView;
    if(snapshot.width>view.innerWidth||snapshot.height>view.innerHeight)throw new Error('The object is larger than the visible page View.');
    const oldScroll={x:view.scrollX,y:view.scrollY};
    const overlays=[...element.ownerDocument.querySelectorAll('[data-editor-overlay]')].map(node=>({node,visibility:node.style.visibility}));
    try{
      element.scrollIntoView({block:'center',inline:'center'});
      overlays.forEach(item=>{item.node.style.visibility='hidden';});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const rect=element.getBoundingClientRect();const frameRect=frame.getBoundingClientRect();
      const scaleX=frameRect.width/Math.max(1,frame.clientWidth);const scaleY=frameRect.height/Math.max(1,frame.clientHeight);
      const captureRect={x:frameRect.left+(rect.left*scaleX),y:frameRect.top+(rect.top*scaleY),width:rect.width*scaleX,height:rect.height*scaleY};
      const outputScale=snapshot.outputWidth/Math.max(1,captureRect.width);
      return await window.electronAPI.captureRegion({rect:captureRect,scale:outputScale,format});
    }finally{
      overlays.forEach(item=>{item.node.style.visibility=item.visibility;});
      view.scrollTo(oldScroll.x,oldScroll.y);
      frameSelectionRenderers.get(frame)?.();
    }
  }

  function updateObjectExportSummary(){
    const elements=(Array.isArray(objectExportTarget)?objectExportTarget:[objectExportTarget]).filter(element=>element?.isConnected);
    if(!elements.length){refs.objectExportSummary.textContent='No object selected.';return;}
    const rect=elements[0].getBoundingClientRect();
    const scale=Number(refs.objectExportScale.value)||1;
    const width=Math.max(1,Math.ceil(rect.width*scale)),height=Math.max(1,Math.ceil(rect.height*scale));
    refs.objectExportSummary.textContent=elements.length>1?`${elements.length} objects · each object will be exported as a separate file`:`${objectDisplayName(elements[0])} · ${Math.ceil(rect.width)} × ${Math.ceil(rect.height)} px · Output ${width} × ${height} px`;
  }

  function openObjectExportDialog(element=selectedElement){
    const selection=SelectionManager.items().filter(item=>item?.isConnected&&!['HTML','BODY'].includes(item.tagName));
    const targets=selection.length?(element&&selection.includes(element)?selection:selection):(element?.isConnected?[element]:[]);
    if(!targets.length){showToast('Select an object to export');return false;}
    objectExportTarget=targets;
    refs.objectExportFormat.value='png';refs.objectExportScale.value='1';
    updateObjectExportSummary();refs.objectExportModal.classList.add('show');
    setTimeout(()=>refs.objectExportFormat.focus(),0);return true;
  }

  function closeObjectExportDialog(){refs.objectExportModal.classList.remove('show');objectExportTarget=null;}

  async function confirmObjectExport(){
    const elements=(Array.isArray(objectExportTarget)?objectExportTarget:[objectExportTarget]).filter(element=>element?.isConnected);
    if(!elements.length)return closeObjectExportDialog();
    const format=refs.objectExportFormat.value;
    const scale=Number(refs.objectExportScale.value)||1;
    const confirm=$('#objectExportConfirm');confirm.disabled=true;
    try{
      const suffix=scale===1?'':`@${scale}x`;
      const items=[];
      for(const element of elements){
        const snapshot=await createObjectSvgSnapshot(element,scale);
        let source=snapshot.source;
        if(format!=='svg'){
          try{source=await captureRenderedObject(element,snapshot,format);}
          catch(captureError){console.warn('Rendered capture fallback to SVG rasterization',captureError);source=await rasterizeObjectSnapshot(snapshot,format);}
        }
        items.push({suggestedName:`${exportSafeName(objectDisplayName(element))}${suffix}.${format}`,source});
      }
      const result=items.length>1
        ?await window.electronAPI.exportObjectAssets({format,items})
        :await window.electronAPI.exportObjectAsset({format,...items[0]});
      if(result&&(Array.isArray(result)?result.length:true)){closeObjectExportDialog();showToast(`${items.length} ${format.toUpperCase()} file${items.length===1?'':'s'} exported`);}
    }catch(error){console.error('Object export failed',error);showToast(`Export failed: ${error.message}`);}
    finally{confirm.disabled=false;}
  }

  refs.exportElementBtn?.addEventListener('click',()=>openObjectExportDialog());
  refs.objectExportFormat?.addEventListener('change',updateObjectExportSummary);
  refs.objectExportScale?.addEventListener('change',updateObjectExportSummary);
  $('#objectExportCancel')?.addEventListener('click',closeObjectExportDialog);
  $('#objectExportConfirm')?.addEventListener('click',confirmObjectExport);
  refs.objectExportModal?.addEventListener('keydown',event=>{
    trapDialogFocus(refs.objectExportModal,event);
    if(event.key==='Escape'){event.preventDefault();closeObjectExportDialog();}
  });

  function openObjectContextMenu(frame,target,clientX,clientY){
    if(!refs.objectContextMenu)return;
    if(!SelectionManager.has(target))SelectionManager.select(target,frame,'viewport-context');
    objectContextFrame=frame;
    const frameRect=frame.getBoundingClientRect();
    refs.objectContextMenu.hidden=false;
    const width=refs.objectContextMenu.offsetWidth,height=refs.objectContextMenu.offsetHeight;
    refs.objectContextMenu.style.left=`${Math.min(innerWidth-width-8,Math.max(8,frameRect.left+clientX))}px`;
    refs.objectContextMenu.style.top=`${Math.min(innerHeight-height-8,Math.max(8,frameRect.top+clientY))}px`;
    refs.objectContextMenu.querySelector('[data-object-context="paste"]').disabled=!componentClipboard?.items?.length;
    refs.objectContextMenu.querySelector('[data-object-context="edit-text"]').disabled=!isTextWidget(selectedElement);
    refs.objectContextMenu.focus();
  }

  function closeObjectContextMenu(){if(refs.objectContextMenu)refs.objectContextMenu.hidden=true;objectContextFrame=null;}

  refs.objectContextMenu?.addEventListener('click',event=>{
    const action=event.target.closest('[data-object-context]')?.dataset.objectContext;
    if(!action)return;
    closeObjectContextMenu();
    if(action==='copy')copySelectedElements();
    if(action==='paste')pasteSelectedElements();
    if(action==='duplicate')duplicateSelectedElements();
    if(action==='edit-text')editSelectedText();
    if(action==='export')openObjectExportDialog();
    if(action==='delete')deleteSelectedElements();
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#objectContextMenu'))closeObjectContextMenu();},true);
  document.addEventListener('pointerdown',event=>{
    if(event.leafActivationReason==='focus')return;
    if(inlineTextEditSession)endInlineTextEdit({commit:true});
  },true);

  function deleteSelectedElements(){
    const deletable=SelectionManager.items().filter(element=>element?.isConnected && !['BODY','HTML'].includes(element.tagName));
    if(!htmlEditEnabled || !deletable.length) return;
    const performDelete=()=>{
      const frame=selectedElementFrame || deletable[0]?.ownerDocument?.defaultView?.frameElement;
      const pageId=frameToPageId(frame);
      const page=pageById(pageId);
      if(!page || !frame) return;
      const scrollPosition={x:frame.contentWindow.scrollX,y:frame.contentWindow.scrollY};

      if(inlineTextEditSession) endInlineTextEdit();
      pushUndo(page);
      deletable.sort((a,b)=>{
        const depth=element=>{let value=0,current=element;while(current?.parentElement){value++;current=current.parentElement;}return value;};
        return depth(b)-depth(a);
      }).forEach(element=>element.remove());
      syncFrameToPage(frame,page,{mutationKind:'inspector-delete'});
      clearInspector();
      renderVisibleFramesForPage(pageId,frame);
      if(state.mode==='code' && state.views.codePage===pageId) loadCodePage();
      persist();
      const restoreScrollPosition=()=>{
        frame.contentWindow.scrollTo(scrollPosition.x,scrollPosition.y);
      };
      restoreScrollPosition();
      setTimeout(restoreScrollPosition,0);
    };

    if(hasUnsavedInspectorDraft()){
      withUnsavedInspectorGuard(performDelete);
      return;
    }
    performDelete();
  }

  function frameToPageId(frame){
    if(frame===refs.singleFrame) return state.views.single;
    if(frame===refs.leftFrame) return state.views.left;
    if(frame===refs.rightFrame) return state.views.right;
    if(frame===refs.codePreviewFrame) return state.views.codePreview;
    return null;
  }

  // Chromium's native PDF viewer fully re-parses the document on every
  // navigation, even one to a byte-identical file:// URL - so renderFrameContent
  // skips reassigning a pdf frame's src when it is already showing that exact
  // page. That skip is wrong for one caller: reloading a local file whose bytes
  // changed on disk but whose path (and therefore URL) did not. This marks
  // every frame currently bound to a page so the next render is forced through,
  // regardless of the dedup key.
  function markPageFramesForForceReload(pageId){
    [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>{
      if(frame&&frameToPageId(frame)===pageId)frame.dataset.pdfForceReload='1';
    });
  }

  function syncFrameToPage(frame,page,{mutationKind='dom-serialize'}={}){
    const before=page.source||'';
    const inlineSession=inlineTextEditSession?.frame===frame && inlineTextEditSession.element?.isConnected ? inlineTextEditSession : null;
    if(inlineSession){
      if(inlineSession.originalContentEditable===null) inlineSession.element.removeAttribute('contenteditable');
      else inlineSession.element.setAttribute('contenteditable',inlineSession.originalContentEditable);
    }
    const doc=frame.contentDocument.cloneNode(true);
    if(inlineSession) inlineSession.element.setAttribute('contenteditable','plaintext-only');
    window.SourceFidelity.stripEditorArtifactsFromDocument(doc);
    const next='<!doctype html>\n'+doc.documentElement.outerHTML;
    const leakage=window.SourceFidelity.editorArtifactReport(next);
    if(leakage.length){
      console.error('Refusing source commit due to editor artifact leakage',leakage);
      showToast('Source commit blocked: editor metadata detected');
      return false;
    }
    page.source=next;
    page.isEmpty=false;
    reportUnexpectedSourceMutation(page,{kind:mutationKind,before,after:next});
    return true;
  }

  function renderVisibleFramesForPage(pageId,excludeFrame=null){
    // Re-render only *other* viewports that show the changed page.
    // The edited frame already contains the committed DOM and stays live so
    // the current element selection can remain stable after a live commit.
    if(refs.singleFrame!==excludeFrame && state.views.single===pageId && state.mode==='preview') renderFrame(refs.singleFrame,pageId);
    if(refs.leftFrame!==excludeFrame && state.views.left===pageId && state.mode==='split') renderFrame(refs.leftFrame,pageId);
    if(refs.rightFrame!==excludeFrame && state.views.right===pageId && state.mode==='split') renderFrame(refs.rightFrame,pageId);
    if(refs.codePreviewFrame!==excludeFrame && state.views.codePreview===pageId && state.mode==='code') renderFrame(refs.codePreviewFrame,pageId);
  }

  function hasUnsavedInspectorDraft(){
    return !!inspectorDraft && (pendingInspectorFields().length>0 || hasInspectorValidationErrors());
  }

  function withUnsavedInspectorGuard(action){
    // Valid Inspector values have already been committed. Only an invalid
    // transient field can remain, so discard that local value before moving on.
    if(hasUnsavedInspectorDraft() && inspectorDraft){
      restoreDraftOriginalLive();
      inspectorDraft.values=clone(inspectorDraft.savedValues);
      inspectorDraft.validationErrors={};
      updateDirtyFields();
    }
    action?.();
    return true;
  }

  // ----- Unified splitter controller -----
  const SPLITTER_HANDLE_PX=5;
  const MIN_MAIN_WIDTH=420;
  const MIN_SIDEBAR_WIDTH=190;
  const MAX_SIDEBAR_WIDTH=420;
  const MIN_INSPECTOR_WIDTH=220;
  const MAX_INSPECTOR_WIDTH=520;

  function clamp(value,min,max){
    return Math.min(Math.max(value,min),Math.max(min,max));
  }

  function dynamicSidebarMax(){
    const rect=refs.workspace.getBoundingClientRect();
    const inspectorSpace=state.preferences.inspectorCollapsed?0:(inspectorWidth+SPLITTER_HANDLE_PX);
    return Math.max(MIN_SIDEBAR_WIDTH,Math.min(MAX_SIDEBAR_WIDTH,rect.width-inspectorSpace-MIN_MAIN_WIDTH-SPLITTER_HANDLE_PX));
  }

  function dynamicInspectorMax(){
    const rect=refs.workspace.getBoundingClientRect();
    const sidebarSpace=state.preferences.sidebarCollapsed?0:(sidebarWidth+SPLITTER_HANDLE_PX);
    return Math.max(MIN_INSPECTOR_WIDTH,Math.min(MAX_INSPECTOR_WIDTH,rect.width-sidebarSpace-MIN_MAIN_WIDTH-SPLITTER_HANDLE_PX));
  }

  function ratioBounds(container,minFirst,minSecond){
    const width=Math.max(1,container.getBoundingClientRect().width-SPLITTER_HANDLE_PX);
    let min=minFirst/width;
    let max=1-(minSecond/width);
    if(min>max){ min=.35; max=.65; }
    return {min:Math.max(.1,min),max:Math.min(.9,max),width};
  }

  function beginResizeSession({
    event,
    handle,
    getValue,
    computeValue,
    applyValue,
    commitValue,
    cancelValue,
    defaultValue
  }){
    if(event.button!==0) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerId=event.pointerId;
    const startValue=getValue();
    let currentValue=startValue;
    const axis=handle.getAttribute('aria-orientation')==='horizontal'?'y':'x';
    let pendingPosition=axis==='y'?event.clientY:event.clientX;
    let rafId=0;
    let finished=false;

    document.body.classList.add(axis==='y'?'is-resizing-row':'is-resizing');
    handle.classList.add('dragging');
    handle.setAttribute('aria-valuenow',String(startValue));
    try{ handle.setPointerCapture(pointerId); }catch{}

    const flush=()=>{
      rafId=0;
      currentValue=computeValue(pendingPosition);
      applyValue(currentValue);
      handle.setAttribute('aria-valuenow',String(currentValue));
    };

    const schedule=position=>{
      pendingPosition=position;
      if(!rafId) rafId=requestAnimationFrame(flush);
    };

    const cleanup=()=>{
      if(finished) return;
      finished=true;
      if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
      document.body.classList.remove('is-resizing','is-resizing-row');
      handle.classList.remove('dragging');
      try{
        if(handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      }catch{}
      handle.removeEventListener('pointermove',onMove);
      handle.removeEventListener('pointerup',onUp);
      handle.removeEventListener('pointercancel',onCancel);
      handle.removeEventListener('lostpointercapture',onLostCapture);
      window.removeEventListener('blur',onWindowBlur);
    };

    const finish=commit=>{
      if(finished) return;
      if(rafId){ cancelAnimationFrame(rafId); rafId=0; flush(); }
      if(commit) commitValue(currentValue);
      else {
        currentValue=startValue;
        (cancelValue||applyValue)(startValue);
      }
      cleanup();
      persist();
    };

    const onMove=e=>{
      if(e.pointerId!==pointerId) return;
      schedule(axis==='y'?e.clientY:e.clientX);
    };
    const onUp=e=>{
      if(e.pointerId!==pointerId) return;
      finish(true);
    };
    const onCancel=e=>{
      if(e.pointerId!==pointerId) return;
      finish(false);
    };
    const onLostCapture=()=>{ if(!finished) finish(true); };
    const onWindowBlur=()=>{ if(!finished) finish(true); };

    handle.addEventListener('pointermove',onMove);
    handle.addEventListener('pointerup',onUp);
    handle.addEventListener('pointercancel',onCancel);
    handle.addEventListener('lostpointercapture',onLostCapture);
    window.addEventListener('blur',onWindowBlur,{once:true});

    if(Number.isFinite(defaultValue)){
      handle.ondblclick=()=>{
        applyValue(defaultValue);
        commitValue(defaultValue);
        persist();
      };
    }
  }

  refs.sidebarResizer.addEventListener('pointerdown',event=>{
    if(state.preferences.sidebarCollapsed) return;
    const rect=refs.workspace.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.sidebarResizer,
      getValue:()=>sidebarWidth,
      computeValue:clientX=>clamp(clientX-rect.left,MIN_SIDEBAR_WIDTH,dynamicSidebarMax()),
      applyValue:value=>{
        sidebarWidth=value;
        refs.workspace.style.setProperty('--sidebar-width',`${Math.round(value)}px`);
      },
      commitValue:value=>{
        sidebarWidth=Math.round(value);
        state.preferences.sidebarWidth=sidebarWidth;
        updateWorkspaceColumns();
      },
      defaultValue:260
    });
  });

  refs.inspectorResizer.addEventListener('pointerdown',event=>{
    if(state.preferences.inspectorCollapsed) return;
    const rect=refs.workspace.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.inspectorResizer,
      getValue:()=>inspectorWidth,
      computeValue:clientX=>clamp(rect.right-clientX,MIN_INSPECTOR_WIDTH,dynamicInspectorMax()),
      applyValue:value=>{
        inspectorWidth=value;
        refs.workspace.style.setProperty('--inspector-width',`${Math.round(value)}px`);
      },
      commitValue:value=>{
        inspectorWidth=Math.round(value);
        state.preferences.inspectorWidth=inspectorWidth;
        updateWorkspaceColumns();
      },
      defaultValue:300
    });
  });

  refs.splitDivider.addEventListener('pointerdown',event=>{
    const container=$('#splitView');
    const rect=container.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.splitDivider,
      getValue:()=>splitRatio,
      computeValue:clientX=>{
        const bounds=ratioBounds(container,240,240);
        return clamp((clientX-rect.left)/Math.max(1,rect.width),bounds.min,bounds.max);
      },
      applyValue:value=>{
        splitRatio=value;
        container.style.setProperty('--split-left',`${value*100}%`);
      },
      commitValue:value=>{
        splitRatio=value;
        state.layout.splitRatio=value;
        updateWorkspaceColumns();
      },
      defaultValue:.5
    });
  });

  refs.codeDivider.addEventListener('pointerdown',event=>{
    const container=$('#codeView');
    const rect=container.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.codeDivider,
      getValue:()=>codeRatio,
      computeValue:clientX=>{
        const bounds=ratioBounds(container,260,340);
        return clamp((clientX-rect.left)/Math.max(1,rect.width),bounds.min,bounds.max);
      },
      applyValue:value=>{
        codeRatio=value;
        container.style.setProperty('--code-preview-width',`${value*100}%`);
      },
      commitValue:value=>{
        codeRatio=value;
        state.layout.codeRatio=value;
        updateWorkspaceColumns();
      },
      defaultValue:.5
    });
  });


  refs.leftHorizontalSplitter.addEventListener('pointerdown',event=>{
    const sidebar=document.querySelector('.sidebar');
    const rect=sidebar.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.leftHorizontalSplitter,
      getValue:()=>leftTopRatio,
      computeValue:clientY=>clamp((clientY-rect.top)/Math.max(1,rect.height),.25,.8),
      applyValue:value=>{
        leftTopRatio=value;
        sidebar.style.setProperty('--left-top-height',`${value*100}%`);
      },
      commitValue:value=>{
        leftTopRatio=value;
        state.layout=state.layout||{};
        state.layout.leftTopRatio=value;
        sidebar.style.setProperty('--left-top-height',`${value*100}%`);
      },
      defaultValue:.58
    });
  });

  refs.usedPreviewSplitter?.addEventListener('pointerdown',event=>{
    if(state.preferences.usedPreviewVisible===false)return;
    const panel=document.querySelector('[data-left-panel="used"]');
    const rect=panel.getBoundingClientRect();
    beginResizeSession({
      event,
      handle:refs.usedPreviewSplitter,
      getValue:()=>usedPreviewRatio,
      computeValue:clientY=>clamp((rect.bottom-clientY)/Math.max(1,rect.height),.2,.7),
      applyValue:value=>{
        usedPreviewRatio=value;
        panel.style.setProperty('--used-preview-height',`${value*100}%`);
      },
      commitValue:value=>{
        usedPreviewRatio=value;
        state.layout.usedPreviewRatio=value;
        renderUsedPreviewLayout();
      },
      defaultValue:.42
    });
  });

  if(refs.usedPreviewSplitter){
    refs.usedPreviewSplitter.tabIndex=0;
    refs.usedPreviewSplitter.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','Home'].includes(event.key)||state.preferences.usedPreviewVisible===false)return;
      event.preventDefault();
      usedPreviewRatio=event.key==='Home'?.42:clamp(usedPreviewRatio+(event.key==='ArrowUp'?.03:-.03),.2,.7);
      state.layout.usedPreviewRatio=usedPreviewRatio;
      renderUsedPreviewLayout();persist();
    });
  }

  // Keyboard nudge for accessibility / precision.
  [
    [refs.sidebarResizer,'sidebar'],
    [refs.inspectorResizer,'inspector'],
    [refs.splitDivider,'split'],
    [refs.codeDivider,'code']
  ].forEach(([handle,type])=>{
    handle.tabIndex=0;
    handle.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home'].includes(e.key)) return;
      e.preventDefault();
      const dir=e.key==='ArrowLeft'?-1:1;

      if(type==='sidebar'){
        if(state.preferences.sidebarCollapsed) return;
        sidebarWidth=e.key==='Home'?260:clamp(sidebarWidth+(dir*10),MIN_SIDEBAR_WIDTH,dynamicSidebarMax());
        state.preferences.sidebarWidth=Math.round(sidebarWidth);
      }else if(type==='inspector'){
        if(state.preferences.inspectorCollapsed) return;
        inspectorWidth=e.key==='Home'?300:clamp(inspectorWidth-(dir*10),MIN_INSPECTOR_WIDTH,dynamicInspectorMax());
        state.preferences.inspectorWidth=Math.round(inspectorWidth);
      }else if(type==='split'){
        const bounds=ratioBounds($('#splitView'),240,240);
        splitRatio=e.key==='Home'? .5:clamp(splitRatio+(dir*.02),bounds.min,bounds.max);
        state.layout.splitRatio=splitRatio;
      }else if(type==='code'){
        const bounds=ratioBounds($('#codeView'),260,340);
        codeRatio=e.key==='Home'? .5:clamp(codeRatio+(dir*.02),bounds.min,bounds.max);
        state.layout.codeRatio=codeRatio;
      }

      updateWorkspaceColumns();
      persist();
    });
  });

  function toggleInspector(){
    state.preferences.inspectorCollapsed=!state.preferences.inspectorCollapsed;
    updateWorkspaceColumns();
    persist();
  }
  function toggleSidebar(){
    state.preferences.sidebarCollapsed=!state.preferences.sidebarCollapsed;
    if(!state.preferences.sidebarCollapsed){
      sidebarWidth=clamp(sidebarWidth,MIN_SIDEBAR_WIDTH,dynamicSidebarMax());
      state.preferences.sidebarWidth=Math.round(sidebarWidth);
    }
    updateWorkspaceColumns();
    persist();
  }
  $('#collapseInspector').onclick=toggleInspector;
  $('#inspectorToggleTop').onclick=toggleInspector;
  $('#sidebarToggleTop').onclick=toggleSidebar;


  window.addEventListener('resize',()=>{
    if(!state.preferences.sidebarCollapsed){
      sidebarWidth=clamp(sidebarWidth,MIN_SIDEBAR_WIDTH,dynamicSidebarMax());
    }
    if(!state.preferences.inspectorCollapsed){
      inspectorWidth=clamp(inspectorWidth,MIN_INSPECTOR_WIDTH,dynamicInspectorMax());
    }
    const splitBounds=ratioBounds($('#splitView'),240,240);
    splitRatio=clamp(splitRatio,splitBounds.min,splitBounds.max);
    const codeBounds=ratioBounds($('#codeView'),260,340);
    codeRatio=clamp(codeRatio,codeBounds.min,codeBounds.max);
    state.preferences.sidebarWidth=Math.round(sidebarWidth);
    state.preferences.inspectorWidth=Math.round(inspectorWidth);
    state.layout.splitRatio=splitRatio;
    state.layout.codeRatio=codeRatio;
    updateWorkspaceColumns();
    persist();
  });


  // ----- Jira / Atlassian export -----
  function currentPageForExport(){
    return pageById(currentActivePageId());
  }

  async function buildJiraExportDocument(page){
    if(!page || page.isEmpty || !(page.source||'').trim()) throw new Error('Current page is empty.');
    const payload=await htmlForSemanticExport(page);
    const semantic=window.SemanticDocument.fromHtml(payload.html,{
      baseUrl:page.baseUrl||null,
      title:page.name||page.fileName||'',
      sourceKind:payload.sourceKind
    });

    // If a rendered snapshot was successfully used, the generic source-script warning is not useful.
    if(payload.sourceKind==='rendered'){
      semantic.warnings=semantic.warnings.filter(w=>!w.startsWith('This document contains JavaScript.'));
    }

    const diagnostics=window.JiraCompatibility.analyzeHtml(payload.html);
    return {semantic,sourceKind:payload.sourceKind,diagnostics};
  }

  function jiraOutputForMode(semantic,mode){
    if(mode==='markdown'){
      const text=window.JiraExport.toMarkdown(semantic);
      return {mode,text,plain:text,extension:'md',suggestedSuffix:'-jira.md'};
    }
    if(mode==='adf'){
      const adf=window.JiraExport.toAdf(semantic);
      const text=JSON.stringify(adf,null,2);
      return {mode,text,plain:text,extension:'json',suggestedSuffix:'-adf.json',adf};
    }

    const html=window.JiraExport.toRichHtml(semantic);
    const plain=window.JiraExport.toPlainText(semantic);
    return {mode:'rich',html,plain,text:plain,extension:'html',suggestedSuffix:'-jira.html'};
  }

  function renderJiraExportDialog(){
    if(!jiraExportState) return;
    const {page,semantic,sourceKind,mode}=jiraExportState;
    const output=jiraOutputForMode(semantic,mode);
    jiraExportState.output=output;

    refs.jiraExportSource.textContent=`${page.name || page.fileName || 'Current page'} · ${page.fileName || ''}`;
    refs.jiraExportRuntime.textContent=sourceKind==='rendered'
      ? 'Source: Rendered DOM snapshot'
      : sourceKind==='source-fallback'
        ? 'Source: HTML source fallback'
        : 'Source: HTML source';

    const stats=window.JiraExport.stats(semantic);
    refs.jiraExportStats.textContent=Object.entries(stats)
      .map(([key,value])=>`${key} ${value}`)
      .join(' · ');

    const diagnostics=jiraExportState.diagnostics;
    const diagnosticNotes=diagnostics?.issues?.map(i=>`${i.severity.toUpperCase()}: ${i.label} — ${i.message}`)||[];
    const warnings=[...(semantic.warnings||[]),...diagnosticNotes];
    refs.jiraExportWarnings.hidden=!warnings.length;
    refs.jiraExportWarnings.innerHTML=warnings.length
      ? `<strong>Conversion notes</strong><br>${warnings.map(w=>`• ${esc(w)}`).join('<br>')}`
      : '';

    $$('.jira-export-tabs [data-jira-mode]').forEach(button=>{
      button.classList.toggle('active',button.dataset.jiraMode===mode);
    });

    if(mode==='rich'){
      refs.jiraRichPreview.hidden=false;
      refs.jiraTextPreview.hidden=true;
      refs.jiraRichPreview.innerHTML=output.html;
    }else{
      refs.jiraRichPreview.hidden=true;
      refs.jiraTextPreview.hidden=false;
      refs.jiraTextPreview.value=output.text;
    }

    $('#jiraExportSave').textContent=mode==='adf'?'Export JSON':mode==='markdown'?'Export Markdown':'Export HTML';
    $('#jiraExportCopy').textContent=mode==='rich'?'Copy for Jira':'Copy';
  }

  async function openJiraExportDialog(mode='rich'){
    return new Promise(resolve=>{
      withUnsavedInspectorGuard(async()=>{
        const page=currentPageForExport();
        if(!page || page.isEmpty || !(page.source||'').trim()){
          showToast('Select a non-empty page first');
          resolve(false);
          return;
        }

        try{
          refs.jiraExportModal.classList.add('show');
          refs.jiraExportSource.textContent='Preparing semantic document…';
          refs.jiraRichPreview.innerHTML='<div class="edit-mode-message">Converting HTML…</div>';
          refs.jiraTextPreview.hidden=true;

          const {semantic,sourceKind,diagnostics}=await buildJiraExportDocument(page);
          jiraExportState={page,semantic,sourceKind,diagnostics,mode};
          renderJiraExportDialog();
          setTimeout(()=>$('#jiraExportCopy').focus(),0);
          resolve(true);
        }catch(error){
          refs.jiraExportModal.classList.remove('show');
          console.error('Jira export failed',error);
          showToast(`Jira export failed: ${error.message}`);
          resolve(false);
        }
      });
    });
  }

  function closeJiraExportDialog(){
    refs.jiraExportModal.classList.remove('show');
    jiraExportState=null;
  }

  async function copyJiraOutput(){
    if(!jiraExportState?.output) return;
    const output=jiraExportState.output;
    if(output.mode==='rich'){
      await window.electronAPI.writeRichClipboard({text:output.plain,html:output.html});
      showToast('Copied rich content for Jira');
    }else{
      await window.electronAPI.writeTextClipboard(output.text);
      showToast(output.mode==='adf'?'ADF JSON copied':'Markdown copied');
    }
  }

  async function saveJiraOutput(){
    if(!jiraExportState?.output) return;
    const {page,output}=jiraExportState;
    const base=(page.fileName||page.name||'page').replace(/\.[^.]+$/,'');
    const suggestedName=base+output.suggestedSuffix;
    const filePath=await window.electronAPI.exportText({
      title: output.mode==='adf'?'Export ADF JSON':output.mode==='markdown'?'Export Markdown':'Export Jira-compatible HTML',
      suggestedName,
      extension:output.extension,
      source:output.mode==='rich'?output.html:output.text
    });
    if(filePath) showToast('Export saved');
  }

  async function copyCurrentPageForJira(){
    const page=currentPageForExport();
    if(!page || page.isEmpty || !(page.source||'').trim()) return showToast('Select a non-empty page first');
    try{
      const {semantic}=await buildJiraExportDocument(page);
      await window.electronAPI.writeRichClipboard({
        text:window.JiraExport.toPlainText(semantic),
        html:window.JiraExport.toRichHtml(semantic)
      });
      showToast('Copied for Jira');
    }catch(error){
      showToast(`Copy failed: ${error.message}`);
    }
  }

  async function copyCurrentPageAsMarkdown(){
    const page=currentPageForExport();
    if(!page || page.isEmpty || !(page.source||'').trim()) return showToast('Select a non-empty page first');
    try{
      const {semantic}=await buildJiraExportDocument(page);
      await window.electronAPI.writeTextClipboard(window.JiraExport.toMarkdown(semantic));
      showToast('Markdown copied');
    }catch(error){
      showToast(`Copy failed: ${error.message}`);
    }
  }

  async function exportCurrentPageAdf(){
    const page=currentPageForExport();
    if(!page || page.isEmpty || !(page.source||'').trim()) return showToast('Select a non-empty page first');
    try{
      const {semantic}=await buildJiraExportDocument(page);
      const json=JSON.stringify(window.JiraExport.toAdf(semantic),null,2);
      const base=(page.fileName||page.name||'page').replace(/\.[^.]+$/,'');
      const filePath=await window.electronAPI.exportText({
        title:'Export ADF JSON',
        suggestedName:`${base}-adf.json`,
        extension:'json',
        source:json
      });
      if(filePath) showToast('ADF JSON exported');
    }catch(error){
      showToast(`ADF export failed: ${error.message}`);
    }
  }

  $$('.jira-export-tabs [data-jira-mode]').forEach(button=>{
    button.addEventListener('click',()=>{
      if(!jiraExportState) return;
      jiraExportState.mode=button.dataset.jiraMode;
      renderJiraExportDialog();
    });
  });
  $('#jiraExportClose').onclick=closeJiraExportDialog;
  $('#jiraExportCancel').onclick=closeJiraExportDialog;
  $('#jiraExportCopy').onclick=()=>copyJiraOutput();
  $('#jiraExportSave').onclick=()=>saveJiraOutput();
  refs.jiraExportModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.jiraExportModal,event);
    if(event.key==='Escape') closeJiraExportDialog();
  });

  $('#savePageAsCancel').onclick=closeSavePageAsDialog;
  $('#savePageAsConfirm').onclick=async()=>{
    const format=refs.savePageAsFormat.value;
    closeSavePageAsDialog();
    try{await savePageAsFormat(format);}catch(error){console.error('Save Page As failed',error);showToast(`Save failed: ${error.message}`);}
  };
  refs.savePageAsModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.savePageAsModal,event);
    if(event.key==='Escape'){event.preventDefault();closeSavePageAsDialog();}
    if(event.key==='Enter'){event.preventDefault();$('#savePageAsConfirm').click();}
  });

  function openAboutDialog(){refs.aboutModal.classList.add('show');setTimeout(()=>$('#aboutClose').focus(),0);}
  function closeAboutDialog(){refs.aboutModal.classList.remove('show');}
  $('#aboutClose').onclick=closeAboutDialog;
  refs.aboutModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.aboutModal,event);
    if(event.key==='Escape'||event.key==='Enter'){event.preventDefault();closeAboutDialog();}
  });

  // ----- GitHub -----
  // A repository is a Document: folders become group nodes, files become page
  // nodes. Nothing new is needed for the tree, search, tile view, split view,
  // outline or Inspector - they all already work on that shape.
  //
  // The whole tree arrives in one call and costs nothing to hold, but a file's
  // contents are only fetched when the Page is first opened. Until then the
  // node is a stub: real in the tree, empty in the editor.

  const GITHUB_URL = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+)(?:\/(?:tree|blob)\/([^/\s?#]+)((?:\/[^\s?#]*)?))?/i;

  // Only what Leaf can actually open is listed, so a code repository does not
  // bury three documents under a thousand source files. Show all files lifts it.
  const GITHUB_OPENABLE = /\.(?:html?|md|markdown|json|xml|svg|pdf|png|jpe?g|gif|webp)$/i;

  let githubModalState = null;

  function githubRepoUrlParts(value) {
    const match = GITHUB_URL.exec(String(value || '').trim());
    if (!match) return null;
    const [, owner, repo, ref, rest] = match;
    const path = String(rest || '').replace(/^\/+/, '').replace(/\/+$/, '');
    return {
      owner,
      repo: repo.replace(/\.git$/i, ''),
      ref: ref || null,
      // A /blob/ URL points at a file, a /tree/ URL at a folder.
      root: /\/blob\//i.test(match[0]) ? path.split('/').slice(0, -1).join('/') : path,
      file: /\/blob\//i.test(match[0]) ? path : null
    };
  }

  // The main process answers with an envelope so the failure kind survives the
  // bridge. This turns it back into something throwable, with the kind intact.
  async function github(call) {
    const reply = await call;
    if (reply && reply.ok) return reply.value;
    const error = new Error(reply?.message || 'GitHub could not be reached.');
    error.kind = reply?.kind || 'unknown';
    throw error;
  }

  function githubError(error) {
    return {
      kind: error?.kind || 'unknown',
      message: String(error?.message || 'GitHub could not be reached.')
    };
  }

  function setGithubError(error) {
    const box = $('#githubError');
    if (!box) return;
    if (!error) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = githubError(error).message;
  }

  async function openGithubModal(prefill = null) {
    githubModalState = { prefill, repos: [], selected: null, branches: [] };
    setGithubError(null);
    // A previous visit may have left another repository's site on the row.
    const pagesRow = $('#githubPagesRow');
    if (pagesRow) pagesRow.hidden = true;
    const status = await github(window.electronAPI.github.status()).catch(() => ({ connected: false, storage: 'unavailable' }));
    githubModalState.status = status;
    renderGithubModal();
    refs.githubModal.classList.add('show');
    setTimeout(() => (status.connected ? $('#githubRepoInput') : $('#githubToken'))?.focus(), 0);
    if (status.connected) loadGithubRepositories();
  }

  function closeGithubModal() {
    refs.githubModal.classList.remove('show');
    githubModalState = null;
  }

  function renderGithubModal() {
    const modal = githubModalState;
    if (!modal) return;
    const connected = !!modal.status?.connected;
    $('#githubSignIn').hidden = connected;
    $('#githubPick').hidden = !connected;
    $('#githubDisconnect').hidden = !connected;
    $('#githubSubmit').textContent = connected ? 'Open repository' : 'Connect';
    $('#githubTitle').textContent = connected ? 'Open a GitHub repository' : 'Connect GitHub';

    const account = $('#githubAccount');
    account.hidden = !connected || !modal.status?.login;
    account.textContent = modal.status?.login ? `Signed in as ${modal.status.login}` : '';

    // Storage honesty: on a Linux box with no keyring safeStorage still reports
    // as available while barely protecting anything, so say which it is.
    const note = $('#githubStorageNote');
    const storage = modal.status?.storage;
    note.textContent = storage === 'unavailable'
      ? 'This system has no secure storage, so Leaf cannot keep a token here.'
      : storage === 'weak'
        ? 'No system keyring was found, so the token is only lightly obscured on this machine.'
        : 'The token is encrypted with your operating system\u2019s secure storage and never leaves this machine.';

    if (modal.prefill && connected) {
      $('#githubRepoInput').value = `${modal.prefill.owner}/${modal.prefill.repo}`;
      if (modal.prefill.root) $('#githubRoot').value = modal.prefill.root;
    }
    renderGithubRepoList();
  }

  function renderGithubRepoList() {
    const list = $('#githubRepoList');
    const modal = githubModalState;
    if (!list || !modal) return;
    const query = String($('#githubRepoInput')?.value || '').trim().toLowerCase();
    const matches = (modal.repos || []).filter(repo => !query || repo.fullName.toLowerCase().includes(query));
    list.innerHTML = matches.length
      ? matches.slice(0, 20).map((repo, index) =>
          `<button type="button" data-github-repo="${index}"><span>${esc(repo.fullName)}</span><span class="github-repo-meta">${repo.private ? 'private' : 'public'} \u00b7 ${esc(repo.defaultBranch)}</span></button>`
        ).join('')
      : '<p class="github-note">Type owner/repo, or pick one once the list loads.</p>';
    list.querySelectorAll('[data-github-repo]').forEach(button => {
      button.addEventListener('click', () => {
        const repo = matches[Number(button.dataset.githubRepo)];
        if (!repo) return;
        $('#githubRepoInput').value = repo.fullName;
        selectGithubRepository(repo.owner, repo.name);
      });
    });
  }

  async function loadGithubRepositories() {
    try {
      const repos = await github(window.electronAPI.github.repositories());
      if (!githubModalState) return;
      githubModalState.repos = repos || [];
      renderGithubRepoList();
      const typed = String($('#githubRepoInput')?.value || '').trim();
      if (typed.includes('/')) {
        const [owner, repo] = typed.split('/');
        selectGithubRepository(owner, repo);
      }
    } catch (error) { setGithubError(error); }
  }

  async function selectGithubRepository(owner, repo) {
    if (!owner || !repo) return;
    setGithubError(null);
    try {
      const [info, branches] = await Promise.all([
        github(window.electronAPI.github.repository({ owner, repo })),
        github(window.electronAPI.github.branches({ owner, repo }))
      ]);
      if (!githubModalState) return;
      githubModalState.selected = info;
      githubModalState.branches = branches || [];
      const select = $('#githubBranch');
      const wanted = githubModalState.prefill?.ref || info.defaultBranch;
      select.innerHTML = (branches || []).map(name =>
        `<option value="${esc(name)}"${name === wanted ? ' selected' : ''}>${esc(name)}</option>`).join('');
      if (!branches?.includes(wanted) && wanted) {
        select.insertAdjacentHTML('afterbegin', `<option value="${esc(wanted)}" selected>${esc(wanted)}</option>`);
      }
      loadGithubPagesSite(owner, repo);
    } catch (error) { setGithubError(error); }
  }

  // A repository and the site it publishes are two different things: the tree
  // holds the Markdown someone wrote, the Pages URL serves what the build made
  // of it. Both are worth opening, so once a repository is picked Leaf offers
  // the second one alongside the first.
  //
  // Fire-and-forget rather than awaited: the branch list is what the user is
  // waiting for, and a repository with Pages switched off must not make picking
  // one feel slower.
  async function loadGithubPagesSite(owner, repo) {
    const row = $('#githubPagesRow');
    if (row) row.hidden = true;
    let site = null;
    try {
      site = await github(window.electronAPI.github.pages({ owner, repo }));
    } catch {
      // Never surfaced. A token without the permission to read Pages settings
      // still opens the repository fine, and an error here would be noise
      // about a feature the user did not ask for.
      return;
    }
    // The modal may have moved to another repository while this was in flight.
    const modal = githubModalState;
    if (!modal || !row) return;
    if (modal.selected?.owner !== owner || modal.selected?.name !== repo) return;
    if (!site?.enabled || !site.url) return;
    modal.pagesUrl = site.url;
    $('#githubPagesUrl').textContent = site.url;
    $('#githubPagesUrl').title = site.cname ? `Custom domain: ${site.cname}` : site.url;
    row.hidden = false;
  }

  function openGithubPagesSite() {
    const url = githubModalState?.pagesUrl;
    if (!url) return;
    closeGithubModal();
    // The same path a typed URL takes, so the published site arrives as an
    // ordinary Page: reloadable, searchable, and with its relative assets
    // resolved against the site rather than against the repository.
    openPageFromUrl(url, 'single');
  }

  // A repository tree is a flat path list. Turning it into Leaf nodes is the
  // whole adaptation: a folder with no openable file under it is dropped, or
  // src/ and node_modules/ would fill the tree with empty shells.
  function githubNodesFromTree(entries, { root = '', showAllFiles = false } = {}) {
    const prefix = root ? `${root.replace(/\/+$/, '')}/` : '';
    const within = entries.filter(entry => !prefix || entry.path.startsWith(prefix));
    const files = within.filter(entry => entry.type === 'file'
      && (showAllFiles || GITHUB_OPENABLE.test(entry.path)));

    const keptDirs = new Set();
    for (const file of files) {
      const parts = file.path.slice(prefix.length).split('/');
      parts.pop();
      let walked = '';
      for (const part of parts) {
        walked = walked ? `${walked}/${part}` : part;
        keptDirs.add(walked);
      }
    }

    const nodes = [];
    const idByPath = new Map();
    const order = new Map();
    const nextOrder = parentId => {
      const key = parentId || '';
      const value = order.get(key) || 0;
      order.set(key, value + 1);
      return value;
    };

    [...keptDirs].sort().forEach(dirPath => {
      const parts = dirPath.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      const id = uid('group');
      idByPath.set(dirPath, id);
      const parentId = parentPath ? idByPath.get(parentPath) || null : null;
      nodes.push({
        id, type: 'group', name: parts[parts.length - 1], parentId,
        order: nextOrder(parentId), expanded: false, container: true,
        remote: { path: prefix + dirPath }
      });
    });

    files.sort((a, b) => a.path.localeCompare(b.path)).forEach(file => {
      const relative = file.path.slice(prefix.length);
      const parts = relative.split('/');
      const fileName = parts.pop();
      const parentPath = parts.join('/');
      const parentId = parentPath ? idByPath.get(parentPath) || null : null;
      nodes.push({
        id: uid('page'), type: 'page', name: fileName, fileName,
        documentType: githubDocumentType(fileName),
        parentId, order: nextOrder(parentId),
        source: '', loadedSource: '', baseUrl: null, sourcePath: null, previewUrl: null,
        isEmpty: false,
        // loaded:false is what makes this a stub. The tree is honest about the
        // repository's shape while only opened files are ever downloaded.
        remote: { path: file.path, sha: file.sha, size: file.size, loaded: false }
      });
    });

    return nodes;
  }

  function githubDocumentType(fileName) {
    const lower = String(fileName || '').toLowerCase();
    if (/\.html?$/.test(lower)) return 'html';
    if (/\.(?:md|markdown)$/.test(lower)) return 'markdown';
    if (/\.json$/.test(lower)) return 'json';
    if (/\.(?:xml|svg)$/.test(lower)) return 'xml';
    if (/\.pdf$/.test(lower)) return 'pdf';
    return 'image';
  }

  async function connectGithubRepository() {
    const modal = githubModalState;
    if (!modal) return;
    setGithubError(null);

    if (!modal.status?.connected) {
      const token = String($('#githubToken')?.value || '').trim();
      if (!token) { setGithubError({ message: 'Paste a token to connect.' }); return; }
      try {
        const identity = await github(window.electronAPI.github.connect(token));
        $('#githubToken').value = '';
        modal.status = { connected: true, login: identity.login, storage: identity.storage };
        renderGithubModal();
        await loadGithubRepositories();
        showToast(`Connected as ${identity.login}`);
      } catch (error) { setGithubError(error); }
      return;
    }

    const typed = String($('#githubRepoInput')?.value || '').trim();
    const [owner, repo] = typed.split('/').map(part => part.trim());
    if (!owner || !repo) { setGithubError({ message: 'Name the repository as owner/repo.' }); return; }
    const ref = String($('#githubBranch')?.value || '').trim()
      || modal.selected?.defaultBranch || 'main';
    const root = String($('#githubRoot')?.value || '').trim().replace(/^\/+|\/+$/g, '');

    try {
      const tree = await github(window.electronAPI.github.tree({ owner, repo, ref }));
      const nodes = githubNodesFromTree(tree.entries, { root });
      if (!nodes.some(node => node.type === 'page')) {
        setGithubError({ message: root
          ? `Nothing Leaf can open under ${root}.`
          : 'Nothing Leaf can open in that repository.' });
        return;
      }
      const project = {
        id: uid('document'),
        name: `${owner}/${repo}`,
        color: '#5873d4',
        filePath: null,
        expanded: true,
        remote: {
          owner, repo, ref, root,
          defaultBranch: modal.selected?.defaultBranch || ref,
          truncated: !!tree.truncated,
          showAllFiles: false,
          entries: tree.entries
        },
        nodes
      };
      state.documents.push(project);
      state.selectedDocumentId = project.id;
      focusDocument(project);
      closeGithubModal();
      clearInspector();
      renderAll();
      persist();
      if (tree.truncated) {
        showToast('GitHub truncated this listing - narrow it to a folder to see everything');
      } else {
        showToast(`Opened ${owner}/${repo}`);
      }
    } catch (error) { setGithubError(error); }
  }

  // Called when a stub Page is first bound to a view. Everything downstream -
  // preview runtimes, outline, Inspector - then sees an ordinary Page.
  async function ensureGithubPageLoaded(page) {
    const project = state.documents.find(document => document.nodes?.some(node => node.id === page?.id));
    const remote = project?.remote;
    if (!remote || !page?.remote || page.remote.loaded) return false;
    try {
      const file = await github(window.electronAPI.github.read({
        owner: remote.owner, repo: remote.repo, ref: remote.ref, path: page.remote.path
      }));
      page.source = file.text;
      page.loadedSource = file.text;
      page.baseUrl = file.baseUrl;
      page.isEmpty = !file.text.trim();
      page.remote = { ...page.remote, sha: file.sha, size: file.size, loaded: true };
      persist();
      return true;
    } catch (error) {
      showToast(githubError(error).message);
      return false;
    }
  }

  // ----- Committing back to GitHub -----------------------------------------
  //
  // Saving a repository document is not the same act as saving a local file,
  // and it is not pretended to be. The edit goes to a branch of its own and
  // arrives as a pull request, so a stray keystroke cannot rewrite what a
  // repository publishes, and the change has somewhere to be looked at.

  let githubCommitState = null;

  function githubProjectFor(page) {
    const project = state.documents.find(document => document.nodes?.some(node => node.id === page?.id));
    return project?.remote ? project : null;
  }

  function setGithubCommitError(error) {
    const box = $('#githubCommitError');
    if (!box) return;
    if (!error) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = githubError(error).message;
  }

  function openGithubCommitDialog(page) {
    const project = githubProjectFor(page);
    if (!project) return false;
    githubCommitState = { pageId: page.id, project, pull: null };
    setGithubCommitError(null);
    $('#githubCommitResult').hidden = true;
    $('#githubCommitSubmit').disabled = false;
    $('#githubCommitSubmit').textContent = 'Commit & open PR';
    const remote = project.remote;
    $('#githubCommitWhere').textContent =
      `${remote.owner}/${remote.repo} · ${page.remote.path} · from ${remote.ref}`;
    $('#githubCommitMessage').value = `Update ${String(page.remote.path).split('/').pop()}`;
    refs.githubCommitModal.classList.add('show');
    setTimeout(() => $('#githubCommitMessage')?.select(), 0);
    return true;
  }

  function closeGithubCommitDialog() {
    refs.githubCommitModal.classList.remove('show');
    githubCommitState = null;
  }

  async function submitGithubCommit() {
    const commitState = githubCommitState;
    const page = pageById(commitState?.pageId);
    if (!commitState || !page) return;
    const message = String($('#githubCommitMessage')?.value || '').trim();
    if (!message) { setGithubCommitError({ message: 'Write a commit message.' }); return; }
    setGithubCommitError(null);
    const submit = $('#githubCommitSubmit');
    submit.disabled = true;
    submit.textContent = 'Committing…';
    const remote = commitState.project.remote;
    try {
      const result = await github(window.electronAPI.github.commit({
        owner: remote.owner, repo: remote.repo, ref: remote.ref,
        path: page.remote.path, text: page.source, message, sha: page.remote.sha
      }));
      // The new blob replaces the old one, so a second save from this document
      // is checked against what was just committed rather than against the
      // version the editor was first shown.
      page.remote = { ...page.remote, sha: result.sha };
      page.loadedSource = page.source;
      renderAll(); persist();
      if (!githubCommitState) return;
      githubCommitState.pull = result.pull;
      $('#githubCommitPullUrl').textContent = result.pull.url;
      $('#githubCommitResult').hidden = !result.pull.number;
      submit.textContent = 'Committed';
      showToast(`Committed to ${result.branch}`);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = 'Commit & open PR';
      setGithubCommitError(error);
    }
  }

  async function mergeGithubPull() {
    const commitState = githubCommitState;
    const pull = commitState?.pull;
    if (!pull?.number) return;
    const button = $('#githubCommitMerge');
    button.disabled = true;
    button.textContent = 'Merging…';
    const remote = commitState.project.remote;
    try {
      const merged = await github(window.electronAPI.github.merge({
        owner: remote.owner, repo: remote.repo, number: pull.number
      }));
      if (!merged.merged) throw new Error(merged.message || 'GitHub did not merge that pull request.');
      button.textContent = 'Merged';
      showToast(`Merged pull request #${pull.number}`);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Merge';
      setGithubCommitError(error);
    }
  }

  // ----- Google Drive -----
  //
  // Deliberately shaped like the GitHub panel above, because to someone using
  // Leaf these are the same act: point at a remote place, see what is in it,
  // open a document. Two things underneath are not the same, and both surface
  // here rather than being smoothed over.
  //
  // The first is what a listing can contain. Leaf holds Google's drive.file
  // scope, which shows it only the files it created - the wider scopes are
  // "restricted" and cost a paid security assessment. So a fresh account lists
  // nothing, and that is the scope working, not a failure. The panel says so.
  //
  // The second is the sign-in itself: it happens in the user's browser, so this
  // has a waiting state that GitHub's paste-a-token flow never needed.

  const DRIVE_MIME = {
    html: 'text/html',
    markdown: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml'
  };

  let driveModalState = null;

  async function drive(call) {
    const reply = await call;
    if (reply && reply.ok) return reply.value;
    const error = new Error(reply?.message || 'Google Drive could not be reached.');
    error.kind = reply?.kind || 'unknown';
    throw error;
  }

  function driveError(error) {
    return {
      kind: error?.kind || 'unknown',
      message: String(error?.message || 'Google Drive could not be reached.')
    };
  }

  function setDriveError(error) {
    const box = $('#driveError');
    if (!box) return;
    if (!error) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = driveError(error).message;
  }

  async function openDriveModal() {
    driveModalState = { files: [], signingIn: false };
    setDriveError(null);
    const status = await drive(window.electronAPI.drive.status())
      .catch(() => ({ connected: false, storage: 'unavailable', configured: false }));
    driveModalState.status = status;
    renderDriveModal();
    refs.driveModal.classList.add('show');
    if (status.connected) loadDriveFiles();
  }

  function closeDriveModal() {
    // A sign-in still waiting on the browser has a loopback socket open behind
    // it. Closing the window has to take that down, or the next attempt binds a
    // second port and the first waits out its whole timeout.
    if (driveModalState?.signingIn) window.electronAPI.drive.cancelConnect().catch(() => {});
    refs.driveModal.classList.remove('show');
    driveModalState = null;
  }

  function renderDriveModal() {
    const modal = driveModalState;
    if (!modal) return;
    const connected = !!modal.status?.connected;
    $('#driveSignIn').hidden = connected;
    $('#drivePick').hidden = !connected;
    $('#driveDisconnect').hidden = !connected;
    $('#driveUpload').hidden = !connected;

    const account = $('#driveAccount');
    account.hidden = !modal.status?.account?.email;
    account.textContent = modal.status?.account?.email || '';

    const submit = $('#driveSubmit');
    submit.textContent = connected ? 'Open' : (modal.signingIn ? 'Waiting for your browser…' : 'Connect');
    submit.disabled = modal.signingIn || (connected && !modal.files.some(file => !file.isFolder));

    const note = $('#driveStorageNote');
    if (!modal.status?.configured) {
      note.textContent = 'This copy of Leaf has no Google OAuth client yet, so it cannot sign in.';
    } else if (modal.status?.storage === 'weak') {
      note.textContent = 'This system has no keyring, so the sign-in is stored with weak encryption.';
    } else if (modal.status?.storage === 'unavailable') {
      note.textContent = 'This system has no secure storage, so Leaf will not keep the sign-in.';
    } else {
      note.textContent = 'The sign-in is stored encrypted by your operating system.';
    }

    renderDriveFileList();
    renderDriveUploadChoices();
  }

  function renderDriveFileList() {
    const list = $('#driveFileList');
    const modal = driveModalState;
    if (!list || !modal) return;
    list.innerHTML = '';
    const files = modal.files.filter(file => !file.isFolder);
    if (!files.length) {
      const empty = document.createElement('p');
      empty.className = 'github-note';
      empty.textContent = modal.loading ? 'Looking…' : 'No files yet.';
      list.appendChild(empty);
      return;
    }
    for (const file of files) {
      const row = document.createElement('button');
      row.type = 'button';
      const name = document.createElement('span');
      name.textContent = file.name;
      const meta = document.createElement('span');
      meta.className = 'github-repo-meta';
      // A Google Doc can be read but never written back, so it says so here
      // rather than at the moment a save silently does nothing.
      meta.textContent = file.readOnly ? 'Google Doc · read-only' : (file.mimeType || '');
      row.append(name, meta);
      row.addEventListener('click', () => openDriveDocument([file]));
      list.appendChild(row);
    }
  }

  function renderDriveUploadChoices() {
    const select = $('#driveUploadPage');
    if (!select) return;
    const pages = state.documents.flatMap(document => (document.nodes || []))
      .filter(node => node.type === 'page' && !isBinaryPage(node) && !node.remote?.driveId);
    select.innerHTML = '';
    for (const page of pages) {
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = page.fileName || page.name;
      select.appendChild(option);
    }
    $('#driveUpload').disabled = !pages.length;
  }

  async function loadDriveFiles() {
    const modal = driveModalState;
    if (!modal) return;
    modal.loading = true;
    renderDriveFileList();
    try {
      const listing = await drive(window.electronAPI.drive.list({}));
      if (!driveModalState) return;
      driveModalState.files = listing.files || [];
    } catch (error) {
      if (driveModalState) setDriveError(error);
    } finally {
      if (driveModalState) { driveModalState.loading = false; renderDriveModal(); }
    }
  }

  async function connectDrive() {
    const modal = driveModalState;
    if (!modal) return;
    setDriveError(null);

    if (!modal.status?.connected) {
      modal.signingIn = true;
      renderDriveModal();
      try {
        const account = await drive(window.electronAPI.drive.connect());
        if (!driveModalState) return;
        driveModalState.signingIn = false;
        driveModalState.status = { ...driveModalState.status, connected: true, account };
        renderDriveModal();
        await loadDriveFiles();
        showToast(`Connected as ${account.email}`);
      } catch (error) {
        if (!driveModalState) return;
        driveModalState.signingIn = false;
        setDriveError(error);
        renderDriveModal();
      }
      return;
    }

    openDriveDocument(driveModalState.files.filter(file => !file.isFolder));
  }

  // A Drive file becomes the same kind of stub a GitHub file does: named and
  // listed straight away, downloaded only when someone opens it.
  function driveNodesFromFiles(files) {
    return (files || [])
      .filter(file => file && !file.isFolder)
      .map(file => ({
        id: uid('page'),
        type: 'page',
        name: file.name.replace(/\.[^.]+$/, '') || file.name,
        fileName: file.name,
        documentType: githubDocumentType(file.exportAs === 'text/html' ? `${file.name}.html` : file.name),
        source: '',
        loadedSource: '',
        isEmpty: true,
        remote: {
          driveId: file.id,
          readOnly: !!file.readOnly,
          mimeType: file.mimeType,
          loaded: false
        }
      }));
  }

  function openDriveDocument(files) {
    const nodes = driveNodesFromFiles(files);
    if (!nodes.length) { setDriveError({ message: 'Nothing Leaf can open here yet.' }); return; }
    const existing = state.documents.find(document => document.driveRoot);
    if (existing) {
      // Re-opening adds what is new rather than stacking a second Drive
      // document beside the first.
      const known = new Set((existing.nodes || []).map(node => node.remote?.driveId).filter(Boolean));
      const added = nodes.filter(node => !known.has(node.remote.driveId));
      existing.nodes.push(...added);
      state.selectedDocumentId = existing.id;
      focusDocument(existing);
      showToast(added.length ? `Added ${added.length} file${added.length === 1 ? '' : 's'}` : 'Already open');
    } else {
      const project = {
        id: uid('document'),
        name: 'Google Drive',
        color: '#1a73e8',
        filePath: null,
        expanded: true,
        driveRoot: true,
        nodes
      };
      state.documents.push(project);
      state.selectedDocumentId = project.id;
      focusDocument(project);
      showToast(`Opened ${nodes.length} file${nodes.length === 1 ? '' : 's'} from Drive`);
    }
    closeDriveModal();
    clearInspector();
    renderAll();
    persist();
  }

  async function uploadPageToDrive() {
    const modal = driveModalState;
    if (!modal) return;
    const page = pageById($('#driveUploadPage')?.value);
    if (!page) { setDriveError({ message: 'Choose a page to send.' }); return; }
    setDriveError(null);
    try {
      const file = await drive(window.electronAPI.drive.create({
        name: page.fileName || `${page.name}.html`,
        text: page.source || '',
        mimeType: DRIVE_MIME[page.documentType] || 'text/plain'
      }));
      // The page is now backed by that file, so Save writes back to it rather
      // than opening a file dialog.
      page.remote = { driveId: file.id, readOnly: false, mimeType: file.mimeType, loaded: true };
      persist();
      renderAll();
      showToast(`Sent ${file.name} to Drive`);
      await loadDriveFiles();
    } catch (error) { setDriveError(error); }
  }

  // Called when a stub Page is first bound to a view, exactly as the GitHub one
  // is. Everything downstream then sees an ordinary Page.
  async function ensureDrivePageLoaded(page) {
    if (!page?.remote?.driveId || page.remote.loaded) return false;
    try {
      const file = await drive(window.electronAPI.drive.read({ fileId: page.remote.driveId }));
      page.source = file.text;
      page.loadedSource = file.text;
      page.isEmpty = !file.text.trim();
      page.remote = { ...page.remote, readOnly: !!file.readOnly, loaded: true };
      persist();
      return true;
    } catch (error) {
      showToast(driveError(error).message);
      return false;
    }
  }

  // Save on a Drive-backed page writes back to Drive. Without this it would
  // fall through to the export dialog, and the user would end up with a local
  // copy that quietly stopped matching the file they opened.
  async function saveDrivePage(page) {
    if (page.remote?.readOnly) {
      showToast('This is a Google document. Google does not let Leaf write it back.');
      return false;
    }
    try {
      await drive(window.electronAPI.drive.write({ fileId: page.remote.driveId, text: page.source }));
      page.loadedSource = page.source;
      renderAll(); persist();
      showToast('Saved to Drive');
      return true;
    } catch (error) {
      showToast(driveError(error).message);
      return false;
    }
  }

  // ----- Splash -----
  // Blender's splash is a launcher rather than a progress bar: the app behind it
  // is already usable, every row does something, and clicking away dismisses it.
  function splashParentFolder(filePath){
    const parts=String(filePath||'').split(/[\\/]/).filter(Boolean);
    return parts.length>1?parts[parts.length-2]:'';
  }

  function renderSplash(){
    const version=document.documentElement.dataset.appVersion||'';
    const versionLabel=$('#splashVersion');
    if(versionLabel)versionLabel.textContent=version?`Version ${version}`:'';

    const newList=$('#splashNewList');
    if(newList){
      newList.innerHTML=Object.entries(NEW_PAGE_TYPES).map(([type,definition])=>
        `<button type="button" data-splash-new="${esc(type)}"><span class="splash-item-name">${esc(definition.label)} Page</span><span class="splash-item-note">.${esc(definition.extension)}</span></button>`
      ).join('');
      newList.querySelectorAll('[data-splash-new]').forEach(button=>{
        button.addEventListener('click',()=>{closeSplash();splashNewPage(button.dataset.splashNew);});
      });
    }

    const recentList=$('#splashRecentList');
    if(recentList){
      const recent=(state.recent||[]).slice(0,8);
      recentList.innerHTML=recent.length
        ? recent.map((item,index)=>
            `<button type="button" data-splash-recent="${index}" title="${esc(item.filePath||'')}"><span class="splash-item-name">${esc(item.name)}</span><span class="splash-item-note">${esc(splashParentFolder(item.filePath))}</span></button>`
          ).join('')
        : '<p class="splash-empty">No recent projects yet.</p>';
      recentList.querySelectorAll('[data-splash-recent]').forEach(button=>{
        button.addEventListener('click',()=>{
          const item=recent[Number(button.dataset.splashRecent)];
          if(!item)return;
          closeSplash();
          openRecentItem(item);
        });
      });
    }
  }

  // Same guard and the same call as the tree's own New Page, so a Page made from
  // the splash is indistinguishable from one made in the tree.
  function splashNewPage(documentType){
    const project=activeDocument();
    if(!project){showToast('Create or select a document first');return;}
    addEmptyPage(project,null,{asChild:false,documentType});
  }

  function openSplash(){
    renderSplash();
    refs.splashModal.classList.add('show');
    setTimeout(()=>refs.splashModal.querySelector('.splash-list button, .splash-link')?.focus(),0);
  }
  function closeSplash(){refs.splashModal.classList.remove('show');}

  $('#connectGithub')?.addEventListener('click',()=>{openGithubModal();});
  $('#githubCancel')?.addEventListener('click',closeGithubModal);
  $('#githubSubmit')?.addEventListener('click',()=>{connectGithubRepository();});
  $('#githubRepoInput')?.addEventListener('input',()=>{renderGithubRepoList();});
  $('#githubRepoInput')?.addEventListener('change',()=>{
    const [owner,repo]=String($('#githubRepoInput').value||'').split('/').map(part=>part.trim());
    if(owner&&repo)selectGithubRepository(owner,repo);
  });
  $('#githubMakeToken')?.addEventListener('click',()=>{
    // Scopes are pre-filled so nobody has to guess which boxes to tick.
    window.electronAPI.openExternalLink('https://github.com/settings/tokens/new?scopes=repo&description=Leaf')
      .catch(error=>showToast(`Could not open GitHub: ${error.message}`));
  });
  $('#githubPagesOpen')?.addEventListener('click',openGithubPagesSite);
  $('#githubDisconnect')?.addEventListener('click',async()=>{
    await github(window.electronAPI.github.disconnect()).catch(()=>{});
    if(githubModalState){githubModalState.status={connected:false,storage:githubModalState.status?.storage};renderGithubModal();}
    showToast('Signed out of GitHub');
  });
  refs.githubModal.addEventListener('click',event=>{
    if(event.target===refs.githubModal)closeGithubModal();
  });
  refs.githubModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.githubModal,event);
    if(event.key==='Escape'){event.preventDefault();closeGithubModal();}
    if(event.key==='Enter'&&event.target.tagName!=='BUTTON'){event.preventDefault();connectGithubRepository();}
  });

  $('#githubCommitCancel')?.addEventListener('click',closeGithubCommitDialog);
  $('#githubCommitSubmit')?.addEventListener('click',()=>{submitGithubCommit();});
  $('#githubCommitMerge')?.addEventListener('click',()=>{mergeGithubPull();});
  refs.githubCommitModal.addEventListener('click',event=>{
    if(event.target===refs.githubCommitModal)closeGithubCommitDialog();
  });
  refs.githubCommitModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.githubCommitModal,event);
    if(event.key==='Escape'){event.preventDefault();closeGithubCommitDialog();}
    if(event.key==='Enter'&&event.target.tagName!=='BUTTON'){event.preventDefault();submitGithubCommit();}
  });
  $('#driveCancel')?.addEventListener('click',closeDriveModal);
  $('#driveSubmit')?.addEventListener('click',()=>{connectDrive();});
  $('#driveUpload')?.addEventListener('click',()=>{uploadPageToDrive();});
  $('#driveDisconnect')?.addEventListener('click',async()=>{
    await drive(window.electronAPI.drive.disconnect()).catch(()=>{});
    if(driveModalState){
      driveModalState.status={...driveModalState.status,connected:false,account:null};
      driveModalState.files=[];
      renderDriveModal();
    }
    showToast('Signed out of Google Drive');
  });
  refs.driveModal.addEventListener('click',event=>{
    if(event.target===refs.driveModal)closeDriveModal();
  });
  refs.driveModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.driveModal,event);
    if(event.key==='Escape'){event.preventDefault();closeDriveModal();}
    if(event.key==='Enter'&&event.target.tagName!=='BUTTON'){event.preventDefault();connectDrive();}
  });

  refs.splashModal.addEventListener('click',event=>{
    if(event.target===refs.splashModal)closeSplash();
  });
  refs.splashModal.addEventListener('keydown',event=>{
    trapDialogFocus(refs.splashModal,event);
    if(event.key==='Escape'){event.preventDefault();closeSplash();}
  });
  refs.splashModal.querySelectorAll('[data-splash-action]').forEach(button=>{
    button.addEventListener('click',()=>{
      const action=button.dataset.splashAction;
      closeSplash();
      handleAction(action).catch(error=>{
        console.error('Splash action failed',action,error);
        showToast(`Could not run ${action}`);
      });
    });
  });

  // ----- Modal -----
  function openModal(title,desc,placeholder,initial,action){$('#modalTitle').textContent=title;$('#modalDesc').textContent=desc;$('#modalInput').placeholder=placeholder;$('#modalInput').value=initial||'';modalAction=action;$('#inputModal').classList.add('show');setTimeout(()=>$('#modalInput').focus(),0);}
  function closeModal(){$('#inputModal').classList.remove('show');modalAction=null;}
  $('#modalCancel').onclick=closeModal;
  $('#modalConfirm').onclick=()=>{
    const value=$('#modalInput').value.trim();
    const action=modalAction;
    if(!value || !action) return;
    // Close first so a downstream render error can never strand the dialog or
    // accidentally submit the same action twice.
    closeModal();
    try{ action(value); }
    catch(error){ console.error('Dialog action failed',error);showToast(`Action failed: ${error.message}`); }
  };
  $('#modalInput').onkeydown=e=>{if(e.key==='Enter')$('#modalConfirm').click();if(e.key==='Escape')closeModal();};

  function trapDialogFocus(container,e){
    if(e.key!=='Tab' || !container.classList.contains('show')) return;
    const focusables=[...container.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')];
    if(!focusables.length) return;
    const first=focusables[0],last=focusables[focusables.length-1];
    if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }
  $('#inputModal').addEventListener('keydown',e=>{trapDialogFocus($('#inputModal'),e);if(e.key==='Escape')closeModal();});
  refs.viewportSizeModal.addEventListener('keydown',e=>{
    trapDialogFocus(refs.viewportSizeModal,e);
  });

  // ----- Keyboard shortcuts -----
  document.addEventListener('keydown',e=>{
    const editing=e.target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName);
    const dialogOpen=!!document.querySelector('.modal-backdrop.show');
    const modifier=e.ctrlKey||e.metaKey;
    if(!dialogOpen&&modifier&&e.key.toLowerCase()==='f'){
      const search=activeViewSearchInput();
      if(search){e.preventDefault();search.focus();search.select();return;}
    }
    if(!dialogOpen && e.key==='Escape' && inlineTextEditSession){e.preventDefault();endInlineTextEdit({commit:false});return;}
    if(!dialogOpen && e.key==='Escape' && SelectionManager.items().length){e.preventDefault();clearInspector();return;}
    if(!dialogOpen && (e.key==='Delete'||e.key==='Del') && !editing && SelectionManager.items().length){e.preventDefault();deleteSelectedElements();return;}
    if(!dialogOpen && e.key==='Enter' && !editing && !modifier && SelectionManager.items().length){e.preventDefault();editSelectedText();return;}
    if(!dialogOpen && e.key==='F2' && !editing && SelectionManager.items().length){e.preventDefault();SelectionManager.source==='hierarchy'?beginHierarchyRename():editSelectedText();return;}
    if(!dialogOpen && e.key.toLowerCase()==='f' && !editing && !modifier && SelectionManager.items().length){e.preventDefault();revealSelectedObject();return;}
    if(!dialogOpen && modifier && !editing && SelectionManager.items().length && e.key.toLowerCase()==='c'){e.preventDefault();copySelectedElements();return;}
    if(!dialogOpen && modifier && !editing && e.key.toLowerCase()==='v'){e.preventDefault();pasteSelectedElements();return;}
    if(!dialogOpen && modifier && !editing && !e.repeat && SelectionManager.items().length && e.key.toLowerCase()==='d'){e.preventDefault();duplicateSelectedElements();return;}
    if(modifier&&e.shiftKey&&e.key.toLowerCase()==='n'){e.preventDefault();newPage();}
    else if(modifier&&e.key.toLowerCase()==='n'){e.preventDefault();newProject();}
    if(modifier&&e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();saveLeafProject(true);}
    else if(modifier&&e.key.toLowerCase()==='s'){e.preventDefault();saveLeafProject(false);}
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
    // Redo is Ctrl+Y only - the key most Windows apps use, and this ships
    // Windows-first. Ctrl+Shift+Z is deliberately inert rather than falling
    // through to undo.
    else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
  });

  function repairViews(){
    const first=pageList()[0]?.page.id||null;
    state.views=state.views||{};
    ['single','left','right','codePreview','codePage'].forEach(k=>{
      if(!state.views[k] || !pageById(state.views[k])) state.views[k]=first;
    });
    if(state.mode==='split'&&pageById(state.views.left)&&samePageDocument(state.views.left,state.views.right))ensureDistinctSplitBindings(state.views.left);
    activeSlots=activeSlots||{split:'left',code:'preview'};
    if(!['left','right'].includes(activeSlots.split)) activeSlots.split='left';
    if(!['preview','editor'].includes(activeSlots.code)) activeSlots.code='preview';
  }
  function renderCrumbs(){
    const project=state.projectName||'Leaf Project';
    const document_=activeDocument()?.name||'No Document';
    refs.crumbs.innerHTML=`<button type="button" class="crumb crumb-project" data-crumb-kind="project">${esc(project)}</button>`+
      `<span class="crumb-sep">/</span><span class="crumb-document">${esc(document_)}</span>`;
  }

  refs.crumbs?.addEventListener('click',event=>{
    if(!event.target.closest?.('.crumb-project'))return;
    withUnsavedInspectorGuard(()=>{
      selectedTreeNode=null;
      clearInspector();
      renderTree();
      renderCrumbs();
      refs.tree?.focus({preventScroll:true});
      persist();
    });
  });
  function renderAll(){
    repairViews();
    renderViewMode();
    updateClearButtons();
    renderCrumbs();
    renderAllTocPanels();
  }

  $$('[data-edit-save]').forEach(button=>button.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();
    const slot=button.dataset.editSave;
    const page=pageById(pageIdForSlot(slot));
    if(!page?.sourcePath){showToast('This Page has no original file yet - use Save As');return;}
    // A PDF's annotations live inside the plugin, not in page.source, so the app
    // has nothing of its own to write. Arming the capture turns the viewer's own
    // Save into a write back onto this Page's file.
    if(page.documentType==='pdf'){
      try{
        await window.electronAPI.armPdfAnnotationSave({sourcePath:page.sourcePath,url:page.previewUrl||''});
        showToast('Use the PDF toolbar Save to write your annotations back to this Page');
      }catch(error){ showToast(`Could not arm the PDF save: ${error.message}`); }
      return;
    }
    setHtmlEditEnabled(false,slot);
    await savePage(false);
  }));

  $$('[data-edit-cancel]').forEach(button=>button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    cancelHtmlEdit(button.dataset.editCancel);
  }));
  $('#cancelEditKeep')?.addEventListener('click',closeCancelEditDialog);
  $('#cancelEditConfirm')?.addEventListener('click',()=>{
    const slot=pendingEditCancel;
    closeCancelEditDialog();
    if(!slot)return;
    restoreEditSessionSnapshot();
    setHtmlEditEnabled(false,slot);
    showToast('Edits discarded');
  });
  refs.cancelEditModal?.addEventListener('keydown',event=>{
    trapDialogFocus(refs.cancelEditModal,event);
    if(event.key==='Escape')closeCancelEditDialog();
  });

  $('#quickAddDocument').onclick=newDocument;
  clearInspector();
  applyPreferences();

  $('#tableAddRow')?.addEventListener('click',addTableRow);
  $('#tableAddColumn')?.addEventListener('click',addTableColumn);
  $('#tableDeleteRow')?.addEventListener('click',deleteTableRow);
  $('#tableDeleteColumn')?.addEventListener('click',deleteTableColumn);
  $('#tableToggleHeaderRow')?.addEventListener('click',toggleTableHeaderRow);
  $('#tableMergeRight')?.addEventListener('click',mergeCellRight);
  $('#tableUnmerge')?.addEventListener('click',unmergeCell);

  renderPreviewDevicePresetOptions();
  installPreviewOrientationButtons();
  installPreviewZoomControls();
  installDropZoneUrlFields();
  renderObjectsPalette();
  renderAll();
  updateAllPreviewZoomIndicators();
  requestAnimationFrame(()=>{renderAllPreviewSizes();updateAllPreviewZoomIndicators();renderHierarchy();});
  persist();
  performance.mark('leaf-renderer-ready');
  performance.measure('leaf-renderer-bootstrap','leaf-renderer-start','leaf-renderer-ready');
  setTimeout(()=>{
    document.documentElement.dataset.leafReady='true';
    const startup=$('#appStartup');startup?.classList.add('is-complete');
    setTimeout(()=>startup?.remove(),220);
    if(state.preferences.splash!==false)openSplash();
    emitLifecycle('leaf-renderer-ready',{});
  },0);
})();
