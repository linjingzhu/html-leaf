---
doc_id: ai-project-lessons
version: 1.0.0
canonical_path: .ai/memory/PROJECT_LESSONS.md
updated: 2026-09-25
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
