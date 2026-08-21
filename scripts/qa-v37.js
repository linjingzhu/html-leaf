const fs=require('node:fs'); const path=require('node:path'); const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8'); const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'); const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'); const sample=fs.readFileSync('/mnt/data/DEV-20454-Multi-Layer and Keyframe Selection State Definition- (2).html','utf8');
let p=0,f=0; function c(n,v){if(v){console.log('PASS ',n);p++;}else{console.error('FAIL ',n);f++;}}
c('Sample is script-driven',sample.includes('function render()')&&sample.includes('render();')&&sample.includes('<div id="body"></div>'));
c('Script pages detected',js.includes('function pageRequiresScripts(page)')&&js.includes('<script\\b'));
c('Script runtime uses allow-scripts only',js.includes("frame.setAttribute('sandbox','allow-scripts')")&&!js.includes('allow-scripts allow-same-origin'));
c('Static runtime uses allow-same-origin',js.includes("frame.setAttribute('sandbox','allow-same-origin')"));
c('Script CSP permits inline scripts',js.includes("script-src 'unsafe-inline'"));
c('Script runtime blocks connect',js.includes("connect-src 'none'"));
c('Interactive preview bypasses Inspector DOM',js.includes("previewRuntime==='interactive-isolated'"));
c('All Clear buttons exist',['single','left','right','codePreview','codePage'].every(s=>html.includes(`data-clear-slot="${s}"`)));
c('Clear modal exists',html.includes('id="clearHtmlModal"')&&html.includes('id="clearHtmlConfirm"'));
c('Clear makes page empty',js.includes("page.source=''")&&js.includes('page.isEmpty=true')&&js.includes('page.baseUrl=null'));
c('Electron security hardened',main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false')&&main.includes('sandbox: true')&&main.includes('webSecurity: true'));
console.log(`\n${p}/${p+f} checks passed.`); process.exit(f?1:0);
