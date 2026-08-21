const fs=require('fs');

const js=fs.readFileSync('src/renderer/renderer.js','utf8');
const fidelity=fs.readFileSync('src/renderer/source-fidelity.js','utf8');
let passed=0;
function check(name,condition){
  if(!condition){console.error(`FAIL ${name}`);process.exit(1);}
  passed++;console.log(`PASS ${name}`);
}

check('Viewport scrollbar owns a fixed eight-pixel visual target',
  js.includes('const PREVIEW_SCROLLBAR_VISUAL_SIZE=8'));
check('Runtime scrollbar dimensions are inverse to document zoom',
  js.includes('function runtimePreviewScrollbarCss(zoom=100)')&&
  js.includes('const px=value=>')&&js.includes('value/scale'));
check('Width, height, border, and radius are compensated together',
  js.includes('width:${px(PREVIEW_SCROLLBAR_VISUAL_SIZE)}')&&
  js.includes('height:${px(PREVIEW_SCROLLBAR_VISUAL_SIZE)}')&&
  js.includes('border:${px(2)} solid transparent')&&js.includes('border-radius:${px(8)}'));
check('Every zoom application refreshes scrollbar compensation',
  js.includes('surface.style.zoom=String(zoom/100);')&&
  js.includes('applyPreviewScrollbarCompensation(slot,zoom);'));
check('Every frame load reapplies the current zoom compensation',
  js.includes('if(slot)applyPreviewScrollbarCompensation(slot);'));
check('Static preview runtime style is removable editor metadata',
  js.includes('data-editor-overlay="1" data-leaf-scrollbar-runtime="1"')&&
  js.includes('runtimePreviewScrollbarCss(previewZoomForSlot(slot))'));
check('Interactive isolated previews use a token-protected zoom bridge',
  js.includes('__leafViewportChromeScale:true,token,css')&&
  js.includes('event.data.__leafViewportChromeScale===true && event.data.token===TOKEN'));
check('Markdown and JSON source editors receive the same compensation',
  js.includes('buildDirectSourceEditor(page,directToken,previewZoomForSlot(slot))')&&
  js.includes("if(data.__leafViewportChromeScale===true){const style=document.querySelector('[data-leaf-scrollbar-runtime]')"));
check('Compensation state is observable without touching Page source',
  js.includes("frame.dataset.scrollbarVisualSize=String(PREVIEW_SCROLLBAR_VISUAL_SIZE)")&&
  js.includes("frame.dataset.scrollbarCompensation=applied?'inverse-zoom':'native'"));
check('Scrollbar runtime metadata is removed and leakage-detected',
  fidelity.includes('[data-leaf-scrollbar-runtime]')&&
  fidelity.includes("'data-leaf-scrollbar-runtime'")&&fidelity.includes('editorArtifactReport'));

console.log(`Leaf zoom-independent scrollbar regression QA: ${passed}/10 PASS`);
