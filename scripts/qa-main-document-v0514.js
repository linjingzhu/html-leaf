const fs=require('fs');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const vm=require('vm');

async function main(){
  const root=path.join(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8')+'\n;globalThis.__leafMainTest={readDocumentPath,documentTypeForPath,exportObjectAssets};';
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'leaf-main-qa-'));
  const output=path.join(temp,'exports');await fsp.mkdir(output);
  const electron={
    app:{setName(){},setAppUserModelId(){},getPath(){return temp;},whenReady(){return{then(){}}},on(){},quit(){}},
    BrowserWindow:function(){},clipboard:{write(){},writeText(){}},ipcMain:{handle(){}},
    dialog:{async showOpenDialog(){return{canceled:false,filePaths:[output]}}}
  };
  const context={console,process,Buffer,URL,setTimeout,clearTimeout,require:id=>id==='electron'?electron:require(id)};
  vm.runInNewContext(source,context,{filename:'src/main.js'});
  const api=context.__leafMainTest;let passed=0;
  const check=(name,condition)=>{if(!condition)throw new Error(`FAIL ${name}`);passed++;console.log(`PASS ${name}`);};
  try{
    const htmlPath=path.join(temp,'page.html'),mdPath=path.join(temp,'notes.md'),pdfPath=path.join(temp,'guide.pdf'),txtPath=path.join(temp,'bad.txt');
    await fsp.writeFile(htmlPath,'<!doctype html><h1>Leaf</h1>');await fsp.writeFile(mdPath,'# Leaf');await fsp.writeFile(pdfPath,Buffer.from('%PDF-1.4\n'));await fsp.writeFile(txtPath,'no');
    const html=await api.readDocumentPath(htmlPath),md=await api.readDocumentPath(mdPath),pdf=await api.readDocumentPath(pdfPath);
    check('Main loader classifies HTML, Markdown, and PDF',html.documentType==='html'&&md.documentType==='markdown'&&pdf.documentType==='pdf');
    check('PDF remains binary/read-only and uses a file preview URL',pdf.source===''&&pdf.previewUrl.startsWith('file:'));
    let unsupported=false;try{await api.readDocumentPath(txtPath);}catch{unsupported=true;}
    check('Unsupported Explorer files are rejected',unsupported);
    const large=path.join(temp,'large.html');const handle=await fsp.open(large,'w');await handle.truncate(50_000_001);await handle.close();
    let oversized=false;try{await api.readDocumentPath(large);}catch(error){oversized=/50 MB/.test(error.message);}
    check('Oversized text documents are rejected before reading',oversized);
    const png='data:image/png;base64,iVBORw0KGgo=';
    const exported=await api.exportObjectAssets({format:'png',items:[{suggestedName:'same.png',source:png},{suggestedName:'same.png',source:png}]});
    check('Batch export creates one unique file per selected object',exported.length===2&&path.basename(exported[0])==='same.png'&&path.basename(exported[1])==='same-2.png'&&exported.every(file=>fs.existsSync(file)));
    check('Batch export leaves no staging artifacts',!(await fsp.readdir(output)).some(name=>name.includes('.leaf-stage-')));
    console.log(`Leaf v0.5.14 main-process adversarial QA: ${passed}/6 PASS`);
  }finally{await fsp.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.stack||error);process.exit(1);});
