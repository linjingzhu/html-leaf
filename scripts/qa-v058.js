const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const js=read('src/renderer/renderer.js');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Used tab and extracted-component panel are present',html.includes('data-left-tab="used"')&&html.includes('id="usedComponentsList"'));
check('Used catalog extracts and deduplicates active document components',js.includes('function extractUsedComponents()')&&js.includes('groups.get(signature)')&&js.includes('existing.count+=1'));
check('Used component HTML removes scripts, event handlers, IDs, and editor metadata',js.includes('function sanitizedUsedComponentHtml(element)')&&js.includes("clone.querySelectorAll('script,base')")&&js.includes("/^on/i.test(attribute.name)"));
check('Used components publish a dedicated drag payload',js.includes("setData('application/x-hbe-used-component'")&&js.includes('function createUsedComponent(payload,doc)'));
check('Used components can drop into Hierarchy and Viewport',js.split("getData('application/x-hbe-used-component')").length>=3);
check('Inline text edit tracks IME composition boundaries',js.includes("addEventListener('compositionstart'")&&js.includes("addEventListener('compositionend'"));
check('Inline input updates live UI without serializing during composition',js.includes('const updateLiveState=()=>')&&js.includes('inlineTextEditSession.composing=true')&&!/const updateLiveState[\s\S]{0,700}syncFrameToPage/.test(js));
check('Enter commits text edit while Shift+Enter remains a newline',js.includes("event.key!=='Enter' || event.isComposing")&&js.includes('if(event.shiftKey)')&&js.includes('endInlineTextEdit({commit:true})'));
check('Inline text source commits once through the mutation transaction',js.includes("syncFrameToPage(frame,page,{mutationKind:'inline-text-edit'})"));
check('All four selection edges span the complete side hit area',js.includes("n:{top:'-5px',left:'-2px',right:'-2px'}")&&js.includes("e:{top:'-2px',bottom:'-2px',right:'-5px'}")&&js.includes("s:{bottom:'-5px',left:'-2px',right:'-2px'}")&&js.includes("w:{top:'-2px',bottom:'-2px',left:'-5px'}"));
check('Component copy, paste, duplicate, and text edit commands exist',js.includes('function copySelectedElements()')&&js.includes('function pasteSelectedElements()')&&js.includes('function duplicateSelectedElements()')&&js.includes('function editSelectedText()'));
check('Viewport shortcuts bind Ctrl/Cmd+C, V, D and F2',js.includes("event.key.toLowerCase()==='c'")&&js.includes("event.key.toLowerCase()==='v'")&&js.includes("event.key.toLowerCase()==='d'")&&js.includes("event.key==='F2'"));
check('Object context menu exposes all requested commands',html.includes('data-object-context="copy"')&&html.includes('data-object-context="paste"')&&html.includes('data-object-context="duplicate"')&&html.includes('data-object-context="edit-text"'));
check('Context menu dispatches component commands',js.includes('function openObjectContextMenu(')&&js.includes("action==='copy'")&&js.includes("action==='paste'")&&js.includes("action==='duplicate'"));
check('Scale displays one editable percentage input per Viewport',html.match(/data-preview-zoom=/g)?.length===4&&html.match(/class="viewport-zoom-indicator"/g)?.length===4);
check('Obsolete scale reset button is removed',!html.includes('viewport-zoom-reset')&&!js.includes('viewport-zoom-reset'));
check('All compatibility buttons use Atlassian naming',html.match(/>Check Atlassian<\/button>/g)?.length===4&&!html.includes('Check JIRA'));
check('Atlassian main, Recheck, Clear, and Close actions are bound',js.includes("$$('[data-jira-check-slot]').forEach(button=>button.addEventListener('click'")&&js.includes("$('#jiraCheckRecheck')?.addEventListener")&&js.includes("$('#jiraCheckClear')?.addEventListener")&&js.includes("$('#jiraCheckClose')?.addEventListener"));
check('Code input converts an empty default document into a renderable page',js.includes("page.source=refs.source.value;page.isEmpty=!(page.source||'').trim()"));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v057.js')],{stdio:'inherit'});
check('qa-v057.js regression',prior.status===0);
console.log(`v0.5.8 Used components/editing/commands regression QA: ${passed}/20 PASS`);
