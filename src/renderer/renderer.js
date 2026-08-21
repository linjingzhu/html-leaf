(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const ROOT = null;
  const stateKey = 'leaf-v0-5-15-state';

  const refs = {
    workspace: $('#workspace'), tree: $('#tree'), inspector: $('#inspector'),
    inspectorBody: $('#inspectorBody'), inspectorActions: $('#inspectorActions'),
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
    replaceHtmlModal: $('#replaceHtmlModal'), replaceHtmlTarget: $('#replaceHtmlTarget'),
    jiraExportModal: $('#jiraExportModal'), jiraExportSource: $('#jiraExportSource'),
    jiraExportRuntime: $('#jiraExportRuntime'), jiraExportStats: $('#jiraExportStats'),
    jiraExportWarnings: $('#jiraExportWarnings'), jiraRichPreview: $('#jiraRichPreview'),
    jiraTextPreview: $('#jiraTextPreview'),
    leftHorizontalSplitter: $('#leftHorizontalSplitter'), hierarchyTree: $('#hierarchyTree'),
    objectsList: $('#objectsList'), usedComponentsList: $('#usedComponentsList'), usedComponentPreviewFrame: $('#usedComponentPreviewFrame'), usedComponentPreviewName: $('#usedComponentPreviewName'),
    usedPreviewSplitter: $('#usedPreviewSplitter'), toggleUsedPreview: $('#toggleUsedPreview'),
    objectContextMenu: $('#objectContextMenu'), treeAddMenu: $('#treeAddMenu'), jiraCheckPopover: $('#jiraCheckPopover'),
    tableToolbar: $('#tableToolbar'), exportElementBtn: $('#exportElementBtn'),
    objectExportModal: $('#objectExportModal'), objectExportFormat: $('#objectExportFormat'), objectExportScale: $('#objectExportScale'), objectExportSummary: $('#objectExportSummary'),
    atlassianPreviewToolbar: $('#atlassianPreviewToolbar'), atlassianPreviewActions: $('#atlassianPreviewActions'),
    atlassianPreviewSource: $('#atlassianPreviewSource'), atlassianFileInput: $('#atlassianFileInput')
  };

  resetPersistedEditorState();
  let state = normalizeState(createDefaultState());
  let selectedTreeNode = state.selectedTreeNode || null;
  let activeSlots = state.activeSlots || { split:'left', code:'preview' };
  let selectedElement = null;
  let selectedElementFrame = null;
  let selectedElements = new Set();
  const frameSelectionRenderers = new WeakMap();
  let inlineTextEditSession = null;

  const SelectionManager={
    source:null,
    items(){
      selectedElements=new Set([...selectedElements].filter(element=>element?.isConnected));
      return [...selectedElements];
    },
    has(element){ return selectedElements.has(element); },
    select(element,frame,source='unknown',{toggle=false}={}){
      if(!element || ['HTML','BODY'].includes(element.tagName)) return selectedElement;
      if(inlineTextEditSession && inlineTextEditSession.element!==element) endInlineTextEdit();
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
      version:'0.5.15',
      projectName:'Untitled Leaf Project',
      projectFilePath:null,
      mode:'preview',
      preferences:{ language:'ko', scale:1, theme:'dark', inspectorCollapsed:false, sidebarWidth:260, inspectorWidth:290, inspectorPreview:true, hierarchyNameMode:true, usedPreviewVisible:true },
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
    s.version='0.5.15';
    s.projectName=String(s.projectName||s.documentName||fallback.projectName);
    s.projectFilePath=typeof s.projectFilePath==='string'?s.projectFilePath:(typeof s.documentFilePath==='string'?s.documentFilePath:null);
    s.mode=['preview','split','code'].includes(s.mode) ? s.mode : 'preview';
    s.preferences={...fallback.preferences,...(s.preferences||{})};
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
      if(page.type==='page'){
        page.source=String(page.source||'');page.name=String(page.name||'Untitled Page');page.fileName=String(page.fileName||'untitled.html');
        if(typeof page.loadedSource!=='string') page.loadedSource=String(page.source||'');
        if(!['html','markdown','pdf'].includes(page.documentType)){
          page.documentType=/\.pdf$/i.test(page.fileName||'')?'pdf':/\.(md|markdown)$/i.test(page.fileName||'')?'markdown':'html';
        }
        if(page.documentType==='pdf'&&page.sourcePath&&!page.previewUrl)page.previewUrl=`file:///${String(page.sourcePath).replace(/\\/g,'/')}`;
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
        .filter(key=>/^hbe-(?:v[\d-]+|v0-[\d-]+)-state$/.test(key))
        .forEach(key=>localStorage.removeItem(key));
    }catch(error){
      console.warn('Editor state reset skipped',error);
    }
  }

  function loadState(){
    try {
      const v = localStorage.getItem(stateKey) || localStorage.getItem('hbe-v0-5-3-state') || localStorage.getItem('hbe-v0-5-2-state') || localStorage.getItem('hbe-v0-5-0-state') || localStorage.getItem('hbe-v4-3-state') || localStorage.getItem('hbe-v4-2-state') || localStorage.getItem('hbe-v4-1-state') || localStorage.getItem('hbe-v4-0-state') || localStorage.getItem('hbe-v3-9-state') || localStorage.getItem('hbe-v3-8-state') || localStorage.getItem('hbe-v3-7-state') || localStorage.getItem('hbe-v3-6-state') || localStorage.getItem('hbe-v3-5-state') || localStorage.getItem('hbe-v3-4-state') || localStorage.getItem('hbe-v3-3-state') || localStorage.getItem('hbe-v3-2-state') || localStorage.getItem('hbe-v3-1-state') || localStorage.getItem('hbe-v3-state');
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }
  function persist(){
    state.selectedTreeNode = selectedTreeNode;
    state.activeSlots = activeSlots;
    localStorage.setItem(stateKey, JSON.stringify(state));
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

  function showToast(text){
    refs.toast.textContent=text; refs.toast.classList.add('show');
    clearTimeout(showToast.t); showToast.t=setTimeout(()=>refs.toast.classList.remove('show'),1500);
  }

  function applyPreferences(){
    document.body.dataset.theme = state.preferences.theme || 'dark';
    document.documentElement.style.setProperty('--ui-scale', state.preferences.scale || 1);
    $$('.lang-ko').forEach(e=>e.textContent=state.preferences.language==='ko'?'✓':'');
    $$('.lang-en').forEach(e=>e.textContent=state.preferences.language==='en'?'✓':'');
    $$('.theme-dark').forEach(e=>e.textContent=state.preferences.theme==='dark'?'✓':'');
    $$('.theme-light').forEach(e=>e.textContent=state.preferences.theme==='light'?'✓':'');
    sidebarWidth = state.preferences.sidebarWidth || 260;
    inspectorWidth = state.preferences.inspectorWidth || 290;
    splitRatio = state.layout?.splitRatio ?? 0.5;
    codeRatio = state.layout?.codeRatio ?? 0.5;
    usedPreviewRatio = state.layout?.usedPreviewRatio ?? 0.42;
    inspectorPreviewEnabled = true;
    state.preferences.inspectorPreview = true;
    updateWorkspaceColumns();
    updateInspectorEditControls();
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

  $$('[data-pref-lang]').forEach(button=>{
    button.addEventListener('click',()=>{
      state.preferences.language=button.dataset.prefLang;
      applyPreferences(); persist(); closeAllMenus();
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
      state.preferences.theme=button.dataset.prefTheme;
      applyPreferences(); persist(); closeAllMenus();
    });
  });

  async function handleAction(action){
    switch(action){
      case 'new-page': return newPage();
      case 'new-document': return newDocument();
      case 'save-page': return savePage(false);
      case 'save-page-as': return savePage(true);
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
            showToast('Recent project is no longer available');
          }finally{
            closeAllMenus();
          }
        });
      });
    });
  }

  // ----- Project / Documents / Pages -----
  function documentSerializable(project){
    const p=clone(project); return p;
  }

  function leafProjectSerializable(){
    return {format:'leaf-project',version:'0.5.15',name:state.projectName||'Leaf Project',documents:clone(state.documents)};
  }

  function loadLeafProjectPayload(payload,filePath){
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
      const filePath=forceAs||!state.projectFilePath
        ?await window.electronAPI.saveProjectAs({suggestedName:`${exportSafeName(state.projectName||'project')}.leaf`,project:payload})
        :await window.electronAPI.saveProject({filePath:state.projectFilePath,project:payload});
      if(!filePath)return false;
      state.projectFilePath=filePath;state.projectName=filePath.split(/[\\/]/).pop().replace(/\.leaf$/i,'')||state.projectName;
      addRecent(filePath,state.projectName);renderAll();persist();showToast('Leaf project saved');return true;
    }catch(error){console.error('Leaf project save failed',error);showToast(`Save failed: ${error.message}`);return false;}
  }

  function isNodeInActiveViewport(nodeId){
    return !!nodeId && nodeId===currentActivePageId();
  }

  function activePageSlot(){
    return state.mode==='preview'?'single':state.mode==='split'?activeSlots.split:(activeSlots.code==='preview'?'codePreview':'codePage');
  }

  function newPage(){
    withUnsavedInspectorGuard(()=>{
      const project=activeDocument();
      if(!project){showToast('Create or select a document first');return;}
      openModal('New Page','Create an empty HTML page inside the selected document.','Page name','Untitled Page',name=>{
        const context=selectedContext();
        const parentId=context.project?.id===project.id&&context.node?.type==='group'?context.node.id:(context.project?.id===project.id?context.node?.parentId||null:null);
        const page={
          id:uid('page'),type:'page',name,fileName:`${exportSafeName(name)}.html`,documentType:'html',
          parentId,order:children(project,parentId).length,source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true
        };
        project.nodes.push(page);project.expanded=true;state.selectedDocumentId=project.id;selectedTreeNode=page.id;
        const slot=activePageSlot();state.views[slot]=page.id;
        if(state.mode==='code'){state.views.codePreview=page.id;state.views.codePage=page.id;}
        clearInspector();activateLeftTab('project');renderAll();persist();showToast('New page created');
      });
    });
  }

  async function newDocument(){
    withUnsavedInspectorGuard(()=>{
      openModal(
        'New Document',
        'Create a document with an Empty Page inside the current Leaf Project.',
        'Document name',
        'New Document',
        name=>{
          const pageId=uid('page');
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
          project.expanded=true;
          activateLeftTab('project');
          renderTree();
          renderAll();
          persist();
          showToast('New document created');
        }
      );
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

  async function savePage(forceAs){
    const page=pageById(currentActivePageId());
    if(!page){showToast('Select a page first');return false;}
    if(page.documentType==='pdf'&&!forceAs){showToast('PDF pages are read-only. Use Save As to copy the file.');return false;}
    return new Promise(resolve=>{
      withUnsavedInspectorGuard(async()=>{
        try{
          let filePath=null;
          if(page.documentType==='pdf'){
            filePath=await window.electronAPI.copyDocumentAs({sourcePath:page.sourcePath,suggestedName:page.fileName||`${page.name}.pdf`});
          }else if(page.documentType==='markdown'){
            filePath=forceAs||!page.sourcePath
              ?await window.electronAPI.exportText({title:'Save Markdown Page',suggestedName:page.fileName||`${page.name}.md`,extension:/\.markdown$/i.test(page.fileName||'')?'markdown':'md',source:page.source})
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
    state.views[slot]=page.id;
    if(slot==='single') state.views.single=page.id;
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

  function isSupportedDocumentFile(file){return !!file&&/\.(html?|md|markdown|pdf)$/i.test(file.name||'');}

  async function importDroppedPages(event,project,parentId=null){
    const files=[...(event.dataTransfer?.files||[])].filter(isSupportedDocumentFile);
    if(!files.length){showToast('Drop HTML, Markdown, or PDF pages');return;}
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

  function renderTree(){
    refs.tree.innerHTML='';
    state.documents.forEach((project)=>{
      const card=document.createElement('div');
      card.className='document-card';
      card.dataset.documentId=project.id;
      card.style.setProperty('--document-color', project.color || '#395a88');

      const row=document.createElement('div');
      row.className=`tree-row document ${state.selectedDocumentId===project.id && !selectedTreeNode?'selected':''}`;
      row.dataset.documentId=project.id; row.dataset.depth=0; row.draggable=true;
      row.innerHTML=`<span class="twisty">${project.expanded!==false?'▾':'▸'}</span><span class="document-swatch" style="background:${project.color}" title="Change document color"></span><span class="label">${esc(project.name)}</span><button class="tree-row-add" type="button" title="Add Page or Group">＋</button>`;
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
      if(project.expanded!==false) walkTree(project,null,1,card);
      refs.tree.appendChild(card);
    });
  }

  refs.tree.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types?.includes('Files'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  });
  refs.tree.addEventListener('drop',event=>{
    if(!event.dataTransfer?.files?.length)return;
    event.preventDefault();event.stopPropagation();
    const project=activeDocument();if(project)importDroppedPages(event,project,null);
  });

  function walkTree(project,parentId,depth,container){
    children(project,parentId).forEach(node=>{
      const row=document.createElement('div');
      row.className='tree-row';
      row.dataset.nodeId=node.id; row.dataset.depth=Math.min(depth,5);
      if(node.id===selectedTreeNode) row.classList.add('selected');
      if(node.id===state.views.left) row.classList.add('view-left');
      if(node.id===state.views.right) row.classList.add('view-right');
      if(node.id===state.views.codePreview) row.classList.add('view-code-preview');
      if(node.id===state.views.codePage) row.classList.add('view-code-editor');
      if(isNodeInActiveViewport(node.id)) row.classList.add('active-viewport-node');
      const hasChildren=children(project,node.id).length;
      row.draggable=true;
      const documentIcon=node.documentType==='pdf'?'PDF':node.documentType==='markdown'?'MD':'◇';
      row.innerHTML=`<span class="twisty">${hasChildren?(node.expanded!==false?'▾':'▸'):''}</span><span class="ico ${node.type==='page'?'page-kind':''}">${node.type==='group'?'▰':documentIcon}</span><span class="label">${esc(node.name)}</span><button class="tree-row-add" type="button" title="Add child">＋</button>`;
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
      if(hasChildren && node.expanded!==false) walkTree(project,node.id,depth+1,container);
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
    if(action==='page')addEmptyPage(project,node,{asChild:true});
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
  function addEmptyPage(project,targetNode,{asChild=false}={}){
    if(!project)return;
    withUnsavedInspectorGuard(()=>{
      const parentId=asChild?(targetNode?.id||null):(targetNode?.type==='group'?targetNode.id:(targetNode?.parentId||null));
      openModal('Add Empty Page','Create a blank page placeholder. Drop an HTML file from Explorer to load it.','Page name','Empty Page',name=>{
        const page={id:uid('page'),type:'page',name,fileName:'untitled.html',documentType:'html',parentId,order:children(project,parentId).length,source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true};
        project.nodes.push(page);selectedTreeNode=page.id;
        if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
        const slot=state.mode==='preview'?'single':state.mode==='split'?activeSlots.split:(activeSlots.code==='preview'?'codePreview':'codePage');
        state.views[slot]=page.id;
        clearInspector();
        renderAll();persist();
      });
    });
  }
  function addGroup(project,targetNode,{asChild=false}={}){
    if(!project)return;
    const parentId=asChild?(targetNode?.id||null):(targetNode?.type==='group'?targetNode.id:(targetNode?.parentId||null));
    openModal('Add Group','Create a group in the selected hierarchy.','Group name','New Group',name=>{
      const group={id:uid('group'),type:'group',name,parentId,order:children(project,parentId).length,expanded:true};
      project.nodes.push(group);selectedTreeNode=group.id;state.selectedDocumentId=project.id;
      if(parentId){const parent=project.nodes.find(node=>node.id===parentId);if(parent)parent.expanded=true;}
      renderAll();persist();
    });
  }


  // ----- Viewport zoom -----
  const PREVIEW_ZOOM_MIN=5;
  const PREVIEW_ZOOM_MAX=200;
  const PREVIEW_ZOOM_STEP=10;

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

  function applyPreviewZoom(slot){
    const surface=$(`[data-preview-surface="${slot}"]`);
    const canvas=$(`[data-preview-canvas="${slot}"]`);
    if(!surface || !canvas) return false;
    const zoom=previewZoomForSlot(slot);
    surface.style.zoom=String(zoom/100);
    canvas.classList.toggle('is-zoomed',zoom!==100);
    canvas.classList.toggle('is-fit',state.previewZoomMode?.[slot]==='fit');
    updatePreviewZoomIndicator(slot);
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
      indicator.replaceWith(control);
      control.append(out,inputIndicator,inside);
      control.insertAdjacentElement('afterend',fit);
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
      const canvas=$(`[data-preview-canvas="${slot}"]`);
      canvas?.addEventListener('wheel',event=>{
        if(!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        const direction=event.deltaY<0?1:-1;
        setPreviewZoom(slot,previewZoomForSlot(slot)+(direction*PREVIEW_ZOOM_STEP),{anchor:{clientX:event.clientX,clientY:event.clientY}});
      },{passive:false});
    });
    updateAllPreviewZoomIndicators();

    if('ResizeObserver' in window){
      const observer=new ResizeObserver(entries=>{
        entries.forEach(entry=>{
          const slot=entry.target.dataset.previewCanvas;
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
    return clone.outerHTML;
  }

  function usedComponentSignature(element){
    if(!element||['HTML','BODY'].includes(element.tagName))return null;
    return sanitizedUsedComponentHtml(element).replace(/\s+/g,' ').trim();
  }

  function extractUsedComponents(){
    const frame=activeStaticFrame();
    let doc=null;try{doc=frame?.contentDocument}catch{}
    if(!doc?.body || frame?.dataset.previewRuntime==='interactive-isolated') return [];
    const selector='[data-hbe-object],[data-hbe-name],main,article,section,aside,header,footer,nav,figure,table,blockquote,pre,button,h1,h2,h3,h4,h5,h6,p';
    const candidates=[...new Set([...doc.body.children,...doc.body.querySelectorAll(selector)])]
      .filter(element=>!element.dataset?.editorOverlay && !['SCRIPT','STYLE','BASE','LINK','META'].includes(element.tagName));
    const groups=new Map();
    candidates.forEach(element=>{
      const html=sanitizedUsedComponentHtml(element);
      if(!html.trim()) return;
      const signature=html.replace(/\s+/g,' ').trim();
      const existing=groups.get(signature);
      if(existing){existing.count+=1;return;}
      groups.set(signature,{signature,html,label:objectDisplayName(element),tag:element.tagName.toLowerCase(),count:1});
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
      <div class="object-item used-component-item ${token===selectedUsedComponentToken?'selected':''}" draggable="true" data-used-component="${token}" title="Drag to reuse this component">
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
    renderUsedComponentPreview();
  }

  function syncUsedSelectionFromElement(element){
    usedDocumentSelectionSignature=usedComponentSignature(element);
    if(document.querySelector('[data-left-panel="used"]')?.classList.contains('active'))renderUsedComponents();
  }

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
    if(name==='used') renderUsedComponents();
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

  function hierarchyNodeId(el){
    return el.getAttribute('data-hbe-id') || ensureInspectorElementId(el);
  }

  function hierarchyChildren(el){
    const meaningful=new Set(['MAIN','ARTICLE','SECTION','ASIDE','H1','H2','H3','H4','H5','H6','P','UL','OL','TABLE','PRE','BLOCKQUOTE','IMG','DIV','FIGURE','HR']);
    const result=[];
    [...el.children].forEach(child=>{
      if(child.dataset?.editorOverlay || child.dataset?.adfMarker) return;
      if(meaningful.has(child.tagName)||child.hasAttribute('data-hbe-object')) result.push(child);
      else result.push(...hierarchyChildren(child));
    });
    return result;
  }

  function renderHierarchy(){
    const frame=activeStaticFrame();
    if(!frame||frame.dataset.previewRuntime==='interactive-isolated'){
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
    doc?.querySelectorAll('[data-hbe-drop-line]').forEach(el=>el.remove());
  }

  function bindObjectDropToFrame(frame){
    frame.addEventListener('load',()=>{
      if(frame.dataset.previewRuntime==='interactive-isolated')return;
      let doc=null;try{doc=frame.contentDocument}catch{}if(!doc)return;

      doc.addEventListener('dragover',e=>{
        const hasTemplate=e.dataTransfer.types.includes('application/x-hbe-object-template');
        const hasUsed=e.dataTransfer.types.includes('application/x-hbe-used-component');
        if(!hasTemplate&&!hasUsed)return;
        e.preventDefault();e.dataTransfer.dropEffect='copy';
        clearViewportDropFeedback(doc);
        const target=e.target.closest?.('[data-hbe-object],main,article,section,aside,div,p,h1,h2,h3,h4,h5,h6,table,pre,blockquote')||doc.body;
        if(window.WidgetRegistry.canContain(target))target.classList.add('viewport-object-drop-target');
      },true);

      doc.addEventListener('dragleave',e=>{if(e.target===doc.documentElement)clearViewportDropFeedback(doc)},true);

      doc.addEventListener('drop',e=>{
        const raw=e.dataTransfer.getData('application/x-hbe-object-template');
        const usedRaw=e.dataTransfer.getData('application/x-hbe-used-component');
        if(!raw&&!usedRaw)return;
        e.preventDefault();
        clearViewportDropFeedback(doc);
        let payload=null;try{payload=JSON.parse(raw||usedRaw)}catch{}
        const element=raw?window.WidgetRegistry.create(payload?.type,doc):createUsedComponent(payload,doc);
        if(!element)return;

        const target=e.target.closest?.('[data-hbe-object],main,article,section,aside,div,p,h1,h2,h3,h4,h5,h6,table,pre,blockquote')||doc.body;
        if(window.WidgetRegistry.canContain(target)){
          target.appendChild(element);
        }else{
          target.parentNode?.insertBefore(element,target.nextSibling);
        }

        const page=pageById(frameToPageId(frame));
        commitDomMutation(frame,page,element,'viewport-drop');
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

  function setModePanelVisibility(){
    $$('[data-mode-panel]').forEach(panel=>{
      panel.classList.toggle('is-active', panel.dataset.modePanel===state.mode);
    });
  }

  function ensureDistinctSplitBindings(preferredLeftId){
    const leftId=pageById(preferredLeftId)?preferredLeftId:(pageList()[0]?.page.id||null);
    state.views.left=leftId;
    if(pageById(state.views.right)&&state.views.right!==leftId)return;
    const alternate=pageList().map(item=>item.page).find(page=>page.id!==leftId);
    if(alternate){state.views.right=alternate.id;return;}
    const project=nodeById(leftId)?.project||activeDocument();
    if(!project)return;
    const page={id:uid('page'),type:'page',name:'Split Right',fileName:'untitled.html',documentType:'html',parentId:null,order:children(project,null).length,source:'',loadedSource:'',baseUrl:null,sourcePath:null,previewUrl:null,isEmpty:true};
    project.nodes.push(page);state.views.right=page.id;
  }

  function renderViewMode(){
    repairViews();
    $$('#viewSeg button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
    setModePanelVisibility();

    if(state.mode==='preview'){
      renderFrame(refs.singleFrame,state.views.single);
      $('#singlePageName').textContent=pageById(state.views.single)?.name||'';
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
          if(key==='codePreview'||key==='codePage'){
            // Code Preview and Source are one editing transaction, never two
            // independently selected documents.
            state.views.codePreview=nextPageId;
            state.views.codePage=nextPageId;
          }else{
            if(state.mode==='split'&&key==='left'&&nextPageId===state.views.right)state.views.right=previousPageId;
            if(state.mode==='split'&&key==='right'&&nextPageId===state.views.left)state.views.left=previousPageId;
            state.views[key]=nextPageId;
          }
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
      if(state.mode==='preview'){
        state.views.single=pageId;
      } else if(state.mode==='split'){
        state.views[activeSlots.split==='right'?'right':'left']=pageId;
      } else if(state.mode==='code'){
        state.views[activeSlots.code==='preview'?'codePreview':'codePage']=pageId;
      }

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
    return !!page && !page.isEmpty && (page.documentType==='pdf'?!!(page.previewUrl||page.sourcePath):!!String(page.source||'').trim());
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
        addEventListener('message', event => {
          if(event.data && event.data.__hbeSnapshotRequest===TOKEN) sendSnapshot();
        });
        addEventListener('pointerdown', () => {
          parent.postMessage({__hbeViewportInput:true,token:TOKEN,kind:'activate'}, '*');
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
    const base=page.baseUrl?`<base href="${esc(page.baseUrl)}">`:'';
    const csp=allowScripts
      ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; connect-src 'none'; object-src 'none'; frame-src 'none';">`
      : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; object-src 'none'; frame-src 'none';">`;
    const bridge=allowScripts && bridgeToken ? snapshotBridgeScript(bridgeToken) : '';
    let source=page.source||'';
    if(/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i,`<head$1>${base}${csp}${bridge}`);
    if(/<html[\s>]/i.test(source)) return source.replace(/<html([^>]*)>/i,`<html$1><head>${base}${csp}${bridge}</head>`);
    return `<!doctype html><html><head>${base}${csp}${bridge}</head><body>${source}</body></html>`;
  }

  function configureFrameRuntime(frame,page,slot){
    if(page?.documentType&&page.documentType!=='html'){
      frame.closest('.view-pane')?.classList.remove('scripted-preview');
      frame.dataset.previewRuntime='document-readonly';
      const badge=$(`[data-runtime-badge="${slot}"]`);if(badge)badge.hidden=true;
      if(page.documentType==='markdown')frame.setAttribute('sandbox','allow-same-origin');
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
      frame.srcdoc='<!doctype html><html><body></body></html>';
      return;
    }
    const scripted=configureFrameRuntime(frame,page,slot);
    updateInspectorEditControls();
    if(page.documentType==='pdf'){
      frame.dataset.snapshotToken='';frame.dataset.snapshotPageId=page.id;
      frame.removeAttribute('srcdoc');
      frame.src=page.previewUrl||`file:///${String(page.sourcePath||'').replace(/\\/g,'/')}`;
      return;
    }
    frame.removeAttribute('src');
    const snapshotToken=scripted ? uid('snapshot') : '';
    frame.dataset.snapshotToken=snapshotToken;
    frame.dataset.snapshotPageId=page.id;
    renderedSnapshotCache.delete(frame);
    const nextSource=buildPreviewSource(page,{allowScripts:scripted,bridgeToken:snapshotToken});
    const renderToken=`render-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const runtimeSource=nextSource.replace('</head>',`<meta data-editor-overlay="1" name="hbe-render-token" content="${renderToken}"><style data-editor-overlay="1">*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(112,120,132,.42);border:2px solid transparent;border-radius:8px;background-clip:padding-box}*::-webkit-scrollbar-thumb:hover{background:rgba(112,120,132,.65);border:2px solid transparent;background-clip:padding-box}</style></head>`);
    frame.srcdoc=runtimeSource;
  }

  function onPreviewFrameLoad(frame){
    const slot=previewSlotForFrame(frame);
    if(frame.dataset.previewRuntime==='interactive-isolated'||frame.dataset.previewRuntime==='document-readonly'){
      if(htmlEditEnabled && frameForEditSlot(editOwnerSlot)===frame) setHtmlEditEnabled(false);
      updateInspectorEditControls();
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
    restorePendingSelection(frame);
    updateInspectorEditControls();
  }

  [refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame].forEach(frame=>frame.addEventListener('load',()=>onPreviewFrameLoad(frame)));


  window.addEventListener('message', event => {
    const frame=[refs.singleFrame,refs.leftFrame,refs.rightFrame,refs.codePreviewFrame]
      .find(candidate => candidate.contentWindow===event.source);
    const data=event.data;
    if(!frame || !data) return;
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
  }
  function openClearHtmlDialog(slot){
    const pageId=pageIdForSlot(slot);
    const page=pageById(pageId);
    if(!pageHasRenderableContent(page)) return showToast('Nothing to clear');
    withUnsavedInspectorGuard(()=>{
      if(!pageHasUnsavedChanges(page)){
        pendingClearPageId=pageId;
        clearLoadedHtml();
        return;
      }
      pendingClearPageId=pageId;
      refs.clearHtmlTarget.textContent=page.name || page.fileName || 'Current Page';
      $('#clearHtmlMessage').textContent='This page has unsaved changes. Save it before clearing?';
      refs.clearHtmlModal.classList.add('show');
      setTimeout(()=>$('#clearHtmlCancel').focus(),0);
    });
  }
  function closeClearHtmlDialog(){ refs.clearHtmlModal.classList.remove('show'); pendingClearPageId=null; }
  function pageHasUnsavedChanges(page){ return page?.documentType!=='pdf'&&String(page?.source||'')!==String(page?.loadedSource||''); }
  function clearLoadedHtml(){
    const page=pageById(pendingClearPageId);
    if(!page){ closeClearHtmlDialog(); return; }
    pushUndo(page);
    page.source=''; page.loadedSource=''; page.baseUrl=null; page.sourcePath=null; page.previewUrl=null;page.documentType='html';page.fileName='untitled.html'; page.isEmpty=true;
    clearInspector(); closeClearHtmlDialog();
    if(state.views.codePage===page.id) loadCodePage();
    renderViewMode(); updateClearButtons(); persist(); showToast('Loaded page cleared');
  }
  $$('[data-clear-slot]').forEach(button=>{
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('click',event=>{ event.preventDefault(); event.stopPropagation(); openClearHtmlDialog(button.dataset.clearSlot); });
  });
  $('#clearHtmlCancel').onclick=closeClearHtmlDialog;
  $('#clearHtmlConfirm').onclick=clearLoadedHtml;
  $('#clearHtmlSave').onclick=async()=>{
    const page=pageById(pendingClearPageId);
    if(!page) return closeClearHtmlDialog();
    try{
      const filePath=page.documentType==='markdown'
        ?(page.sourcePath?await window.electronAPI.saveTextPath({filePath:page.sourcePath,source:page.source}):await window.electronAPI.exportText({title:'Save Markdown Page',suggestedName:page.fileName||`${page.name}.md`,extension:'md',source:page.source}))
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
    const pdfNotice=page?.documentType==='pdf'?`PDF page (read-only)\n${page.sourcePath||page.fileName||''}`:'';
    refs.source.value=pdfNotice||(page?.source||'');
    refs.source.readOnly=page?.documentType==='pdf';
    refs.source.classList.toggle('read-only',page?.documentType==='pdf');
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
    if(page.documentType==='pdf')return;
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

  // ----- Explorer HTML Drag & Drop -----
  function isHtmlFile(file){ return !!file && /\.html?$/i.test(file.name || ''); }
  function isAtlassianPreviewFile(file){return !!file&&/\.(md|markdown|json)$/i.test(file.name||'');}
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
    if(!file) return showToast('Only .html / .htm files can be dropped');

    withUnsavedInspectorGuard(async()=>{
      try{
        const result=await window.electronAPI.readDroppedHtml(file);
        const page=pageById(pageIdForSlot(slot));
        if(page && !page.isEmpty && (page.source||'').trim()){
          pendingHtmlDrop={slot,pageId:page.id,result};
          refs.replaceHtmlTarget.textContent=`${page.name || page.fileName} → ${result.fileName}`;
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
  $('#replaceHtmlConfirm').onclick=()=>{
    const pending=pendingHtmlDrop;
    if(!pending) return closeReplaceHtmlDialog();
    const page=pageById(pending.pageId);
    if(!page) return closeReplaceHtmlDialog();
    pushUndo(page);
    page.name=pending.result.title;page.fileName=pending.result.fileName;
    page.source=pending.result.source;page.loadedSource=pending.result.source;
    page.baseUrl=pending.result.baseUrl;page.sourcePath=pending.result.filePath;page.isEmpty=false;
    selectedTreeNode=page.id;
    closeReplaceHtmlDialog();clearInspector();renderAll();persist();showToast('HTML replaced');
  };
  refs.replaceHtmlModal.addEventListener('keydown',event=>{trapDialogFocus(refs.replaceHtmlModal,event);if(event.key==='Escape')closeReplaceHtmlDialog();});

  function bindDropTarget(selector, slot){
    const pane=$(selector); if(!pane) return;
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
    'objectName','text','fontFamily','fontSize','fontWeight','fontStyle',
    ...TEXT_CSS_FIELDS.map(field=>field.key),
    'marginTop','marginRight','marginBottom','marginLeft'
  ];

  function frameForEditSlot(slot){
    return slot==='single'?refs.singleFrame:slot==='left'?refs.leftFrame:slot==='right'?refs.rightFrame:slot==='codePreview'?refs.codePreviewFrame:null;
  }

  function canInspectFrame(frame){
    return !!htmlEditEnabled && !!editOwnerSlot && frameForEditSlot(editOwnerSlot)===frame;
  }

  function updateInspectorEditControls(){
    $$('[data-edit-slot]').forEach(button=>{
      const slot=button.dataset.editSlot;
      const frame=frameForEditSlot(slot);
      const page=pageById(pageIdForSlot(slot));
      const unavailable=!pageHasRenderableContent(page) || page?.documentType!=='html' || frame?.dataset.previewRuntime==='interactive-isolated';
      const active=htmlEditEnabled && editOwnerSlot===slot;
      button.classList.toggle('active',active);
      button.closest('.view-pane')?.classList.toggle('edit-active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
      button.disabled=unavailable;
      button.textContent='Edit';
      button.title=unavailable
        ?'Edit is unavailable for an empty or interactive preview'
        :active?'Disable Edit for this Window':'Enable Edit for this Window';
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

  function setHtmlEditEnabled(enabled,slot=editOwnerSlot){
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
      }
    }
    updateInspectorEditControls();
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

    const sizeLabel=doc.createElement('div');
    sizeLabel.dataset.editorOverlay='1';
    Object.assign(sizeLabel.style,{
      position:'absolute',left:'0',top:'100%',marginTop:'5px',padding:'2px 5px',
      borderRadius:'3px',background:'#5873d4',color:'#fff',font:'10px/1.3 Arial,sans-serif',
      whiteSpace:'nowrap',display:'none',pointerEvents:'none'
    });
    overlay.appendChild(sizeLabel);

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
      let changed=false;

      const move=moveEvent=>{
        moveEvent.preventDefault();
        const deltaX=moveEvent.clientX-startX;
        const deltaY=moveEvent.clientY-startY;

        if(direction.includes('e')){
          target.style.width=`${Math.max(1,Math.round(startWidth+deltaX))}px`;
        }else if(direction.includes('w')){
          const width=Math.max(1,startWidth-deltaX);
          const appliedDelta=startWidth-width;
          target.style.width=`${Math.round(width)}px`;
          target.style.marginLeft=`${Math.round(startMarginLeft+appliedDelta)}px`;
        }

        if(direction.includes('s')){
          target.style.height=`${Math.max(1,Math.round(startHeight+deltaY))}px`;
        }else if(direction.includes('n')){
          const height=Math.max(1,startHeight-deltaY);
          const appliedDelta=startHeight-height;
          target.style.height=`${Math.round(height)}px`;
          target.style.marginTop=`${Math.round(startMarginTop+appliedDelta)}px`;
        }

        changed=changed
          || ((direction.includes('e')||direction.includes('w')) && Math.abs(deltaX)>.001)
          || ((direction.includes('n')||direction.includes('s')) && Math.abs(deltaY)>.001);
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
      if(!canInspectFrame(frame) || e.target.dataset?.editorOverlay) return;
      if(SelectionManager.items().some(item=>item.ownerDocument===doc)) syncSelectionOverlays();
      else positionOverlay(e.target,'hover');
    },true);

    doc.addEventListener('mouseout',()=>{
      if(!canInspectFrame(frame)){
        overlay.style.display='none';
        return;
      }
      if(SelectionManager.items().some(item=>item.ownerDocument===doc)) syncSelectionOverlays();
      else overlay.style.display='none';
    },true);

    doc.addEventListener('pointerdown',e=>{
      if(!canInspectFrame(frame) || e.target.dataset?.editorOverlay) return;
      if(inlineTextEditSession?.element?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();

      const target=e.target;
      SelectionManager.select(target,frame,'viewport',{toggle:e.ctrlKey||e.metaKey});
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
    inlineTextEditSession={element,frame,page,originalContentEditable:element.getAttribute('contenteditable'),originalHtml:element.innerHTML,composing:false};
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
    return true;
  }

  function endInlineTextEdit({commit=true}={}){
    const session=inlineTextEditSession;
    if(!session) return;
    const {element,frame,page,listeners}=session;
    element.removeEventListener('input',listeners.updateLiveState);
    element.removeEventListener('compositionstart',listeners.compositionStart);
    element.removeEventListener('compositionend',listeners.compositionEnd);
    element.removeEventListener('keydown',listeners.keydown);
    element.removeEventListener('blur',listeners.blur);
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
    if(element.isConnected){
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

  function getInspectorValues(el,frame){
    const cs=frame.contentWindow.getComputedStyle(el);
    const values={
      objectName:objectDisplayName(el),
      text:directText(el),
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
    try{frame?.contentDocument?.querySelectorAll('.table-cell-selected').forEach(el=>el.classList.remove('table-cell-selected'))}catch{}
  }

  function markSelectedCell(cell,frame){
    clearSelectedCellMarker(frame);
    if(cell) cell.classList.add('table-cell-selected');
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
  }

  function mutateSelectedTable(mutator,source){
    const table=selectedTable();
    const frame=selectedElementFrame;
    if(!table||!frame) return;
    const page=pageById(frameToPageId(frame));
    if(!page) return;
    mutator(table,selectedTableCell());
    commitDomMutation(frame,page,selectedElement||table,source);
    updateStructuredToolbar();
  }

  function addTableRow(){
    mutateSelectedTable((table,cell)=>{
      const columnCount=Math.max(1,...[...table.rows].map(row=>row.cells.length));
      const row=table.insertRow(-1);
      for(let i=0;i<columnCount;i++){
        const td=row.insertCell(-1);
        td.textContent='Cell';
        td.style.cssText='border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle';
      }
    },'table-add-row');
  }

  function deleteTableRow(){
    mutateSelectedTable((table,cell)=>{
      const row=cell?.parentElement || table.rows[table.rows.length-1];
      if(row && table.rows.length>1) row.remove();
    },'table-delete-row');
  }

  function addTableColumn(){
    mutateSelectedTable((table)=>{
      [...table.rows].forEach((row,rowIndex)=>{
        const isHeader=row.parentElement?.tagName==='THEAD';
        const cell=isHeader?document.createElement('th'):document.createElement('td');
        cell.textContent=isHeader?'Header':'Cell';
        cell.style.cssText='border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle';
        row.appendChild(cell);
      });
    },'table-add-column');
  }

  function deleteTableColumn(){
    mutateSelectedTable((table,cell)=>{
      let index=cell?.cellIndex ?? -1;
      if(index<0) index=Math.max(0,(table.rows[0]?.cells.length||1)-1);
      [...table.rows].forEach(row=>{
        if(row.cells.length>1 && row.cells[index]) row.deleteCell(index);
      });
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
      if(!cell) return;
      const next=cell.nextElementSibling;
      if(!next || !['TD','TH'].includes(next.tagName)) return;
      cell.innerHTML=`${cell.innerHTML}<br>${next.innerHTML}`;
      cell.colSpan=(cell.colSpan||1)+(next.colSpan||1);
      next.remove();
    },'table-merge-right');
  }

  function unmergeCell(){
    mutateSelectedTable((table,cell)=>{
      if(!cell || cell.colSpan<=1) return;
      const count=cell.colSpan-1;
      cell.colSpan=1;
      for(let i=0;i<count;i++){
        const newCell=document.createElement(cell.tagName.toLowerCase());
        newCell.textContent='Cell';
        newCell.style.cssText=cell.style.cssText;
        cell.parentElement.insertBefore(newCell,cell.nextSibling);
      }
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

  }

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
  document.addEventListener('pointerdown',()=>{
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
    return Math.max(MIN_INSPECTOR_WIDTH,Math.min(MAX_INSPECTOR_WIDTH,rect.width-sidebarWidth-MIN_MAIN_WIDTH-(SPLITTER_HANDLE_PX*2)));
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
  $('#collapseInspector').onclick=toggleInspector;
  $('#inspectorToggleTop').onclick=toggleInspector;


  window.addEventListener('resize',()=>{
    sidebarWidth=clamp(sidebarWidth,MIN_SIDEBAR_WIDTH,dynamicSidebarMax());
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
    if(!dialogOpen&&modifier&&e.key.toLowerCase()==='f'&&state.mode==='code'){
      e.preventDefault();refs.codeSearch?.focus();refs.codeSearch?.select();return;
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
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newPage();}
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='s'){e.preventDefault();savePage(true);}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();savePage(false);}
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();redo();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
  });

  function repairViews(){
    const first=pageList()[0]?.page.id||null;
    state.views=state.views||{};
    ['single','left','right','codePreview','codePage'].forEach(k=>{
      if(!state.views[k] || !pageById(state.views[k])) state.views[k]=first;
    });
    activeSlots=activeSlots||{split:'left',code:'preview'};
    if(!['left','right'].includes(activeSlots.split)) activeSlots.split='left';
    if(!['preview','editor'].includes(activeSlots.code)) activeSlots.code='preview';
  }
  function renderCrumbs(){
    const page=pageById(currentActivePageId());if(!page){refs.crumbs.textContent='No page selected';return;}
    const x=nodeById(page.id);const names=[page.name];let parent=page.parentId;while(parent){const p=x.project.nodes.find(n=>n.id===parent);if(!p)break;names.unshift(p.name);parent=p.parentId;}names.unshift(x.project.name);refs.crumbs.textContent=names.join(' / ');
  }
  function renderAll(){
    repairViews();
    renderViewMode();
    updateClearButtons();
    $('#workspaceTitle').textContent=`${state.projectName||'Leaf Project'} / ${activeDocument()?.name||'No Document'}`;
  }

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
  renderObjectsPalette();
  renderAll();
  updateAllPreviewZoomIndicators();
  requestAnimationFrame(()=>{renderAllPreviewSizes();updateAllPreviewZoomIndicators();renderHierarchy();});
  persist();
})();
