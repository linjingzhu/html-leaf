# v0.4.0 Defect Root Cause and Fix

## 1. Objects drag without drop
Root cause: v0.3.9 implemented only `dragstart` payload generation. No viewport/hierarchy drop consumer existed.

Fix:
- `WidgetRegistry.create()`
- Palette → Viewport drop
- Palette → Hierarchy drop
- Existing Hierarchy node reorder/reparent
- DOM mutation → source commit transaction

## 2. Widget Registry was metadata-only
Root cause: registry described labels/Jira compatibility but did not create widgets or validate containers.

Fix:
- `create(type, document)`
- `canContain(element)`
- stable `data-hbe-id`
- default HTML/CSS for Canvas/Overlay/Box/Grid/content widgets

## 3. Hierarchy was a flat DOM list
Root cause: meaningful tags were flattened into rows without persistent expansion state.

Fix:
- expandable/collapsible hierarchy
- selected ancestors auto-expanded
- hierarchy drag/drop
- shared selection manager facade

## 4. Horizontal splitter bypassed unified splitter
Root cause: v0.3.9 added a separate pointer handler.

Fix:
- existing `beginResizeSession()` now supports X/Y axis from `aria-orientation`
- horizontal splitter uses the common pointer capture/rAF/cancel/commit engine
- `leftTopRatio` persisted in layout state

## 5. Jira Check and Export inspected different inputs
Root cause:
- Check used page.source
- Export used rendered DOM snapshot for script-driven HTML

Fix:
- both use `htmlForSemanticExport(page)`
- Export build result now also returns compatibility diagnostics
- Jira export dialog includes the same diagnostics

## 6. Jira markers were not stably mapped
Root cause: marker lookup used `find()` by object type, mapping repeated widgets to the first instance.

Fix:
- analyzer records `data-hbe-id` and occurrence index
- marker resolver uses stable ID first and occurrence fallback

## 7. Marker serialization contamination risk
Root cause: markers were inserted into iframe DOM and `syncFrameToPage()` did not remove `data-adf-marker`.

Fix:
- sync removes ADF markers/drop feedback before serialization

## Remaining limitation
Script-generated runtime DOM remains inspect/export capable but direct object authoring is intentionally disabled because runtime mutation would not update the JavaScript source that regenerates the DOM.
