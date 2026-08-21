(() => {
function severity(def){if(!def)return null;if(def.jira.support==='unsupported')return'blocked';if(def.jira.support==='convertible'&&def.jira.fidelity==='low')return'lossy';if(def.jira.support==='convertible')return'converted';return null;}
function analyzeHtml(html){
const doc=new DOMParser().parseFromString(String(html||''),'text/html');
const issues=[],counts={safe:0,converted:0,lossy:0,blocked:0};let id=0;
const occurrence=new Map();
for(const el of [...doc.body.querySelectorAll('*')]){
let t=el.getAttribute('data-hbe-object');if(!t){if(el.tagName==='SVG')t='__svg__';else if(el.tagName==='IMG')t='image';}
if(t==='__svg__'){
const index=occurrence.get('svg')||0;occurrence.set('svg',index+1);
issues.push({id:`jira_${++id}`,severity:'blocked',label:'SVG',objectType:'svg',objectId:null,occurrence:index,message:'Inline SVG is not directly preserved in Jira.',lostProperties:['vectorGraphic']});counts.blocked++;continue;}
const def=window.WidgetRegistry.get(t);if(!def)continue;const s=severity(def);if(!s){counts.safe++;continue;}
const lost=({canvas:['x','y','anchor','zOrder'],overlay:['layering','zOrder'],horizontalBox:['horizontalLayout'],grid:['gridPlacement'],image:['localMediaReference']})[t]||[];
const index=occurrence.get(t)||0;occurrence.set(t,index+1);
issues.push({id:`jira_${++id}`,severity:s,label:def.label,objectType:t,objectId:el.getAttribute('data-hbe-id')||null,occurrence:index,message:s==='lossy'?`${def.label} will lose layout fidelity in Jira.`:`${def.label} will be converted to Jira document flow.`,lostProperties:lost});counts[s]++;
}
return{issues,counts,stale:false};
}
window.JiraCompatibility={analyzeHtml};
})();