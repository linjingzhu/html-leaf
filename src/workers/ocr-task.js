// OCR + "retyped PDF" output, ported from an earlier web implementation's
// OCR route. Runs inside the forked utility process (see runBackgroundTask in
// src/main.js) -- rasterizing pages, running Tesseract, and embedding a font
// can take seconds to tens of seconds, and this process's main thread also
// owns the renderer's UI, so this stays off it.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createCanvas, DOMMatrix, Path2D, ImageData } = require("@napi-rs/canvas");
// pdfjs-dist's Node rendering path expects these as ambient globals (the
// way a real browser provides them); Node itself does not define them, and
// -- confirmed empirically -- Electron's utility-process environment hits
// this gap where a plain Node process running the exact same code does not
// (something about its own global setup makes pdfjs-dist's Node/browser
// detection behave differently). @napi-rs/canvas exports its own Node
// implementations of all three but never installs them as globals itself,
// so this is done once, here, before pdfjs-dist is ever imported.
if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = Path2D;
if (typeof globalThis.ImageData === "undefined") globalThis.ImageData = ImageData;
const { PDFDocument } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const {
  assertImageDimensions,
  assertRenderDimensions,
  fitRenderScale,
  RenderLimitError,
} = require("./render-limits");
const {
  findInkRegions,
  layoutRetypedPages,
  RETYPED_PAGE_HEIGHT,
  RETYPED_PAGE_WIDTH,
} = require("./retyped-pdf-layout");

const OCR_LANGUAGES = ["eng", "kor", "eng+kor"];
const DEFAULT_OCR_LANGUAGE = "eng";
// The original capped this at 5 pages for a serverless function's timeout;
// that constraint doesn't apply to a desktop app's own background process,
// but a bound is still worth keeping for v1 rather than letting one request
// run unboundedly long -- revisit if a real document needs more.
const MAX_OCR_PAGES = 5;

const PDF_MAGIC_BYTES = "%PDF-";

// pdf.js calls create/reset for its own scratch canvases too (an embedded
// image at native size, patterns); those get the larger image budget. The
// page canvas is checked against the stricter output budget before this
// factory is asked for it (see the render loop below).
class NodeCanvasFactory {
  create(width, height) {
    assertImageDimensions(width, height);
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext, width, height) {
    assertImageDimensions(width, height);
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    // Native canvas treats zero as its default 350x150 size, not empty.
    canvasAndContext.canvas.width = 1;
    canvasAndContext.canvas.height = 1;
  }
}

// --- Image/table preservation ----------------------------------------------
// Tesseract's own `blocktype` classification was checked empirically and
// found unreliable for separating text from non-text regions. Instead, any
// part of the rendered page NOT covered by a
// recognized text line, but not blank either, is treated as an image/table
// to preserve verbatim.
const INK_CELL_SIZE = 12;
const INK_MIN_REGION_CELLS = 12;
const INK_WHITE_TOLERANCE = 24;
const INK_MIN_DARK_PIXELS = 3;
const INK_BACKGROUND_SAMPLE_STRIDE = 7;
const INK_BACKGROUND_PERCENTILE = 0.9;

// A real scan/photo's paper is rarely literal white (255). Sampling a high
// percentile of observed brightness finds the page's actual paper tone,
// since the large majority of a real document's pixels are background.
function estimateBackgroundLevel(data, width, height) {
  const samples = [];
  for (let y = 0; y < height; y += INK_BACKGROUND_SAMPLE_STRIDE) {
    for (let x = 0; x < width; x += INK_BACKGROUND_SAMPLE_STRIDE) {
      const i = (y * width + x) * 4;
      samples.push(Math.max(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (samples.length === 0) return 255;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length * INK_BACKGROUND_PERCENTILE)];
}

function buildInkGrid(canvas, textBboxesPx) {
  const { width, height } = canvas;
  const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
  const background = estimateBackgroundLevel(data, width, height);
  const cols = Math.ceil(width / INK_CELL_SIZE);
  const rows = Math.ceil(height / INK_CELL_SIZE);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const y0 = r * INK_CELL_SIZE;
    const y1 = Math.min(height, y0 + INK_CELL_SIZE);
    for (let c = 0; c < cols; c++) {
      const x0 = c * INK_CELL_SIZE;
      const x1 = Math.min(width, x0 + INK_CELL_SIZE);
      const coveredByText = textBboxesPx.some((b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0);
      if (coveredByText) {
        row.push(false);
        continue;
      }
      let darkCount = 0;
      for (let y = y0; y < y1 && darkCount < INK_MIN_DARK_PIXELS; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          if (
            background - data[i] > INK_WHITE_TOLERANCE ||
            background - data[i + 1] > INK_WHITE_TOLERANCE ||
            background - data[i + 2] > INK_WHITE_TOLERANCE
          ) {
            darkCount++;
            if (darkCount >= INK_MIN_DARK_PIXELS) break;
          }
        }
      }
      row.push(darkCount >= INK_MIN_DARK_PIXELS);
    }
    grid.push(row);
  }
  return grid;
}

// Crops the region's bounding box, then whitens every cell that isn't
// actually part of THIS connected component -- see retyped-pdf-layout.js's
// header comment for why cell membership (not just the box) is load-bearing.
function cropRegionToPng(canvas, region) {
  const x0 = region.c0 * INK_CELL_SIZE;
  const y0 = region.r0 * INK_CELL_SIZE;
  const x1 = Math.min(canvas.width, (region.c1 + 1) * INK_CELL_SIZE);
  const y1 = Math.min(canvas.height, (region.r1 + 1) * INK_CELL_SIZE);
  const width = x1 - x0;
  const height = y1 - y0;
  const crop = createCanvas(width, height);
  const ctx = crop.getContext("2d");
  ctx.drawImage(canvas, x0, y0, width, height, 0, 0, width, height);

  const memberCells = new Set(region.cells.map(([r, c]) => `${r},${c}`));
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let cr = region.r0; cr <= region.r1; cr++) {
    for (let cc = region.c0; cc <= region.c1; cc++) {
      if (memberCells.has(`${cr},${cc}`)) continue;
      const lx0 = (cc - region.c0) * INK_CELL_SIZE;
      const ly0 = (cr - region.r0) * INK_CELL_SIZE;
      const lx1 = Math.min(width, lx0 + INK_CELL_SIZE);
      const ly1 = Math.min(height, ly0 + INK_CELL_SIZE);
      for (let y = ly0; y < ly1; y++) {
        for (let x = lx0; x < lx1; x++) {
          const i = (y * width + x) * 4;
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return { bbox: { x0, y0, x1, y1 }, png: crop.toBuffer("image/png") };
}

// Disables every OpenType feature confirmed to substitute an untabulated
// glyph for a sequence that sits inside one drawn string (Hangul
// space-between-syllables, fi/ffi-style ligatures, locl digit-adjacent-to-
// letter substitutions) -- pdf-lib's CustomFontEmbedder only tabulates
// glyphs reachable by direct codepoint lookup, so a substituted glyph gets
// rendered at the PDF spec's 1000-unit default width by real viewers. Hangul
// jamo features (ljmo/vjmo/tjmo) and ccmp/rlig/mark/kern stay on and are
// unaffected.
const NON_SUBSTITUTING_FONT_FEATURES = { liga: false, clig: false, dlig: false, calt: false, locl: false };

async function assertFontDataUsable(bytes) {
  const fontkitFont = await fontkit.create(bytes);
  fontkitFont.layout("A", NON_SUBSTITUTING_FONT_FEATURES);
}

// Builds the whole retyped PDF against a brand new PDFDocument every call,
// so a failure at any point -- embedding, layout, drawing, or save() -- can
// be recovered from simply by discarding this document and calling again
// with different font bytes, never by patching or reusing a document a
// broken font has already been registered into.
async function buildRetypedPdf(fontBytes, pagesOfBlocks, pageRenderScales) {
  await assertFontDataUsable(fontBytes);
  const outPdf = await PDFDocument.create();
  outPdf.registerFontkit(fontkit);
  // Always unsubsetted -- subsetting was found (empirically, earlier) to
  // corrupt glyph output across repeated drawText calls against one embedded font.
  const font = await outPdf.embedFont(fontBytes, { subset: false, features: NON_SUBSTITUTING_FONT_FEATURES });
  const { pageCount, instructions } = layoutRetypedPages(pagesOfBlocks, pageRenderScales, font);
  if (pageCount === 0) return null;
  for (let i = 0; i < pageCount; i++) outPdf.addPage([RETYPED_PAGE_WIDTH, RETYPED_PAGE_HEIGHT]);
  const imageCache = new Map();
  for (const instruction of instructions) {
    const outPage = outPdf.getPage(instruction.pageIndex);
    if (instruction.kind === "text") {
      for (const word of instruction.words) {
        outPage.drawText(word.text, { x: word.x, y: instruction.y, size: instruction.size, font });
      }
    } else {
      let image = imageCache.get(instruction.png);
      if (!image) {
        image = await outPdf.embedPng(instruction.png);
        imageCache.set(instruction.png, image);
      }
      outPage.drawImage(image, { x: instruction.x, y: instruction.y, width: instruction.width, height: instruction.height });
    }
  }
  return Buffer.from(await outPdf.save());
}

// payload: { pagePath, lang, fontBytes?, resourcesDir }
// resourcesDir is computed by main.js (it knows app.isPackaged/resourcesPath;
// this plain utility process does not) and points at the directory holding
// tessdata/ and fonts/.
// Returns { text, totalPages, pagesProcessed, truncated, retypedPdfTempPath }.
module.exports = async function ocrTask(payload) {
  const { pagePath, lang, fontBytes, resourcesDir } = payload || {};
  if (!pagePath) throw Object.assign(new Error("No PDF page was given to OCR."), { kind: "invalid" });
  const language = OCR_LANGUAGES.includes(lang) ? lang : DEFAULT_OCR_LANGUAGE;
  const customFontBytes = fontBytes ? Buffer.from(fontBytes) : null;

  const TESS_LANG_PATH = path.join(resourcesDir, "tessdata");
  const DEFAULT_RETYPED_FONT_PATH = path.join(resourcesDir, "fonts", "NotoSansKR-Regular.ttf");

  let bytes;
  try {
    bytes = await fs.readFile(pagePath);
  } catch (error) {
    throw Object.assign(new Error(`Could not read the PDF file: ${error.message}`), { kind: "invalid" });
  }
  const header = bytes.subarray(0, PDF_MAGIC_BYTES.length).toString("latin1");
  if (header !== PDF_MAGIC_BYTES) {
    throw Object.assign(new Error("This file is not a PDF."), { kind: "invalid-pdf" });
  }

  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Electron's utility-process environment defines enough of a Worker-like
  // global that pdfjs-dist insists on a real worker instead of silently
  // falling back to synchronous in-process rendering the way plain Node
  // does (confirmed empirically: identical code against the same PDF needs
  // no workerSrc at all under plain `node`). Point it at the real Node
  // worker build pdfjs-dist ships for exactly this environment.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
  const { createWorker } = require("tesseract.js");

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
    CanvasFactory: NodeCanvasFactory,
  });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy();
    if (error instanceof Error && error.name === "PasswordException") {
      throw Object.assign(new Error("Password-protected PDFs are not supported."), { kind: "invalid-pdf" });
    }
    throw Object.assign(new Error("This PDF could not be read. It may be corrupted."), { kind: "invalid-pdf" });
  }

  const totalPages = doc.numPages;
  const pagesToProcess = Math.min(totalPages, MAX_OCR_PAGES);
  const canvasFactory = new NodeCanvasFactory();
  let worker;

  try {
    const renderPages = [];
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = fitRenderScale(base.width, base.height);
      const viewport = page.getViewport({ scale });
      assertRenderDimensions(viewport.width, viewport.height);
      renderPages.push({ page, viewport, renderScale: scale });
    }

    try {
      worker = await createWorker(language, 1, {
        langPath: TESS_LANG_PATH,
        gzip: true,
        cacheMethod: "none",
        errorHandler: (error) => console.error("[ocr] worker error:", error),
      });
    } catch {
      throw Object.assign(new Error("The OCR engine failed to start. Please try again."), { kind: "ocr-start-failed" });
    }

    const pages = [];
    const pagesOfBlocks = [];
    const pageRenderScales = [];
    for (const { page, viewport, renderScale } of renderPages) {
      const target = canvasFactory.create(viewport.width, viewport.height);
      try {
        await page.render({ canvasContext: target.context, viewport }).promise;
        const { data } = await worker.recognize(target.canvas.toBuffer("image/png"), {}, { text: true, blocks: true });
        pages.push(data.text);

        const paragraphs = (data.blocks ?? [])
          .flatMap((block) => block.paragraphs ?? [])
          .filter((paragraph) => paragraph.lines?.length);

        const textBboxesPx = paragraphs.flatMap((p) => p.lines.map((l) => l.bbox));
        const imageBlocks = [];
        try {
          const grid = buildInkGrid(target.canvas, textBboxesPx);
          const regions = findInkRegions(grid, INK_MIN_REGION_CELLS);
          for (const region of regions) {
            const { bbox, png } = cropRegionToPng(target.canvas, region);
            imageBlocks.push({ kind: "image", bbox, png, __y0: bbox.y0 });
          }
        } catch (error) {
          console.error("[ocr] image-region detection failed for a page:", error);
        }

        const blocks = [
          ...paragraphs.map((paragraph) => ({
            kind: "text",
            paragraph,
            __y0: Math.min(...paragraph.lines.map((l) => l.bbox.y0)),
          })),
          ...imageBlocks,
        ];
        blocks.sort((a, b) => a.__y0 - b.__y0);
        pagesOfBlocks.push(blocks);
        pageRenderScales.push(renderScale);
      } finally {
        canvasFactory.destroy(target);
        page.cleanup();
      }
    }

    let retypedPdfBytes = null;
    try {
      const resolvedFontBytes = customFontBytes ?? (await fs.readFile(DEFAULT_RETYPED_FONT_PATH));
      try {
        retypedPdfBytes = await buildRetypedPdf(resolvedFontBytes, pagesOfBlocks, pageRenderScales);
      } catch (error) {
        if (customFontBytes) {
          console.error("[ocr] custom font failed, falling back to the bundled font:", error);
          const defaultBytes = await fs.readFile(DEFAULT_RETYPED_FONT_PATH);
          retypedPdfBytes = await buildRetypedPdf(defaultBytes, pagesOfBlocks, pageRenderScales);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("[ocr] retyped PDF generation failed:", error);
      retypedPdfBytes = null;
    }

    let retypedPdfTempPath = null;
    if (retypedPdfBytes) {
      retypedPdfTempPath = path.join(os.tmpdir(), `leaf-ocr-retyped-${process.pid}-${Date.now()}.pdf`);
      await fs.writeFile(retypedPdfTempPath, retypedPdfBytes);
    }

    return {
      text: pages.join("\n\n--- page break ---\n\n"),
      totalPages,
      pagesProcessed: pagesToProcess,
      truncated: totalPages > pagesToProcess,
      retypedPdfTempPath,
    };
  } catch (error) {
    if (error instanceof RenderLimitError) {
      throw Object.assign(new Error(error.message), { kind: "too-large" });
    }
    if (error && error.kind) throw error;
    throw Object.assign(new Error("OCR failed while processing this PDF."), { kind: "ocr-failed" });
  } finally {
    try {
      await worker?.terminate();
    } finally {
      await loadingTask.destroy();
    }
  }
};
