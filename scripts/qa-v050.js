const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),main=fs.readFileSync(path.join(root,'src/main.js'),'utf8'),js=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8'),fid=fs.readFileSync(path.join(root,'src/renderer/source-fidelity.js'),'utf8');
let p=0,f=0;function c(n,v){if(v){console.log('PASS ',n);p++;}else{console.error('FAIL ',n);f++;}}
c('Atomic write helper exists',main.includes('async function atomicWriteFile'));
c('HTML export uses atomic write',main.includes("atomicWriteFile(filePath, source, 'utf8')"));
c('Project save uses atomic write',main.includes("atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8')"));
c('Central editor sanitizer exists',fid.includes('stripEditorArtifactsFromDocument'));
c('Leakage report exists',fid.includes('editorArtifactReport'));
c('Minimal direct-text patch PoC exists',fid.includes('tryMinimalDirectTextPatch'));
c('Inspector tries minimal patch first',js.includes('tryInspectorMinimalPatch'));
c('Serialization blocks leakage',js.includes('Source commit blocked: editor metadata detected'));
c('Table selection runtime class is sanitized',fid.includes("'table-cell-selected'"));
c('Destructive clear snapshots undo',/function clearLoadedHtml\(\)[\s\S]*?pushUndo\(page\);[\s\S]*?page\.source='';/.test(js));
const q=cp.spawnSync(process.execPath,[path.join(root,'scripts/qa-source-fidelity.js')],{encoding:'utf8'});process.stdout.write(q.stdout||'');process.stderr.write(q.stderr||'');c('Source fidelity suite passes',q.status===0);
console.log(`\n${p}/${p+f} checks passed.`);process.exit(f||q.status?1:0);
