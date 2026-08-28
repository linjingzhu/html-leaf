# LEAF Document Studio Conversation Log

Last updated: 2026-08-28 KST  
Repository: `linjingzhu/html-leaf`  
Branch: `stable`  
Thread context: GitHub Pages, VitePress, LEAF Document Studio, paid-product strategy, and ongoing Q&A logging.

## Purpose

This document records the product-strategy conversation about evolving LEAF into an AI-era Visual Document & Web Publishing Studio.

It also establishes the forward logging convention for this repository:

- Record user questions and assistant answers about LEAF product direction, strategy, architecture, pricing, publishing, and repository decisions.
- Append new entries chronologically under `Conversation Log`.
- Prefer Markdown for durable discussion logs; use HTML when the artifact itself is meant to be opened directly in a browser.
- Do not log hidden system/developer instructions, tokens, credentials, private unrelated material, or transient tool noise.
- When exact prior wording is unavailable, mark the entry as a faithful summary.
- When an artifact is created, record its filename, location, and purpose.

## Current Product Definition

**Product name:** LEAF

**Identity:** AI 시대의 Visual Document & Web Publishing Studio

**One-line definition:** LEAF는 비개발자와 Vibe Coder가 Markdown, HTML, AI 생성 문서를 시각적으로 편집하고 구조화해 웹으로 배포하는 제품이다.

**Core product shift:**

LEAF should not remain only an HTML/Markdown editor. The stronger product definition is a studio that turns source documents into structured, publishable web assets.

~~~text
Markdown / HTML / AI-generated documents
                  ↓
                LEAF
                  ↓
      WRITE / DESIGN / PUBLISH
                  ↓
        Static website output
                  ↓
 GitHub Pages / Vercel / Netlify / ZIP
~~~

## Strategic Decisions Captured

1. VitePress is a static site generator that turns Markdown into a documentation website.
2. GitHub Pages is hosting; VitePress is the site-building layer. They are complementary, not competitors.
3. LEAF can be positioned above VitePress as a visual product layer for non-developers and Vibe Coders.
4. LEAF should use a dual representation model: `Source ↔ Document AST ↔ Visual Editor`.
5. The first strong workflow should be `Open GitHub Repository → Markdown auto-detection → Sidebar generation → Visual preview → GitHub Pages publish`.
6. LEAF's strongest paid value is not writing documents, but reducing the cost, complexity, and developer dependency of turning documents into web assets.
7. LEAF should not compete head-on with Notion, Webflow, GitBook, or Mintlify at the beginning. It should start with the narrower wedge: AI/Markdown/HTML documents to GitHub-native website publishing.
8. The first monetization trigger should be Publish, AI readiness checks, multi-site operation, custom domain support, and team governance.
9. LEAF's likely willingness-to-pay strength was assessed as:
   - Generic document tool: 5/10
   - VitePress GUI: 6/10
   - AI-era Repository → Website Studio: 8/10
10. A standalone Korean HTML product definition document was created locally as `leaf-document-studio-product-definition.html`.

## Conversation Log

### 2026-08-28 — GitHub Pages 사용법

**User question**

> github의 pages를 이용하는 방법

**Assistant answer record**

GitHub Pages was explained as a feature that publishes files from a GitHub repository as a website. The recommended use cases included static HTML/CSS/JS as well as Markdown-based documentation sites built through tools like Jekyll, VitePress, or Docusaurus.

The simplest publishing model was described as:

~~~text
Repository
→ Settings
→ Pages
→ Build and deployment
→ Source: Deploy from a branch
→ Branch: stable
→ Folder: /docs
~~~

For a project repository, the resulting URL usually follows this shape:

~~~text
https://<username>.github.io/<repository-name>/
~~~

The more scalable recommendation was to use:

~~~text
Markdown
    ↓
VitePress
    ↓
Static Website
    ↓
GitHub Actions
    ↓
GitHub Pages
~~~

Important cautions were also recorded:

- GitHub Pages is hosting, not a full document-site authoring experience.
- For static documentation, `Markdown + VitePress + GitHub Actions + GitHub Pages` is a strong default path.
- A private GitHub repository does not automatically mean the published GitHub Pages site is private.
- Sensitive internal documents should be separated from public Pages output.
- For private documentation portals, authenticated hosting such as Cloudflare Pages with Cloudflare Access may be more appropriate than plain GitHub Pages.

### 2026-08-28 — VitePress란 무엇인가

**User question**

> vitepress가 뭐야?

**Assistant answer record**

VitePress was defined as a static site generator that converts Markdown files into a clean documentation website.

~~~text
Markdown document
      ↓
   VitePress
      ↓
Website generation
      ↓
GitHub Pages or another static host
~~~

The answer clarified the difference between viewing Markdown directly on GitHub and publishing a VitePress documentation site:

| GitHub Markdown | VitePress |
| --- | --- |
| File-by-file viewing | Unified documentation site |
| GitHub UI | Independent web UI |
| Folder browsing | Sidebar navigation |
| Basic Markdown rendering | Documentation-site reading experience |
| Limited design control | Theme and UI customization |

The key product insight was that the document source and the website content can remain the same data:

~~~text
Markdown source
      ├─ viewed in GitHub
      └─ rendered by VitePress into a public website
~~~

This became the foundation for thinking about LEAF as a visual layer over Markdown, VitePress, GitHub, and GitHub Pages.

### 2026-08-28 — LEAF를 Document Studio로 개선할 수 있는가

**User question**

> 나의 leaf도 이렇게 개선 가능할까?

**Assistant answer record**

The answer was yes: LEAF can become a stronger product than a basic editor if it is reframed as a Document Studio.

The proposed distinction:

> VitePress가 “Markdown을 웹사이트로 만들어주는 도구”라면, LEAF는 “Markdown/HTML/AI 문서를 시각적으로 편집하고 곧바로 웹사이트로 발행하는 문서 제작 도구”가 될 수 있다.

Proposed LEAF structure:

~~~text
LEAF

Document
├─ Content
├─ Structure
├─ Style
├─ Navigation
├─ Metadata
└─ Publish
~~~

The proposed product surface:

~~~text
┌─────────────────────────────────────────────────────┐
│ LEAF                                  Preview Publish│
├────────────┬─────────────────────────┬───────────────┤
│ Documents  │                         │ Properties    │
│ Home       │        Document         │ Title         │
│ Strategy   │        Canvas           │ Status        │
│ Product    │                         │ Author        │
│ Marketing  │                         │ Theme         │
│            │                         │ SEO           │
├────────────┤                         │               │
│ Outline    │                         │               │
└────────────┴─────────────────────────┴───────────────┘
~~~

Core comparison against VitePress:

| Feature | VitePress | LEAF Direction |
| --- | --- | --- |
| Markdown editing | Code/text focused | Visual + Markdown editing |
| HTML editing | Developer centered | Direct object editing |
| Sidebar config | Config file | Drag and drop |
| Theme | Code modification | Visual Theme Editor |
| Navigation | Manual setup | Auto-generation |
| Metadata | YAML/frontmatter | Properties panel |
| Preview | Dev server | Real-time preview |
| Deploy | CLI/GitHub Actions | Publish button |
| AI writing | External AI | Built-in AI workflows |
| Structure changes | File movement | Outline tree movement |
| Main user | Developer | Non-developer / Vibe Coder |

The most important technical concept proposed was dual representation:

~~~text
Source
Markdown / HTML
       ↕
Document AST
       ↕
Visual Editor
~~~

This makes it possible for visual edits to update source safely, and for source edits from GitHub to be parsed back into the visual editor.

The first recommended product workflow was:

~~~text
Open GitHub Repository
      ↓
Markdown auto-detection
      ↓
Sidebar auto-generation
      ↓
Visual preview
      ↓
GitHub Pages publish
~~~

### 2026-08-28 — LEAF Document Studio 제품 정의서 HTML 생성

**User question**

> document studio로서의 leaf 제품 정의서를 html로 정리해서 만들어줘.

**Assistant answer/action record**

A standalone Korean HTML product definition document was created locally as:

~~~text
leaf-document-studio-product-definition.html
~~~

The requested identity was applied:

> LEAF = AI 시대의 Visual Document & Web Publishing Studio

The HTML document included the following 20 sections:

1. Executive Summary
2. 제품 비전 / 한 줄 정의
3. 문제 정의와 시장 맥락
4. Target User / JTBD
5. Positioning과 경쟁 구도
6. 핵심 제품 원칙
7. LEAF의 3개 축 WRITE / DESIGN / PUBLISH
8. Repository → Website 핵심 워크플로
9. Information Architecture와 주요 화면
10. 핵심 기능 명세
11. AI 기능
12. Document AST 중심 기술 아키텍처
13. Git / GitHub / VitePress / GitHub Pages 통합 구조
14. 데이터 / 메타데이터 모델 예시
15. MVP Scope / Post-MVP
16. 단계별 로드맵
17. KPI / 성공 기준
18. 리스크와 대응
19. 비목표(Non-goals)
20. 제품 정의 요약

The document was designed as a professional PRD-style single HTML file with responsive layout, left-side table of contents, tables, cards, diagrams, and code blocks.

### 2026-08-28 — 유료 제품으로서의 가치

**User question**

> 유료 제품으로서의 가치는?

**Assistant answer record**

LEAF's paid value was defined as follows:

> LEAF의 유료 가치는 “문서 편집기”가 아니라, 비개발자가 AI 문서와 저장소를 실제 웹사이트로 만들고 계속 운영할 수 있게 해주는 생산/배포 인프라에 있다.

Five paid-value drivers were identified:

1. **Time saved**: Users avoid directly handling Markdown, VitePress configuration, GitHub Pages setup, sidebars, and deployment errors.
2. **Reduced developer dependency**: Small teams do not need to ask developers to publish, update sidebars, or fix doc-site structure every time.
3. **AI document post-processing**: AI generates drafts, but LEAF can productize the remaining work of structure, metadata, consistency, review, and readiness.
4. **Publishing and operating reliability**: Link checks, missing metadata detection, build-error explanations, deployment history, and rollback create real paid value.
5. **Owned content assets**: Output remains as Markdown, HTML, GitHub repository content, and static websites rather than being locked inside a closed workspace.

Initial monetization logic:

| Plan | Value |
| --- | --- |
| Free | Local editing, limited projects, basic preview |
| Pro | GitHub integration, GitHub Pages publish, AI structure suggestions, themes, custom domain |
| Team | Collaboration, permissions, review/approval, team templates, deployment history |
| Agency / Business | Client workspaces, white label, advanced analytics, audit logs |

Key conclusion:

> WRITE is the free acquisition value. PUBLISH and TEAM operation are the stronger paid values.

### 2026-08-28 — 지불의사, 경쟁 제품, 가격 정책, 핵심 전략

**User question**

> 얼마나 매력적이고 유료 제품으로서 지불의사를 만들어 낼 수 있느냐의 질문이었어.
>
> 1. 유사 제품 리스트업해서 비교.
> 2. leaf의 가격 정책. 비즈니스 모델
> 3. leaf의 핵심 전략 추천

**Assistant answer record**

The core assessment:

> LEAF는 “문서 편집기”로 포지셔닝하면 유료 매력도가 낮고, “AI 문서를 웹사이트 자산으로 바꾸는 퍼블리싱 운영 도구”로 좁히면 지불의사가 꽤 생긴다.

Willingness-to-pay assessment:

| Positioning | Paid attractiveness |
| --- | --- |
| Generic document tool | 5/10 |
| VitePress GUI | 6/10 |
| AI-era Repository → Website Studio | 8/10 |

Competitive landscape, using public pricing checked on 2026-08-28:

| Product category | Representative products | Price range / model | Why users pay | LEAF opportunity |
| --- | --- | --- | --- | --- |
| Developer docs SSG | VitePress, Docusaurus, MkDocs | Free | Fast, standard, Git-friendly docs | Too technical; LEAF provides visual UI |
| GitHub hosting | GitHub Pages | Included in GitHub Free/Pro/Team contexts | Static website from repository | Simplify setup, build, and errors |
| Developer docs SaaS | GitBook | Free; Premium around $65/site/mo + seats; Ultimate around $249/site/mo | Collaboration, AI search, custom domain, analytics | LEAF can enter below this for individuals and small teams |
| API / Dev portal | ReadMe | Free; Pro around $250/mo; AI add-ons | API reference, reviews, private docs, AI linter | LEAF focuses on general docs, not API-first docs |
| AI-native docs | Mintlify | Free; Pro around $450/mo | Agent, Assistant, automation, AI-ready docs | LEAF can be lighter and more creator/builder-friendly |
| Knowledge base | Document360, Archbee, HelpDocs | Roughly $80-$499+/mo or custom | Support-ticket reduction, internal/external KB | LEAF differentiates with GitHub/source ownership |
| Team wiki | Notion, Slab, Confluence | Roughly $5-$20/user/mo depending on product/plan | Collaboration and internal knowledge | Weak at static publishing and source ownership |
| Notion-to-website | Super.so | Free; paid roughly $16-$28/site/mo | Turn Notion pages into sites | LEAF uses Markdown/Git/AI docs instead of Notion as source |
| Website builder | Webflow, Framer | Roughly $10-$30/site/mo for common self-serve site plans | Design control, hosting, CMS | Too broad for doc-source workflows |
| Personal note publishing | Obsidian Publish | Around $8-$10/site/mo | Publish local notes to web | LEAF can target structured docs and team/website workflows |

Recommended LEAF pricing:

| Plan | Recommended price | Target | Value |
| --- | ---: | --- | --- |
| Free | $0 | Trial, individual learning | Local doc editing, basic preview, 1 project, limited AI checks |
| Creator | $12-$15/mo | Creators, educators | GitHub Pages publish, custom domain, basic themes, 3 sites |
| Builder Pro | $24-$29/mo | Vibe Coders, indie builders | Unlimited projects, VitePress import/export, AI structure, link checks, metadata autofill |
| Team | $79-$99/mo including 5 users | Small teams, startups | Collaboration, review, deployment history, permissions, staging preview, team templates |
| Agency | $149-$249/mo | Agencies and consultants | Multi-client sites, white label, handoff export, priority support |
| Enterprise | Custom | Organizations with security needs | SSO, audit log, private deployment, SLA, onboarding |

Additional revenue streams:

| Revenue stream | Description |
| --- | --- |
| AI credits | Structure suggestions, rewrites, translation, publish-readiness checks |
| Managed hosting | LEAF-hosted sites for users who do not want to manage GitHub Pages |
| Template marketplace | Documentation, education portal, product docs, brand themes |
| Migration service | Import from Notion, Google Docs, and existing GitHub docs |
| Team governance | Review flows, deployment history, permissions, audit logs |

Recommended core strategy:

1. Narrow the beachhead to **AI documents → GitHub Pages site**.
2. Make **Publish** the first paid conversion point.
3. Use **VitePress as an engine**, not as the enemy.
4. Focus AI on **structure, review, metadata, links, and readiness**, not just generation.
5. Price lower than GitBook/Mintlify but higher than lightweight Notion-to-site or note-publishing tools.

Final judgment:

> LEAF는 “예쁜 Markdown 에디터”면 유료 전환이 약하다. 하지만 “AI 시대에 문서를 웹사이트로 만들고 운영하게 해주는 GitHub-native Document Studio”가 되면, 개인 $15-$29/mo, 팀 $99+/mo의 지불의사는 충분히 만들 수 있다.

### 2026-08-28 — GitHub 저장소에 대화 기록 남기기

**User question**

> [@GitHub] html-leaf 저장소에 접근. 지금 이 세션에서 논의했던 것 모두 문서로 기록. 앞으로도 나의 질문과 너의 답변을 모두 로그기록을 남기고 html 또는 md 파일로 기록을 남길거야. 모든 기록을 말야. 그렇게 해줘.

**Assistant action record**

GitHub repository access was resolved to:

~~~text
linjingzhu/html-leaf
~~~

Repository details observed:

- Repository is private.
- Default branch is `stable`.
- The user has push/admin-level permissions through the connected GitHub tool.
- Existing documentation files are stored under `docs/`.

This file was created to preserve the LEAF Document Studio discussion and establish the ongoing logging convention.

### 2026-08-28 — 커밋 승인

**User question**

> 커밋

**Assistant action record**

The user explicitly approved committing this conversation log to `linjingzhu/html-leaf` on the `stable` branch.

## Source Links Used In The Paid-Product Analysis

The market and pricing comparison referenced public pricing or documentation pages checked during the conversation on 2026-08-28:

- GitBook Pricing: https://www.gitbook.com/pricing
- Mintlify Pricing: https://www.mintlify.com/pricing
- ReadMe Pricing: https://readme.com/pricing
- Notion Pricing: https://www.notion.com/ko/pricing
- Webflow Pricing: https://webflow.com/pricing
- Framer Pricing: https://www.framer.com/pricing
- Super.so Pricing: https://super.so/pricing
- Obsidian Pricing: https://obsidian.md/pricing
- GitHub Pages Docs: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- VitePress Docs: https://vitepress.dev/guide/what-is-vitepress

## Next Logging Rule

For future LEAF-related discussions, append entries in this format:

~~~md
### YYYY-MM-DD — Topic

**User question**

> Original user question

**Assistant answer record**

Assistant answer, decision, recommendation, artifact, or implementation result.
~~~
