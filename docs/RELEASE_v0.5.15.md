# Leaf v0.5.15 — Project / Document / Page Model

## Canonical hierarchy

```text
Leaf Project (.leaf)
└─ Document
   ├─ Group
   └─ Page (HTML / Markdown / PDF)
```

The Project is the saved Leaf workspace. A Project owns Documents, and every Document owns Pages. Groups remain optional organizational nodes within a Document.

## Renamed commands

| v0.5.14 | v0.5.15 |
|---|---|
| Leaf Document | Leaf Project |
| Project | Document |
| HTML/Markdown/PDF Document | Page |
| New Document | New Page |
| New Project | New Document |
| Import Documents | Import Pages |
| Save Document | Save Page |

Keyboard shortcuts continue to target the lowest editable content level:

- `Ctrl+N`: New Page
- `Ctrl+S`: Save Page
- `Ctrl+Shift+S`: Save Page As

## Storage schema

New Project files use:

```json
{
  "format": "leaf-project",
  "version": "0.5.15",
  "name": "Example Project",
  "documents": []
}
```

The reader continues to accept the v0.5.14 schema:

```json
{
  "format": "leaf-document",
  "projects": []
}
```

Legacy `projects` are normalized as Documents. Existing IDs and Page source are preserved; the migrated model is only emitted in the new form when the user next saves the Project.

## Regression coverage

- v0.5.15 terminology/schema QA: 13/13
- source Electron functional QA: 11/11
- complete v0.5.0–v0.5.14 regression chain
- Source Fidelity: 14/14

Trust Foundation behavior is unchanged: context isolation, renderer sandboxing, editor-metadata sanitization, atomic writes, bounded file reads, and source-fidelity checks remain active.
