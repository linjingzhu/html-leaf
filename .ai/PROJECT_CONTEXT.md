---
doc_id: ai-project-context
version: 1.0.0
canonical_path: .ai/PROJECT_CONTEXT.md
updated: 2026-09-25
---

# html-leaf Context

Repository: linjingzhu/html-leaf. Evidence baseline: 37ac065e617c6359dc48c32b841fb28ba93a446e.

## repository_mode

```text
repository_mode: protected
```

## Facts the checks read

```text
base_branch: stable
merge_deploys: yes
runtime_gate: none
test_command: npm run qa
lint_command: npm run qa:static
build_command: none
generated: release-v0.5.16/ from Electron source and package configuration : npm run dist:win or npm run dist:mac; platform icons from build/icon.png : npm run icons:build
external_scripts: unverified; inspect the affected product surface before changing script loading
public_ids: unverified; no new public-identifier allowlist established by this policy update
owner_ledger: .ai/reports/OWNER_ACTIONS.md
```

`merge_deploys: yes` is a conservative assumption because external deployment integrations have not been verified. It does not assert that a deployment is configured. GitHub Actions workflows are removed at the owner's request; do not recreate or re-enable them without a new instruction. Existing README/CI references may describe the previous setup; verification now runs locally. A value of `none` above means no applicable verified command was established, not a passed check.

## Authoritative product constraints

Leaf is an Electron visual project editor with document workspaces, source-fidelity guards and HTML/Markdown/JSON/PDF pages. README describes version 0.5.16 and the Project/Document/Page-or-Group hierarchy.

Preserve editable source and save semantics: new projects use .prj; legacy .leaf/.hbeproj/JSON remain openable; cross-format exports leave the editable Page unchanged; same-format Save As adopts its path. Preserve the detailed current interaction requirements in README.

## Current architecture

Electron main entry src/main.js; renderer source under src/renderer/. package.json owns electron-builder settings; scripts/ contains version-specific QA and packaging helpers. README and docs/RELEASE_v0.5.16.md document behavior.

## Current development slice

Adopt the shared ai-dev-rule 3.0.0 policy and Codex/Claude capabilities and remove tracked GitHub Actions workflows. Application implementation and package/build configuration are unchanged. Later application work must consult current source, README and the retained project documentation rather than infer a feature roadmap from this maintenance slice.

## Permanently excluded scope

Keep the product boundaries stated above and in the repository's product documents. Additional exclusions not established by those sources are unknown; this policy update creates no new product roadmap.

## Repository guidance migration

No previous CLAUDE.md or AGENTS.md was present at the recorded base commit. The shared ai-dev-rule 3.0.0 documents govern generic development workflow, model routing, reporting and merge authority; they supersede contradictory older generic instructions. This does not relax repository-specific product, data or security boundaries. The current explicit user request authorizes this batch policy merge; protected is the safe default for future unrelated work.

No generic build or automated running-product gate is declared. npm start opens Electron for manual verification. Packaging scripts increment the version via version:build and must not be used as a read-only verification shortcut. The qa command inspects source patterns and is not proof of runtime behavior.

## Verification limits

Policy structural checks and whitespace checks validate the policy update only. Application dependencies, builds, runtime behavior, visual behavior, external deployments, generated-output completeness, external scripts and public identifiers were not fully verified during adoption. Commands above are grounded in tracked README, package/build configuration or prior guidance; they have not been claimed to pass here.
