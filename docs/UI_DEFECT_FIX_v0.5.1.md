# HTML Book Editor v0.5.1 UI Reliability Fix

## Root causes and corrections

1. Inspector Preview stored the checkbox preference, but its Draft DOM behavior was spread across independent handlers. A single `setInspectorPreviewEnabled()` transition now applies or restores the complete valid Draft immediately without committing Source.
2. The generic input dialog executed its callback before closing. A render exception could therefore strand the dialog and permit a duplicate action. Confirm now captures the callback, closes first, and then executes it with error reporting.
3. Preview, Split, and Code had panels and render functions but no click binding after the v0.5.0 merge. The segmented buttons now perform a guarded state transition, rerender, and persist.
4. Viewport zoom previously stored and displayed `100%` only. Every preview now has accessible − / percentage-reset / + controls, a persisted 25–200% state, and real Chromium rendering scale.

## Trust Foundation invariants

- Draft Preview never writes Page Source.
- Mode and zoom changes never serialize a preview DOM.
- Atomic project and export writes are unchanged.
- Editor artifact sanitization and source leakage blocking are unchanged.
- Minimal direct-text patch behavior is unchanged.

## Verification

- v0.5.1 UI regression: 12/12
- v0.5.0 Trust Foundation: 11/11
- Source Fidelity: 14/14
