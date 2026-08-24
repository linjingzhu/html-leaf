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

  function patchStoredState() {
    try {
      const current = localStorage.getItem(STATE_KEY);
      if (!current) return;
      const normalized = normalizeSerializedState(current);
      if (normalized !== current) localStorage.setItem(STATE_KEY, normalized);
    } catch {}
  }

  function patchLocalStorageWrites() {
    try {
      if (localStorage.__leafThemePolicyPatched) return;
      const nativeSetItem = localStorage.setItem.bind(localStorage);
      Object.defineProperty(localStorage, '__leafThemePolicyPatched', {
        value: true,
        configurable: false
      });
      localStorage.setItem = (key, value) => {
        const nextValue = key === STATE_KEY ? normalizeSerializedState(value) : value;
        return nativeSetItem(key, nextValue);
      };
    } catch {}
  }

  function removeCodexControls() {
    document.querySelectorAll('[data-pref-theme="codex"]').forEach(control => control.remove());
    document.querySelectorAll('.theme-codex').forEach(mark => mark.remove());
  }

  function syncThemeChecks(theme) {
    document.querySelectorAll('.theme-dark').forEach(mark => { mark.textContent = theme === 'dark' ? '✓' : ''; });
    document.querySelectorAll('.theme-light').forEach(mark => { mark.textContent = theme === 'light' ? '✓' : ''; });
    document.querySelectorAll('.theme-carbon').forEach(mark => { mark.textContent = theme === 'carbon' ? '✓' : ''; });
  }

  function enforceThemePolicy() {
    patchStoredState();
    removeCodexControls();
    if (!document.body) return;
    const nextTheme = normalizeTheme(document.body.dataset.theme);
    if (document.body.dataset.theme !== nextTheme) document.body.dataset.theme = nextTheme;
    syncThemeChecks(nextTheme);
  }

  function install() {
    patchLocalStorageWrites();
    enforceThemePolicy();
    document.addEventListener('click', event => {
      const codexThemeControl = event.target.closest?.('[data-pref-theme="codex"]');
      if (!codexThemeControl) return;
      event.preventDefault();
      event.stopPropagation();
      enforceThemePolicy();
    }, true);
    const observer = new MutationObserver(enforceThemePolicy);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
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
