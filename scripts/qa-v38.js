const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

const html=fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
const renderer=fs.readFileSync(path.join(root,'src/renderer/renderer.js'),'utf8');
const semantic=fs.readFileSync(path.join(root,'src/renderer/semantic-document.js'),'utf8');
const jira=fs.readFileSync(path.join(root,'src/renderer/jira-export.js'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'src/preload.js'),'utf8');

let pass=0,fail=0;
function check(name,ok){
  if(ok){console.log('PASS ',name);pass++;}
  else{console.error('FAIL ',name);fail++;}
}

check('Jira export menu actions exist',
  ['jira-export','copy-jira','copy-markdown','export-adf'].every(a=>html.includes(`data-action="${a}"`)));
check('Jira export modal exists',html.includes('id="jiraExportModal"')&&html.includes('data-jira-mode="adf"'));
check('Semantic parser loaded before renderer',
  html.indexOf('semantic-document.js') < html.indexOf('renderer.js') &&
  html.indexOf('jira-export.js') < html.indexOf('renderer.js'));
check('Semantic mapping supports core HTML',
  ['H1','TABLE','UL','BLOCKQUOTE','PRE'].every(token=>semantic.includes(token)));
check('Semantic callout maps to panel',semantic.includes("data-hbe-object=\"panel\"")&&semantic.includes("type: 'panel'"));
check('ADF root is version 1 doc',jira.includes('version: 1')&&jira.includes("type: 'doc'"));
check('ADF supports panel/table/codeBlock',
  jira.includes("type: 'panel'")&&jira.includes("type: 'table'")&&jira.includes("type: 'codeBlock'"));
check('Rich Jira clipboard includes HTML + text',
  main.includes('clipboard.write({')&&main.includes('html: String(html'));
check('Preload exposes rich clipboard',preload.includes('writeRichClipboard'));
check('Markdown copy is wired',renderer.includes('copyCurrentPageAsMarkdown'));
check('ADF JSON export is wired',renderer.includes('exportCurrentPageAdf'));
check('Scripted DOM snapshot bridge exists',
  renderer.includes('__hbeRenderedSnapshot')&&renderer.includes('__hbeSnapshotRequest'));
check('Snapshot message validates frame/token',
  renderer.includes('event.source')&&renderer.includes('frame.dataset.snapshotToken'));
check('Offscreen scripted export renderer exists',renderer.includes('renderScriptedPageForExport'));
check('Electron hardened settings unchanged',
  main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false')&&main.includes('sandbox: true')&&main.includes('webSecurity: true'));
check('Object authoring plan created',fs.existsSync(path.join(root,'docs/HTML_OBJECT_AUTHORING_PLAN.md')));

console.log(`\n${pass}/${pass+fail} checks passed.`);
process.exit(fail?1:0);
