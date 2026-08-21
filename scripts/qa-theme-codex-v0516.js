const fs=require('fs');

const html=fs.readFileSync('src/renderer/index.html','utf8');
const js=fs.readFileSync('src/renderer/renderer.js','utf8');
const css=fs.readFileSync('src/renderer/styles.css','utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exit(1);}
  passed++;
  console.log(`PASS ${name}`);
}

check('Preference exposes Codex without removing existing themes',
  ['dark','light','carbon','codex'].every(theme=>html.includes(`data-pref-theme="${theme}"`)));
check('Codex owns an independent Preference check state',
  html.includes('class="check theme-codex"')&&js.includes("state.preferences.theme==='codex'?'✓':''"));
check('Codex is the default for new preference state',
  js.includes("scale:1, theme:'codex'")&&js.includes("state.preferences.theme || 'codex'"));
check('Codex uses the observed neutral surface hierarchy',
  css.includes('body[data-theme="codex"]')&&['#000000','#111111','#181818','#212121','#282828'].every(color=>css.includes(color)));
check('Codex text and low-contrast borders are represented by semantic tokens',
  css.includes('--foreground:#dfdfdf')&&css.includes('--text-secondary:rgba(255,255,255,.70)')&&
  css.includes('--border:rgba(255,255,255,.08)')&&css.includes('--border-strong:rgba(255,255,255,.16)'));
check('Codex uses the blue focus and selection family',
  css.includes('--focus-ring:rgba(51,156,255,.70)')&&css.includes('--accent:#339cff')&&css.includes('--selected:#00284d'));
check('Codex geometry follows the 4px-based rounded system',
  css.includes('--radius-control:8px')&&css.includes('--radius-popup:12px')&&css.includes('--radius-panel:10px')&&
  css.includes('--control-h:32px')&&css.includes('--row-h:30px'));
check('Codex styles core chrome and controls without touching Page iframes',
  ['.menubar','.menu-trigger','.tree-row','.seg button','.property-group','.btn'].every(selector=>css.includes(`body[data-theme="codex"] ${selector}`))&&
  !css.includes('body[data-theme="codex"] iframe'));
check('Codex scrollbars use transparent tracks and semantic thumb contrast',
  css.includes('scrollbar-color:var(--border) transparent')&&css.includes('scrollbar-color:var(--border-strong) transparent')&&
  css.includes('body[data-theme="codex"] *::-webkit-scrollbar{width:10px;height:10px}'));
check('Edit outline renders outside a reserved View gutter',
  css.includes('--view-outline-gutter:2px')&&css.includes('padding:var(--view-outline-gutter)')&&
  css.includes('outline:2px solid #ff3f46;outline-offset:0')&&!css.includes('outline:2px solid #ff3f46;outline-offset:-2px'));
check('Codex preview canvas and top-right mode toggle use harmonious surfaces',
  css.includes('--canvas:#111111')&&css.includes('iframe{width:100%;height:100%;border:0;background:var(--canvas)')&&
  css.includes('body[data-theme="codex"] .seg{padding:2px;background:var(--panel-secondary)')&&
  css.includes('background:color-mix(in srgb,var(--accent) 18%,var(--panel-secondary))'));
check('Dark, Light, and Carbon definitions remain intact',
  css.includes(':root{')&&css.includes('body[data-theme="light"]')&&css.includes('body[data-theme="carbon"]'));

console.log(`Leaf Codex theme regression QA: ${passed}/12 PASS`);
