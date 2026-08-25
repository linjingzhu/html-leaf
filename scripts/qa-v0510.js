const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const readBinary=file=>fs.readFileSync(path.join(root,file));
const html=read('src/renderer/index.html');
const css=read('src/renderer/styles.css');
const main=read('src/main.js');
const pkg=JSON.parse(read('package.json'));
const ico=readBinary('build/icon.ico');
const productPng=readBinary('src/renderer/assets/product-icon.png');
let passed=0;
function check(name,condition){if(!condition){console.error(`FAIL ${name}`);process.exit(1);}passed++;console.log(`PASS ${name}`);}

check('Windows ICO contains a multi-resolution icon directory',ico.readUInt16LE(2)===1&&ico.readUInt16LE(4)>=9);
check('Renderer product PNG is a valid 512px square PNG',productPng.subarray(1,4).toString()==='PNG'&&productPng.readUInt32BE(16)===512&&productPng.readUInt32BE(20)===512);
check('BrowserWindow uses the branded Windows icon',main.includes("icon: path.join(__dirname, '..', 'build', 'icon.ico')"));
check('Main menu begins without an embedded product mark',!html.includes('class="product-mark"')&&html.includes('<nav class="main-menu" id="mainMenu"'));
check('Removed product mark leaves no application-bar gutter styles',!css.includes('.product-mark{')&&!css.includes('.product-mark img{'));
check('Windows package uses branded application icon',pkg.build?.win?.icon==='build/icon.ico');
check('Windows executable uses the branded Leaf icon',pkg.build?.win?.icon==='build/icon.ico'&&pkg.build?.productName==='Leaf');
check('Branded icon ships inside the portable package',Array.isArray(pkg.build?.files)&&pkg.build.files.includes('build/icon.ico'));

const prior=spawnSync(process.execPath,[path.join(__dirname,'qa-v059.js')],{stdio:'inherit'});
check('qa-v059.js regression',prior.status===0);
console.log(`v0.5.10 product icon regression QA: ${passed}/9 PASS`);
