// Ported verbatim (logic unchanged, TS types stripped) from an earlier web
// implementation's retyped-pdf module. Pure layout/pagination logic for the OCR "retyped
// PDF" output: takes already-recognized, structured OCR data (tesseract.js's
// data.blocks[].paragraphs[].lines[], each line already measured against the
// source page's real geometry) and produces a flat list of draw instructions
// a caller can play back against a pdf-lib PDFDocument. No pdf-lib
// PDFDocument/page objects or canvas types are touched here, so it stays
// testable with plain data.
//
// Six rounds of independent review on an earlier density/overlap/text-
// enclosure heuristic for classifying ink regions as decoration vs. content
// each fixed a real failure but introduced a new one. findInkRegions below
// is the design that replaced all of that: every connected ink component
// becomes its own region with its *exact* cell membership (not just a
// bounding box), and the caller (src/workers/ocr-task.js's cropRegionToPng)
// masks every crop to only that membership -- duplication and loss become
// structurally impossible instead of something a heuristic tries to avoid.
// Do not re-add density/overlap heuristics here; they were tried, in
// increasing sophistication, and each one kept finding a new real failure.

// A4 portrait, ~20mm margins -- a plain, standard page for a retyped
// document (this is a reflow, not a positional replica of the original).
const RETYPED_PAGE_WIDTH = 595.28;
const RETYPED_PAGE_HEIGHT = 841.89;
const RETYPED_MARGIN = 56;
const RETYPED_CONTENT_WIDTH = RETYPED_PAGE_WIDTH - RETYPED_MARGIN * 2;
const RETYPED_LINE_GAP = 1.3;
const RETYPED_PARAGRAPH_GAP = 0.65; // extra, in units of that paragraph's font size
const RETYPED_MIN_FONT_SIZE = 9;
const RETYPED_MAX_FONT_SIZE = 32;
const RETYPED_BASE_FONT_SIZE = 11;

// Measured directly in the original implementation (a pdf-lib-drawn line's
// Tesseract-recognized bbox height, converted from rendered-canvas pixels to PDF
// points via the page's own render scale, is consistently ~1.06x the font's
// point size across 10-40pt with the bundled Noto Sans KR font). Not exact
// for every font/script, so the result is clamped, not trusted blindly.
const LINE_HEIGHT_TO_FONT_SIZE_RATIO = 1.06;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Converts one recognized line's pixel bbox height into an estimated
// original point size, given the render scale (pixels per point) used when
// rasterizing that line's source page.
function estimateFontSize(bboxHeightPx, renderScale) {
  if (!Number.isFinite(bboxHeightPx) || !Number.isFinite(renderScale) || renderScale <= 0) {
    return RETYPED_BASE_FONT_SIZE;
  }
  const heightInPoints = bboxHeightPx / renderScale;
  return clamp(heightInPoints / LINE_HEIGHT_TO_FONT_SIZE_RATIO, RETYPED_MIN_FONT_SIZE, RETYPED_MAX_FONT_SIZE);
}

function paragraphText(paragraph) {
  return paragraph.lines.map((line) => line.text.trim()).join(" ").replace(/\s+/g, " ").trim();
}

// A paragraph is one semantic unit rendered at one size -- the size of its
// tallest line (using the tallest rather than the first avoids being thrown
// off by a short/stray first line).
function paragraphFontSize(paragraph, renderScale) {
  let maxHeight = 0;
  for (const line of paragraph.lines) {
    maxHeight = Math.max(maxHeight, line.bbox.y1 - line.bbox.y0);
  }
  return estimateFontSize(maxHeight, renderScale);
}

// pdf-lib's CustomFontEmbedder builds its PDF glyph-width table by looking
// up each codepoint directly; it does not account for a glyph that shaping
// substitutes in only when characters sit next to each other in the SAME
// drawn string (confirmed: the bundled Noto Sans KR font swaps in a
// different, un-tabulated glyph for the space between two Hangul syllables).
// The fix: never ask pdf-lib to lay out a space character next to CJK text
// in the first place -- each word is measured and later drawn as its own
// isolated drawText call, with the gap between words computed from the same
// known-safe standalone-space width.
function wrapIntoLines(words, font, size, maxWidth) {
  const spaceWidth = font.widthOfTextAtSize(" ", size);
  const lines = [];
  let current = [];
  let currentWidth = 0;
  for (const word of words) {
    const wordWidth = font.widthOfTextAtSize(word, size);
    const additional = current.length === 0 ? wordWidth : spaceWidth + wordWidth;
    if (current.length > 0 && currentWidth + additional > maxWidth) {
      lines.push(current);
      current = [word];
      currentWidth = wordWidth;
    } else {
      current.push(word);
      currentWidth += additional;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function ensureSpace(cursor, needed) {
  if (cursor.y - needed < RETYPED_MARGIN) {
    cursor.pageIndex++;
    cursor.y = RETYPED_PAGE_HEIGHT - RETYPED_MARGIN;
  }
}

// Lays out a document's recognized content (one ordered block list per
// source page -- text paragraphs and preserved image/table crops,
// interleaved in reading order) into a flat list of draw instructions
// against continuously-reflowed, standard-size output pages. Does not force
// one output page per source page -- pages are a function of how much
// content there is, which is the point of "재타이핑" (retype), not a
// positional replica.
function layoutRetypedPages(pagesOfBlocks, pageRenderScales, font) {
  const instructions = [];
  const cursor = { pageIndex: 0, y: RETYPED_PAGE_HEIGHT - RETYPED_MARGIN };
  let wroteAnything = false;

  for (let pageIndex = 0; pageIndex < pagesOfBlocks.length; pageIndex++) {
    const blocks = pagesOfBlocks[pageIndex];
    const renderScale = pageRenderScales[pageIndex] ?? 1;

    for (const block of blocks) {
      if (block.kind === "text") {
        const text = paragraphText(block.paragraph);
        if (text === "") continue;
        const size = paragraphFontSize(block.paragraph, renderScale);
        const lineHeight = size * RETYPED_LINE_GAP;
        const spaceWidth = font.widthOfTextAtSize(" ", size);
        const lines = wrapIntoLines(text.split(" "), font, size, RETYPED_CONTENT_WIDTH);
        for (const line of lines) {
          ensureSpace(cursor, lineHeight);
          const words = [];
          let x = RETYPED_MARGIN;
          for (const word of line) {
            words.push({ text: word, x });
            x += font.widthOfTextAtSize(word, size) + spaceWidth;
          }
          instructions.push({ kind: "text", pageIndex: cursor.pageIndex, y: cursor.y - size, size, words });
          cursor.y -= lineHeight;
          wroteAnything = true;
        }
        cursor.y -= size * RETYPED_PARAGRAPH_GAP;
      } else {
        const widthPt = (block.bbox.x1 - block.bbox.x0) / renderScale;
        const heightPt = (block.bbox.y1 - block.bbox.y0) / renderScale;
        if (widthPt <= 0 || heightPt <= 0) continue;
        const contentHeight = RETYPED_PAGE_HEIGHT - RETYPED_MARGIN * 2;
        const scale = Math.min(1, RETYPED_CONTENT_WIDTH / widthPt, contentHeight / heightPt);
        const drawWidth = widthPt * scale;
        const drawHeight = heightPt * scale;
        ensureSpace(cursor, drawHeight);
        instructions.push({
          kind: "image",
          pageIndex: cursor.pageIndex,
          x: RETYPED_MARGIN,
          y: cursor.y - drawHeight,
          width: drawWidth,
          height: drawHeight,
          png: block.png,
        });
        cursor.y -= drawHeight + RETYPED_BASE_FONT_SIZE * RETYPED_PARAGRAPH_GAP;
        wroteAnything = true;
      }
    }
  }

  return { pageCount: wroteAnything ? cursor.pageIndex + 1 : 0, instructions };
}

// `cells` is every grid cell actually belonging to this connected component,
// not just its bounding rectangle -- see this file's header comment for why
// that membership (not just the box) is load-bearing.

// 8-connected flood fill over a boolean grid (grid[row][col] = true means
// "ink present and not already known to be text"). Returns every connected
// component with at least `minCells` cells, along with its bounding box and
// its exact cell membership.
function findInkRegions(grid, minCells) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const visited = grid.map((row) => row.map(() => false));
  const regions = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c] || visited[r][c]) continue;
      let r0 = r, c0 = c, r1 = r, c1 = c;
      const cells = [];
      const stack = [[r, c]];
      visited[r][c] = true;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop();
        cells.push([cr, cc]);
        r0 = Math.min(r0, cr); c0 = Math.min(c0, cc);
        r1 = Math.max(r1, cr); c1 = Math.max(c1, cc);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (visited[nr][nc] || !grid[nr][nc]) continue;
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (cells.length >= minCells) regions.push({ r0, c0, r1, c1, cells });
    }
  }
  return regions;
}

module.exports = {
  RETYPED_PAGE_WIDTH,
  RETYPED_PAGE_HEIGHT,
  RETYPED_MARGIN,
  RETYPED_CONTENT_WIDTH,
  RETYPED_MIN_FONT_SIZE,
  RETYPED_MAX_FONT_SIZE,
  RETYPED_BASE_FONT_SIZE,
  estimateFontSize,
  layoutRetypedPages,
  findInkRegions,
};
