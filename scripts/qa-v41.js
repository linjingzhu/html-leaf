const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
let p=0,f=0;
function c(n,v){if(v){console.log('PASS ',n);p++;}else{console.error('FAIL ',n);f++;}}
c('Zoom indicator exists in Preview',html.includes('data-preview-zoom="single"'));
c('Zoom indicator exists in Split Left',html.includes('data-preview-zoom="left"'));
c('Zoom indicator exists in Split Right',html.includes('data-preview-zoom="right"'));
c('Zoom indicator exists in Code Preview',html.includes('data-preview-zoom="codePreview"'));
c('Zoom state defaults to 100',js.includes('state.previewZoom[slot]=100'));
c('Zoom indicator text is synchronized',js.includes('indicator.value=`${zoom}%`')&&js.includes('indicator.title=`Viewport zoom: ${zoom}%`'));
c('Zoom is refreshed with preview sizing',js.includes('updatePreviewZoomIndicator(slot);'));
c('Zoom indicator sits in the floating controls layer outside the canvas',css.includes('.viewport-zoom-indicator')&&css.includes('.viewport-zoom-control{')&&css.includes('position:static')&&js.includes("layer.className='viewport-floating-controls'"));
console.log(`\n${p}/${p+f} checks passed.`);
process.exit(f?1:0);
