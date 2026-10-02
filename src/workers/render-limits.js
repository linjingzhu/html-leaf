// Ported verbatim (logic unchanged) from pdf-convertor's app/lib/render-limits.ts.
// The output bitmap alone uses four bytes per pixel; PNG encoding and OCR
// need additional copies. Check rounded dimensions before any allocation.
const MAX_RENDER_PIXELS = 16_000_000;
const MAX_RENDER_DIMENSION = 8192;

// pdf.js's Node build has no ImageBitmap, so it also asks the canvas factory
// for a scratch canvas at an embedded image's *native* pixel size before
// drawing it onto the (fitted) page canvas. That bitmap is transient, and
// OCR runs one job at a time (see runBackgroundTask in src/main.js), so it
// gets a larger budget than the page output: 64M pixels is 256 MB of RGBA
// and covers a 600 dpi A4 scan (4960x7016 = 34.8M); anything bigger is
// refused before allocation.
const MAX_IMAGE_PIXELS = 64_000_000;
const MAX_IMAGE_DIMENSION = 16_384;

class RenderLimitError extends Error {
  constructor() {
    super("This PDF contains a page or image that is too large to render safely. Use a PDF with smaller pages or lower-resolution scans.");
    this.name = "RenderLimitError";
  }
}

// A high-resolution scan can already be thousands of points per side; the
// "preferred" 2x scale (chosen for ordinary 612x792pt pages) would push it
// far over the bitmap budget. Rather than refuse the page, scale it down to
// the largest factor that fits. Only a page that cannot be rendered at any
// scale (non-finite or sub-point) throws.
function fitRenderScale(width, height, preferred = 2) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new RenderLimitError();
  }
  const byDimension = MAX_RENDER_DIMENSION / Math.max(width, height);
  const byArea = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
  const fitted = Math.min(preferred, Math.floor(Math.min(byDimension, byArea) * 0.999 * 10000) / 10000);
  if (Math.min(width, height) * fitted < 1) {
    throw new RenderLimitError();
  }
  return fitted;
}

function assertWithin(width, height, maxDimension, maxPixels) {
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  if (
    !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
    w > maxDimension || h > maxDimension || w * h > maxPixels
  ) {
    throw new RenderLimitError();
  }
}

function assertRenderDimensions(width, height) {
  assertWithin(width, height, MAX_RENDER_DIMENSION, MAX_RENDER_PIXELS);
}

function assertImageDimensions(width, height) {
  assertWithin(width, height, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS);
}

module.exports = {
  MAX_RENDER_PIXELS,
  MAX_RENDER_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_DIMENSION,
  RenderLimitError,
  fitRenderScale,
  assertRenderDimensions,
  assertImageDimensions,
};
