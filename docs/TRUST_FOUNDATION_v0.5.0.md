# v0.5.0 — Trust Foundation

## 목적
기능 추가보다 기존 HTML을 안심하고 편집할 수 있는 기반을 우선한다.

## 구현

### Atomic Save
HTML/Text export 및 project save는 임시 파일 작성 후 rename으로 교체한다.

### Editor-state Leakage Guard
다음 runtime 상태는 Source에 저장하지 않는다.
- data-editor-overlay
- data-adf-marker
- data-hbe-drop-line
- data-editor-element-id
- table-cell-selected
- viewport-object-drop-target

남아 있으면 Source commit을 차단한다.

### Minimal Source Patch PoC
Inspector에서 Text 하나만 변경되고 원본 text가 Source에 정확히 1회 존재하면 전체 DOM serialization 대신 문자열 범위만 교체한다.

현재 지원:
- unique direct text edit

현재 fallback:
- style/typography/margin
- object insertion/delete/reparent
- table structural operations
- ambiguous text

### Golden Fixtures
10개 HTML fixture 및 source fidelity regression을 추가했다.

### Clear Undo
Clear HTML 전에 undo snapshot을 생성한다.

## 의도적으로 아직 하지 않은 것
- lossless HTML parser
- DOM ↔ source AST mapping
- style/attribute surgical patch
- smallest-subtree structural patch
- Electron GUI E2E
- TableGrid/Zoom/DOM 탭 신규 확장

이들은 Trust Foundation 검증 후 다음 Mission으로 진행한다.
