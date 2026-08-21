(() => {
  'use strict';

  function setCommon(el,type,label){
    el.setAttribute('data-hbe-object',type);
    el.setAttribute('data-hbe-version','1');
    el.setAttribute('data-hbe-name',label);
    return el;
  }

  function create(type,doc){
    const id=`obj_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    let el;

    switch(type){
      case 'text':
        el=setCommon(doc.createElement('p'),type,'Text');
        el.textContent='Text';
        break;
      case 'heading':
        el=setCommon(doc.createElement('h2'),type,'Heading');
        el.textContent='Heading';
        break;
      case 'callout':
        el=setCommon(doc.createElement('aside'),type,'Callout');
        el.setAttribute('data-hbe-panel-type','info');
        el.innerHTML='<strong>Info</strong><p>Callout content</p>';
        break;
      case 'quote':
        el=setCommon(doc.createElement('blockquote'),type,'Quote');
        el.textContent='Quote';
        break;
      case 'codeBlock':
        el=setCommon(doc.createElement('pre'),type,'Code Block');
        el.innerHTML='<code>code</code>';
        break;
      case 'divider':
        el=setCommon(doc.createElement('hr'),type,'Divider');
        break;
      case 'table':
        el=setCommon(doc.createElement('table'),type,'Table');
        el.setAttribute('data-hbe-table-header-row','true');
        el.style.cssText='border-collapse:collapse;width:100%;';
        el.innerHTML='<thead><tr><th style="border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle">Header</th><th style="border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle">Header</th></tr></thead><tbody><tr><td style="border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle">Cell</td><td style="border:1px solid currentColor;padding:8px;text-align:left;vertical-align:middle">Cell</td></tr></tbody>';
        break;
      case 'image':
        el=setCommon(doc.createElement('figure'),type,'Image');
        el.innerHTML='<div style="min-height:96px;display:grid;place-items:center;border:1px dashed currentColor;opacity:.55">Image</div>';
        break;
      case 'verticalBox':
        el=setCommon(doc.createElement('div'),type,'Vertical Box');
        el.style.cssText='display:flex;flex-direction:column;gap:12px;min-height:72px;padding:12px;';
        break;
      case 'horizontalBox':
        el=setCommon(doc.createElement('div'),type,'Horizontal Box');
        el.style.cssText='display:flex;flex-direction:row;gap:12px;min-height:72px;padding:12px;';
        break;
      case 'grid':
        el=setCommon(doc.createElement('div'),type,'Grid');
        el.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:96px;padding:12px;';
        break;
      case 'overlay':
        el=setCommon(doc.createElement('div'),type,'Overlay');
        el.style.cssText='display:grid;min-height:120px;padding:12px;';
        el.setAttribute('data-hbe-layout','overlay');
        break;
      case 'canvas':
        el=setCommon(doc.createElement('div'),type,'Canvas Panel');
        el.style.cssText='position:relative;min-height:320px;padding:12px;';
        el.setAttribute('data-hbe-layout','canvas');
        break;
      default:
        return null;
    }

    el.setAttribute('data-hbe-id',id);
    return el;
  }

  const defs=[
    {type:'text',label:'Text',category:'Document',kind:'content',properties:{alignment:['horizontal']},jira:{support:'native',fidelity:'high'}},
    {type:'heading',label:'Heading',category:'Document',kind:'content',properties:{alignment:['horizontal']},jira:{support:'native',fidelity:'high'}},
    {type:'callout',label:'Callout',category:'Document',kind:'content',properties:{alignment:['horizontal']},jira:{support:'native',fidelity:'high'}},
    {type:'quote',label:'Quote',category:'Document',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'codeBlock',label:'Code Block',category:'Document',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'divider',label:'Divider',category:'Document',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'table',label:'Table',category:'Document',kind:'content',structured:true,properties:{alignment:['horizontal'],table:true},jira:{support:'native',fidelity:'high'}},
    {type:'image',label:'Image',category:'Media',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'verticalBox',label:'Vertical Box',category:'Layout',kind:'panel',slot:'box',jira:{support:'convertible',fidelity:'high'}},
    {type:'horizontalBox',label:'Horizontal Box',category:'Layout',kind:'panel',slot:'box',jira:{support:'convertible',fidelity:'medium'}},
    {type:'grid',label:'Grid',category:'Layout',kind:'panel',jira:{support:'convertible',fidelity:'medium'}},
    {type:'overlay',label:'Overlay',category:'Layout',kind:'panel',slot:'overlay',jira:{support:'convertible',fidelity:'low'}},
    {type:'canvas',label:'Canvas Panel',category:'Layout',kind:'panel',slot:'canvas',jira:{support:'convertible',fidelity:'low'}}
  ];
  const map=new Map(defs.map(d=>[d.type,d]));

  function canContain(element){
    if(!element) return false;
    const type=element.getAttribute?.('data-hbe-object');
    const def=map.get(type);
    if(def?.kind==='panel') return true;
    return ['BODY','MAIN','ARTICLE','SECTION','ASIDE','DIV'].includes(element.tagName);
  }

  window.WidgetRegistry={
    all:()=>defs.slice(),
    get:t=>map.get(t)||null,
    create,
    canContain,
    isJiraSafe:d=>!!d&&(d.jira.support==='native'||(d.jira.support==='convertible'&&d.jira.fidelity==='high'))
  };
})();