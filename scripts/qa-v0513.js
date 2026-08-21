const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('src/renderer/index.html');
const css=read('src/renderer/styles.css');
const js=read('src/renderer/renderer.js');
const jiraExportSource=read('src/renderer/jira-export.js');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Ctrl-wheel zoom captures the outer cursor position',js.includes('capturePreviewZoomAnchor(')&&js.includes('restorePreviewZoomAnchor(')&&js.includes("anchor:{clientX:event.clientX,clientY:event.clientY}"));
check('Static iframe wheel coordinates are translated into the outer viewport',js.includes('function outerPointForFrameEvent(')&&js.includes('{anchor:outerPointForFrameEvent(frame,event)}'));
check('Interactive iframe bridge forwards wheel cursor coordinates',js.includes('clientX:event.clientX')&&js.includes('clientY:event.clientY')&&js.includes("data.kind==='zoom'"));
check('Check Atlassian opens a dedicated Split preview',js.includes('openAtlassianSplitPreview(page,{semantic,sourceKind,diagnostics})')&&js.includes("state.mode='split'")&&js.includes('state.views.left=page.id'));
check('Atlassian right pane identifies Jira ticket body and file formats',html.includes('Jira ticket body')&&html.includes('data-atlassian-format="markdown"')&&html.includes('data-atlassian-format="adf"')&&html.includes('accept=".md,.markdown,.json'));
check('Normal right-document controls are hidden only during Atlassian Preview',css.includes('.atlassian-preview-active>.view-pane-head>#rightPageSelect')&&css.includes('.atlassian-preview-active .preview-canvas{display:block!important}'));
check('Atlassian Preview accepts dropped Markdown and ADF JSON',js.includes('function isAtlassianPreviewFile(')&&js.includes('function loadAtlassianPreviewFile(')&&js.includes('window.JiraExport.adfToRichHtml(JSON.parse(text))'));
check('Jira preview document keeps a restrictive CSP',js.includes("default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: file: https: http:"));

const context={window:{},URL};
vm.runInNewContext(jiraExportSource,context,{filename:'jira-export.js'});
const markdown=context.window.JiraExport.markdownToRichHtml('# Title\n\n- **one**\n- two\n\n```\n<script>alert(1)</script>\n```');
check('Markdown renderer produces Jira-style structure and escapes scripts',markdown.includes('<h1>Title</h1>')&&markdown.includes('<ul>')&&markdown.includes('&lt;script&gt;alert(1)&lt;/script&gt;')&&!markdown.includes('<script>alert'));
const adf=context.window.JiraExport.adfToRichHtml({fields:{description:{version:1,type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'ADF'}]},{type:'paragraph',content:[{type:'text',text:'Body',marks:[{type:'strong'}]}]}]}}});
check('ADF renderer accepts Jira REST fields.description',adf.includes('<h2>ADF</h2>')&&adf.includes('<strong>Body</strong>'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0512.js')],{stdio:'inherit'});
check('qa-v0512.js regression',prior.status===0);
console.log(`v0.5.13 cursor zoom + Atlassian Split regression QA: ${passed}/11 PASS`);
