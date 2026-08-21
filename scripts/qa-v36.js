const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');

let passed=0, failed=0;
function check(name,condition){
  if(condition){console.log('PASS ',name);passed++;}
  else{console.error('FAIL ',name);failed++;}
}

check('Renderer index is non-empty',html.length>5000);
check('Upper-left tool name removed',!html.includes('class="brand-mini"') && !html.includes('<strong>HTML Book Editor</strong>'));
check('File menu commands exist',
  ['new-project','save-project','save-project-as','import','export'].every(a=>html.includes(`data-action="${a}"`)));
check('File commands have direct listeners',
  js.includes("$$('[data-action]').forEach(button=>") && js.includes('runMenuAction(button.dataset.action,button)'));
check('Popup propagation no longer breaks command dispatch',
  js.includes("$$('.menu-popup,.submenu-popup').forEach") && !js.includes("$('#mainMenu').addEventListener('click'"));
check('New Project is implemented',js.includes("showToast('New project created')"));
check('Save Project is implemented',js.includes("window.electronAPI.saveProject({"));
check('Save As Project is implemented',js.includes("window.electronAPI.saveProjectAs({"));
check('Import HTML is implemented',js.includes("window.electronAPI.importHtml()"));
check('Export HTML is implemented',js.includes("window.electronAPI.exportHtml({"));
check('Recent is implemented',js.includes("window.electronAPI.readProjectPath(item.filePath)"));
check('Main process supports project save/open paths',
  main.includes("ipcMain.handle('project:save'") &&
  main.includes("ipcMain.handle('project:saveAs'") &&
  main.includes("ipcMain.handle('project:readPath'"));
check('Preload exposes project/file commands',
  ['importHtml','exportHtml','readProjectPath','saveProject','saveProjectAs'].every(k=>preload.includes(k)));

check('Preview/Split/Code buttons exist',
  ['preview','split','code'].every(m=>html.includes(`data-mode="${m}"`)));
check('Preview/Split/Code buttons directly bind events',
  js.includes("$$('#viewSeg button[data-mode]').forEach(button=>"));
check('All three mode panels exist',
  ['preview','split','code'].every(m=>html.includes(`data-mode-panel="${m}"`)));
check('Preview render-size selector exists in all preview slots',
  ['single','left','right','codePreview'].every(s=>html.includes(`data-preview-size-slot="${s}"`)));
check('Preview surfaces exist in all preview slots',
  ['single','left','right','codePreview'].every(s=>html.includes(`data-preview-surface="${s}"`)));
check('Preview fixed size mutates real surface dimensions',
  js.includes('surface.style.width=`${width}px`') &&
  js.includes('surface.style.height=`${height}px`') &&
  js.includes('void surface.offsetWidth'));
check('Responsive mode returns surface to 100%',
  js.includes("surface.style.width='100%'") && js.includes("surface.style.height='100%'"));

check('All four splitters exist',
  ['sidebarResizer','splitDivider','codeDivider','inspectorResizer'].every(id=>html.includes(`id="${id}"`)));
check('Resize protects iframe interaction',css.includes('body.is-resizing iframe{pointer-events:none!important}'));
check('Electron security remains hardened',
  main.includes('contextIsolation: true') &&
  main.includes('nodeIntegration: false') &&
  main.includes('sandbox: true') &&
  main.includes('webSecurity: true'));

console.log(`\n${passed}/${passed+failed} checks passed.`);
process.exit(failed?1:0);
