#!/usr/bin/env node
// pdfjs-dist's Node rendering path and the OCR task (src/workers/ocr-task.js)
// must load the *same* @napi-rs/canvas install. If npm ever resolves two
// separate copies (e.g. the top-level pin and pdfjs-dist's own
// optionalDependency range drift apart), pdf.js hands image data from one
// copy's native module to a canvas context created by the other -- confirmed
// (in an earlier project) to segfault or hang the process on
// any JPEG-containing PDF page. The package.json "overrides" entry is
// supposed to make this impossible by forcing every resolution of
// @napi-rs/canvas to the top-level version; this check catches the case
// where that guarantee didn't hold (a stale install, a manually edited
// node_modules, or the override being removed).
const fs = require("fs");
const path = require("path");

const nestedPkg = path.join(
  __dirname,
  "..",
  "node_modules",
  "pdfjs-dist",
  "node_modules",
  "@napi-rs",
  "canvas",
  "package.json",
);

if (fs.existsSync(nestedPkg)) {
  console.error(
    "ERROR: node_modules/pdfjs-dist/node_modules/@napi-rs/canvas exists -- " +
      "pdfjs-dist and src/workers/ocr-task.js would load two separate " +
      "@napi-rs/canvas installs, reproducing a real crash/hang found earlier. " +
      "Check package.json's \"overrides\" " +
      "entry for \"@napi-rs/canvas\" and re-run npm install.",
  );
  process.exit(1);
}
