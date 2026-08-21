# Table & Alignment — v0.4.3

## Goal
Table을 첫 번째 Structured Object로 취급하고, 정렬을 기본 Inspector 속성으로 승격한다.

## Alignment model
- Object Alignment
- Content Alignment
- Slot Alignment

v0.4.3에서 우선 구현:
- Text / Heading / Button: Horizontal text alignment
- Table: Table alignment
- Table Cell: Horizontal + Vertical content alignment

## Table operations
- Add Row
- Add Column
- Delete Row
- Delete Column
- Toggle Header Row
- Merge selected cell with the cell to the right
- Unmerge colspan
- Row Span
- Column Span
- Cell Padding

## Table selection
`td` / `th`는 직접 selection target이며 선택 시 Inspector가 Cell 속성으로 확장된다.

## Follow-up
- Header Column
- Multi-cell selection
- Rectangular merge
- Row/column context menu
- Cell background / border controls
- Keyboard navigation between cells
