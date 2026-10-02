---
doc_id: ai-project-lessons
version: 1.1.0
canonical_path: .ai/memory/PROJECT_LESSONS.md
updated: 2026-10-02
---

# Project Lessons

## Policy adoption baseline

- Evidence: linjingzhu/html-leaf at commit 37ac065e617c6359dc48c32b841fb28ba93a446e; shared source commit 94e808cc78d8ca194a8e20272a395551be3066db (ai-dev-rule 3.0.0).
- The repository default branch is stable; derive future work from this configured base rather than assuming main.
- GitHub Actions workflows were removed by explicit owner request. Local product checks are listed in `.ai/PROJECT_CONTEXT.md`; removing automation does not establish that those checks pass.
- No generic build or automated running-product gate is declared. npm start opens Electron for manual verification. Packaging scripts increment the version via version:build and must not be used as a read-only verification shortcut. The qa command inspects source patterns and is not proof of runtime behavior.
- Policy structure is separate evidence from application compilation, tests and runtime behavior. Do not report unrun application checks as successful.

## Preserved project memory

No prior repository entry instructions were present at the recorded baseline. No historical implementation lessons are invented here.

Only add future lessons with a concrete file, test, error or measured observation as evidence.

## pdf-convertor consolidation (2026-10-02)

Full detail in `.ai/reports/2026-10-02-pdf-tools-consolidation.md`. `pdf-convertor` is deleted; do not treat it as a live source. Concrete, reusable findings from that run:

- `pdfjs-dist` behaves differently inside Electron's forked `utilityProcess` than under plain Node, in ways its own code tries to auto-detect and gets wrong. Confirmed empirically (identical module, plain Node vs. utility process) for two separate symptoms: (1) `DOMMatrix`/`Path2D`/`ImageData` are not ambient globals and must be polyfilled manually from `@napi-rs/canvas`'s exports before importing `pdfjs-dist`; (2) its internal `isNodeJS` check (`process.type !== "browser"`) reads `false` under a utility process (`process.type === "utility"`), so its own Node-specific cMap/standard-font readers never activate — pass `CMapReaderFactory`/`StandardFontDataFactory` explicitly rather than relying on that auto-detection whenever `pdfjs-dist` runs in a forked utility process. See `src/workers/ocr-task.js` and `src/workers/convert-pdf-to-images-task.js`/`extract-text-task.js` for the pattern.
- A path inside `node_modules/` that `build.asarUnpack` unpacks (e.g. `pdfjs-dist/cmaps/**`) cannot be found from inside a forked utility process via `require.resolve('<pkg>/package.json')` + `path.dirname` — that still returns an asar-internal path. Resolve such directories once in `src/main.js` using `app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', ...) : path.join(__dirname, '..', ...)` (same pattern already used for `resources/ocr`) and pass the real path down in the task payload, rather than letting the forked process try to resolve it itself.
- `electron-builder --linux dir --publish never` is a fast, no-Wine way to validate `asarUnpack` packaging correctness (confirm real files land under `app.asar.unpacked/`, launch the packaged app, exercise its IPC) when the actual release target is Windows and no Wine is available in the container — the packaging/path-resolution logic itself is OS-independent even though the final installer format is not.
- A `workflow_dispatch`-only workflow is not dispatchable via the API (`POST .../dispatches` 404s, and `list_workflows` returns 0) until the workflow file exists on the repository's default branch — pushing it to a feature branch and opening a PR is not enough; it must actually merge first.
- Separately: a repository's GitHub Actions can be in a state where `run_workflow` returns success (run created, `status: queued`) but no job is ever created and the run never progresses — `list_workflow_jobs` stays empty and even `cancel_workflow_run` refuses with `409 Cannot cancel a workflow run that has not been queued yet`. Observed right after this repository's visibility was switched from private to public; fixed by the owner enabling Actions permissions at Settings -> Actions -> General (a setting that apparently does not auto-enable on a visibility change). Diagnose this by comparing against another repository's run-time history on the same account/runner type as a baseline, not by assuming a normal queue delay.
- The GitHub App installation backing this account's GitHub MCP tools cannot create (`create_repository` → 403 `Resource not accessible by integration`) or delete repositories — both require the repository owner to act directly on github.com. Do not retry these via the API; ask the owner.
