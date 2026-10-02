// Entry point for Leaf's background PDF-task utility process, forked from
// runBackgroundTask() in src/main.js. This file stays a thin dispatcher so
// the process-management code in main.js never needs to know what a given
// task type actually does -- each feature registers its own handler here as
// it's ported (compress, ocr, ...).
const handlers = {
  compress: require('./compress-task'),
  ocr: require('./ocr-task'),
  'convert-pdf-to-images': require('./convert-pdf-to-images-task'),
  'convert-images-to-pdf': require('./convert-images-to-pdf-task'),
  'extract-text': require('./extract-text-task'),
};

process.parentPort.once('message', async (event) => {
  const { type, payload } = event.data || {};
  try {
    const handler = handlers[type];
    if (!handler) throw Object.assign(new Error(`Unknown task type: ${type}`), { kind: 'invalid' });
    const value = await handler(payload);
    process.parentPort.postMessage({ ok: true, value });
  } catch (error) {
    process.parentPort.postMessage({
      ok: false,
      kind: error?.kind,
      message: String(error?.message || 'PDF task failed.'),
    });
  }
  process.exit(0);
});
