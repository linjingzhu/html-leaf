# Leaf 2 px View Outline and Bottom Surface Design QA

## Evidence

- Source visual truth: `C:\Users\jsvis\AppData\Local\Temp\codex-clipboard-528144d6-8cf4-4ba8-810e-f644ae515037.png`
- Implementation screenshot: `C:\Users\jsvis\Documents\Codex\2026-08-21\referenced-chatgpt-conversation-this-is-an\work\publish-html-leaf\scripts\qa-evidence-codex-v0516.png`
- Focused comparison: `C:\Users\jsvis\Documents\Codex\2026-08-21\referenced-chatgpt-conversation-this-is-an\work\publish-html-leaf\design-qa-comparison.png`
- Source pixels: 138 × 108.
- Implementation pixels: 2469 × 1475.
- Implementation viewport: 1646 × 983 CSS px at device pixel ratio 1.5.
- State: Codex theme, Preview View, empty Page, Edit highlight active.

## Full-view Comparison Evidence

- The red Edit highlight renders as a 2 px outside outline with a matching 2 px reserved gutter. It remains visible without covering the View header or Page canvas.
- The Page canvas reaches the bottom of the software using the requested `#111111` surface.
- Existing panel dimensions, toolbar alignment, Inspector, Project panel, and Preview / Compare / Code controls remain unchanged.

## Focused Region Comparison Evidence

- The source swatch and the bottom-center implementation crop were placed together in the focused comparison.
- Source sample: `rgb(17, 17, 17)`.
- Implementation sample: `rgb(17, 17, 17)`.
- The two sampled surfaces are an exact pixel-color match; the gray separator in the comparison image is only evidence framing.

## Required Fidelity Surfaces

- Fonts and typography: unchanged.
- Spacing and layout rhythm: only the View outline gutter changed from 3 px to 2 px; no content dimensions shifted unexpectedly.
- Colors and visual tokens: the Codex canvas token now matches the supplied `#111111` reference exactly.
- Image quality and asset fidelity: the supplied raster swatch was used directly as the color source; no replacement asset was introduced.
- Copy and content: unchanged.

## Findings

- No actionable P0, P1, or P2 differences remain in the requested scope.

## Comparison History

### Iteration 1

- Requested refinements: reduce the outer Edit line from 3 px to 2 px and match the software bottom surface to the supplied color.
- Fixes made: changed the View gutter and outline to 2 px, softened the related glow, and changed the Codex canvas from `#111315` to sampled `#111111`.
- Post-fix evidence: exact source/implementation color samples and the full Electron screenshot above.
- Verification: Codex theme regression 12/12, Electron rendering verification 6/6, and complete Leaf v0.5.16 regression suite 65/65.

## Implementation Checklist

- [x] Render the active View outline at 2 px.
- [x] Keep the outline outside the document content.
- [x] Match the bottom Page surface to `#111111`.
- [x] Preserve Page iframe isolation and existing themes.
- [x] Verify actual Electron rendering.

## Follow-up Polish

- None required for this scoped refinement.

final result: passed
