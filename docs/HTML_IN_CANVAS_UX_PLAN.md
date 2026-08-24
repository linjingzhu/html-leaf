# Leaf HTML-in-Canvas UX Plan

Date: 2026-08-24
Status: UX planning baseline
Scope: Experimental HTML-in-Canvas rendering inside Leaf Preview / Compare / Export flows

## Decision

HTML-in-Canvas should enter Leaf as an opt-in experimental renderer, not as a replacement for the current iframe DOM Preview.

The user-facing promise is:

```text
Use the native DOM-to-canvas path when it is available, useful, and safe.
Keep the existing Preview/Edit/Export behavior as the default fallback.
Always show which rendering path is active.
```

This matches Leaf's existing trust model: source fidelity, isolated script-driven preview, explicit Edit ownership, and visible runtime badges.

## Current Product Anchors

Leaf already has the right UX surfaces for this feature:

- `src/renderer/index.html` has per-view title bars with Edit, Page select, Search, Check Atlassian, render size, runtime badge, Clear, and fullscreen controls.
- `src/renderer/renderer.js` persists Preview sizes, zoom modes, active slots, Edit ownership, Inspector preview, and source-fidelity state.
- `src/main.js` is the right place to opt into Chromium runtime flags before the Electron app is ready.
- `README.md` already documents the security distinction between static HTML Preview and Script-driven Interactive Preview.

## External Constraints

- Leaf currently depends on Electron 43.4.0, which ships Chromium 150.0.7871.224.
- Chrome documents HTML-in-Canvas as early-stage and origin-trial based in Chrome 148 through 150.
- WICG defines three core primitives: `layoutsubtree`, `drawElementImage()`, and the `paint` event.
- Electron supports Chromium command-line switches through `app.commandLine.appendSwitch(...)`, but Electron security guidance says experimental features and Blink features must not be enabled speculatively.

References:

- https://developer.chrome.com/blog/html-in-canvas-origin-trial
- https://wicg.github.io/html-in-canvas/
- https://releases.electronjs.org/release/v43.4.0
- https://www.electronjs.org/docs/latest/api/command-line
- https://github.com/electron/electron/blob/main/docs/tutorial/security.md

## UX Goals

1. Preserve default reliability.
   - Opening, previewing, editing, saving, searching, and exporting current Pages must behave the same when the experiment is off.

2. Make renderer state visible.
   - Users should never have to infer whether they are seeing DOM Preview, Scripted Preview, Canvas Preview, or fallback.

3. Keep fallback calm.
   - Unsupported builds, cross-origin content, readback restrictions, snapshot timing failures, and script isolation should fall back to the existing preview without data loss.

4. Protect source fidelity.
   - Canvas support must not add editor metadata to saved HTML and must not change the Page source unless the user explicitly edits content through existing Edit flows.

5. Use Compare as the learning surface.
   - The safest early UX is A/B comparison: DOM Preview on one side, Canvas Preview on the other, with identical Page and viewport size.

## Non-goals

- Do not make Canvas Preview the default renderer in the first implementation.
- Do not enable Chromium experimental features globally without an explicit developer/user gate.
- Do not use Canvas Preview for Markdown, JSON, or PDF Pages in the first implementation.
- Do not support HTML Edit directly inside Canvas Preview in the first implementation.
- Do not promise identical results for cross-origin iframes, blocked media, protected content, or pages requiring unsupported APIs.

## Entry Points

### 1. Preference Menu

Add an `Experimental` group under Preference:

```text
Experimental
[ ] HTML-in-Canvas renderer
Renderer mode: Auto / DOM / Canvas
```

Behavior:

- The checkbox is off by default.
- If Chromium support is unavailable, the checkbox is disabled and shows a tooltip: `HTML-in-Canvas is not available in this build.`
- If enabling requires restart because the Chromium flag must be set before app startup, save the preference and show a restart-required toast/dialog.
- `Auto` means Leaf may use Canvas only for eligible HTML preview surfaces and must fallback silently with a visible badge.
- `DOM` forces the current iframe path.
- `Canvas` requests Canvas Preview and shows fallback if blocked.

### 2. Runtime Badge

Extend the existing `preview-runtime-badge` in every visual View.

Recommended compact labels:

```text
DOM
JS
Canvas
Fallback
```

Tooltips:

- `DOM`: `Static DOM Preview. HTML Edit and Inspector are available.`
- `JS`: `Script-driven Interactive Preview. Direct DOM editing is disabled for security.`
- `Canvas`: `Experimental HTML-in-Canvas Preview. Existing DOM fallback is preserved.`
- `Fallback`: `Canvas Preview was requested but Leaf is using DOM Preview for this Page.`

The badge should stay compact enough for the current View title row and should not push Search, size, Clear, or fullscreen controls out of view.

### 3. Compare Mode

Use Compare for the first meaningful user workflow:

```text
Left: DOM Preview
Right: Canvas Preview
```

When the same Page is selected in both panes and Canvas is available, add a small renderer switch to the right pane runtime badge menu:

```text
Renderer
- DOM Preview
- Canvas Preview experimental
```

This lets a user visually compare fidelity without changing the app-wide default.

### 4. Export Flow

In a later phase, expose Canvas as an export source only when active and readback-safe:

```text
Export Source
- Current DOM Preview
- Canvas Preview experimental
```

If the browser marks the canvas unreadable or the Page includes blocked content, disable the Canvas option and explain: `Canvas export is blocked for this Page. Use Current DOM Preview.`

## Core User Flows

### Flow A: User Enables Experiment

1. User opens Preference.
2. User turns on `HTML-in-Canvas renderer`.
3. Leaf checks startup/runtime capability.
4. If runtime support is missing, show unavailable state and keep preference off.
5. If a restart is needed, store the setting and show `Restart Leaf to enable HTML-in-Canvas.`
6. After restart, runtime badges can show Canvas availability.

### Flow B: User Opens Static HTML

1. User imports or selects an HTML Page.
2. DOM Preview renders exactly as today.
3. If renderer mode is Auto and Page is eligible, Leaf may render Canvas Preview.
4. Badge shows `Canvas` only after first successful paint.
5. Search, selection, accessibility, and zoom are checked against the current DOM behavior.
6. If any canvas paint fails, badge becomes `Fallback` and DOM Preview remains visible.

### Flow C: User Enters Edit Mode

1. User clicks Edit in a View.
2. If View is Canvas Preview, Leaf switches that View to DOM Preview or asks to switch.
3. Existing red Edit state, selection handles, hierarchy sync, and Inspector behavior remain unchanged.
4. When Edit turns off, Auto mode may attempt Canvas Preview again.

Recommended copy:

```text
Canvas Preview is read-only for now. Switch to DOM Edit?
```

### Flow D: Script-driven HTML

1. Leaf detects the Page requires script execution.
2. Existing Interactive Preview security model remains in charge.
3. Canvas Preview is disabled by default for script-driven Pages.
4. Badge shows `JS`; tooltip explains that Canvas is unavailable for scripted isolated preview in this release.

### Flow E: Unsupported / Blocked Content

1. User requests Canvas Preview.
2. Leaf detects unsupported API, cross-origin iframe, failed snapshot, or canvas readback restriction.
3. View remains usable through DOM Preview.
4. Badge shows `Fallback` and a toast appears once per Page/session.

Recommended copy:

```text
Canvas Preview is not available for this Page. Leaf is using DOM Preview.
```

## State Model

Add preferences without changing Page source:

```js
preferences: {
  experimentalHtmlCanvas: false,
  htmlCanvasRendererMode: 'auto' // auto | dom | canvas
}
```

Per-view runtime state should stay ephemeral:

```js
viewRuntime: {
  single: { requested: 'auto', active: 'dom', reason: null },
  left: { requested: 'dom', active: 'dom', reason: null },
  right: { requested: 'canvas', active: 'fallback', reason: 'unsupported-api' },
  codePreview: { requested: 'auto', active: 'dom', reason: null }
}
```

Do not serialize runtime errors, canvas transforms, temporary layout wrappers, or feature-detection artifacts into Page HTML.

## Implementation Phases

### Phase 0: UX and Risk Baseline

- Land this plan.
- Add implementation checklist issue(s).
- Keep shipping behavior unchanged.

### Phase 1: Capability and UI Wiring

- Add a developer gate such as `LEAF_ENABLE_HTML_CANVAS=1` or a hidden preference.
- In `src/main.js`, append the specific Chromium feature switch only when the gate is enabled.
- Add renderer feature detection:

```js
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const supportsHtmlInCanvas = typeof ctx?.drawElementImage === 'function';
```

- Extend runtime badges with DOM / JS / Canvas / Fallback states.
- Add QA proving the default off state is visually and behaviorally unchanged.

### Phase 2: Read-only Canvas Preview Proof

- Build a read-only Canvas Preview path for static trusted HTML only.
- Preserve current iframe DOM Preview as the fallback view.
- Sync canvas grid size with device pixel ratio and viewport zoom.
- Use the `paint` event and returned transform for hit testing alignment.
- Disable Canvas when Edit is active.

### Phase 3: Compare A/B Workflow

- Let Compare show DOM and Canvas side by side for the same Page.
- Add visible mismatch checks for zoom, responsive sizes, search highlights, scroll position, and DPR.
- Capture QA screenshots for DOM and Canvas paths.

### Phase 4: Export Integration

- Add Canvas Preview as an optional export source only after readback and fidelity checks pass.
- Keep DOM export as the default.
- Document unsupported content cases.

### Phase 5: Product Decision

After QA and user testing, decide one of:

- Keep as developer-only experiment.
- Promote to user-visible experimental Preference.
- Use only for export/compare, not primary Preview.
- Remove if Chromium API changes or security/fidelity cost is too high.

## QA Acceptance Criteria

Default-off criteria:

- `npm run qa:static` passes.
- Opening HTML, Markdown, JSON, and PDF Pages behaves as before.
- Preview, Compare, Code Preview, Search, Clear, Save Page As, and fullscreen retain current behavior.
- No saved HTML contains canvas wrappers, runtime badges, transforms, or editor artifacts.

Experiment-on criteria:

- Unsupported Chromium builds show disabled/unavailable UI without breaking Preview.
- Supported builds detect `drawElementImage()` before offering Canvas Preview.
- Canvas Preview never becomes active before the first successful paint.
- Resize, zoom, DPR, and fixed viewport presets stay visually aligned.
- Edit mode uses DOM Preview and preserves selection/Inspector behavior.
- Script-driven Pages retain the existing isolated Interactive Preview path.
- Cross-origin iframe or protected content falls back to DOM Preview with a visible reason.
- Canvas export is disabled unless the canvas can be read safely.

## Suggested Backlog

1. `feat: gate HTML-in-Canvas runtime capability`
2. `feat: add renderer runtime badge states`
3. `feat: add experimental renderer preference`
4. `feat: prototype read-only HTML-in-Canvas preview`
5. `test: add HTML-in-Canvas fallback QA fixtures`
6. `feat: compare DOM and Canvas preview renderers`
7. `feat: add canvas preview export source`

## Recommended First Implementation

Start with Phase 1 only.

Reason:

- It proves whether Electron 43.4.0 and Chromium 150 expose the API under the intended flag.
- It gives users and QA a visible capability state.
- It avoids touching source editing, script isolation, or export behavior before the experimental runtime is verified.
