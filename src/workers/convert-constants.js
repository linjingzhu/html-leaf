// Ported from pdf-convertor's app/convert/constants.ts.
// Images -> PDF has no server route to enforce a body-size cap the way
// compress/OCR do (app/compress/constants.ts, app/ocr/constants.ts) -- it
// runs entirely in a background process with no request timeout of its own.
// File *bytes* don't bound the cost here: a small, well-compressed PNG can
// still decode to a huge bitmap (a 0.7 MB single-color 8000x8000 PNG took
// over 10s and ~685 MB to embed and re-save with no cap at all -- found in
// review). Pixel counts are what pdf-lib's embed/resize work actually scales
// with, so the caps below are pixel-based: generous for real photos and
// scans, but bounded well under what froze the tab.
//
// pdf-convertor's own PDF -> images direction had no equivalent cap at all
// (a real, still-open gap there -- ROADMAP item 14). Leaf has no server
// timeout to fall back on, so these same limits are applied symmetrically to
// both directions here.
const MAX_IMAGES = 100;
const MAX_IMAGE_PIXELS = 40_000_000; // ~40 MP: above any common phone/scanner output.
const MAX_TOTAL_PIXELS = 200_000_000; // sum across the whole batch.

module.exports = { MAX_IMAGES, MAX_IMAGE_PIXELS, MAX_TOTAL_PIXELS };
