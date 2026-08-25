# Leaf v0.5.16

## v0.5.16 — Project File Hierarchy

Leaf now uses the final workspace hierarchy and shortcut ownership:

```text
Project (.prj)                       Ctrl+N
└─ Document
   ├─ Page                           Ctrl+Shift+N
   └─ Group (container)
```

- `Ctrl+N`, `Ctrl+S`, and `Ctrl+Shift+S` create, save, and save-as the Project.
- `Ctrl+Shift+N` creates a Page under the currently selected object in the active Document.
- New Projects save as `.prj`; legacy `.leaf`, `.hbeproj`, and JSON projects remain openable and migrate through Save As.
- Supported Page formats are HTML, Markdown, JSON, and PDF. Markdown and JSON can be edited directly in Preview with the View's Edit toggle.
- Document View modes are labelled `Preview`, `Compare`, and `Code` while retaining their existing behavior and saved-state keys.
- The application menu now starts at the left edge without an embedded product icon; executable, installer, Desktop, and Start Menu icons remain branded.
- Hovering an object in HTML Edit shows a DevTools-style highlight and a property tooltip with its selector, editable name, rendered size, role, display mode, and keyboard-focusability. The current selection remains active while another object is inspected.
- `Save Page As` explicitly supports HTML, Markdown, JSON, and rendered PDF output. Cross-format exports leave the editable Page unchanged, while same-format Save As adopts the new file path.
- Preview, both Compare panes, Code Preview, and Code Source all provide Search. Matches are highlighted without changing the Page DOM, and Enter/Shift+Enter moves to the next/previous result.
- The final main-menu item is `Help`, with an `About Leaf` product-information dialog.
- Clear acts on the clicked View even when another View is active. Unchanged Pages clear immediately and unsaved Pages retain the save/discard prompt.
- Hierarchy updates from the loaded DOM as it changes and shows each object's type at the right edge.
- Holding Shift while resizing snaps the dragged edge to nearby object edges and centers within 6px.
- Edit uses a 3px red outline, and View title/search rows are 20% taller.
- Every vertical and horizontal splitter reserves an 8px neutral gutter, leaving clear breathing room between adjacent panes while retaining the centered drag guide.
- New Document, New Page, and New Section create immediately in the Project tree without opening a naming dialog. Repeated items receive collision-safe numbered names and remain available for later F2 rename.
- Preference offers Dark and Light appearances, with Light as the default. The former `Carbon` appearance is retired; stored `carbon` and legacy `codex` preferences migrate to Light on load.
- The application bar now includes a left-panel toggle. It hides both the Project/Object/Used area and Hierarchy splitter, expands the document View immediately, and restores the panel independently from Inspector visibility.
- Selecting an HTML table cell in Edit mode now opens an in-document toolbar for adding or deleting the selected row/column, merging right, and splitting a merged cell. Structural actions preserve selection, support Undo/Redo, and understand `colspan` while keeping editor controls out of saved HTML.
- Document zoom now scales Page content without visually scaling its internal scrollbar. Preview scrollbars retain an 8px target at 5–200% zoom, including Compare and direct Markdown/JSON editing, and the runtime compensation never enters saved Page source.
- A source file is represented by one Page and cannot be opened into two Compare windows; duplicate imports focus the existing Page.
- Markdown source editing works in every visual View. PDF Edit enables the native PDF annotation, highlight, fill, sign, undo/redo, and download tools.

Release details and verification: `docs/RELEASE_v0.5.16.md`.

## Downloads

| Platform | File | Source |
| --- | --- | --- |
| Windows x64 | `Leaf-0.5.16-x64.zip` (portable, no install) | [`windows-v0.5.16`](../../releases/tag/windows-v0.5.16), [`dist/`](dist) |
| macOS Apple Silicon | `Leaf-0.5.16-mac-arm64.dmg` / `.zip` | [`macos-v0.5.16`](../../releases/tag/macos-v0.5.16) |
| macOS Intel | `Leaf-0.5.16-mac-x64.dmg` / `.zip` | [`macos-v0.5.16`](../../releases/tag/macos-v0.5.16) |

플랫폼 빌드는 GitHub Actions의 `Build macOS` / `Build Windows` 워크플로가 각각 macOS·Windows 러너에서 생성합니다.
두 워크플로 모두 `claude/**` 브랜치 push, `v*` 태그 push, 수동 실행(Actions → 워크플로 선택 → Run workflow)으로 동작하며,
결과물을 워크플로 아티팩트와 `macos-v<version>` / `windows-v<version>` 사전 릴리스에 함께 올립니다.

Windows 빌드는 코드 서명 인증서가 없어 SmartScreen 경고가 표시될 수 있습니다. **추가 정보 → 실행**을 선택하세요.

macOS 빌드는 Apple Developer 인증서로 서명/공증되지 않았기 때문에 첫 실행이 차단됩니다.
`Leaf.app`을 `/Applications`로 옮긴 뒤 아래 명령으로 격리 속성을 제거하거나, 앱을 우클릭한 다음 **열기**를 선택하세요.

```bash
xattr -dr com.apple.quarantine /Applications/Leaf.app
```

## Building locally

```bash
npm ci
npm run dist:win          # Windows: portable zip (Windows 필요)
npm run dist:mac          # macOS: dmg + zip, arm64 + x64 (macOS 필요)
npm run dist:mac:arm64    # Apple Silicon 전용
npm run dist:mac:x64      # Intel 전용
```

빌드 결과는 `release-v<version>/`에 생성됩니다.
`dmg` 타깃과 코드 서명은 macOS에서만 동작하므로, macOS 배포본은 macOS 또는 위 워크플로에서 빌드해야 합니다.

## v0.5.15 — Project / Document / Page Model

Leaf now uses one consistent three-level content model:

```text
Leaf Project (.leaf)
└─ Documents
   └─ Pages (HTML / Markdown / JSON / PDF)
```

- The former Leaf Document is now a **Leaf Project**.
- Former Projects are now **Documents**.
- HTML, Markdown, JSON, and PDF child documents are now **Pages**.
- `Ctrl+N`, `Ctrl+S`, and `Ctrl+Shift+S` create, save, and save-as the active Page.
- File actions now use New Page, New Document, and Open/Save Leaf Project terminology.
- New `.leaf` files use the `leaf-project` / `documents` schema.
- v0.5.14 `leaf-document` / `projects` files remain readable and migrate automatically in memory.

## v0.5.14 — Leaf Document Workspace and Editing UI

- Native document fullscreen now hides the operating-system title bar. The only remaining control is a circular translucent Show UI icon.
- `Ctrl+N`, `Ctrl+S`, and `Ctrl+Shift+S` now create, save, and save-as the active document rather than the active project.
- A `.leaf` document serializes the complete project collection. Each project can contain HTML, Markdown, JSON, and PDF documents.
- HTML, Markdown, JSON, and PDF files can be dragged from Explorer directly into a Project card; multiple files are imported independently.
- Edit activation turns both its button and owning View outline red.
- Code View uses non-wrapping source, synchronized line numbers, and a title-bar search field focused by `Ctrl+F`.
- Inspector uses two-level foldable groups, enlarges the selected object name, and hides Reset.
- PNG/JPG export captures the rendered object. Multi-selection context Export writes one collision-safe file per object.
- Compact scrollbars are applied to Leaf UI and runtime previews without leaking editor metadata into saved HTML.

Release details and verification: `docs/RELEASE_v0.5.14.md`.

## v0.5.13 — Cursor Zoom and Jira Ticket Preview

- Ctrl + mouse wheel zoom now preserves the document point under the cursor, including wheel input inside the preview document.
- Check Atlassian switches to Split: the source document remains on the left and a Jira issue-description preview appears on the right.
- The Atlassian preview can render generated Rich Text, Markdown, and ADF JSON, and accepts dropped/opened `.md`, `.markdown`, and `.json` files.
- Jira preview conversion escapes imported text and runs under a restrictive no-network content policy.

## v0.5.12 — Object Export and Focused Document Viewing

- Export the selected object as PNG, JPG, or SVG at 0.5×–4× scale from Inspector or context menu.
- Resize, hide, and restore the Used component Preview area.
- Keep the Viewport Edit label stable as an on/off state control.
- View one document without application UI and restore the UI from the same upper-right control.
- Enter edits selected text, Escape cancels it, outside clicks commit it, and F locates the selected object.

## v0.5.11 — Leaf Product Identity

- Renamed the application, executable, installer, window title, and shortcuts to Leaf.
- Registered the Windows App User Model ID as `com.leaf.editor`.

## v0.5.10 — Product Icon and Windows Installer

- Added the supplied leaf artwork as the Windows executable and taskbar icon.
- Added a branded NSIS installer with matching installer and uninstall icons.
- Added matching Desktop and Start Menu shortcut icons.
- The supplied product artwork remains the Windows executable, installer, Desktop, and Start Menu icon. The former menu-bar icon was removed in v0.5.16.

## v0.5.9 — Document Hierarchy and Text Fidelity

- Shift+Enter now commits a durable `<br>` to Source, while Enter ends inline editing and IME composition remains protected.
- Hierarchy starts in Name mode and Root is navigation-only, never an editable selection.
- Inspector exposes a complete Text CSS fold with typography, decoration, wrapping, bidi, writing-mode, and WebKit text controls.
- Split always binds two different Documents and swaps bindings when a selector would collide.
- Used adds a sandboxed lower preview and one-way document-object to Used-list selection synchronization.
- Project nodes support F2, Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D, Delete, per-node child add menus, and hierarchy drag-and-drop.
- Undo and Redo now restore structural object-selection snapshots after the iframe DOM is rebuilt.
- The redundant Preview label was removed from the Document View title.

## v0.5.8 — Used Components and Editing Reliability

- The new `Used` tab extracts reusable components from the active loaded HTML, groups identical components, and supports drag-to-reuse in the Viewport or Hierarchy.
- Inline text editing is IME-safe for single Korean characters: typing continues until Enter, Shift+Enter inserts a newline, and Enter commits once.
- Selection edge handles now cover each complete side while corner handles remain independently draggable.
- Selected components support Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+D, F2 text editing, and the same actions from a context menu.
- Viewport zoom controls display one editable percentage field without the extra `100` reset button.
- `Check Atlassian` replaces `Check JIRA`, and all check, recheck, clear, and close controls are connected.
- Typing HTML into an empty default document now makes it renderable immediately.

## v0.5.7 — Live Editing and Persistent Selection

- The first source loaded from each HTML path is copied into a session temp folder and removed when the app exits.
- Double-clicking a selected text widget enters direct keyboard editing.
- Inspector values commit immediately; the Apply button and unapplied-change flow are removed.
- Selection persists until another object is pressed, with Ctrl/Cmd toggle, Delete, Escape, and multi-object selection support.
- Hierarchy can switch between tag/content and editable object names. Rename with F2 or a second mouse press on a selected row.
- Object names are independent from content and appear in Inspector.
- Hierarchy expand arrows use a larger visual and pointer target.

## v0.5.6 — Free Resize and View-preserving Delete

- Selected document objects expose four corner and four edge handles.
- Every edge changes only its own axis; corner drags resize width and height independently without locking aspect ratio.
- Each Window title starts with a highlighted `Edit` / `Preview` toggle.
- Inspector Delete preserves the current document scroll position and clears selection.
- Inspector Reset sits immediately left of Delete in the bottom action row.
- Viewport Fit is a separate button to the right of the 100% zoom control.

## v0.5.4 — Resolution Fit and Ctrl+Wheel Zoom

- Fixed device and custom resolutions automatically scale to fit inside their Viewport.
- Fit zoom remains synchronized when the app window or Split divider is resized.
- `Ctrl + mouse wheel up/down` zooms the Viewport in 10% steps.
- Toolbar, wheel input, actual rendering scale, and percentage indicator share one zoom state.

## v0.5.3 — View-owned Editing and Inspector Folds

- `Edit` moved from Inspector to each editable Viewport title bar.
- Only the Viewport owning Edit can drive selection and Inspector changes.
- Inspector property groups use subtle, persistent fold headers with error badges.
- Code mode follows the Page in the currently active visual View.
- Split Left and Right keep independent Page bindings, sizes, zoom, Clear, and drops.
- File menu terminology now uses Document.

## v0.5.2 — Document Lifecycle Reliability

- Clear immediately removes unchanged HTML; changed HTML offers Save & Clear, Clear without saving, or Cancel.
- Split preserves the current Preview document in its left pane.
- New Project opens and expands its tree in the Projects panel.
- Dropping HTML over an occupied Viewport requires explicit replacement confirmation.
- Hierarchy now begins with a stable Root node.

## v0.5.1 — UI Reliability Fix

- Inspector Preview now applies and removes the current valid Draft without committing Source.
- New Project confirm closes safely and creates/selects the new project.
- Preview / Split / Code mode buttons now switch the center Viewport.
- Every preview has working Zoom Out / Reset / Zoom In controls (25–200%).
- Added v0.5.1 UI regression QA while retaining Trust Foundation and Source Fidelity suites.

## Script-driven HTML rendering

JavaScript가 DOM을 생성하는 HTML은 기존 Script-OFF Preview에서 빈 화면으로 보일 수 있었습니다.

v0.3.7:

```text
Static HTML
→ sandbox="allow-same-origin"
→ scripts OFF
→ HTML Edit 가능

Script-driven HTML
→ sandbox="allow-scripts"
→ same-origin 권한 없음
→ inline JavaScript 실행
→ Interactive Preview
```

`allow-scripts`와 `allow-same-origin`을 함께 사용하지 않습니다.
따라서 Electron Renderer와 scripted iframe은 격리됩니다.

Interactive Preview에서는 보안상 direct DOM Inspector/HTML Edit을 사용하지 않습니다.

## Clear HTML

Preview / Split Left / Split Right / Code Preview / Code Editor의 title bar에 `Clear` 버튼을 추가했습니다.

Clear는 Page를 삭제하지 않고:

```text
source = ""
baseUrl = null
sourcePath = null
isEmpty = true
```

로 만들어 다시 HTML Drag & Drop을 받을 수 있는 Empty Page로 되돌립니다.


## Jira / Atlassian Export

File 메뉴:

```text
Jira / Atlassian Export…
Copy for Jira
Copy as Markdown
Export ADF JSON
```

`Jira / Atlassian Export…` dialog에서:

- Jira Rich Text
- Markdown
- ADF JSON

을 미리 보고 Copy / Save 할 수 있습니다.

JavaScript로 본문을 만드는 HTML은 isolated Preview의 렌더링 DOM snapshot을 사용합니다.

자세한 구현:
- `docs/JIRA_EXPORT_IMPLEMENTATION.md`

다음 Object Authoring 기획:
- `docs/HTML_OBJECT_AUTHORING_PLAN.md`


## v0.4.0 Structural Fix

- Objects → Viewport real Drop
- Objects → Hierarchy real Drop
- Hierarchy reorder/reparent
- WidgetRegistry.create / containment
- Hierarchy expand/collapse
- Shared SelectionManager facade
- Horizontal splitter moved back into Unified Splitter Engine
- Hierarchy split ratio persistence
- Jira Check and Jira Export use the same rendered/source resolver
- Stable Jira issue mapping by object ID / occurrence
- Jira markers excluded from HTML serialization

See `docs/DEFECT_ROOT_CAUSE_AND_FIX_v4.0.md`.


## v0.4.1 — Viewport Zoom Percentage

Preview 계열 Viewport의 우하단에 현재 Zoom 비율을 표시합니다.

- Preview
- Split Left
- Split Right
- Code Preview

현재 기존 렌더링 배율은 `100%`이며, 각 Viewport별 zoom state를 독립적으로 보관하도록 구성했습니다.
향후 Zoom In / Zoom Out / Fit 기능은 이 상태와 표시를 그대로 확장할 수 있습니다.


## v0.4.2 — Device Target Resolution Presets
Viewport Size 메뉴를 UMG-style Screen Size preset으로 확장했습니다.

- iPhone 17 Pro — 1206 × 2622
- iPhone 17 Pro Max — 1320 × 2868
- MacBook Air 13″ M4 — 2560 × 1664
- MacBook Pro 14″ M4 — 3024 × 1964
- iMac 24″ M4 — 4480 × 2520
- Full HD / QHD / 4K UHD
- Portrait / Landscape swap

이 프리셋은 향후 PDF/PPT/Image export의 target resolution으로 재사용할 수 있습니다.


## v0.4.3 — Structured Table + Alignment

정렬을 기본 Inspector 속성으로 승격하고 Table을 첫 번째 Structured Object로 확장했습니다.

Table:
- Add/Delete Row
- Add/Delete Column
- Header Row toggle
- Cell selection
- Horizontal / Vertical alignment
- Row Span / Column Span
- Cell Padding
- Merge Right / Unmerge
- Table Left / Center / Right alignment

정렬은 앞으로 Object / Content / Slot의 세 범주로 확장합니다.


## v0.5.0 — Trust Foundation
- Atomic Save
- Editor metadata leakage guard
- Minimal direct-text patch PoC
- 10 Golden HTML fixtures
- Source fidelity regression suite
- Clear HTML undo snapshot
