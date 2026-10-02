// Extracts a PDF's embedded text layer and formats it as Markdown. Runs
// inside the forked utility process (see runBackgroundTask in src/main.js)
// for the same reasons compress/OCR/convert do.
//
// This is deliberately not OCR: it reads the PDF's own text layer via
// pdfjs-dist's getTextContent(), which is fast and exact for any PDF that
// already has one (most reports, exports, and native documents) -- no
// rasterization or recognition involved, so no image-quality loss either.
// A scanned PDF with no text layer will come back empty; OCR (already a
// separate "PDF tools" action) is the tool for that case, not this one.
const fs = require('node:fs/promises');
const path = require('node:path');
const { DOMMatrix, Path2D, ImageData } = require('@napi-rs/canvas');
// See ocr-task.js / convert-pdf-to-images-task.js for why this is needed.
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;

const PDF_MAGIC_BYTES = '%PDF-';
// Extraction has none of rendering/recognition's per-page cost, but a bound
// still keeps one request from walking an unbounded number of pages.
const MAX_EXTRACT_PAGES = 500;

// See convert-pdf-to-images-task.js for why these exist: pdfjs-dist's own
// Node cMap/standard-font readers are only selected via its internal
// isNodeJS auto-detection, which reads false under Electron's utility
// process (process.type is 'utility', not 'browser'). Without these, text
// using a custom/CID-encoded embedded font can decode to the wrong
// characters instead of just rendering with a substitute glyph -- correctness
// matters more here than for OCR or image rendering, since the decoded text
// *is* the entire output of this task.
class LocalCMapReaderFactory {
  constructor({ baseUrl, isCompressed = true }) {
    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }
  async fetch({ name }) {
    if (!name) throw new Error('CMap name must be specified.');
    const data = await fs.readFile(path.join(this.baseUrl, name + (this.isCompressed ? '.bcmap' : '')));
    return { cMapData: new Uint8Array(data), isCompressed: this.isCompressed };
  }
}
class LocalStandardFontDataFactory {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl;
  }
  async fetch({ filename }) {
    if (!filename) throw new Error('Font filename must be specified.');
    const data = await fs.readFile(path.join(this.baseUrl, filename));
    return new Uint8Array(data);
  }
}

// pdfjs-dist's getTextContent() items carry hasEOL rather than real
// paragraph structure, so this folds them into lines first (joining items
// up to each hasEOL marker) and then lines into paragraphs (a blank line
// ends one), which reads far better as Markdown than one run-on line per
// page would.
function itemsToMarkdown(items) {
  const lines = [];
  let current = '';
  for (const item of items) {
    current += item.str;
    if (item.hasEOL) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);

  const paragraphs = [];
  let paragraph = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (paragraph.length) paragraphs.push(paragraph.join(' ').trim());
      paragraph = [];
    } else {
      paragraph.push(line.trim());
    }
  }
  if (paragraph.length) paragraphs.push(paragraph.join(' ').trim());
  return paragraphs.join('\n\n');
}

// payload: { pagePath, pdfjsRoot }
// Returns { markdown, totalPages, pagesProcessed, truncated }.
module.exports = async function extractTextTask(payload) {
  const { pagePath, pdfjsRoot } = payload || {};
  if (!pagePath) throw Object.assign(new Error('No PDF page was given to extract text from.'), { kind: 'invalid' });

  let bytes;
  try {
    bytes = await fs.readFile(pagePath);
  } catch (error) {
    throw Object.assign(new Error(`Could not read the PDF file: ${error.message}`), { kind: 'invalid' });
  }
  const header = bytes.subarray(0, PDF_MAGIC_BYTES.length).toString('latin1');
  if (header !== PDF_MAGIC_BYTES) {
    throw Object.assign(new Error('This file is not a PDF.'), { kind: 'invalid-pdf' });
  }

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    CMapReaderFactory: LocalCMapReaderFactory,
    StandardFontDataFactory: LocalStandardFontDataFactory,
    cMapUrl: path.join(pdfjsRoot, 'cmaps') + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts') + path.sep,
  });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy();
    if (error instanceof Error && error.name === 'PasswordException') {
      throw Object.assign(new Error('Password-protected PDFs are not supported.'), { kind: 'invalid-pdf' });
    }
    throw Object.assign(new Error('This PDF could not be read. It may be corrupted.'), { kind: 'invalid-pdf' });
  }

  const totalPages = doc.numPages;
  const pagesToProcess = Math.min(totalPages, MAX_EXTRACT_PAGES);
  const sections = [];
  try {
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const body = itemsToMarkdown(content.items).trim();
        sections.push(`## Page ${pageNumber}\n\n${body || '*No extractable text on this page.*'}`);
      } finally {
        page.cleanup();
      }
    }
    await doc.destroy();
  } catch (error) {
    await doc.destroy().catch(() => {});
    throw Object.assign(new Error('This PDF could not be read. It may be corrupted.'), { kind: 'invalid-pdf' });
  }

  const title = path.basename(pagePath, path.extname(pagePath));
  const markdown = `# ${title}\n\n${sections.join('\n\n')}\n`;

  return {
    markdown,
    totalPages,
    pagesProcessed: pagesToProcess,
    truncated: pagesToProcess < totalPages,
  };
};
