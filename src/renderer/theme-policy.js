(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const ALLOWED_THEMES = new Set(['dark', 'light']);
  const RETIRED_THEMES = ['codex', 'carbon'];

  function normalizeTheme(theme) {
    return ALLOWED_THEMES.has(theme) ? theme : 'light';
  }

  function normalizeSerializedState(value) {
    try {
      const state = JSON.parse(String(value || 'null'));
      if (!state || typeof state !== 'object') return value;
      state.preferences = state.preferences && typeof state.preferences === 'object'
        ? state.preferences
        : {};
      const nextTheme = normalizeTheme(state.preferences.theme);
      if (state.preferences.theme !== nextTheme) state.preferences.theme = nextTheme;
      return JSON.stringify(state);
    } catch {
      return value;
    }
  }

  // One-shot only. renderer.js owns preferences.theme and normalizes it on load,
  // so intercepting every state write here would re-parse the whole project
  // payload for a single string.
  function patchStoredStateOnce() {
    try {
      const current = localStorage.getItem(STATE_KEY);
      if (!current) return;
      // Escaped page sources cannot produce this unescaped key/value pair.
      if (/"theme":"(?:dark|light)"/.test(current)) return;
      const normalized = normalizeSerializedState(current);
      if (normalized !== current) localStorage.setItem(STATE_KEY, normalized);
    } catch {}
  }

  // A build that retired a theme can still meet a menu rendered by an older
  // shell, so the controls are stripped rather than merely ignored.
  function removeRetiredThemeControls() {
    RETIRED_THEMES.forEach(theme => {
      document.querySelectorAll(`[data-pref-theme="${theme}"]`).forEach(control => control.remove());
      document.querySelectorAll(`.theme-${theme}`).forEach(mark => mark.remove());
    });
  }

  function setThemeCheck(selector, checked) {
    const next = checked ? '✓' : '';
    document.querySelectorAll(selector).forEach(mark => {
      if (mark.textContent !== next) mark.textContent = next;
    });
  }

  function syncThemeChecks(theme) {
    setThemeCheck('.theme-dark', theme === 'dark');
    setThemeCheck('.theme-light', theme === 'light');
  }

  function enforceThemePolicy() {
    removeRetiredThemeControls();
    if (!document.body) return;
    const nextTheme = normalizeTheme(document.body.dataset.theme);
    if (document.body.dataset.theme !== nextTheme) document.body.dataset.theme = nextTheme;
    syncThemeChecks(nextTheme);
  }

  function install() {
    patchStoredStateOnce();
    enforceThemePolicy();
    document.addEventListener('click', event => {
      const retiredThemeControl = RETIRED_THEMES.some(theme => event.target.closest?.(`[data-pref-theme="${theme}"]`));
      if (!retiredThemeControl) return;
      event.preventDefault();
      event.stopPropagation();
      enforceThemePolicy();
    }, true);

    // Only the body theme attribute is relevant. Observing childList here can
    // recursively observe syncThemeChecks() and starve the renderer event loop.
    const observer = new MutationObserver(enforceThemePolicy);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    let ticks = 0;
    const timer = setInterval(() => {
      enforceThemePolicy();
      ticks += 1;
      if (ticks >= 20) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

