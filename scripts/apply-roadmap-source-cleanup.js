const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, value) {
  fs.writeFileSync(path.join(root, file), value);
}

function replaceAllOrThrow(file, source, replacements) {
  let next = source;
  for (const [from, to] of replacements) {
    if (!next.includes(from)) {
      throw new Error(`${file}: expected source fragment not found: ${from}`);
    }
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
  let next = replaceAllOrThrow(file, source, [
    ["theme:'codex'", "theme:'light'"],
    ["state.preferences.theme || 'codex'", "state.preferences.theme || 'light'"]
  ]);
  next = next.replace(/\n\s*\$\$\('\.theme-codex'\)\.forEach\([^\n]+\);/, '');
  next = next.replace(
    'state.preferences.theme=button.dataset.prefTheme;',
    "state.preferences.theme=['dark','light','carbon'].includes(button.dataset.prefTheme)?button.dataset.prefTheme:'light';"
  );
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

function removeHistoricalCodexQa() {
  const file = path.join(root, 'scripts/qa-theme-codex-v0516.js');
  if (fs.existsSync(file)) fs.rmSync(file);
}

cleanupRenderer();
cleanupIndex();
cleanupStyles();
removeHistoricalCodexQa();
console.log('Roadmap source cleanup applied: Light default, Codex theme source removed.');
