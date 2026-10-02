# Owner Actions

One row per action only the repository owner can approve or perform. Reports and other documents cite a row's id rather than restating its status — this file is the single place that says what the status is.

## OA-1 — GitHub Actions approved for manual Windows desktop-package builds

- **Status**: **active** — the owner switched this repository's visibility to public (confirmed via the GitHub API: `"private": false, "visibility": "public"`) and the workflow has since run successfully (run `37028862821`, 2026-10-02, conclusion `success`, published `v0.6.2-build.2`). The cost basis below now holds.
- **Approved**: 2026-10-02, by the repository owner, as part of a wider request to consolidate development into this repository and retire the sibling `pdf-convertor` repository ("Leaf 배포 파이프라인 복구/교체도 포함" — explicitly confirmed when asked). This repository's own GitHub Actions workflows (`build-windows.yml`/`build-macos.yml`/`build-release.yml`) were previously removed at the owner's explicit request on 2026-09-25 (`.ai/reports/2026-09-25-rules-and-actions-result.md`), with no release published since 2026-09-07; this row is the new instruction to recreate manual-only, Windows-only CI, deliberately narrower than what was removed.
- **Workflow**: `.github/workflows/build-desktop.yml` — builds the Windows NSIS installer and portable zip on `windows-latest` (`npm ci`, the full `qa:*` suite, `npm run dist:win`), uploads them as a workflow artifact, and publishes a GitHub Release per run (tag `v<version>-build.<run number>`, assets `Leaf-Setup-x64.exe` / `Leaf-x64-portable.zip`, via the runner's `gh` CLI with the workflow's own `GITHUB_TOKEN`, `permissions: contents: write`). The newest build is always at:
  - `https://github.com/linjingzhu/html-leaf/releases/latest/download/Leaf-Setup-x64.exe`
  - `https://github.com/linjingzhu/html-leaf/releases/latest/download/Leaf-x64-portable.zip`

  Does not deploy anything. No macOS job — this repository's entire release history (27 prior releases) never shipped a macOS build successfully, so macOS packaging config stays in `package.json` but is not wired into CI.
- **Trigger**: `workflow_dispatch` only — no automatic run on push, pull request, or a schedule. Every run is a deliberate, manual action. (The prior, removed workflows ran on `push`/tag events too; that surface caused a real incident — a duplicated push trigger minted 116 release tags before it was caught, per `scripts/qa-static.js`'s own regression check — and is not being reintroduced.)
- **Provider / runner**: GitHub Actions, `windows-latest` (standard GitHub-hosted runner only — no self-hosted or larger/paid runner).
- **Repository scope**: `linjingzhu/html-leaf` only.
- **Expected maximum cost**: $0 under GitHub's standard pricing — this repository is confirmed public, which gives unlimited Actions minutes on standard runners (including Windows) plus free artifact storage. A manual run takes roughly 4 minutes of runner time (confirmed: run `37028862821` completed in 4m06s).
- **Review / expiry date**: 2027-01-02 (90 days), or immediately if this repository's visibility changes in a way that invalidates the cost assumption above — whichever comes first. Re-confirm with the owner at that point before any further use.
