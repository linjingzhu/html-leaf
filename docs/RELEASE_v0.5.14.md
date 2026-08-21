# Leaf v0.5.14 Release Report

## Scope

This release separates three concepts that had been conflated in the UI:

```text
Leaf Document (.leaf)
└─ Projects
   ├─ Groups
   └─ Documents (HTML / Markdown / PDF)
```

`New Document` now creates a document inside the active project. `New Project` remains a separate command. A Leaf Document saves and restores the entire project collection.

## Root causes fixed

- Fullscreen only changed renderer CSS, so the Windows title bar remained visible.
- Document-labelled menu items still called project creation and project-save functions.
- Project tree drag handlers only accepted Leaf's internal tree MIME types.
- Code line numbers used a different line metric and did not follow textarea scroll.
- Inspector had one flat fold level and de-emphasized the selected object identity.
- Raster export depended on SVG `foreignObject`, which fails for some rendered/local assets and only stored one export target.

## Implementation

- Native `BrowserWindow.setFullScreen()` is synchronized with renderer document-only mode.
- The active document owns New, Save, and Save As keyboard commands.
- `.leaf` workspace serialization stores all projects; legacy `.hbeproj` and JSON loading remains accepted.
- Project cards accept one or more Explorer files. Main-process loaders classify HTML, Markdown, and PDF and enforce size limits before reading.
- Markdown is rendered with the existing escaped Atlassian-safe converter. PDF is a read-only Chromium document preview.
- Code source uses `wrap="off"`, identical 18.6 px line metrics, scroll-linked line rail transforms, and a case-insensitive Ctrl+F search.
- Inspector groups are General, Appearance, and Layout, each with second-level folds.
- PNG/JPG first capture the actually rendered selection. SVG serialization remains available, with local image embedding and the existing editor-artifact sanitizer.
- Multi-selection export stages every output in the selected directory and rolls back partial output on failure.

## Security and Trust Foundation

Unchanged:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- Scripted HTML remains isolated without `allow-same-origin`.
- Runtime scrollbar and selection metadata uses `data-editor-overlay` and is removed before source serialization.
- Document and asset writes use atomic temporary-file replacement.

New limits:

- HTML/Markdown: 50 MB
- PDF: 500 MB
- Leaf Document: 100 MB
- Batch object export: 200 objects and 200 MB encoded payload

## Verification

- Syntax checks: main, preload, renderer, and new QA scripts passed.
- Static and historical regression chain: `npm run qa`, 19/19 v0.5.14 gates passed, including every v0.5.0–v0.5.13 suite.
- Main-process adversarial QA: 6/6 passed.
- Real Electron functional QA: 9/9 passed.
- Source Fidelity golden fixtures: 14/14 passed.
- Evidence: `scripts/qa-evidence-v0514.png`.

## Adversarial findings resolved

- Empty Code documents did not reveal the editor after their first source input. The pane now updates its empty state immediately.
- Multi-export could leave staged or already-written files after a later failure. It now validates first, stages all files, and rolls back on failure.
- Unbounded document reads could exhaust memory. Type-specific limits now reject oversized input before reading.
- Imported Leaf JSON could contain missing project/node arrays and crash tree rendering. Workspace payloads are normalized and bounded before use.
- Project import highlighting could remain after drag-leave. The import target state is now always cleared.

The external Codex Challenge executable was present but WindowsApps denied execution in this environment. The adversarial verification therefore used the extracted v0.5.13 `app.asar` as a clean diff baseline plus targeted failure-path tests.
