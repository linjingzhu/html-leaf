# pdf-convertor consolidation and retirement

Status: COMPLETED
Repository: linjingzhu/html-leaf
Repository Mode: protected
PR: https://github.com/linjingzhu/html-leaf/pull/70
Merged into: stable (merge commit 29c24efc5dca6300d007a1813fdbe01d2c18686c)
Follow-up commit: 6d9f30c (OA-1 status update, pushed directly to stable, not via PR)

## Executive Summary

Ported the sibling `linjingzhu/pdf-convertor` repository's three PDF tools into
Leaf (compress, OCR + retyped-PDF, PDF<->image convert), added a fourth tool
beyond the original scope (export a PDF's text layer as Markdown) per a
mid-session user request, restored Leaf's own dead Windows build/release
pipeline, verified the result against a real packaged build and a real
Windows GitHub Actions run, and retired `pdf-convertor`: the owner deleted it
from GitHub after every item below was confirmed. `pdf-convertor` no longer
exists; do not reference it as a live source in future work on this
repository.

## Delivered

- Shared infrastructure: `ipcReply` envelope factory (generalizes the
  pre-existing `githubReply`/`driveReply` pattern), `runBackgroundTask()`
  utility-process harness (`src/workers/task-runner.js`), default-deny
  `setPermissionRequestHandler` (grants only `local-fonts`, for OCR's font
  picker).
- `.github/workflows/build-desktop.yml`: manual-only (`workflow_dispatch`),
  Windows-only, single workflow replacing the removed three-workflow
  (`build-windows.yml`/`build-macos.yml`/`build-release.yml`) setup. QA
  scripts `qa-static.js` / `qa-release-version-v0516.js` rewritten to check
  this architecture instead of the removed one.
- `src/workers/compress-task.js`: PDF re-encode/shrink via `sharp`, replaces
  the original file after a size-comparison confirmation (`compress:run` /
  `compress:commit` / `compress:discard`).
- `src/workers/ocr-task.js` + `render-limits.js` + `retyped-pdf-layout.js`:
  Tesseract OCR with per-component image/table preservation, optional
  retyped PDF with a real embedded font, added as a new sibling Page
  (`ocr:run` / `ocr:addRetypedPage` / `ocr:discardRetyped`).
- `src/workers/convert-pdf-to-images-task.js` / `convert-images-to-pdf-task.js`
  / `convert-constants.js`: PDF -> images lands as a new sibling Group of
  image Pages; Images -> PDF combines a Group's images via a new
  "Combine to PDF..." tree context-menu action (`convert:pdfToImages` /
  `convert:imagesToPdf`). Applies pixel/count caps symmetrically to both
  directions — the original's PDF -> images direction had none.
- `src/workers/extract-text-task.js` (beyond original plan): reads a PDF's
  embedded text layer via `pdfjs-dist`'s `getTextContent()` (not OCR — exact
  and fast for any PDF that already has a text layer), previews it, saves as
  Markdown via a dialog, offers the result as a new sibling Page
  (`extractText:run` / `extractText:save`).
- Removed `pdf-convertor` references from code comments/scripts ahead of its
  deletion (commit 34ae3c9), keeping the rationale they recorded without
  naming a repo that no longer exists. `.ai/reports/OWNER_ACTIONS.md`'s own
  decision-log reference to it was deliberately kept (commit 6d9f30c) — it
  records a real, dated decision, not a dangling pointer.

## Verification

- Compile: N/A (plain JS, no build step for source files themselves).
- Tests: `qa:static` 331/332 (one pre-existing, unrelated failure —
  "Subframe navigation is observed but never blocked" — confirmed present
  before this work started, traced to a stale string match against
  `renderer.js` unrelated to any file this work touched); `qa:release-version`
  5/5; `qa:github-client` 49/49; `qa:google-drive` 75/75 (both confirm the
  shared `ipcReply` refactor didn't regress existing GitHub/Drive IPC).
- Target Build: packaged (`asar`) build verified twice — once locally via
  `electron-builder --linux dir --publish never` (no Wine available in this
  session's container for a Windows NSIS build, so Linux packaging was used
  to validate the OS-independent risk: `asarUnpack` paths for
  `sharp`/`@napi-rs/canvas`/`tesseract.js-core`/`pdfjs-dist`'s
  worker+cmaps+standard_fonts/`resources/ocr` all unpack to
  `app.asar.unpacked/` exactly as configured; all four features' IPC calls
  re-run against that packaged build and passed), and once for real via the
  GitHub Action (`windows-latest`, run id 37028862821, conclusion `success`,
  ~4 minutes, published release `v0.6.2-build.2` with
  `Leaf-Setup-x64.exe`/`Leaf-x64-portable.zip`).
- Runtime/Visual: full UI flows driven via CDP against real (dev-mode and
  packaged) Electron instances for every new PDF-tools button and
  context-menu item, screenshots captured and inspected at each key step.
- Adversarial Review: NOT RUN (no separate review agent was used this run;
  verification was self-directed across pure-logic/IPC/UI/packaged tiers).
- Cross-Agent Review: NOT AVAILABLE — one model family only.
- Git Conflicts: none.

## Problems Found & Automatically Fixed

- Medium — `pdfjs-dist`'s Node rendering path expects `DOMMatrix`/`Path2D`/
  `ImageData` as ambient globals; `@napi-rs/canvas` exports them but never
  installs them as globals, and Electron's utility-process environment hits
  this gap where plain Node does not → manually polyfilled at the top of
  `ocr-task.js` / `convert-pdf-to-images-task.js` / `extract-text-task.js`.
- Medium — same root cause, different symptom: `pdfjs-dist`'s own `isNodeJS`
  detection (`process.type !== "browser"`) reads `false` under Electron's
  utility process (`process.type === "utility"`), so its internal Node
  cMap/standard-font readers never activate and it silently falls back to
  DOM-oriented readers that assume `fetch`/`document` → added
  `LocalCMapReaderFactory`/`LocalStandardFontDataFactory` classes passed
  explicitly via `getDocument()`'s `CMapReaderFactory`/
  `StandardFontDataFactory` options, with paths resolved once in
  `src/main.js` (`pdfjsRoot`, mirroring the existing `ocrResourcesDir`
  pattern) since a forked utility process cannot reliably resolve an
  asarUnpack'd *directory* path itself the way a single `require.resolve`'d
  file can.
- Low — pdf-convertor's own `PdfToImages` direction had no page-count or
  pixel cap at all (a real, open gap there) → fixed by applying the existing
  `MAX_IMAGES`/`MAX_TOTAL_PIXELS` caps (from `app/convert/constants.ts`)
  symmetrically to both directions in the port.
- Low — html-leaf's GitHub Actions permission was left in a state that
  silently accepted `workflow_dispatch` calls (204 success) but never
  created a job: the run sat at `status: queued` indefinitely with zero
  entries in `list_workflow_jobs`, and even `cancel_workflow_run` refused it
  (`409 Cannot cancel a workflow run that has not been queued yet`) — an
  internal state inconsistent with the reported "queued" status. Diagnosed
  by comparing against `pdf-convertor`'s own identical-shaped workflow
  (same account, same `windows-latest`, reliably ~5 minutes per its run
  history) and confirmed by the fix: once the owner allowed Actions for this
  repository in Settings -> Actions -> General, a freshly dispatched run
  went `in_progress` within 4 seconds. Likely cause: a per-repository
  Actions-permission setting that doesn't auto-enable on a private-to-public
  visibility switch.

## Remaining Risks

- No macOS build exists or is wired into CI (deliberate scope decision,
  macOS never shipped successfully in this repository's history).
- The GitHub App installation backing this session's GitHub MCP tools has no
  `create_repository` (confirmed: 403 `Resource not accessible by
  integration`) or repository-deletion capability — a future session asked
  to create or delete a repository under this account will hit the same
  wall and must ask the owner to do it via github.com directly.
- No mirror/backup of `pdf-convertor` was kept before deletion — the owner
  was asked and explicitly chose to skip it ("백업 생략하고 진행"). Its
  history (including the documented rationale for the image pixel caps, the
  OCR font-embedding fixes, and other defects found and fixed there) is now
  unrecoverable from this account; the only surviving record of that work is
  what was ported into this repository's code/comments/reports (including
  this one) before deletion.
- `MAX_OCR_PAGES = 5` in `ocr-task.js` and `MAX_EXTRACT_PAGES = 500` in
  `extract-text-task.js` are both carried-over or newly-chosen bounds noted
  in-code as revisitable, not load-bearing architectural limits.

## Efficiency / Meta Evaluation

- Single-agent, single-session run (no worker fan-out; features were ported
  sequentially since each built on infrastructure the previous one
  established).
- One real rework cycle: the original plan assumed Convert would run in
  Leaf's renderer process (matching pdf-convertor's own browser-side
  implementation); this was corrected during implementation once
  `contextIsolation`/`nodeIntegration` being off was confirmed to make that
  impossible, and it was moved into the same utility-process harness
  compress/OCR already used.
- Strategy lesson: when porting a feature from an environment with a
  materially different execution model (browser main thread vs. Electron
  utility process; plain Node vs. Electron's utility process), verify the
  *environment-specific* assumptions (module isolation, `isNodeJS`-style
  auto-detection, global polyfills) empirically against the actual target
  runtime before writing the port's architecture into a plan — two of this
  run's three real bugs were exactly this class of issue, and the plan
  initially got one of them (Convert's execution location) wrong for the
  same underlying reason.

## Owner Actions

- OA-1 — Windows build workflow approved and now active (see
  `.ai/reports/OWNER_ACTIONS.md`); repository visibility switched to public;
  a real run confirmed green.

## Recommended Next Actions

1. If a macOS build is ever wanted, `package.json`'s existing but unwired
   `dist:mac*` scripts are the starting point — no work was done toward
   this, since the repository's own release history (27 prior releases)
   never shipped one successfully.
2. Consider deleting the now-merged `leaf/pdf-tools-consolidation` branch
   on GitHub (left in place; not required, but no longer needed).
3. `pdf-convertor` is gone. Any future task that references it as a living
   source repository is working from stale context — treat this report,
   and the code/comments it describes, as the full surviving record.
