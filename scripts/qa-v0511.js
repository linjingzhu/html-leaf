const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const pkg=JSON.parse(read('package.json'));
const main=read('src/main.js');
const html=read('src/renderer/index.html');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Package and product names are Leaf',pkg.name==='leaf'&&pkg.build?.productName==='Leaf');
check('Windows identity is registered for Leaf',pkg.build?.appId==='com.leaf.editor'&&main.includes("app.setAppUserModelId('com.leaf.editor')"));
check('Electron runtime name is Leaf',main.includes("app.setName('Leaf')")&&main.includes('return `Leaf v${app.getVersion()}`')&&main.includes('title: appTitle()'));
check('Renderer document is labelled Leaf without a menu-bar product mark',html.includes('<title>Leaf</title>')&&html.includes('aria-label="Application menu"')&&!html.includes('class="product-mark"'));
check('Windows artifacts use Leaf filenames',pkg.build?.win?.artifactName?.startsWith('Leaf-')&&pkg.build?.productName==='Leaf');
// Windows ships an installer again by request. The check keeps its original
// subject - that the Windows build produces Leaf-branded artifacts on the
// targets we intend - and now covers both of them.
check('Windows ships an installer and a portable zip, both Leaf-branded',
  JSON.stringify(pkg.build?.win?.target)==='["nsis","zip"]'
  &&/nsis/.test(pkg.scripts?.['dist:win']||'')
  &&pkg.build?.nsis?.artifactName?.startsWith('Leaf-Setup-')
  &&pkg.build?.nsis?.shortcutName==='Leaf');
check('Leaf container dialogs use the Leaf product name',main.split("name: 'Leaf Project'").length===3||main.split("name: 'Leaf Document'").length===3);

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0510.js')],{stdio:'inherit'});
check('qa-v0510.js regression',prior.status===0);
console.log(`v0.5.11 Leaf identity regression QA: ${passed}/8 PASS`);
