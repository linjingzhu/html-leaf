const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, value) {
  fs.writeFileSync(path.join(root, file), value);
}

function hasNormalized(source, fragment) {
  return source.replace(/\r\n/g, '\n').includes(fragment.replace(/\r\n/g, '\n'));
}

function replaceAllIfPresent(source, replacements) {
  let next = source;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

function replaceRequired(source, from, to, file, reason) {
  if (!source.includes(from)) {
    if (hasNormalized(source, to)) return source;
    throw new Error(`${file}: expected source fragment not found for ${reason}.`);
  }
  return source.split(from).join(to);
}

function replaceRequiredPattern(source, pattern, to, file, reason) {
  if (!pattern.test(source)) {
    if (hasNormalized(source, to)) return source;
    throw new Error(`${file}: expected source pattern not found for ${reason}.`);
  }
  return source.replace(pattern, to);
}

function removeCodexThemeCss(css) {
  const marker = '/* Codex-inspired application chrome.';
  const start = css.indexOf(marker);
  if (start < 0) return css;

  const endMatch = css.slice(start).match(/\r?\n\r?\n\*\{box-sizing:border-box\}/);
  if (!endMatch) throw new Error('src/renderer/styles.css: Codex theme block end marker not found.');

  const end = start + endMatch.index;
  return `${css.slice(0, start).replace(/[\r\n]+$/, '\n')}${css.slice(end)}`;
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
    "state.preferences.theme=['dark','light'].includes(button.dataset.prefTheme)?button.dataset.prefTheme:'light';"
  );
  if (next.includes("theme:'codex'") || next.includes("state.preferences.theme || 'codex'")) {
    throw new Error(`${file}: legacy Codex theme defaults remain after cleanup.`);
  }
  // The project is a per-run workspace by request: startup opens a clean one
  // instead of restoring the stored project, so the rule that used to rewrite
  // startup into loadState() restoration is retired. What still has to hold is
  // that the reset keeps the user's app settings, which is not project content.
  if (!next.includes('let state = startFreshProject(storedStateAtStartup);')) {
    throw new Error(`${file}: renderer no longer opens a fresh project at startup.`);
  }
  if (!next.includes('fresh.preferences=carried.preferences;') || !next.includes('fresh.layout=carried.layout;')) {
    throw new Error(`${file}: startup reset would drop the user's app settings.`);
  }
  write(file, next);
}

function cleanupIndex() {
  const file = 'src/renderer/index.html';
  const source = read(file);
  let next = removeCodexPreferenceButton(source)
    .replace('Light <span class="check theme-light"></span>', 'Light <span class="check theme-light">✓</span>');

  next = next.replace(
    '<div class="app-startup" id="appStartup" role="status" aria-live="polite">',
    '<div class="app-startup is-complete" id="appStartup" role="status" aria-live="polite">'
  );
  next = replaceRequiredPattern(
    next,
    /      continueButton\.addEventListener\('click', \(\) => \{\r?\n\s*document\.documentElement\.dataset\.leafReady = 'true';\r?\n\s*const startup = document\.getElementById\('appStartup'\);\r?\n\s*startup\?\.classList\.add\('is-complete'\);\r?\n\s*setTimeout\(\(\) => startup\?\.remove\(\), 120\);\r?\n\s*\}\);/,
    `      continueButton.addEventListener('click', () => {
        const startup = document.getElementById('appStartup');
        if (document.documentElement.dataset.leafReady !== 'true') {
          window.LeafStartup?.reportError?.('Cannot continue before renderer signals ready.', 'manual-continue-before-ready');
          return;
        }
        startup?.classList.add('is-complete');
        if (startup) {
          startup.style.pointerEvents = 'none';
          startup.setAttribute('aria-hidden', 'true');
        }
        setTimeout(() => startup?.remove(), 120);
      });`,
    file,
    'manual startup continue readiness guard'
  );
  next = replaceRequiredPattern(
    next,
    /(?:      startup\?\.classList\.remove\('is-complete'\);\r?\n      if \(startup\) startup\.style\.pointerEvents = 'auto';\r?\n)*      startup\?\.classList\.add\('startup-error'\);/,
    `      startup?.classList.remove('is-complete');
      if (startup) startup.style.pointerEvents = 'auto';
      startup?.classList.add('startup-error');`,
    file,
    'startup error pointer release'
  );
  if (next.includes("document.documentElement.dataset.leafReady = 'true';")) {
    throw new Error(`${file}: inline startup fallback can still fake renderer readiness.`);
  }
  write(file, next);
}

function cleanupStyles() {
  const file = 'src/renderer/styles.css';
  const source = read(file);
  write(file, removeCodexThemeCss(source));
}

function cleanupSourceFidelityStartup() {
  const file = 'src/renderer/source-fidelity.js';
  const source = read(file);
  let next = source;
  next = next.replace(
    "startup.style.pointerEvents='auto';\n    let panel=document.getElementById('appStartupDebug');",
    "if(startupOverlayShouldCapturePointer(startup))startup.style.pointerEvents='auto';\n    let panel=document.getElementById('appStartupDebug');"
  );
  next = next.replace(
    "if(startup){\n      startup.style.pointerEvents='auto';\n      startup.style.cursor='default';\n    }",
    "if(startup){\n      if(startupOverlayShouldCapturePointer(startup))startup.style.pointerEvents='auto';\n      startup.style.cursor='default';\n    }"
  );
  next = next.replace(
    "    startup?.classList.add('startup-error');\n    startup?.setAttribute('data-error-context',context);",
    "    if(startup){\n      startup.classList.remove('is-complete');\n      startup.style.pointerEvents='auto';\n      startup.style.opacity='1';\n      startup.classList.add('startup-error');\n    }\n    startup?.setAttribute('data-error-context',context);"
  );
  next = replaceRequiredPattern(
    next,
    /  function hideStartupOverlay\(reason='manual'\)\{\r?\n\s*recordStartupDebug\('startup overlay hide requested',reason\);\r?\n\s*document\.documentElement\.dataset\.leafReady='true';\r?\n\s*releaseStartupPointerBarrier\(reason\);\r?\n\s*\}/,
    `  function hideStartupOverlay(reason='manual'){
    recordStartupDebug('startup overlay hide requested',reason);
    if(!isRendererReady()){
      reportStartupError('Cannot continue before renderer signals ready.','manual-continue-before-ready');
      return;
    }
    releaseStartupPointerBarrier(reason);
  }`,
    file,
    'manual startup continue readiness guard'
  );
  if (next.includes("document.documentElement.dataset.leafReady='true';")) {
    throw new Error(`${file}: source-fidelity can still fake renderer readiness.`);
  }
  write(file, next);
}

cleanupRenderer();
cleanupIndex();
cleanupStyles();
cleanupSourceFidelityStartup();
console.log('Roadmap source cleanup applied: Light default, renderer-owned startup readiness, clean project at startup, Codex theme source removed.');
