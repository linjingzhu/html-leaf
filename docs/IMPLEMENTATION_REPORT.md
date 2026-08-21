# HTML Book Editor v0.3.5 — Implementation Report

## 1. Architecture Audit

### Current stack
- Electron: `43.4.0`
- Renderer: Vanilla HTML / CSS / JavaScript
- TypeScript: not used
- React: not used
- Vite: not used
- Tailwind: not used
- Package manager: npm
- Lock file: none in the supplied project
- Main / Preload / Renderer separation: retained
- Preview: sandboxed iframe
- Local HTML drag/drop: preload `webUtils.getPathForFile()` → IPC → Main `fs`
- Project save format: `.hbeproj` JSON
- Renderer state: localStorage + project JSON
- Existing Web application menu / shortcut structure: retained

### Architecture decision
The implementation preserves the current Vanilla Electron architecture. No framework migration or renderer rewrite was performed.

## 2. Dependency

### New Dependencies
- None

### Updated Dependencies
- None

### Removed Dependencies
- None

`electron@43.4.0` remains the only development dependency.

## 3. Track A — UI / Design System

### Semantic tokens
`styles.css` was rebuilt around semantic CSS variables:
- Background: `--background`, `--panel`, `--panel-secondary`, `--elevated`, `--canvas`, `--input`
- Text: `--foreground`, `--text-secondary`, `--muted`, `--disabled`
- Border: `--border`, `--border-subtle`, `--border-strong`, `--focus-ring`
- Interaction: `--hover`, `--selected`, `--selection`
- Semantic: `--accent`, `--success`, `--warning`, `--error`
- Geometry: shared radius / density / layout variables

Dark and Light modes use the same semantic token names.

### Density
- Common control: 30px
- Tree row: 27px
- Panel/section header: 28px
- Property values: 28px
- Typography was raised from the former 8–10px-heavy UI toward 11–13px desktop-tool density.

### Project Card
Project color is limited to:
- low-opacity card tint
- subtle border
- small color swatch
- limited tree context

It is not applied to Inspector, toolbar, general buttons, inputs, or viewport shell.

### Splitter
- Inspector hit area: 5px
- Visible separator: 1px
- Closed: Inspector and splitter columns become 0px

### Elevation
Normal panels use surface differences + borders.
Shadow is reserved for:
- menus
- context menus
- dialogs
- toast/floating UI

## 4. Track B — Inspector UX

### HTML Edit
HTML Edit remains opt-in.
- OFF: no hover / no selection
- ON: hover / selection / Inspector editing

The active button uses a subtle selected treatment rather than a primary CTA appearance.

### Hover / Selection
Hover and Selected are visually distinct:
- Hover: 1px low-emphasis outline
- Selected: 2px accent outline + stronger translucent fill

### Edit Context
The Inspector draft stores:
- `selectedElementId`
- `savedValues`
- `values` (draft)
- `dirtyFields`
- `validationErrors`
- Page / frame / element context

Session-level state also includes:
- `htmlEditEnabled`
- `inspectorPreviewEnabled`

### Commit model
Inspector input does not change `page.source`.

`Preview ON`:
- validates the complete Inspector draft
- temporarily changes only the live iframe DOM
- does not call source serialization

`Preview OFF`:
- returns the iframe element to the last applied state
- keeps the draft

`Apply`:
1. validates the complete draft
2. blocks if any field is invalid
3. pushes one undo snapshot
4. applies the complete draft
5. serializes once to HTML source
6. updates saved values
7. clears dirty fields

One Apply is one logical transaction boundary.

### Reset
Reset:
- restores the live element to the last applied state
- copies Saved → Draft
- clears dirty fields
- clears validation errors

### Validation
Implemented for currently exposed properties only:
- Text: free text
- Font Family: non-empty string
- Font Size: numeric, 0–512px
- Font Weight: `1–1000` or CSS keywords
- Font Style: enum
- Margin: numeric, -10000–10000px

Intermediate text entry is allowed, but Preview/Apply require the complete draft to be valid.

If any property is invalid:
- the field gets an invalid state and error message
- Apply is disabled
- Unsaved-dialog Apply is disabled
- Preview returns the whole element to Saved state instead of partially previewing valid fields

### Unsaved Edit Context Exit
Dirty Inspector state is guarded when:
- switching Page
- switching Project
- switching Preview/Split/Code
- switching active split/code pane
- switching Element A → Element B
- turning HTML Edit off
- deleting a tree target
- importing/dropping HTML into another context
- Undo / Redo leaves the current edit context

Dialog actions:
- Cancel: keep draft and current context
- Discard: rollback preview, discard draft, continue
- Apply: validate + commit one transaction, continue

## 5. Accessibility / Interaction

Added or retained:
- `:focus-visible` focus ring
- HTML Edit `aria-pressed`
- Inspector field `aria-invalid`
- Dialog roles / aria-modal
- Dialog Tab focus containment
- Escape handling
- Context-menu Arrow Up / Down / Enter / Escape navigation
- Existing Tree keyboard navigation

## 6. Safety

### Electron security
Unchanged:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`

### Main / Preload / IPC
No new IPC permission or broader preload exposure was added in v0.3.5.

### Save format
No `.hbeproj` model migration was introduced.

### Native / Existing menu behavior
The current renderer-based application menu and existing shortcuts were preserved rather than replaced for styling reasons.

## 7. QA

### Syntax
Passed:
- `node --check src/main.js`
- `node --check src/preload.js`
- `node --check src/renderer/renderer.js`

### Static Regression Gate
`npm run qa`: **33 / 33 PASS**

Checks include:
- framework migration prohibition
- dependency invariants
- Electron security
- no CDN runtime resource in app shell
- semantic tokens
- Light/Dark token parity
- Inspector 0px collapse
- Splitter width rules
- Project Card
- Empty Page
- Explorer HTML drag/drop
- HTML Edit gating
- Hover/Selected distinction
- Draft / transaction model
- Validation / no partial Preview
- Page / Element / Project unsaved guards
- Inspector single-row properties
- panel shadow policy
- density targets
- large tree data model
- project reorder invariant

### Large Tree
Static data-model fixture:
- Projects: 10
- Groups: 50
- Pages: 300
- Parent hierarchy resolution: PASS

### Project Drag Invariant
Input:
`A / B / C`

Move B above A.

Expected / Result:
`B / A / C` — PASS

## 8. Not Verified in This Environment

### Development Run
Not verified. `npm install --no-audit --no-fund` was attempted but dependency download did not complete within the 120-second execution limit.

### Production Build
Not run. This v0.3.5 remains the requested execution/development form rather than installer packaging.

### Visual screenshot baseline
Not captured because Electron could not be launched in this environment without the dependency install completing.

## 9. Remaining Technical Risks

1. Visual Inspector Apply still serializes the iframe DOM back to HTML.
   - HTML formatting / attribute ordering may change.
   - Future source-range patching remains the preferred production architecture.

2. Source editor is still a `<textarea>`.
   - Syntax highlighting and language tooling are not part of this mission.

3. Language Preference currently preserves the existing preference state behavior; full UI localization is not implemented.

4. Runtime Inspector element IDs are ephemeral and stripped before source serialization.
   - This is intentional to avoid contaminating saved HTML.

## 10. Intentionally Not Implemented

- React migration
- Tailwind / shadcn / Radix adoption
- dependency upgrades
- custom title bar / frameless window
- full CSS property schema
- CSS class / variable editing
- source-range patch engine
- Monaco migration
- installer packaging
- external CDN resources


## v0.3.5 Splitter / Preview Addendum

### Unified Splitter Controller
기존 Inspector 전용 `mousedown → document.mousemove` 구현을 제거하고,
Tree / Split / Code / Inspector 전체에 동일한 pointer-capture 기반 resize session을 적용했다.

Drag 중에는 iframe pointer interaction을 차단하고 `requestAnimationFrame` 단위로 CSS 변수만 갱신한다.
Preference state는 pointerup 이후에만 commit한다.

### Preview Rendering Size
Preview iframe을 Preview Canvas / Surface 구조로 감싸 실제 CSS viewport size를 제어한다.
각 Preview slot은 독립 viewport preset을 가진다. Responsive가 기본이며 fixed/custom 크기는 persistence 된다.
