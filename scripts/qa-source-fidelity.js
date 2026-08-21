const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),fixtures=path.join(root,'tests/html-fixtures');
let p=0,f=0;function c(n,v,d=''){if(v){console.log('PASS ',n);p++;}else{console.error('FAIL ',n,d);f++;}}
const files=fs.readdirSync(fixtures).filter(x=>x.endsWith('.html'));c('10 golden fixtures present',files.length>=10,files.length);
const bad=['data-editor-overlay','data-adf-marker','data-hbe-drop-line','data-editor-element-id','class="table-cell-selected"','viewport-object-drop-target'];
for(const file of files){const s=fs.readFileSync(path.join(fixtures,file),'utf8');c(`${file}: raw fixture has no editor leakage`,!bad.some(x=>s.includes(x)));}
function patchUniqueText(source,oldText,newText){const count=source.split(oldText).length-1;if(count!==1)return{ok:false,source};return{ok:true,source:source.replace(oldText,newText)};}
const simple=fs.readFileSync(path.join(fixtures,'01-simple.html'),'utf8');const patched=patchUniqueText(simple,'Hello World','New Title');
c('single text edit patch succeeds',patched.ok);c('single text edit produces exact expected source',patched.source===simple.replace('Hello World','New Title'));
c('ambiguous text edit is rejected',patchUniqueText('<p>Same</p><p>Same</p>','Same','New').ok===false);
console.log(`\n${p}/${p+f} checks passed.`);process.exit(f?1:0);
