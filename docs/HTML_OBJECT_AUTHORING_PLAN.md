# HTML Book Editor — HTML Object Authoring Plan

## 1. 목적

다음 단계에서는 HTML을 단순 문자열/DOM으로만 편집하지 않고, 사용자가 **의미를 가진 객체(Object)** 를 삽입하고 Inspector에서 편집할 수 있게 한다.

예상 객체:

- Callout / Panel
- Heading Section
- Table
- Code Block
- Quote
- Divider
- Image / Figure
- Jira-compatible Info / Warning / Success Panel
- 향후 Template / Reusable Block

핵심 목표는 **HTML 표준 호환성을 잃지 않는 것**이다.

---

## 2. 권장 저장 방식

Custom Element를 Source of Truth로 삼기보다 표준 HTML 요소 + `data-hbe-*` metadata를 권장한다.

```html
<aside
  class="hbe-callout"
  data-hbe-object="callout"
  data-hbe-id="obj_01"
  data-hbe-type="warning"
>
  <strong>Warning</strong>
  <p>내용</p>
</aside>
```

장점:

1. 일반 브라우저에서도 정상 HTML
2. Editor가 없어도 내용이 보임
3. Jira / Markdown / ADF adapter가 semantic object로 인식 가능
4. 향후 metadata migration이 쉬움
5. `<hbe-panel>` 같은 비표준 Custom Element에 전체 문서를 종속시키지 않음

---

## 3. Object Model

```text
HtmlObject
├─ id
├─ type
├─ version
├─ element
├─ properties
├─ children
└─ adapterMetadata
```

초기 Object Type:

```text
callout
codeBlock
table
quote
divider
figure
section
```

각 type은 Object Registry에 등록한다.

```text
ObjectRegistry
├─ create()
├─ identify()
├─ readProperties()
├─ applyProperties()
├─ validate()
├─ serialize()
├─ toSemanticDocument()
└─ migrate()
```

---

## 4. Jira Export와의 연결

v0.3.8에서 추가한 흐름:

```text
HTML / Rendered DOM
↓
Semantic Document Model
↓
Jira Rich / Markdown / ADF
```

Object Authoring은 이 흐름의 앞단을 강화한다.

```text
HTML Object
↓
Semantic Object
↓
Semantic Document Model
↓
Output Adapter
├─ HTML
├─ Jira Rich Clipboard
├─ Markdown
└─ ADF
```

예:

```html
<aside data-hbe-object="callout" data-hbe-type="warning">
```

은 자동으로:

```text
Semantic
→ panel(type=warning)

ADF
→ panel.attrs.panelType = warning
```

로 매핑한다.

---

## 5. Insert UX

### 5.1 Toolbar

Viewport title bar 또는 Edit mode toolbar:

```text
[ + Insert ]
```

메뉴:

```text
Text
Heading
Callout
Table
Code Block
Quote
Divider
Image
```

### 5.2 Slash Command

Text context에서:

```text
/
```

입력:

```text
/callout
/table
/code
```

후보 표시.

### 5.3 Object Palette

후속 단계:

```text
Object Palette
→ Drag
→ HTML Viewport
→ Drop Position Preview
→ Insert
```

초기 구현에서는 Toolbar Insert를 우선한다.

---

## 6. Selection

현재 HTML Edit Selection과 Object Selection을 분리한다.

```text
HTML Edit
├─ Element Selection
└─ Object Selection
```

Object가 선택되면 Inspector는 Object Schema를 우선 사용한다.

예:

```text
CALLOUT
Type      | Warning
Title     | Caution
Body      | ...
```

일반 Element이면 기존 Typography / Spacing Inspector를 사용한다.

---

## 7. Object Insertion Transaction

삽입은 반드시 하나의 Logical Transaction이다.

```text
Insert Command
↓
Validate target
↓
Create Object
↓
Insert HTML
↓
Source Commit
↓
Selection = New Object
↓
Undo Entry 1개
```

객체 생성 중간 상태를 HTML Source에 여러 번 기록하지 않는다.

---

## 8. Stable Identity

각 Object는 stable ID를 가진다.

```html
data-hbe-id="obj_c6fb..."
```

ID 용도:

- Inspector target
- Undo / Redo
- Copy / Paste
- Object migration
- AI edit
- Jira conversion diagnostics
- Cross-document references

일반 HTML Element 전체에 ID를 강제로 넣지 않고 **Editor Object에만** 넣는다.

---

## 9. Copy / Paste

Object Copy는 DOM string copy가 아니라 object payload도 병행한다.

```text
Clipboard
├─ text/html
├─ text/plain
└─ application/x-hbe-object+json
```

앱 내부 Paste:

```text
HBE Object payload 우선
```

외부 Paste:

```text
HTML fallback
```

---

## 10. Inspector Schema

Object별 Property Schema:

```js
{
  type: "callout",
  fields: [
    { key:"panelType", type:"enum", values:["info","note","warning","success","error"] },
    { key:"title", type:"text" }
  ]
}
```

HTML/CSS Property Editor와 Object Property Editor를 같은 Draft / Preview / Apply transaction 구조 위에서 사용한다.

---

## 11. Object Rendering Policy

객체는 Editor 전용 Shadow DOM에 숨기지 않는다.

Source HTML 자체에 의미 있는 fallback markup과 local CSS를 둔다.

목표:

```text
HTML Book Editor 없이 열어도 읽을 수 있음
+
HTML Book Editor에서는 Object로 인식됨
```

---

## 12. 구현 Phase

### Phase O1 — Object Infrastructure
- Object Registry
- `data-hbe-object`
- stable ID
- identify / serialize
- Object Selection

### Phase O2 — Insert
- `+ Insert`
- Callout
- Code Block
- Divider
- Quote

### Phase O3 — Structured Objects
- Table
- Figure
- Image

### Phase O4 — Inspector
- Object Schema
- Draft / Preview / Apply
- Validation

### Phase O5 — Clipboard
- Copy / Paste Object
- Duplicate
- Cross-document paste

### Phase O6 — Export Adapter
- HBE Object → Semantic Document
- Semantic → ADF / Markdown / HTML
- unsupported object diagnostics

---

## 13. 첫 구현 추천

첫 번째 실제 Object는 **Callout / Panel**을 권장한다.

이유:

1. 구조가 단순함
2. Jira ADF `panel`과 1:1 매핑 가능
3. HTML에서도 자연스러운 fallback 제공 가능
4. Inspector Enum 편집 예제로 적절함
5. Object → Semantic → Jira Adapter 전체 파이프라인을 검증하기 좋음

첫 목표:

```text
Insert → Callout
↓
Info / Note / Warning / Success / Error
↓
HTML 저장
↓
Jira Export
↓
ADF Panel로 변환
```

이 흐름이 안정되면 Table / Code Block / Figure 순서로 확장한다.
