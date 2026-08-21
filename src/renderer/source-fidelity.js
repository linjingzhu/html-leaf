(() => {
  'use strict';
  const EDITOR_CLASS_NAMES=new Set(['table-cell-selected','viewport-object-drop-target']);

  function stripEditorArtifactsFromDocument(doc){
    if(!doc) return doc;
    doc.querySelectorAll('[data-editor-overlay],[data-adf-marker],[data-hbe-drop-line]').forEach(n=>n.remove());
    doc.querySelectorAll('[data-editor-element-id]').forEach(n=>n.removeAttribute('data-editor-element-id'));
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
    const patterns=['data-editor-overlay','data-adf-marker','data-hbe-drop-line','data-editor-element-id','table-cell-selected','viewport-object-drop-target'];
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

  window.SourceFidelity={stripEditorArtifactsFromDocument,editorArtifactReport,tryMinimalDirectTextPatch,tryInspectorMinimalPatch};
})();