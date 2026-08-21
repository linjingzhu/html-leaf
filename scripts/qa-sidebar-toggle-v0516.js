const fs=require('fs');

const html=fs.readFileSync('src/renderer/index.html','utf8');
const js=fs.readFileSync('src/renderer/renderer.js','utf8');
const css=fs.readFileSync('src/renderer/styles.css','utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exit(1);}
  passed++;console.log(`PASS ${name}`);
}

check('Application bar exposes an accessible left-panel toggle',
  html.includes('id="sidebarToggleTop"')&&html.includes('aria-controls="leftSidebar"')&&
  html.includes('aria-expanded="true"')&&html.includes('aria-label="Hide left panel"')&&html.includes('title="Hide left panel"'));
check('Left panel owns a stable accessibility target',html.includes('<aside class="sidebar" id="leftSidebar">'));
check('Sidebar collapsed state is part of normalized preferences',
  js.includes('sidebarCollapsed:false')&&js.includes("classList.toggle('sidebar-collapsed',!!state.preferences.sidebarCollapsed)"));
check('Toggle updates layout, accessibility, tooltip, and stored state',
  js.includes('function toggleSidebar()')&&js.includes('state.preferences.sidebarCollapsed=!state.preferences.sidebarCollapsed')&&
  js.includes("setAttribute('aria-expanded',String(!state.preferences.sidebarCollapsed))")&&
  js.includes("setAttribute('aria-label',refs.sidebarToggleTop.title)")&&
  js.includes("state.preferences.sidebarCollapsed?'Show left panel':'Hide left panel'")&&
  js.includes("$('#sidebarToggleTop').onclick=toggleSidebar")&&js.includes('persist();'));
check('Collapsed grid removes the left panel and its splitter',
  css.includes('.workspace.sidebar-collapsed{')&&css.includes('grid-template-columns:0 0 minmax(0,1fr)')&&
  css.includes('.workspace.sidebar-collapsed .sidebar-resizer'));
check('Both side panels can be collapsed at the same time',
  css.includes('.workspace.sidebar-collapsed.inspector-collapsed{')&&
  css.includes('grid-template-columns:0 0 minmax(0,1fr) 0 0'));
check('Inspector sizing accounts for a hidden left panel',
  js.includes('const sidebarSpace=state.preferences.sidebarCollapsed?0:(sidebarWidth+SPLITTER_HANDLE_PX)'));
check('Hidden sidebar cannot start pointer or keyboard resize',
  (js.match(/if\(state\.preferences\.sidebarCollapsed\) return;/g)||[]).length>=2);
check('Existing Inspector collapse remains independently wired',
  js.includes("$('#collapseInspector').onclick=toggleInspector")&&js.includes("$('#inspectorToggleTop').onclick=toggleInspector"));
check('Trust Foundation security remains enabled',
  fs.readFileSync('src/main.js','utf8').includes('contextIsolation: true')&&
  fs.readFileSync('src/main.js','utf8').includes('sandbox: true')&&
  fs.readFileSync('src/renderer/source-fidelity.js','utf8').includes('stripEditorArtifactsFromDocument'));

console.log(`Leaf left-panel toggle regression QA: ${passed}/10 PASS`);
