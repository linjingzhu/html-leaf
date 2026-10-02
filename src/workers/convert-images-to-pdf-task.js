// Images -> PDF, ported from an earlier web implementation's ImagesToPdf.
// Runs inside the forked utility process (see
// runBackgroundTask in src/main.js) for the same reason compress/ocr do --
// decoding and re-embedding several full-size images can take real time.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadImage } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');
const { MAX_IMAGES, MAX_IMAGE_PIXELS, MAX_TOTAL_PIXELS } = require('./convert-constants');

const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

// payload: { imagePaths: string[] } -- in the order the combined PDF's
// pages should follow (the caller passes a Group's child image Pages in
// their tree order).
// Returns { tempPath, imageCount }.
module.exports = async function convertImagesToPdfTask(payload) {
  const { imagePaths } = payload || {};
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw Object.assign(new Error('No images were given to combine.'), { kind: 'invalid' });
  }
  if (imagePaths.length > MAX_IMAGES) {
    throw Object.assign(new Error(`Choose at most ${MAX_IMAGES} images at a time.`), { kind: 'too-large' });
  }

  const pdf = await PDFDocument.create();
  let totalPixels = 0;

  for (const imagePath of imagePaths) {
    const name = path.basename(imagePath);
    const extension = path.extname(imagePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw Object.assign(new Error(`"${name}" is not a supported image type. Use PNG or JPEG.`), { kind: 'invalid' });
    }

    let bytes;
    try {
      bytes = await fs.readFile(imagePath);
    } catch (error) {
      throw Object.assign(new Error(`Could not read "${name}": ${error.message}`), { kind: 'invalid' });
    }

    // A native decode to read dimensions before embedding -- much cheaper
    // than pdf-lib's own JS-based PNG decode/re-encode, and lets an
    // oversized image be rejected before that expensive path ever runs.
    // The original did this with the browser's createImageBitmap; this
    // background process has no browser, so @napi-rs/canvas's loadImage
    // (already a dependency, used by compress/ocr) stands in for it.
    let bitmap;
    try {
      bitmap = await loadImage(bytes);
    } catch {
      throw Object.assign(new Error(`"${name}" could not be read as an image. It may be corrupted.`), { kind: 'invalid' });
    }
    const pixels = bitmap.width * bitmap.height;
    if (pixels > MAX_IMAGE_PIXELS) {
      throw Object.assign(
        new Error(`"${name}" is too large (${(pixels / 1_000_000).toFixed(0)} MP). The largest supported image is ${(MAX_IMAGE_PIXELS / 1_000_000).toFixed(0)} MP.`),
        { kind: 'too-large' },
      );
    }
    totalPixels += pixels;
    if (totalPixels > MAX_TOTAL_PIXELS) {
      throw Object.assign(
        new Error(`These images total more than ${(MAX_TOTAL_PIXELS / 1_000_000).toFixed(0)} MP combined. Choose fewer or smaller images.`),
        { kind: 'too-large' },
      );
    }

    let image;
    try {
      image = extension === '.png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      throw Object.assign(new Error(`"${name}" could not be read as an image. It may be corrupted.`), { kind: 'invalid' });
    }
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  const pdfBytes = await pdf.save();
  const tempPath = path.join(os.tmpdir(), `leaf-convert-pdf-${process.pid}-${Date.now()}.pdf`);
  await fs.writeFile(tempPath, pdfBytes);

  return { tempPath, imageCount: imagePaths.length };
};
