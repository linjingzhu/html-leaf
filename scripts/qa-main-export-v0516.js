const fs=require('fs');
const fsp=require('fs/promises');
const os=require('os');
const path=require('path');
const vm=require('vm');

async function main(){
  const root=path.join(__dirname,'..');
  const source=fs.readFileSync(path.join(root,'src/main.js'),'utf8')+'\n;globalThis.__leafExportTest={exportPageAs,printableHtml};';
  const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'leaf-page-export-qa-'));
  let destination='';let lastWindowOptions=null;let printCalls=0;let loadedHtml='';
  class MockBrowserWindow{
    constructor(options){lastWindowOptions=options;this.destroyed=false;this.webContents={printToPDF:async options=>{printCalls++;if(!options.printBackground||!options.preferCSSPageSize)throw new Error('Missing PDF options');return Buffer.from('%PDF-1.7\nLEAF-QA');}};}
    async loadFile(filePath){loadedHtml=await fsp.readFile(filePath,'utf8');}
    isDestroyed(){return this.destroyed;}
    destroy(){this.destroyed=true;}
    static getAllWindows(){return[];}
  }
  const electron={
    app:{setName(){},setAppUserModelId(){},getPath(){return temp;},whenReady(){return{then(){}}},on(){},quit(){}},
    BrowserWindow:MockBrowserWindow,clipboard:{write(){},writeText(){}},ipcMain:{handle(){}},
    dialog:{async showSaveDialog(){return{canceled:false,filePath:destination}}}
  };
  const context={console,process,Buffer,URL,setTimeout,clearTimeout,require:id=>id==='electron'?electron:require(id)};
  vm.runInNewContext(source,context,{filename:'src/main.js'});
  const api=context.__leafExportTest;let passed=0;
  const check=(name,condition)=>{if(!condition)throw new Error(`FAIL ${name}`);passed++;console.log(`PASS ${name}`);};
  try{
    for(const [format,extension,text] of [['html','html','<h1>Leaf</h1>'],['markdown','md','# Leaf'],['json','json','{"leaf":true}']]){
      destination=path.join(temp,`page-${format}`);
      const result=await api.exportPageAs({format,suggestedName:`page.${extension}`,source:text,sourceType:format});
      check(`${format} Save Page As writes the requested text format`,result.endsWith(`.${extension}`)&&(await fsp.readFile(result,'utf8'))===text);
    }
    destination=path.join(temp,'rendered');
    const pdfPath=await api.exportPageAs({format:'pdf',suggestedName:'rendered.pdf',source:'<!doctype html><html><body><h1>Leaf PDF</h1><script>alert(1)</script></body></html>',sourceType:'html',baseUrl:'file:///C:/safe/'});
    const pdf=await fsp.readFile(pdfPath);
    check('Rendered PDF is a real binary print output',pdf.subarray(0,4).toString()==='%PDF'&&printCalls===1);
    check('PDF print window is hidden, sandboxed, and JavaScript-disabled',lastWindowOptions.show===false&&lastWindowOptions.webPreferences.sandbox===true&&lastWindowOptions.webPreferences.javascript===false&&loadedHtml.includes("script-src 'none'"));
    const originalPdf=path.join(temp,'original.pdf');await fsp.writeFile(originalPdf,Buffer.from('%PDF-1.4\nORIGINAL'));
    destination=path.join(temp,'copied');
    const copied=await api.exportPageAs({format:'pdf',sourceType:'pdf',sourcePath:originalPdf});
    check('Existing PDF Save As copies the original binary without rendering',Buffer.compare(await fsp.readFile(copied),await fsp.readFile(originalPdf))===0&&printCalls===1);
    let rejected=false;try{destination=path.join(temp,'bad');await api.exportPageAs({format:'webp',source:'x'});}catch(error){rejected=/Unsupported/.test(error.message);}
    check('Save Page As rejects formats outside HTML, Markdown, JSON, and PDF',rejected);
    console.log(`Leaf v0.5.16 main-process Page export QA: ${passed}/7 PASS`);
  }finally{await fsp.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.stack||error);process.exit(1);});
