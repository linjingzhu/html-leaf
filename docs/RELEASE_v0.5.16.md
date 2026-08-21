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

## Supported Page formats

- HTML / HTM
- Markdown / MD
- PDF

Animated WebP is not registered as an independent Page format.

## Security and trust guarantees

- Project atomic writes, source-fidelity sanitization, initial HTML snapshots, bounded reads, and editor-metadata leak checks remain unchanged.

## Verification

- v0.5.16 hierarchy and `.prj` QA: 14/14
- Main-process adversarial document QA: 7/7, including explicit Animated WebP Page rejection
- Source Electron functional QA: 14/14
- Source Fidelity fixtures: 14/14
- Complete v0.5.0–v0.5.15 regression chain: PASS
