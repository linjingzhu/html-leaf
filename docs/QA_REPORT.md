# QA Report — v0.3.4

## Automated static gate

Run:

```bash
npm run qa
```

Expected current result:

```text
33/33 checks passed.
```

## Manual release checklist still required on a Windows development machine

### Build / Launch
- [ ] `npm install`
- [ ] `npm start`
- [ ] Renderer loads without critical console errors
- [ ] No missing local assets
- [ ] No external CDN required

### Core Layout
- [ ] Tree visible
- [ ] Viewport visible
- [ ] Inspector visible
- [ ] Inspector resize
- [ ] Inspector collapse → Inspector + splitter truly occupy 0px

### Project
- [ ] Create/delete
- [ ] Project color tint remains subtle
- [ ] Drag reorder persists
- [ ] Group/Page operations

### Empty Page
- [ ] Create placeholder without boilerplate
- [ ] Explorer `.html/.htm` drag/drop
- [ ] Preview resolves local relative assets

### HTML Edit
- [ ] OFF: no Hover / Selection
- [ ] ON: Hover and Selection work
- [ ] Hover and Selected are visually distinct

### Inspector
- [ ] Draft does not modify source
- [ ] Preview ON changes only temporary live DOM
- [ ] Preview OFF shows saved state while draft remains
- [ ] Reset restores saved values
- [ ] Apply commits all fields once
- [ ] Invalid draft disables Apply
- [ ] Invalid draft does not partially Preview

### Unsaved Exit
- [ ] Page change → dialog
- [ ] Project change → dialog
- [ ] Element A → B → dialog
- [ ] Mode / active pane change → dialog
- [ ] Cancel / Discard / Apply semantics

### Theme
- [ ] Dark visual QA
- [ ] Light visual QA
- [ ] UI scale 90/100/110/125
- [ ] Minimum supported window remains usable
