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

check('Preference exposes Dark, Light, and Carbon only',
  ['dark', 'light', 'carbon'].every(theme => html.includes(`data-pref-theme="${theme}"`)) &&
  !html.includes('data-pref-theme="codex"') &&
  !html.includes('theme-codex'));

check('Light is the visible default Preference selection',
  html.includes('data-pref-theme="light">Light <span class="check theme-light">✓</span>'));

check('Theme policy normalizes unsupported or legacy themes to Light',
  themePolicy.includes("const ALLOWED_THEMES = new Set(['dark', 'light', 'carbon'])") &&
  themePolicy.includes("return ALLOWED_THEMES.has(theme) ? theme : 'light'") &&
  themePolicy.includes('normalizeSerializedState'));

check('Theme policy removes any legacy Codex controls if old markup is encountered',
  themePolicy.includes('removeCodexControls') &&
  themePolicy.includes('[data-pref-theme="codex"]') &&
  themePolicy.includes('.theme-codex'));

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

console.log(`Leaf Light theme policy QA: ${passed}/7 PASS`);
