# Leaf v0.5.16 — Project Hierarchy

## Canonical hierarchy

```text
Project (.prj)
└─ Document
   ├─ Page
   └─ Group (container)
```

The Project is the saved Leaf workspace. A Project owns Documents. Each Document contains Pages and optional Group containers. A Page created with `Ctrl+Shift+N` is inserted below the currently selected Page or Group in the active Document.

## Commands and storage

- `Ctrl+N`: New Project
- `Ctrl+S`: Save Project
- `Ctrl+Shift+S`: Save Project As
- `Ctrl+Shift+N`: New Page under the active Document selection
- Canonical Project extension: `.prj`
- Read compatibility: `.prj`, `.leaf`, `.hbeproj`, and JSON Leaf projects

Legacy Project files are normalized in memory. Saving an opened legacy extension routes through Save As so the original file is not overwritten unexpectedly.

The Document View mode labels are `Preview`, `Compare`, and `Code`. Internally the existing `preview`, `split`, and `code` state keys remain unchanged for project and preference compatibility.

The embedded Leaf icon has been removed from the left side of the application menu. The File menu now begins at the left edge, while Windows executable, installer, Desktop shortcut, and Start Menu branding remain unchanged.

When HTML Edit is active, hovering a rendered object now shows a translucent blue object highlight and a viewport-clamped property tooltip. The tooltip reports the selector, object name, rendered dimensions, semantic role, computed display mode, and keyboard-focusability. Hover inspection is separate from persistent selection, so inspecting another object does not clear the selected widget or Inspector state.

`Save Page As` now opens an explicit format selector for HTML, Markdown, JSON, and PDF. HTML-to-Markdown uses the semantic document converter, JSON cross-format output uses a lossless Leaf Page source envelope, and PDF output is generated through a sandboxed, JavaScript-disabled print window with print backgrounds enabled. Saving in the Page's current format adopts the new path; cross-format output is treated as an export copy so the editable source type is not destructively replaced.

Search is available in Preview, both Compare panes, Code Preview, and Code Source. Preview matches use the browser CSS Highlight API, so highlighting does not inject wrapper elements or alter serialized source. Enter advances and Shift+Enter moves backward, wrapping across matches and scrolling the current result into view. Scripted opaque-origin previews and direct Markdown/JSON editors use token-validated search bridges.

The main menu now ends with `Help > About Leaf`, which opens a keyboard-accessible product-information dialog.

Clear now resolves its target from the clicked View instead of the active Inspector. An unchanged inactive Page clears immediately without activating that View, while unsaved content still uses the save/discard/cancel decision.

Hierarchy displays an always-visible object type at the right edge. A per-frame mutation observer refreshes the tree after Page load and author DOM changes without waiting for a selection change. Editor overlays and runtime metadata remain excluded.

Object resize handles collect nearby object edge and center guides when a drag starts. Holding Shift snaps the moving edge to a guide within 6px; without Shift the existing free resize behavior is unchanged.

Edit mode now uses a 3px red inset outline. The View title row containing Edit and Search is 34px high, up from 28px.

Vertical and horizontal splitters now reserve an 8px neutral gutter between adjacent panes while retaining a centered 1px drag guide.

New Document, New Page, and New Section now create immediately in the Project tree without opening a naming dialog. The new object is selected, its parent is expanded, and repeated default names receive a collision-safe numeric suffix. F2 rename remains available afterward.

Preference now includes a third `Carbon` theme beside Dark and Light. Carbon uses five black-to-graphite surface levels, silver interaction states, off-white text hierarchy, low corner radii, and restrained chrome letter spacing based on the supplied monochrome industrial reference. The theme is limited to Leaf application chrome and does not restyle loaded Page content.

Leaf now assigns one identity to each source path. Importing the same source file focuses the existing Page, and selecting an already-visible Compare document swaps the opposite binding rather than duplicating it.

Markdown and JSON direct-source Edit is available from every visual View. PDF Edit enables the bundled Chromium PDF viewer's native annotation surface for highlighting, drawing, form filling, signatures, undo/redo, and downloading the edited PDF; Leaf does not decode the PDF binary into application source.

## Supported Page formats

- HTML / HTM
- Markdown / MD
- JSON
- PDF

Markdown and JSON Pages can be edited directly in Preview, Compare, and Code Preview by enabling that View's `Edit` toggle. Source changes update the Page immediately, participate in Undo/Redo, and retain the existing atomic-save and source-metadata protections. Disabling Edit restores the rendered Markdown preview or the formatted JSON preview. Invalid JSON remains editable and is shown with a validation diagnostic instead of being discarded.

Animated WebP is not registered as an independent Page format.

## Security and trust guarantees

- Project atomic writes, source-fidelity sanitization, initial HTML snapshots, bounded reads, and editor-metadata leak checks remain unchanged.

## Verification

- v0.5.16 Page lifecycle, editing, hierarchy, layout, export, search, and About QA: 33/33
- Main-process Save Page As format and PDF rendering QA: 7/7
- Main-process adversarial document QA: 7/7, including explicit Animated WebP Page rejection
- Source Electron functional and adversarial QA: 36/36
- Packaged Electron functional and adversarial QA: 36/36
- Carbon theme static regression QA: 10/10
- Carbon theme functional and persistence QA: 4/4
- Source Fidelity fixtures: 14/14
- Complete v0.5.0–v0.5.15 regression chain: PASS
