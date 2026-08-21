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
check('Electron runtime name is Leaf',main.includes("app.setName('Leaf')")&&main.includes("title: 'Leaf'"));
check('Renderer document and product mark are labelled Leaf',html.includes('<title>Leaf</title>')&&html.includes('title="Leaf" aria-label="Leaf"'));
check('Executable and installer artifacts use Leaf filenames',pkg.build?.win?.artifactName?.startsWith('Leaf-')&&pkg.build?.nsis?.artifactName?.startsWith('Leaf-Setup-'));
check('Desktop and Start Menu shortcuts are named Leaf',pkg.build?.nsis?.shortcutName==='Leaf');
check('Leaf container dialogs use the Leaf product name',main.split("name: 'Leaf Project'").length===3||main.split("name: 'Leaf Document'").length===3);

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v0510.js')],{stdio:'inherit'});
check('qa-v0510.js regression',prior.status===0);
console.log(`v0.5.11 Leaf identity regression QA: ${passed}/8 PASS`);
