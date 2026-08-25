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
  ['dark', 'light'].every(theme => html.includes(`data-pref-theme="${theme}"`)));

check('Theme policy normalizes unsupported or legacy themes to Light',
  themePolicy.includes("const ALLOWED_THEMES = new Set(['dark', 'light'])") &&
  themePolicy.includes("return ALLOWED_THEMES.has(theme) ? theme : 'light'") &&
  themePolicy.includes('normalizeSerializedState'));

check('Theme policy removes retired theme controls from the live Preference menu',
  themePolicy.includes('function removeRetiredThemeControls()') &&
  themePolicy.includes("const RETIRED_THEMES = ['codex', 'carbon']") &&
  themePolicy.includes('control.remove()') &&
  themePolicy.includes('mark.remove()'));

check('Theme policy makes Light the effective default body theme',
  themePolicy.includes('const nextTheme = normalizeTheme(document.body.dataset.theme)') &&
  themePolicy.includes('document.body.dataset.theme = nextTheme') &&
  themePolicy.includes('syncThemeChecks(nextTheme)'));

// The policy extension no longer intercepts localStorage.setItem: re-parsing the
// whole project payload on every write cost more than the clamp it enforced.
// The same guarantee now comes from clamping both renderer write paths and
// normalizing any value already on disk once at startup.
check('Renderer theme writes are clamped on every path that reaches stored state',
  js.includes("state.preferences.theme=['dark','light'].includes(button.dataset.prefTheme)?button.dataset.prefTheme:'light'") &&
  !js.includes('state.preferences.theme=button.dataset.prefTheme') &&
  js.includes("s.preferences.theme=['dark','light'].includes(s.preferences.theme)?s.preferences.theme:'light'") &&
  themePolicy.includes('function patchStoredStateOnce()') &&
  themePolicy.includes('patchStoredStateOnce();') &&
  !themePolicy.includes('localStorage.setItem = (key, value) =>'));

check('Light theme CSS is present and isolated from Page iframe content',
  css.includes('body[data-theme="light"]') &&
  !css.includes('body[data-theme="light"] iframe'));

check('Carbon is fully retired from the shell, styles and stored state',
  !html.includes('data-pref-theme="carbon"') && !html.includes('theme-carbon') &&
  !css.includes('body[data-theme="carbon"]') && !js.includes("'carbon'") &&
  themePolicy.includes("RETIRED_THEMES = ['codex', 'carbon']"));

check('Light theme source contains no Codex option or CSS',
  !html.includes('data-pref-theme="codex"') && !js.includes("theme:'codex'") &&
  !js.includes("state.preferences.theme || 'codex'") && !css.includes('body[data-theme="codex"]'));

console.log(`Leaf Light theme policy QA: ${passed}/8 PASS`);
