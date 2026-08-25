const fs = require('fs');

const html = fs.readFileSync('src/renderer/index.html', 'utf8');
const js = fs.readFileSync('src/renderer/renderer.js', 'utf8');
const css = fs.readFileSync('src/renderer/styles.css', 'utf8');
const themePolicy = fs.readFileSync('src/renderer/theme-policy.js', 'utf8');

let passed = 0;
function check(name, condition) {
  if (!condition) {
    console.error(`FAIL ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS ${name}`);
}

check('Preference exposes supported themes in the source shell',
  ['dark', 'light', 'carbon'].every(theme => html.includes(`data-pref-theme="${theme}"`)));

check('Theme policy normalizes unsupported or legacy themes to Light',
  themePolicy.includes("const ALLOWED_THEMES = new Set(['dark', 'light', 'carbon'])") &&
  themePolicy.includes("return ALLOWED_THEMES.has(theme) ? theme : 'light'") &&
  themePolicy.includes('normalizeSerializedState'));

check('Theme policy removes legacy Codex controls from the live Preference menu',
  themePolicy.includes('function removeCodexControls()') &&
  themePolicy.includes('[data-pref-theme="codex"]') &&
  themePolicy.includes('.theme-codex') &&
  themePolicy.includes('control.remove()'));

check('Theme policy makes Light the effective default body theme',
  themePolicy.includes('const nextTheme = normalizeTheme(document.body.dataset.theme)') &&
  themePolicy.includes('document.body.dataset.theme = nextTheme') &&
  themePolicy.includes('syncThemeChecks(nextTheme)'));

check('Renderer theme writes are guarded by the policy extension',
  js.includes('state.preferences.theme=button.dataset.prefTheme') &&
  themePolicy.includes('patchLocalStorageWrites') &&
  themePolicy.includes('localStorage.setItem = (key, value) =>'));

check('Light theme CSS is present and isolated from Page iframe content',
  css.includes('body[data-theme="light"]') &&
  !css.includes('body[data-theme="light"] iframe'));

check('Carbon remains available as the advanced dark appearance',
  html.includes('data-pref-theme="carbon"') &&
  css.includes('body[data-theme="carbon"]') &&
  !css.includes('body[data-theme="carbon"] iframe'));

check('Light theme source contains no Codex option or CSS',
  !html.includes('data-pref-theme="codex"') && !js.includes("theme:'codex'") &&
  !js.includes("state.preferences.theme || 'codex'") && !css.includes('body[data-theme="codex"]'));

console.log(`Leaf Light theme policy QA: ${passed}/8 PASS`);
