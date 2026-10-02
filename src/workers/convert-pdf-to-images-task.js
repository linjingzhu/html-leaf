// PDF -> images, ported from pdf-convertor's app/convert/page.tsx
// (renderPdfToImages/PdfToImages). Runs inside the forked utility process
// (see runBackgroundTask in src/main.js) -- rasterizing every page can take
// seconds on a large document, and this process's main thread also owns the
// renderer's UI, so this stays off it.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, DOMMatrix, Path2D, ImageData } = require('@napi-rs/canvas');
// See ocr-task.js for why this polyfill is needed: pdfjs-dist's Node
// rendering path expects these as ambient globals, @napi-rs/canvas exports
// Node implementations of all three but never installs them as globals, and
// -- confirmed empirically -- Electron's utility-process environment hits
// this gap where a plain Node process running the exact same code does not.
if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2D;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageData;
const {
  assertImageDimensions,
  assertRenderDimensions,
  fitRenderScale,
  RenderLimitError,
} = require('./render-limits');
const { MAX_IMAGES, MAX_TOTAL_PIXELS } = require('./convert-constants');

const PDF_MAGIC_BYTES = '%PDF-';

class NodeCanvasFactory {
  create(width, height) {
    assertImageDimensions(width, height);
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    assertImageDimensions(width, height);
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 1;
    canvasAndContext.canvas.height = 1;
  }
}

// pdfjs-dist's own cMap/standard-font readers (NodeCMapReaderFactory,
// NodeStandardFontDataFactory) are only ever selected via its internal
// isNodeJS auto-detection, which checks `process.type !== 'browser'` --
// true for Electron's utility process (process.type is 'utility'), so
// isNodeJS evaluates to false there and pdfjs-dist falls back to the DOM
// factories (which assume `fetch`/`document`, neither available here).
// Confirmed the same way as the DOMMatrix/workerSrc issues above: this is
// specific to Electron's utility process, not a plain Node run. These two
// small classes replicate the Node factories' own fs-based behavior,
// passed explicitly via the CMapReaderFactory/StandardFontDataFactory
// options so nothing depends on that auto-detection.
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

// payload: { pagePath: string, pdfjsRoot: string }
// Returns { tempDir, files: string[], pageCount } -- the caller
// (convert:pdfToImages's IPC handler) moves the rendered PNGs from tempDir
// into a collision-safe sibling folder next to pagePath.
module.exports = async function convertPdfToImagesTask(payload) {
  const { pagePath, pdfjsRoot } = payload || {};
  if (!pagePath) throw Object.assign(new Error('No PDF page was given to convert.'), { kind: 'invalid' });

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
  // See ocr-task.js: Electron's utility-process environment insists on a
  // real worker instead of silently falling back to synchronous in-process
  // rendering the way plain Node does.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    CanvasFactory: NodeCanvasFactory,
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
  if (totalPages > MAX_IMAGES) {
    await doc.destroy();
    throw Object.assign(
      new Error(`This PDF has ${totalPages} pages. Choose a PDF with at most ${MAX_IMAGES} pages.`),
      { kind: 'too-large' },
    );
  }

  const canvasFactory = new NodeCanvasFactory();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-convert-'));
  const files = [];
  let totalPixels = 0;

  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = fitRenderScale(base.width, base.height);
        const viewport = page.getViewport({ scale });
        assertRenderDimensions(viewport.width, viewport.height);

        totalPixels += Math.ceil(viewport.width) * Math.ceil(viewport.height);
        if (totalPixels > MAX_TOTAL_PIXELS) {
          throw Object.assign(
            new Error(`These pages total more than ${(MAX_TOTAL_PIXELS / 1_000_000).toFixed(0)} MP combined. Choose a smaller PDF.`),
            { kind: 'too-large' },
          );
        }

        const target = canvasFactory.create(viewport.width, viewport.height);
        await page.render({ canvasContext: target.context, viewport }).promise;
        const pngBuffer = target.canvas.toBuffer('image/png');
        const fileName = `page-${pageNumber}.png`;
        await fs.writeFile(path.join(tempDir, fileName), pngBuffer);
        files.push(fileName);
        canvasFactory.destroy(target);
      } finally {
        page.cleanup();
      }
    }
    await doc.destroy();
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await doc.destroy().catch(() => {});
    if (error instanceof RenderLimitError) throw Object.assign(error, { kind: 'too-large' });
    throw error;
  }

  return { tempDir, files, pageCount: totalPages };
};
