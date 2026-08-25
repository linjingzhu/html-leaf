(() => {
  'use strict';

  const STATE_KEY = 'leaf-v0-5-16-state';
  const ALLOWED_THEMES = new Set(['dark', 'light', 'carbon']);

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
      if (/"theme":"(?:dark|light|carbon)"/.test(current)) return;
      const normalized = normalizeSerializedState(current);
      if (normalized !== current) localStorage.setItem(STATE_KEY, normalized);
    } catch {}
  }

  function removeCodexControls() {
    document.querySelectorAll('[data-pref-theme="codex"]').forEach(control => control.remove());
    document.querySelectorAll('.theme-codex').forEach(mark => mark.remove());
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
    setThemeCheck('.theme-carbon', theme === 'carbon');
  }

  function enforceThemePolicy() {
    removeCodexControls();
    if (!document.body) return;
    const nextTheme = normalizeTheme(document.body.dataset.theme);
    if (document.body.dataset.theme !== nextTheme) document.body.dataset.theme = nextTheme;
    syncThemeChecks(nextTheme);
  }

  function install() {
    patchStoredStateOnce();
    enforceThemePolicy();
    document.addEventListener('click', event => {
      const codexThemeControl = event.target.closest?.('[data-pref-theme="codex"]');
      if (!codexThemeControl) return;
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

