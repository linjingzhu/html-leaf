# Jira / Atlassian Export — v0.3.8

## Architecture

```text
HTML Source / Rendered DOM
↓
SemanticDocument
↓
JiraExport Adapter
├─ Rich HTML Clipboard
├─ Markdown
└─ ADF JSON
```

## Script-driven HTML

Script-driven page는 source HTML만 파싱하면 runtime이 생성한 본문이 없다.

따라서 Interactive Preview에 export bridge를 주입한다.

```text
opaque-origin iframe
sandbox = allow-scripts
↓
DOMContentLoaded / load
↓
document.documentElement.outerHTML
↓
postMessage
↓
Renderer validates frame + token
↓
Semantic parser
```

`allow-same-origin`은 추가하지 않는다.

## HTML → Semantic Mapping

지원:

- h1~h6
- paragraph
- strong / em / strike / underline / code
- link
- ul / ol
- blockquote
- pre/code
- hr
- table / th / td / colspan / rowspan
- `.note`, `.callout`, `data-hbe-object=panel/callout`

제한:

- image → placeholder
- SVG → placeholder
- arbitrary CSS layout → semantic flatten
- form control → omit

## File Menu

```text
Jira / Atlassian Export…
Copy for Jira
Copy as Markdown
Export ADF JSON
```

## Copy for Jira

Electron clipboard에 동시에 기록:

```text
text/html
text/plain
```

따라서 Jira rich text editor에 붙여넣을 때 HTML semantic structure를 우선 사용할 수 있다.

## ADF

ADF root:

```json
{
  "version": 1,
  "type": "doc",
  "content": []
}
```

지원 mapping:

- heading
- paragraph
- marks
- bulletList / orderedList / listItem
- blockquote
- codeBlock
- rule
- panel
- table / row / header / cell
