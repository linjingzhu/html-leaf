const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, value) {
  fs.writeFileSync(path.join(root, file), value);
}

function replaceAllIfPresent(source, replacements) {
  let next = source;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

function removeCodexThemeCss(css) {
  const marker = '/* Codex-inspired application chrome.';
  const start = css.indexOf(marker);
  if (start < 0) return css;
  const endMarker = '\n\n*{box-sizing:border-box}';
  const end = css.indexOf(endMarker, start);
  if (end < 0) throw new Error('src/renderer/styles.css: Codex theme block end marker not found.');
  return `${css.slice(0, start).replace(/\n+$/, '\n')}${css.slice(end)}`;
}

function removeCodexPreferenceButton(html) {
  return html.replace(/\n\s*<button data-pref-theme="codex">Codex <span class="check theme-codex">.*?<\/span><\/button>/, '');
}

function cleanupRenderer() {
  const file = 'src/renderer/renderer.js';
  const source = read(file);
  let next = replaceAllIfPresent(source, [
    ["theme:'codex'", "theme:'light'"],
    ["state.preferences.theme || 'codex'", "state.preferences.theme || 'light'"]
  ]);
  next = next.replace(/\n\s*\$\$\('\.theme-codex'\)\.forEach\([^\n]+\);/, '');
  next = next.replace(
    'state.preferences.theme=button.dataset.prefTheme;',
    "state.preferences.theme=['dark','light','carbon'].includes(button.dataset.prefTheme)?button.dataset.prefTheme:'light';"
  );
  if (next.includes("theme:'codex'") || next.includes("state.preferences.theme || 'codex'")) {
    throw new Error(`${file}: legacy Codex theme defaults remain after cleanup.`);
  }
  write(file, next);
}

function cleanupIndex() {
  const file = 'src/renderer/index.html';
  const source = read(file);
  const next = removeCodexPreferenceButton(source)
    .replace('Light <span class="check theme-light"></span>', 'Light <span class="check theme-light">✓</span>');
  write(file, next);
}

function cleanupStyles() {
  const file = 'src/renderer/styles.css';
  const source = read(file);
  write(file, removeCodexThemeCss(source));
}

function cleanupStaticQa() {
  const file = 'scripts/qa-static.js';
  const source = read(file);
  if (source.includes('without legacy Codex source')) return;
  let next = source.replace(
    /check\('Dark, Light, Carbon, and Codex themes are exposed',[\s\S]*?check\('Theme CSS does not leak into Page iframes'/,
    `check('Dark, Light, and Carbon themes are exposed without legacy Codex source',\n  ['dark', 'light', 'carbon'].every(theme => html.includes(\`data-pref-theme="\${theme}"\`)) &&\n  !html.includes('data-pref-theme="codex"') &&\n  css.includes(':root{') && css.includes('body[data-theme="light"]') && css.includes('body[data-theme="carbon"]') &&\n  !css.includes('body[data-theme="codex"]'));\ncheck('Light is the default preference theme',\n  renderer.includes("scale:1, theme:'light'") && renderer.includes("state.preferences.theme || 'light'") &&\n  !renderer.includes("theme:'codex'") && !renderer.includes("state.preferences.theme || 'codex'"));\ncheck('Theme CSS does not leak into Page iframes'`
  );
  if (next === source) throw new Error(`${file}: failed to rewrite legacy Codex QA checks.`);
  write(file, next);
}

function cleanupThemeLightQa() {
  const file = 'scripts/qa-theme-light-v0516.js';
  const source = read(file);
  if (source.includes('Light theme source contains no Codex option or CSS')) return;
  const insertion = `\ncheck('Light theme source contains no Codex option or CSS',\n  !html.includes('data-pref-theme="codex"') && !js.includes("theme:'codex'") &&\n  !js.includes("state.preferences.theme || 'codex'") && !css.includes('body[data-theme="codex"]'));\n`;
  const next = source.replace('\nconsole.log(`Leaf Light theme policy QA: ${passed}/7 PASS`);', `${insertion}\nconsole.log(\`Leaf Light theme policy QA: \${passed}/8 PASS\`);`);
  if (next === source) throw new Error(`${file}: failed to add Light source cleanup assertion.`);
  write(file, next);
}

function removeHistoricalCodexQa() {
  const file = path.join(root, 'scripts/qa-theme-codex-v0516.js');
  if (fs.existsSync(file)) fs.rmSync(file);
}

cleanupRenderer();
cleanupIndex();
cleanupStyles();
cleanupStaticQa();
cleanupThemeLightQa();
removeHistoricalCodexQa();
console.log('Roadmap source cleanup applied: Light default, Codex theme source removed.');
