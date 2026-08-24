# Leaf DOM Editing Policy

Date: 2026-08-24
Status: Product rule baseline
Scope: HTML Preview, DOM Edit, Interactive Preview, source fidelity, and script-bearing documents

## Decision

Leaf is a document authoring and editing tool first, not a passive document viewer.

Therefore, DOM editing must remain available for HTML documents whenever Leaf can construct a source DOM, even if the document contains JavaScript.

The old rule was:

```text
HTML contains <script>
-> run isolated Interactive Preview
-> direct DOM Edit is unavailable
```

The new rule is:

```text
HTML contains <script>
-> Preview may use isolated Interactive Preview
-> Edit switches the active View to scripts-off DOM Edit
-> source DOM remains editable
-> leaving Edit may return to Interactive Preview
```

Script execution is a runtime preview mode. It is not a reason to block document authoring.

## Product Principles

1. Editing is the primary product promise.
   - If a user imports an HTML file, Leaf should help them inspect, select, rename, restructure, style, and save it.

2. Runtime behavior and source editing are separate modes.
   - Runtime Preview answers: `How does this document behave when scripts run?`
   - DOM Edit answers: `What is the authored document structure, and how can I change it?`

3. JavaScript must not be executed inside editable same-origin DOM.
   - Leaf must not combine `allow-scripts` and `allow-same-origin` for imported HTML.
   - Editable DOM uses scripts off.
   - Interactive Preview uses isolated scripts on.

4. Source fidelity still wins.
   - DOM Edit must not inject Leaf metadata, runtime badges, CSP guards, scroll compensation, editor overlays, or temporary wrappers into saved HTML.

5. A script tag is not enough to classify a document as uneditable.
   - Many authored documents contain small helper scripts for language toggles, checklist state, local navigation, theme toggles, or presentation affordances.
   - Those documents should remain editable.

## Runtime Modes

### Static Editable Preview

Use for normal HTML preview and all DOM editing.

```text
sandbox="allow-same-origin"
scripts OFF
DOM Inspector ON when Edit is active
Hierarchy ON
Object palette / Used components ON
Source sync ON
```

### Interactive Preview

Use to validate script behavior without granting DOM edit access.

```text
sandbox="allow-scripts"
opaque origin
scripts ON
DOM Inspector OFF
Hierarchy unavailable
runtime snapshot allowed for export/check flows
```

### Scripts-off DOM Edit

Use when an HTML document contains scripts and the user clicks Edit.

```text
document has <script>
user clicks Edit
active View rerenders with scripts OFF
Edit becomes active
Inspector and Hierarchy become available
script tags remain in source unless the user edits/removes them
```

Recommended badge text:

```text
Scripts off
```

Recommended tooltip:

```text
JavaScript is disabled while DOM Edit is active. Turn Edit off to return to Interactive Preview.
```

## UX Rules

### Edit Button

The Edit button must be enabled for any non-empty HTML Page, including HTML Pages that contain `<script>`.

If the current View is Interactive Preview:

1. User clicks Edit.
2. Leaf disables script execution for that View.
3. Leaf rerenders the same Page as Static Editable Preview.
4. Leaf shows the normal red Edit state.
5. Inspector and Hierarchy become available.

When the user exits Edit:

1. Leaf clears editor overlays.
2. Leaf syncs/keeps committed DOM changes.
3. If the Page still contains scripts and the View is not forced to static mode, Leaf may return to isolated Interactive Preview.

### Runtime Badge

For script-bearing documents, show the current runtime state clearly:

```text
Interactive
Scripts off
Static
```

Badge behavior:

- `Interactive`: scripts are running in an isolated sandbox; DOM Edit is not active.
- `Scripts off`: scripts exist in source but are disabled for editable DOM work.
- `Static`: no script-bearing runtime distinction is active.

### Inspector Empty State

When entering scripts-off DOM Edit, Inspector should not say editing is disabled. It should say:

```text
Edit enabled
JavaScript is disabled while editing. Hover or click an HTML object to inspect and modify the source DOM.
```

### Hierarchy

Hierarchy should be available in scripts-off DOM Edit.

If the Page is still in Interactive Preview, the existing message is acceptable:

```text
Hierarchy unavailable
Script-generated runtime remains inspect-only.
```

### Compare Mode

Compare can support both authoring and runtime validation:

```text
Left: DOM Edit / scripts off
Right: Interactive Preview / scripts on
```

This makes Leaf useful for script-bearing documents without losing the safety of isolated runtime preview.

## Source Rules

1. Preserve script tags unless the user edits them.
   - Disabling scripts for DOM Edit is a runtime sandbox choice, not a source rewrite.

2. Strip Leaf runtime artifacts before source sync.
   - Continue using `SourceFidelity.stripEditorArtifactsFromDocument()`.

3. Remove temporary guards before save.
   - `<base>` and CSP meta inserted by Leaf remain runtime-only.

4. Do not serialize preview bridge scripts.
   - Any snapshot bridge or viewport chrome script must be marked and stripped before commit.

5. Script-generated DOM is not automatically source truth.
   - If JavaScript creates runtime-only DOM nodes, Leaf should not silently save them as authored source without an explicit user action.

## Edge Cases

### Helper-script documents

Examples:

- Language toggle
- QA checklist Pass/Fail buttons
- TOC active-section highlight
- Theme switcher
- Local storage form state

Expected behavior:

- Preview may run interactively.
- Edit is available.
- Editing uses scripts-off DOM.
- The static authored content can be selected and modified.

### Script-only documents

Examples:

```html
<body><div id="app"></div><script>renderApp()</script></body>
```

Expected behavior:

- Interactive Preview may show the rendered runtime app.
- DOM Edit shows the authored source shell.
- Leaf may show a notice: `This Page is mostly generated by JavaScript. Edit the source shell or use Code View for script logic.`
- DOM Edit is still not blocked.

### Cross-origin and remote content

Expected behavior:

- Scripts-off DOM Edit stays available for authored same-document DOM.
- Remote iframe/content internals remain inaccessible.
- Export/check flows should preserve current security boundaries.

## Implementation Rule

The renderer should distinguish these questions:

```js
pageHasScripts(page)      // source contains script tags
shouldRunScripts(page, slot) // true only when not DOM-editing that View
canDomEdit(page, slot)    // true for non-empty HTML source DOM
```

The Edit button availability should use `canDomEdit`, not `shouldRunScripts`.

Recommended behavior:

```js
const hasScripts = pageHasScripts(page);
const editingThisSlot = htmlEditEnabled && editOwnerSlot === slot;
const runScripts = hasScripts && !editingThisSlot;

if (runScripts) {
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.dataset.previewRuntime = 'interactive-isolated';
} else {
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.dataset.previewRuntime = hasScripts ? 'static-editable-scripts-off' : 'static-editable';
}
```

## QA Acceptance Criteria

Use `DEV-20453_Tangent_Handle.html` as a regression fixture.

Expected results:

- Loading the fixture shows a script-aware runtime badge.
- Edit button is enabled.
- Clicking Edit switches to scripts-off DOM Edit.
- Inspector becomes available after selecting a visible DOM object.
- Hierarchy is available in Edit.
- Language toggle / QA buttons do not execute while Edit is active.
- Turning Edit off can return to Interactive Preview.
- Saving after a small DOM edit does not add Leaf runtime artifacts.
- `<script>` tags are preserved unless the user explicitly changes source.
- `npm run qa:static` passes.

## Backlog

1. `feat: enable scripts-off DOM Edit for script-bearing HTML`
2. `test: add DEV-20453 script-bearing HTML edit fixture`
3. `docs: update README script-driven HTML section`
4. `feat: add runtime badge states for Interactive / Scripts off / Static`
5. `feat: add Compare preset for DOM Edit vs Interactive Preview`
