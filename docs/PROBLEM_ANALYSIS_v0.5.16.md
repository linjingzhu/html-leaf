# 문제 분석 — Leaf v0.5.16

분석 시점: 2026-08-25 / 기준 커밋: `ed96e46` (Fix Edit click event-loop freeze, #43)
정적 QA: `npm run qa:static` — 62/62 통과

## 0. 요약

v0.5.16 개발 마지막 8시간 동안 PR #33~#43 중 **9건이 "멈춤(freeze)·시작 루프" 계열 단일 결함군**에 대한
수정이었다. 각 PR은 문제를 일으킨 옵저버를 하나씩 좁히는 방식으로 대응했고, 구조 자체는 그대로 남아 있다.

이 문서는 개별 증상이 아니라 **증상을 계속 만들어내는 두 개의 생성기**를 지목한다.

| # | 문제 | 심각도 | 상태 |
|---|---|---|---|
| 1 | `persist()` 전체 상태 동기 직렬화 (76개 호출부, 스로틀 없음) | 높음 | 미수정 |
| 2 | `theme-policy.js`의 `localStorage.setItem` 몽키패치 | 높음 | 미수정 |
| 3 | 확장 스크립트의 문서 전역 MutationObserver 모델 | 중간 | 구조적 |
| 4 | `code-syntax-highlight.js`의 영구 300ms 인터벌 | 낮음 | 미수정 |
| 5 | `active-view-policy.js`의 도달 불가 정책 코드 | 낮음 | 미수정 |

---

## 1. `persist()` — 렌더러 메인 스레드 정지의 1차 원인

`src/renderer/renderer.js:276`

```js
function persist(){
  state.selectedTreeNode = selectedTreeNode;
  state.activeSlots = activeSlots;
  localStorage.setItem(stateKey, JSON.stringify(state));
}
```

`state`는 모든 Document → Page의 **본문 소스 전체**(`source`, `loadedSource`)를 담는다.
즉 매 호출마다 프로젝트 전체가 문자열로 직렬화된다.

확인된 사실:

- 호출부 **76곳**. 디바운스·스로틀·유휴 지연 없음.
- `try/catch` 없음. (`loadState()`에는 있음)
- 동기 `localStorage.setItem` — 직렬화 후 디스크 쓰기까지 메인 스레드를 점유.

측정값 (Node 24, 문제 2의 몽키패치 비용 포함):

| 프로젝트 규모 | 페이로드 | persist 1회 |
|---|---|---|
| 50 페이지 × 8KB | 0.8 MB | 8.3 ms |
| **300 페이지 × 8KB** | **4.7 MB** | **108.7 ms** |
| 300 페이지 × 32KB | 18.8 MB | 559.5 ms |

300 페이지는 가상의 수치가 아니다 — 저장소의 자체 QA 픽스처가
`10 projects / 50 groups / 300 pages`를 사용한다 (`scripts/qa-static.js`).

**추가 위험 — 조용한 실패:** Chromium의 origin당 localStorage 할당량은 약 5MB다.
위 표의 두 번째 행에서 이미 한계선이며, 세 번째 행은 확실히 초과한다.
`persist()`에 `try/catch`가 없으므로 `QuotaExceededError`가 76개 호출부
(대부분 UI 이벤트 핸들러) 밖으로 그대로 전파된다. 사용자에게는
"편집이 저장되지 않고 UI가 반응하지 않는" 형태로 나타난다.

### 권고

1. `persist()`를 디바운스(예: 250ms) + `requestIdleCallback` 기반으로 전환.
2. `try/catch`로 감싸고 할당량 초과를 사용자에게 표면화.
3. 페이지 본문을 세션 상태에서 분리 — localStorage에는 구조·선택·레이아웃만 저장하고
   본문은 프로젝트 파일(`.prj`)을 단일 출처로 삼는다. 이것이 근본 해법이다.

---

## 2. `theme-policy.js` — 문자열 하나를 위해 전체 상태를 재파싱

`src/renderer/theme-policy.js:35`

```js
localStorage.setItem = (key, value) => {
  const nextValue = key === STATE_KEY ? normalizeSerializedState(value) : value;
  return nativeSetItem(key, nextValue);
};
```

`normalizeSerializedState()`는 `JSON.parse` → `preferences.theme` 정규화 → `JSON.stringify`를 수행한다.
따라서 **모든 `persist()` 호출이 전체 페이로드를 한 번 더 파싱하고 한 번 더 직렬화한다.**

300페이지 기준 측정에서 persist 총 108.7ms 중 **90.4ms(83%)가 이 패치의 비용**이다.
목적은 테마 문자열 하나를 `dark|light|carbon` 중 하나로 강제하는 것뿐이다.

동일 파일의 `enforceThemePolicy()`도 `patchStoredState()`를 호출하며, 이 함수는
`data-theme` 변경 시마다, 그리고 시작 후 5초간 250ms 간격으로 20회 전체 상태를 재파싱한다.

#42가 이 파일의 옵저버 범위를 `childList` → `attributeFilter:['data-theme']`로 좁혀
무한 루프는 제거했지만, **재파싱 비용 자체는 그대로 남았다.**

### 권고

몽키패치를 제거한다. 테마 정규화는 이미 렌더러가 소유한 값이므로
`renderer.js`의 상태 로드 지점 1곳에서 수행하면 충분하다.
저장 경로 전체를 가로챌 이유가 없다.

---

## 3. 구조적 원인 — 확장 스크립트의 문서 전역 옵저버 모델

`source-fidelity.js:613`은 렌더러 준비 후 6개 스크립트를 주입한다:

```
preview-universal-edit.js   image-widget-edit.js   view-drop-bridge.js
code-syntax-highlight.js    active-view-policy.js  scripted-html-edit.js
```

이들은 `renderer.js`가 소유한 동일한 DOM에 대해 **권한 없이 경쟁하는 관찰자**다.
현재 4개가 문서 전역 옵저버를 설치한다:

| 파일 | 위치 | 콜백 | 해제 |
|---|---|---|---|
| `active-view-policy.js` | 202 | `install` | 없음 |
| `code-syntax-highlight.js` | 267 | `install` | 없음 |
| `image-widget-edit.js` | 562 | `scheduleInstall` | 없음 |
| `view-drop-bridge.js` | 273 | `scheduleInstall` | 없음 |
| `source-fidelity.js` | 455 | 스크립트 탐지 | 없음 |

모두 `observe(document.documentElement, { childList: true, subtree: true })` —
문서 어디서든 노드가 추가·삭제되면 콜백이 실행된다.
`renderer.js`의 `renderTree()`, `renderPageSelects()`, `renderFrame()`은
매 렌더마다 수백 개의 노드를 교체하므로 이 경로는 상시 활성이다.

### 3.1 3배 증폭

`view-drop-bridge.js:261`, `image-widget-edit.js:553` — 동일 패턴:

```js
function scheduleInstall() {
  install();
  requestAnimationFrame(install);
  setTimeout(install, 160);
}
```

변경 배치 1건 → `install()` **3회**. 두 파일이므로 6회.
`setTimeout` 핸들은 저장되지 않아 **취소도 병합도 불가능**하다.
160ms 안에 변경 배치가 N번 발생하면 N개의 타이머가 그대로 쌓인다.

각 `install()`은 dataset 플래그로 가드되어 있어 실제 작업은 대부분 조기 반환이지만,
반환 전까지의 `querySelector` 스윕 비용은 매번 지불된다.

### 3.2 해제되지 않는 스크립트 옵저버

`source-fidelity.js:455`의 옵저버는 시작 진단 목적인데 **영구적으로 유지**되며,
추가되는 모든 노드에 대해 `node.querySelectorAll('script')`를 호출한다.
대규모 트리 렌더링 시 O(노드수 × 서브트리크기) 비용이 발생한다.
렌더러 준비 완료 시점에 `disconnect()` 해야 한다.

### 3.3 이것이 #33~#43의 생성기다

#42(테마 옵저버 루프)와 #43(Edit 클릭 이중 처리)은 모두 같은 형태였다 —
확장 스크립트가 렌더러의 DOM을 관찰하다가, 렌더러가 소유한 상태를 되받아쓰고,
그 쓰기가 다시 옵저버를 깨우는 구조.

#43은 올바른 방향을 제시했다: **렌더러가 Edit 상태의 단일 소유자가 되고,
확장은 `leaf-edit-runtime-transition` 커스텀 이벤트를 구독한다.**
옵저버와 폴링은 삭제되었다.

이 패턴을 나머지 4개 옵저버에도 확장 적용해야 한다.

### 권고

`renderer.js`가 렌더 수명주기 이벤트를 명시적으로 발행하고
(`leaf-frame-rendered`, `leaf-tree-rendered`, `leaf-view-mode-changed` 등),
확장은 문서를 감시하는 대신 해당 이벤트만 구독한다.
문서 전역 `subtree` 옵저버 신규 도입을 금지하는 정적 검사 항목을 `qa-static.js`에 추가한다.

---

## 4. `code-syntax-highlight.js` — 영구 인터벌

`code-syntax-highlight.js:261`

```js
setInterval(updateHighlight, 300);
```

해제되지 않는다. `#sourceEditor`는 `index.html`의 정적 요소이므로 인터벌이
중복 등록되지는 않지만(요소 교체가 없어 dataset 가드가 유지됨), **Code 뷰를 한 번도 열지 않아도
앱 수명 내내 300ms마다 실행된다.** 시작 시점에 사용되지 않는 오버레이 `<pre>`도 `#codeArea`에 삽입된다.

추가로 `install()`이 문서 전역 옵저버 콜백이므로(문제 3), 모든 DOM 변경마다
`updateHighlight()`가 한 번 더 실행된다. 텍스트 캐시(`lastText`) 덕분에 재토크나이즈는
회피되지만 `ensureOverlay()` + `detectType()`의 `querySelector` 비용은 매번 발생한다.

또한 `input` 이벤트에 디바운스가 없어, 타이핑 중 매 키 입력마다 소스 전체를 정규식으로 재토크나이즈한다.

### 권고

Code 뷰 활성 시에만 인터벌을 걸고 비활성 시 `clearInterval`. `input` 경로에 rAF 병합 적용.

---

## 5. `active-view-policy.js` — 도달 불가 정책 코드

`install()` 마지막 줄:

```js
if (activeMode() === 'preview' && Date.now() - lastPreviewSyncAt > 250) syncPreviewToActivePage();
```

그러나 `currentActiveSlot()`은 `mode === 'preview'`일 때 **항상 `'single'`을 반환**한다:

```js
function currentActiveSlot() {
  const mode = activeMode();
  if (mode === 'split')  { ... }
  if (mode === 'code')   { ... }
  return mode === 'preview' ? 'single' : slotFromActiveOutline();
}
```

`syncPreviewToActivePage()`는 `pageIdForSlot('single')`, 즉 `singleSelect.value`를
`singleSelect.value`와 비교하므로 **항상 조기 반환한다.**

즉 옵저버 경로에서 이 정책은 **아무 일도 하지 않는다.** 문서 전역 옵저버를 유지하는
비용만 지불하고 있다. (버튼 제스처 경로 `handleModeGesture`는 모드 전환 *이전*에
실행되므로 정상 동작한다 — 기능 자체가 죽은 것은 아니다.)

### 권고

옵저버 경로의 호출을 제거하거나, 의도가 "다른 슬롯의 활성 페이지를 따라간다"였다면
`currentActiveSlot()` 대신 `slotFromActiveOutline()`을 사용하도록 수정한다.
단, 후자를 택할 경우 `renderPageSelects()`가 `el.value`를 되돌리는 경로와
진동(oscillation)을 일으키지 않는지 반드시 검증해야 한다.

---

## 6. 부차 관찰

- **`loadState()`** (`renderer.js:271`) — 18개의 레거시 키를 순차 조회한다.
  마이그레이션 유틸로 1회 승격 후 정리 대상.
- **파일 읽기 IPC** — `readDocumentPath`, `readLocalAssetDataUrl`은 확장자·크기 검증은 하지만
  경로 제한이 없어 디스크의 임의 파일을 읽을 수 있다.
  현재 페이지 iframe은 preload가 없고 CSP `default-src 'none'`이 적용되어
  `electronAPI`에 도달할 수 없으므로 **실제 취약점은 아니다.** 심층 방어 차원의 강화 항목.
- **양호한 부분** — 메인 프로세스 보안 설정은 올바르다:
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
  (`main.js:234`, `main.js:470`). preload는 `contextBridge`로 최소 표면만 노출한다.

---

## 7. 우선순위

**즉시 (사용자 체감 멈춤 제거)**
1. 문제 2 — `theme-policy.js` 몽키패치 제거. 단독으로 persist 비용의 83% 제거.
2. 문제 1 — `persist()` 디바운스 + `try/catch`.

**다음 (결함군 재발 차단)**
3. 문제 3 — 렌더러 수명주기 이벤트 도입, 문서 전역 옵저버 4개 철거.
   `qa-static.js`에 신규 `subtree` 옵저버 금지 검사 추가.

**정리**
4. 문제 4, 5, 그리고 6절의 항목들.

**근본 (v0.5.17 이후)**
5. 페이지 본문을 localStorage 상태에서 분리. 문제 1의 규모 한계를 제거하는 유일한 방법.
