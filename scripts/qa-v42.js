const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/renderer/styles.css'),'utf8');
let p=0,f=0;
function c(n,v){if(v){console.log('PASS ',n);p++;}else{console.error('FAIL ',n);f++;}}
c('Preset registry exists',js.includes('const PREVIEW_DEVICE_PRESETS=['));
c('iPhone 17 Pro preset',js.includes("id:'iphone17pro'")&&js.includes('size:[1206,2622]'));
c('iPhone 17 Pro Max preset',js.includes("id:'iphone17promax'")&&js.includes('size:[1320,2868]'));
c('MacBook Air preset',js.includes("id:'macbookair13m4'")&&js.includes('size:[2560,1664]'));
c('MacBook Pro preset',js.includes("id:'macbookpro14m4'")&&js.includes('size:[3024,1964]'));
c('iMac preset',js.includes("id:'imac24m4'")&&js.includes('size:[4480,2520]'));
c('Preset optgroups',js.includes('<optgroup label='));
c('Orientation button installed',js.includes('installPreviewOrientationButtons')&&css.includes('.viewport-orientation-btn'));
c('Orientation swaps dimensions',js.includes('config.width=height')&&js.includes('config.height=width'));
c('Responsive remains available',js.includes("id:'responsive'"));
console.log(`\n${p}/${p+f} checks passed.`);
process.exit(f?1:0);