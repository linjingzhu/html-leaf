const fs=require('fs');

const html=fs.readFileSync('src/renderer/index.html','utf8');
const js=fs.readFileSync('src/renderer/renderer.js','utf8');
const css=fs.readFileSync('src/renderer/styles.css','utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exit(1);}
  passed++;console.log(`PASS ${name}`);
}

check('Preference exposes Dark, Light, and Carbon themes',
  ['dark','light','carbon'].every(theme=>html.includes(`data-pref-theme="${theme}"`)));
check('Carbon owns an independent Preference check state',
  html.includes('class="check theme-carbon"')&&js.includes("state.preferences.theme==='carbon'?'✓':''"));
check('Carbon uses five deliberate monochrome surface levels',
  css.includes('body[data-theme="carbon"]')&&['#050607','#0a0b0d','#101113','#17181b','#020304'].every(color=>css.includes(color)));
check('Carbon replaces blue interaction color with silver',
  css.includes('--focus-ring:#e3e3df')&&css.includes('--selection:#c9c9c5')&&css.includes('--accent:#deded9'));
check('Carbon preserves readable off-white text hierarchy',
  css.includes('--foreground:#f1f1ee')&&css.includes('--text-secondary:#c5c5c1')&&css.includes('--muted:#85868a'));
check('Carbon uses tighter industrial geometry',
  css.includes('--radius-control:2px')&&css.includes('--radius-popup:3px')&&css.includes('--radius-panel:2px'));
check('Carbon keeps semantic status colors distinct',
  css.includes('--success:#9eaaa2')&&css.includes('--warning:#b5aa98')&&css.includes('--error:#cf7478'));
check('Carbon theme is selected and persisted through the shared theme handler',
  js.includes('state.preferences.theme=button.dataset.prefTheme')&&js.includes('applyPreferences(); persist(); closeAllMenus()'));
check('Carbon affects app chrome without styling document iframe content',
  css.includes('body[data-theme="carbon"] .menubar')&&!css.includes('body[data-theme="carbon"] iframe'));
check('Dark and Light theme definitions remain intact',
  css.includes(':root{')&&css.includes('body[data-theme="light"]'));

console.log(`Leaf Carbon theme regression QA: ${passed}/10 PASS`);
