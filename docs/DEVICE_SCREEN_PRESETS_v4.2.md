# Device Screen Presets — v0.4.2

UMG의 Screen Size 드롭다운 개념을 참고해 Viewport를 target-resolution 기반으로 확장했다.

## General
- Full HD — 1920 × 1080
- QHD — 2560 × 1440
- 4K UHD — 3840 × 2160

## Mobile · Apple
- iPhone 17 Pro — 1206 × 2622
- iPhone 17 Pro Max — 1320 × 2868

## MacBook
- MacBook Air 13″ M4 — 2560 × 1664
- MacBook Pro 14″ M4 — 3024 × 1964

## Mac
- iMac 24″ M4 — 4480 × 2520

## Orientation
Fixed-size presets show a ↔ control. Pressing it swaps width/height and changes the preset to Custom.

## Intent
These are native panel resolutions intended as target-resolution presets for authoring and future image/PDF/PPT export.

Browser responsive testing is a separate concern: CSS viewport dimensions and devicePixelRatio are not the same as native panel resolution.
