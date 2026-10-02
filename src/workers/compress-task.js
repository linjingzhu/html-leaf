// PDF compression, ported from an earlier web implementation's compression
// route. Runs inside the forked utility process (see runBackgroundTask in
// src/main.js) -- a full re-save plus several sharp re-encodes can take
// multiple seconds on a large scan, and this process's main thread also
// owns the renderer's UI, so this stays off it.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  EncryptedPDFError,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} = require('pdf-lib');
const sharp = require('sharp');

const LEVEL_PRESETS = {
  low: { quality: 85, maxDimension: 3000 },
  balanced: { quality: 65, maxDimension: 2000 },
  high: { quality: 40, maxDimension: 1200 },
};

const MIN_QUALITY = 15;
const MIN_DIMENSION = 500;
const MAX_TARGET_ATTEMPTS = 6;
const SHRINK_FACTOR = 0.65;

// Only handles the two color spaces sharp maps to unambiguously (plain RGB
// or grayscale) and only plain JPEG (DCTDecode) input with no DecodeParms
// (a stray `ColorTransform 0` from the original encoder would misinterpret
// mozjpeg's re-encoded output) and no transparency. CMYK, indexed/palette,
// ICC-based color spaces, non-JPEG filters, SMask/Mask/ImageMask, and any
// image used as *another* image's SMask/Mask (walked separately below,
// since that relationship isn't visible on the mask's own dict) are all
// left untouched rather than risking a wrong color conversion or a
// corrupted page.
async function reencodeImages(pdf, settings) {
  const allObjects = [...pdf.context.enumerateIndirectObjects()];

  const maskRefs = new Set();
  for (const [, obj] of allObjects) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    for (const key of ['SMask', 'Mask']) {
      const value = dict.get(PDFName.of(key));
      if (value instanceof PDFRef) maskRefs.add(value.toString());
    }
  }

  const candidates = [];
  for (const [ref, obj] of allObjects) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (maskRefs.has(ref.toString())) continue;
    const dict = obj.dict;
    if (dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
    if (dict.get(PDFName.of('SMask')) || dict.get(PDFName.of('Mask')) || dict.get(PDFName.of('ImageMask'))) {
      continue;
    }
    if (dict.get(PDFName.of('DecodeParms'))) continue;
    if (dict.get(PDFName.of('Filter'))?.toString() !== '/DCTDecode') continue;

    const colorSpace = dict.get(PDFName.of('ColorSpace'))?.toString();
    if (colorSpace !== '/DeviceRGB' && colorSpace !== '/DeviceGray') continue;

    candidates.push({ ref, stream: obj, isGray: colorSpace === '/DeviceGray' });
  }

  for (const { ref, stream, isGray } of candidates) {
    const original = Buffer.from(stream.getContents());
    // ignoreIcc: an embedded ICC profile (common in phone photos, e.g.
    // Display P3) would otherwise be color-converted to sRGB on decode,
    // but the PDF dict declares plain DeviceRGB -- viewers show the stored
    // values as-is, so converting them first would shift the color.
    let pipeline = sharp(original, { ignoreIcc: true }).resize({
      width: settings.maxDimension,
      height: settings.maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (isGray) pipeline = pipeline.toColourspace('b-w');

    let reencoded;
    let meta;
    try {
      ({ data: reencoded, info: meta } = await pipeline
        .jpeg({ quality: settings.quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true }));
    } catch {
      continue;
    }

    if (meta.channels !== (isGray ? 1 : 3) || reencoded.byteLength >= original.byteLength) continue;

    const dict = stream.dict;
    dict.set(PDFName.of('Width'), PDFNumber.of(meta.width));
    dict.set(PDFName.of('Height'), PDFNumber.of(meta.height));
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.set(PDFName.of('Length'), PDFNumber.of(reencoded.byteLength));
    pdf.context.assign(ref, PDFRawStream.of(dict, reencoded));
  }

  return candidates.length;
}

// pdf-lib mutates its document in place, so hitting a different point in
// the quality/dimension search means reloading from the original bytes
// and re-running the whole pass.
async function compressOnce(bytes, settings) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const eligibleImages = await reencodeImages(pdf, settings);
  // addDefaultPage/updateFieldAppearances default to true, and both walk the
  // page tree via PDFPageTree.traverse(), which recurses into every /Kids
  // entry with no visited-object memoization -- a crafted /Pages tree that
  // reuses a node as two parents' /Kids entry can make that walk take
  // 2^N visits. Neither option's own behaviour is something a compression
  // pass needs, so skipping both avoids the exponential walk entirely.
  const resaved = await pdf.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  return { result: resaved.byteLength < bytes.byteLength ? resaved : bytes, eligibleImages };
}

// Every step lowers BOTH knobs geometrically toward their floors, and the
// final step is pinned to exactly (MIN_QUALITY, MIN_DIMENSION). Lowering
// only one knob at a time left the "low" preset spending its whole budget
// on quality and never getting below a 1950px dimension cap.
function searchSchedule(start) {
  const steps = [];
  for (let i = 1; i < MAX_TARGET_ATTEMPTS; i++) {
    const factor = Math.pow(SHRINK_FACTOR, i);
    steps.push({
      quality: Math.max(MIN_QUALITY, Math.round(start.quality * factor)),
      maxDimension: Math.max(MIN_DIMENSION, Math.round(start.maxDimension * factor)),
    });
  }
  steps[steps.length - 1] = { quality: MIN_QUALITY, maxDimension: MIN_DIMENSION };
  return steps;
}

async function compressToTarget(bytes, start, targetBytes) {
  const first = await compressOnce(bytes, start);
  let best = first.result;
  if (best.byteLength <= targetBytes) return { result: best, targetMet: true };
  if (first.eligibleImages === 0) return { result: best, targetMet: false };

  for (const settings of searchSchedule(start)) {
    const attempt = await compressOnce(bytes, settings);
    if (attempt.result.byteLength < best.byteLength) best = attempt.result;
    if (best.byteLength <= targetBytes) return { result: best, targetMet: true };
  }

  return { result: best, targetMet: false };
}

const PDF_MAGIC_BYTES = '%PDF-';

// payload: { pagePath: string, level: 'low'|'balanced'|'high', targetMb?: number }
// Returns { tempPath, originalSize, compressedSize, targetMet } -- the
// caller (compress:run's IPC handler) does not overwrite pagePath itself;
// that only happens if the user confirms the size comparison, via a
// separate compress:commit call that atomically moves tempPath into place.
module.exports = async function compressTask(payload) {
  const { pagePath, level, targetMb } = payload || {};
  if (!pagePath) throw Object.assign(new Error('No PDF page was given to compress.'), { kind: 'invalid' });
  if (!LEVEL_PRESETS[level]) {
    throw Object.assign(new Error(`Invalid level. Choose one of: ${Object.keys(LEVEL_PRESETS).join(', ')}.`), { kind: 'invalid' });
  }

  const bytes = await fs.readFile(pagePath);
  const header = bytes.subarray(0, PDF_MAGIC_BYTES.length).toString('latin1');
  if (header !== PDF_MAGIC_BYTES) {
    throw Object.assign(new Error('This file is not a PDF.'), { kind: 'invalid-pdf' });
  }

  const preset = LEVEL_PRESETS[level];
  let compressed;
  let targetMet;
  try {
    if (targetMb) {
      const outcome = await compressToTarget(bytes, preset, targetMb * 1024 * 1024);
      compressed = outcome.result;
      targetMet = outcome.targetMet;
    } else {
      compressed = (await compressOnce(bytes, preset)).result;
    }
  } catch (error) {
    if (error instanceof EncryptedPDFError) {
      throw Object.assign(new Error('Password-protected PDFs are not supported.'), { kind: 'invalid-pdf' });
    }
    throw Object.assign(new Error('This PDF could not be read. It may be corrupted.'), { kind: 'invalid-pdf' });
  }

  const tempPath = path.join(os.tmpdir(), `leaf-compress-${process.pid}-${Date.now()}.pdf`);
  await fs.writeFile(tempPath, compressed);

  return {
    tempPath,
    originalSize: bytes.byteLength,
    compressedSize: compressed.byteLength,
    targetMet,
  };
};
