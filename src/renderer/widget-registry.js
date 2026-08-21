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
      case 'bulletedList':
        el=setCommon(doc.createElement('ul'),type,'Bulleted List');
        el.innerHTML='<li>List item</li><li>List item</li><li>List item</li>';
        break;
      case 'numberedList':
        el=setCommon(doc.createElement('ol'),type,'Numbered List');
        el.innerHTML='<li>First item</li><li>Second item</li><li>Third item</li>';
        break;
      case 'taskList':
        el=setCommon(doc.createElement('ul'),type,'Task List');
        el.style.cssText='list-style:none;padding-left:0;';
        el.innerHTML='<li><label><input type="checkbox"> Task item</label></li><li><label><input type="checkbox"> Task item</label></li>';
        break;
      case 'descriptionList':
        el=setCommon(doc.createElement('dl'),type,'Description List');
        el.innerHTML='<dt><strong>Term</strong></dt><dd>Description</dd>';
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
      case 'video':
        el=setCommon(doc.createElement('figure'),type,'Video');
        el.innerHTML='<div style="aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed currentColor;background:rgba(127,127,127,.08)">Video</div><figcaption>Video caption</figcaption>';
        break;
      case 'button':
        el=setCommon(doc.createElement('button'),type,'Button');
        el.type='button';el.textContent='Button';
        el.style.cssText='padding:9px 15px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;';
        break;
      case 'link':
        el=setCommon(doc.createElement('a'),type,'Link');
        el.href='#';el.textContent='Link';
        break;
      case 'breadcrumb':
        el=setCommon(doc.createElement('nav'),type,'Breadcrumb');
        el.setAttribute('aria-label','Breadcrumb');
        el.innerHTML='<a href="#">Home</a> <span aria-hidden="true">/</span> <a href="#">Section</a> <span aria-hidden="true">/</span> <span aria-current="page">Current</span>';
        break;
      case 'navigation':
        el=setCommon(doc.createElement('nav'),type,'Navigation');
        el.setAttribute('aria-label','Primary');
        el.style.cssText='display:flex;gap:16px;align-items:center;';
        el.innerHTML='<a href="#">Home</a><a href="#">Features</a><a href="#">Contact</a>';
        break;
      case 'tabs':
        el=setCommon(doc.createElement('div'),type,'Tabs');
        el.setAttribute('role','tablist');el.style.cssText='display:flex;gap:4px;border-bottom:1px solid currentColor;padding:0 0 6px;';
        el.innerHTML='<button type="button" role="tab" aria-selected="true">Overview</button><button type="button" role="tab" aria-selected="false">Details</button><button type="button" role="tab" aria-selected="false">History</button>';
        break;
      case 'pagination':
        el=setCommon(doc.createElement('nav'),type,'Pagination');
        el.setAttribute('aria-label','Pagination');el.style.cssText='display:flex;gap:6px;align-items:center;';
        el.innerHTML='<a href="#">Previous</a><a href="#" aria-current="page">1</a><a href="#">2</a><a href="#">Next</a>';
        break;
      case 'form':
        el=setCommon(doc.createElement('form'),type,'Form');
        el.style.cssText='display:grid;gap:12px;padding:16px;border:1px solid currentColor;border-radius:8px;';
        el.innerHTML='<label>Name <input type="text" placeholder="Enter a name"></label><label>Email <input type="email" placeholder="name@example.com"></label><button type="button">Submit</button>';
        break;
      case 'textInput':
        el=setCommon(doc.createElement('label'),type,'Text Input');
        el.style.cssText='display:grid;gap:5px;';el.innerHTML='Label<input type="text" placeholder="Enter text">';
        break;
      case 'textArea':
        el=setCommon(doc.createElement('label'),type,'Text Area');
        el.style.cssText='display:grid;gap:5px;';el.innerHTML='Label<textarea rows="4" placeholder="Enter text"></textarea>';
        break;
      case 'select':
        el=setCommon(doc.createElement('label'),type,'Select');
        el.style.cssText='display:grid;gap:5px;';el.innerHTML='Label<select><option>Option one</option><option>Option two</option></select>';
        break;
      case 'checkbox':
        el=setCommon(doc.createElement('label'),type,'Checkbox');
        el.innerHTML='<input type="checkbox"> Checkbox label';
        break;
      case 'radioGroup':
        el=setCommon(doc.createElement('fieldset'),type,'Radio Group');
        el.innerHTML='<legend>Choose an option</legend><label><input type="radio" name="option"> Option one</label> <label><input type="radio" name="option"> Option two</label>';
        break;
      case 'switch':
        el=setCommon(doc.createElement('label'),type,'Switch');
        el.innerHTML='<input type="checkbox" role="switch"> Switch label';
        break;
      case 'search':
        el=setCommon(doc.createElement('search'),type,'Search');
        el.innerHTML='<label>Search <input type="search" placeholder="Search"></label> <button type="button">Search</button>';
        break;
      case 'progress':
        el=setCommon(doc.createElement('div'),type,'Progress');
        el.innerHTML='<label>Progress <progress value="60" max="100">60%</progress></label>';
        break;
      case 'meter':
        el=setCommon(doc.createElement('div'),type,'Meter');
        el.innerHTML='<label>Usage <meter min="0" max="100" value="72">72%</meter></label>';
        break;
      case 'stat':
        el=setCommon(doc.createElement('section'),type,'Statistic');
        el.style.cssText='display:grid;gap:4px;padding:16px;border:1px solid currentColor;border-radius:8px;';
        el.innerHTML='<span>Metric</span><strong style="font-size:2em">42%</strong><small>Compared with last period</small>';
        break;
      case 'card':
        el=setCommon(doc.createElement('article'),type,'Card');
        el.style.cssText='display:grid;gap:10px;padding:18px;border:1px solid currentColor;border-radius:10px;';
        el.innerHTML='<h3 style="margin:0">Card title</h3><p style="margin:0">Card description and supporting content.</p><a href="#">Learn more</a>';
        break;
      case 'section':
        el=setCommon(doc.createElement('section'),type,'Section');
        el.style.cssText='display:grid;gap:12px;min-height:120px;padding:20px;';
        el.innerHTML='<h2 style="margin:0">Section title</h2><p style="margin:0">Section content</p>';
        break;
      case 'columns':
        el=setCommon(doc.createElement('div'),type,'Columns');
        el.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;min-height:120px;';
        el.innerHTML='<section style="padding:12px;border:1px dashed currentColor">Column one</section><section style="padding:12px;border:1px dashed currentColor">Column two</section>';
        break;
      case 'spacer':
        el=setCommon(doc.createElement('div'),type,'Spacer');
        el.style.cssText='height:48px;min-height:16px;border:1px dashed currentColor;opacity:.35;';
        el.setAttribute('aria-hidden','true');
        break;
      case 'hero':
        el=setCommon(doc.createElement('section'),type,'Hero');
        el.style.cssText='display:grid;gap:14px;place-content:center;min-height:280px;padding:40px;text-align:center;border:1px solid currentColor;';
        el.innerHTML='<h1 style="margin:0">Hero headline</h1><p style="margin:0">A short value proposition for the page.</p><div><a href="#">Primary action</a></div>';
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
    {type:'bulletedList',label:'Bulleted List',category:'Document',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'numberedList',label:'Numbered List',category:'Document',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'taskList',label:'Task List',category:'Document',kind:'content',jira:{support:'convertible',fidelity:'high'}},
    {type:'descriptionList',label:'Description List',category:'Document',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'table',label:'Table',category:'Document',kind:'content',structured:true,properties:{alignment:['horizontal'],table:true},jira:{support:'native',fidelity:'high'}},
    {type:'image',label:'Image',category:'Media',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'video',label:'Video',category:'Media',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'button',label:'Button',category:'Actions & Navigation',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'link',label:'Link',category:'Actions & Navigation',kind:'content',jira:{support:'native',fidelity:'high'}},
    {type:'breadcrumb',label:'Breadcrumb',category:'Actions & Navigation',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'navigation',label:'Navigation',category:'Actions & Navigation',kind:'panel',jira:{support:'convertible',fidelity:'low'}},
    {type:'tabs',label:'Tabs',category:'Actions & Navigation',kind:'panel',jira:{support:'convertible',fidelity:'low'}},
    {type:'pagination',label:'Pagination',category:'Actions & Navigation',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'form',label:'Form',category:'Forms',kind:'panel',jira:{support:'convertible',fidelity:'low'}},
    {type:'textInput',label:'Text Input',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'textArea',label:'Text Area',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'select',label:'Select',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'checkbox',label:'Checkbox',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'radioGroup',label:'Radio Group',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'switch',label:'Switch',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'search',label:'Search',category:'Forms',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'progress',label:'Progress',category:'Data Display',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'meter',label:'Meter',category:'Data Display',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'stat',label:'Statistic',category:'Data Display',kind:'content',jira:{support:'convertible',fidelity:'medium'}},
    {type:'card',label:'Card',category:'Data Display',kind:'panel',jira:{support:'convertible',fidelity:'medium'}},
    {type:'verticalBox',label:'Vertical Box',category:'Layout',kind:'panel',slot:'box',jira:{support:'convertible',fidelity:'high'}},
    {type:'horizontalBox',label:'Horizontal Box',category:'Layout',kind:'panel',slot:'box',jira:{support:'convertible',fidelity:'medium'}},
    {type:'grid',label:'Grid',category:'Layout',kind:'panel',jira:{support:'convertible',fidelity:'medium'}},
    {type:'overlay',label:'Overlay',category:'Layout',kind:'panel',slot:'overlay',jira:{support:'convertible',fidelity:'low'}},
    {type:'canvas',label:'Canvas Panel',category:'Layout',kind:'panel',slot:'canvas',jira:{support:'convertible',fidelity:'low'}},
    {type:'section',label:'Section',category:'Layout',kind:'panel',jira:{support:'convertible',fidelity:'high'}},
    {type:'columns',label:'Columns',category:'Layout',kind:'panel',jira:{support:'convertible',fidelity:'medium'}},
    {type:'spacer',label:'Spacer',category:'Layout',kind:'content',jira:{support:'convertible',fidelity:'low'}},
    {type:'hero',label:'Hero',category:'Layout',kind:'panel',jira:{support:'convertible',fidelity:'medium'}}
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
