# Leaf v0.5.16 — Project Hierarchy and Animated WebP

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

## Animated WebP Pages

Animated WebP is supported as a binary Page type:

- Import Pages file picker accepts `.webp`.
- Explorer drag and drop accepts `.webp` in the Project tree and Viewports.
- Occupied Viewports retain the replacement confirmation flow.
- Preview uses the original `file:` URL inside a restrictive image-only document.
- No decoding/re-encoding or source serialization occurs, so animation frames, timing, transparency, and original bytes are preserved.
- Code View identifies the Page as read-only.
- Save Page As performs a binary copy and retains `.webp`.

## Security and trust guarantees

- WebP preview is isolated in a sandboxed iframe.
- Its Content Security Policy permits only local/data/blob images and inline layout styles.
- Script, network, object, and frame loading remain blocked by default.
- Project atomic writes, source-fidelity sanitization, initial HTML snapshots, bounded reads, and editor-metadata leak checks remain unchanged.

## Verification

- v0.5.16 hierarchy, `.prj`, and Animated WebP QA: 16/16
- Main-process adversarial document QA: 7/7
- Source Electron functional QA: 14/14
- Source Fidelity fixtures: 14/14
- Complete v0.5.0–v0.5.15 regression chain: PASS

