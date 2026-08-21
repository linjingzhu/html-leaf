const { app, BrowserWindow, dialog, ipcMain, clipboard } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

let mainWindow;
let sessionTempDir = null;
const initialHtmlSnapshots = new Map();

app.setName('Leaf');
if (process.platform === 'win32') app.setAppUserModelId('com.leaf.editor');
if (process.env.LEAF_DISABLE_GPU === '1') app.disableHardwareAcceleration();

async function ensureSessionTempDir() {
  if (!sessionTempDir) {
    sessionTempDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'leaf-editor-'));
  }
  return sessionTempDir;
}

async function snapshotInitialHtml(filePath, source) {
  const key = path.resolve(filePath);
  if (initialHtmlSnapshots.has(key)) return initialHtmlSnapshots.get(key);
  const dir = await ensureSessionTempDir();
  const snapshotPath = path.join(dir, `initial-${initialHtmlSnapshots.size + 1}.html`);
  await atomicWriteFile(snapshotPath, source, 'utf8');
  initialHtmlSnapshots.set(key, snapshotPath);
  return snapshotPath;
}

function cleanupSessionTempDir() {
  if (!sessionTempDir) return;
  try { fsSync.rmSync(sessionTempDir, { recursive: true, force: true }); } catch {}
  initialHtmlSnapshots.clear();
  sessionTempDir = null;
}

async function atomicWriteFile(filePath, content, encoding = 'utf8') {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `.${base}.hbe-tmp-${process.pid}-${Date.now()}`);
  try {
    await fs.writeFile(tempPath, content, encoding);
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      if (process.platform === 'win32') {
        try { await fs.unlink(filePath); } catch {}
        await fs.rename(tempPath, filePath);
      } else {
        throw error;
      }
    }
  } finally {
    try { await fs.unlink(tempPath); } catch {}
  }
  return filePath;
}


function baseUrlForFile(filePath) {
  if (!filePath) return null;
  return pathToFileURL(path.dirname(filePath) + path.sep).href;
}

async function readHtmlPath(filePath) {
  if (!filePath || !/\.html?$/i.test(filePath)) throw new Error('Only .html and .htm files are supported.');
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 50_000_000) throw new Error('HTML pages must be files smaller than 50 MB.');
  const source = await fs.readFile(filePath, 'utf8');
  const initialSnapshotPath = await snapshotInitialHtml(filePath, source);
  return {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath)),
    source,
    baseUrl: baseUrlForFile(filePath),
    initialSnapshotPath
  };
}

const DOCUMENT_EXTENSIONS = new Set(['.html', '.htm', '.md', '.markdown', '.json', '.pdf']);

function documentTypeForPath(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (extension === '.html' || extension === '.htm') return 'html';
  if (extension === '.md' || extension === '.markdown') return 'markdown';
  if (extension === '.json') return 'json';
  if (extension === '.pdf') return 'pdf';
  return null;
}

async function readDocumentPath(filePath) {
  const documentType = documentTypeForPath(filePath);
  if (!filePath || !documentType) throw new Error('Only HTML, Markdown, JSON, and PDF pages are supported.');
  if (documentType === 'html') return { ...(await readHtmlPath(filePath)), documentType };

  const common = {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath)),
    documentType,
    baseUrl: baseUrlForFile(filePath),
    previewUrl: documentType === 'pdf' ? pathToFileURL(filePath).href : null,
    initialSnapshotPath: null
  };
  if (documentType === 'pdf') {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 500_000_000) throw new Error('PDF pages must be files smaller than 500 MB.');
    return { ...common, source: '', loadedSource: '' };
  }
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 50_000_000) throw new Error('Text pages must be files smaller than 50 MB.');
  const source = await fs.readFile(filePath, 'utf8');
  return { ...common, source, loadedSource: source };
}

async function openDocumentFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Pages',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Leaf Pages', extensions: ['html', 'htm', 'md', 'markdown', 'json', 'pdf'] }]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(readDocumentPath));
}

async function openHtmlFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import HTML',
    properties: ['openFile'],
    filters: [{ name: 'HTML Pages', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return readHtmlPath(filePath);
}

async function exportHtml({ suggestedName, source }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export HTML',
    defaultPath: suggestedName || 'page.html',
    filters: [{ name: 'HTML Page', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!/\.html?$/i.test(filePath)) filePath += '.html';
  await atomicWriteFile(filePath, source, 'utf8');
  return filePath;
}

async function saveHtmlPath({ filePath, source }) {
  if (!filePath || !/\.html?$/i.test(filePath)) throw new Error('A valid HTML file path is required.');
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}


async function exportTextFile({ title, suggestedName, extension, source }) {
  const safeExtension = String(extension || 'txt').replace(/^\./, '');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: title || 'Export',
    defaultPath: suggestedName || `page.${safeExtension}`,
    filters: [{ name: `${safeExtension.toUpperCase()} File`, extensions: [safeExtension] }]
  });
  if (result.canceled || !result.filePath) return null;

  let filePath = result.filePath;
  const suffix = `.${safeExtension}`.toLowerCase();
  if (!filePath.toLowerCase().endsWith(suffix)) filePath += suffix;
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}

async function saveTextPath({ filePath, source }) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  if (!filePath || !['.md', '.markdown', '.txt', '.json'].includes(extension)) throw new Error('A valid text page path is required.');
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
  return filePath;
}

async function copyDocumentAs({ sourcePath, suggestedName }) {
  if (!sourcePath || !DOCUMENT_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())) throw new Error('A valid page source path is required.');
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Page As',
    defaultPath: suggestedName || path.basename(sourcePath),
    filters: [{ name: `${extension.toUpperCase()} Page`, extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  let destination = result.filePath;
  if (!destination.toLowerCase().endsWith(`.${extension}`)) destination += `.${extension}`;
  await atomicWriteFile(destination, await fs.readFile(sourcePath));
  return destination;
}

const PAGE_EXPORT_FORMATS = {
  html: { extension: 'html', name: 'HTML Page' },
  markdown: { extension: 'md', name: 'Markdown Page' },
  json: { extension: 'json', name: 'JSON Page' },
  pdf: { extension: 'pdf', name: 'PDF Document' }
};

function printableHtml(source, baseUrl) {
  const safeBase = (() => {
    try {
      const url = new URL(String(baseUrl || ''));
      return ['file:', 'http:', 'https:'].includes(url.protocol) ? url.href.replace(/["<>]/g, '') : '';
    } catch { return ''; }
  })();
  const guards = `${safeBase ? `<base href="${safeBase}">` : ''}<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src file: data: blob: https: http:; style-src 'unsafe-inline' file: https: http:; font-src file: data: https: http:; media-src file: data: blob: https: http:; connect-src 'none'; object-src 'none'; frame-src 'none';">`;
  const html = String(source || '');
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${guards}`);
  if (/<html[\s>]/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${guards}</head>`);
  return `<!doctype html><html><head>${guards}</head><body>${html}</body></html>`;
}

async function renderPageToPdf(source, baseUrl) {
  if (String(source || '').length > 50_000_000) throw new Error('Printable pages must be smaller than 50 MB.');
  const dir = await ensureSessionTempDir();
  const tempPath = path.join(dir, `print-${process.pid}-${Date.now()}.html`);
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: false
    }
  });
  try {
    await atomicWriteFile(tempPath, printableHtml(source, baseUrl), 'utf8');
    await printWindow.loadFile(tempPath);
    await new Promise(resolve => setTimeout(resolve, 180));
    return await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
    try { await fs.unlink(tempPath); } catch {}
  }
}

async function exportPageAs({ format, suggestedName, source, sourcePath, sourceType, baseUrl }) {
  const normalized = String(format || '').toLowerCase();
  const type = PAGE_EXPORT_FORMATS[normalized];
  if (!type) throw new Error('Unsupported Page export format.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Page As',
    defaultPath: suggestedName || `page.${type.extension}`,
    filters: [{ name: type.name, extensions: [type.extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!filePath.toLowerCase().endsWith(`.${type.extension}`)) filePath += `.${type.extension}`;

  if (normalized === 'pdf') {
    if (sourceType === 'pdf') {
      if (!sourcePath || path.extname(sourcePath).toLowerCase() !== '.pdf') throw new Error('A valid PDF source is required.');
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile() || stat.size > 500_000_000) throw new Error('PDF pages must be files smaller than 500 MB.');
      await atomicWriteFile(filePath, await fs.readFile(sourcePath));
    } else {
      await atomicWriteFile(filePath, await renderPageToPdf(source, baseUrl));
    }
  } else {
    const text = String(source ?? '');
    if (text.length > 50_000_000) throw new Error('Text Page exports must be smaller than 50 MB.');
    await atomicWriteFile(filePath, text, 'utf8');
  }
  return filePath;
}

async function exportObjectAsset({ format, suggestedName, source }) {
  const normalized=String(format||'').toLowerCase();
  const types={
    png:{extension:'png',name:'PNG Image',mime:'image/png'},
    jpg:{extension:'jpg',name:'JPEG Image',mime:'image/jpeg'},
    svg:{extension:'svg',name:'SVG Image',mime:'image/svg+xml'}
  };
  const type=types[normalized];
  if(!type) throw new Error('Unsupported object export format.');
  const safeName=path.basename(String(suggestedName||`leaf-object.${type.extension}`)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-');
  const result=await dialog.showSaveDialog(mainWindow,{
    title:'Export selected object',
    defaultPath:safeName,
    filters:[{name:type.name,extensions:[type.extension]}]
  });
  if(result.canceled||!result.filePath)return null;
  let filePath=result.filePath;
  if(!filePath.toLowerCase().endsWith(`.${type.extension}`))filePath+=`.${type.extension}`;

  if(normalized==='svg'){
    const svg=String(source||'');
    if(svg.length>20_000_000||!/^\s*<svg\b/i.test(svg))throw new Error('Invalid SVG export payload.');
    await atomicWriteFile(filePath,svg,'utf8');
  }else{
    const payload=String(source||'');
    const match=payload.match(new RegExp(`^data:${type.mime.replace('/','\\/')};base64,([A-Za-z0-9+/=]+)$`));
    if(!match||match[1].length>120_000_000)throw new Error('Invalid raster export payload.');
    await atomicWriteFile(filePath,Buffer.from(match[1],'base64'));
  }
  return filePath;
}

async function writeObjectAssetAtPath(filePath, format, source) {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'svg') {
    const svg = String(source || '');
    if (svg.length > 20_000_000 || !/^\s*<svg\b/i.test(svg)) throw new Error('Invalid SVG export payload.');
    await atomicWriteFile(filePath, svg, 'utf8');
    return;
  }
  const mime = normalized === 'jpg' ? 'image/jpeg' : normalized === 'png' ? 'image/png' : null;
  const payload = String(source || '');
  const match = mime && payload.match(new RegExp(`^data:${mime.replace('/', '\\/')};base64,([A-Za-z0-9+/=]+)$`));
  if (!match || match[1].length > 120_000_000) throw new Error('Invalid raster export payload.');
  await atomicWriteFile(filePath, Buffer.from(match[1], 'base64'));
}

async function exportObjectAssets({ format, items }) {
  const normalized = String(format || '').toLowerCase();
  if (!['png', 'jpg', 'svg'].includes(normalized) || !Array.isArray(items) || !items.length || items.length > 200) throw new Error('Supply between 1 and 200 valid object export items.');
  let payloadSize = 0;
  for (const item of items) {
    const source = String(item?.source || '');payloadSize += source.length;
    if (normalized === 'svg' ? !/^\s*<svg\b/i.test(source) : !new RegExp(`^data:image/${normalized === 'jpg' ? 'jpeg' : 'png'};base64,`).test(source)) throw new Error('An object export payload is invalid.');
  }
  if (payloadSize > 200_000_000) throw new Error('The combined object export payload is too large.');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Export selected objects',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return [];
  const directory = result.filePaths[0];
  const used = new Set();
  const output = [];
  const staged = [];
  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};
      const base = path.basename(String(item.suggestedName || `leaf-object-${index + 1}.${normalized}`), path.extname(String(item.suggestedName || '')))
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || `leaf-object-${index + 1}`;
      let candidate = `${base}.${normalized}`;
      let suffix = 2;
      while (used.has(candidate.toLowerCase()) || fsSync.existsSync(path.join(directory, candidate))) candidate = `${base}-${suffix++}.${normalized}`;
      used.add(candidate.toLowerCase());
      const filePath = path.join(directory, candidate);
      const stagePath = path.join(directory, `.${candidate}.leaf-stage-${process.pid}-${Date.now()}-${index}`);
      await writeObjectAssetAtPath(stagePath, normalized, item.source);
      staged.push({ stagePath, filePath });
    }
    for (const item of staged) { await fs.rename(item.stagePath, item.filePath);output.push(item.filePath); }
    return output;
  } catch (error) {
    await Promise.allSettled(staged.map(item => fs.unlink(item.stagePath)));
    await Promise.allSettled(output.map(filePath => fs.unlink(filePath)));
    throw error;
  }
}

async function readLocalAssetDataUrl(rawUrl) {
  const url = new URL(String(rawUrl || ''));
  if (url.protocol !== 'file:') throw new Error('Only local file assets may be embedded.');
  const filePath = fileURLToPath(url);
  const extension = path.extname(filePath).toLowerCase();
  const mime = ({ '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.svg':'image/svg+xml' })[extension];
  if (!mime) throw new Error('Unsupported local image type.');
  const data = await fs.readFile(filePath);
  if (data.length > 30_000_000) throw new Error('Local image is too large to embed.');
  return `data:${mime};base64,${data.toString('base64')}`;
}

async function captureRendererRegion({ rect, scale = 1, format = 'png' }) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('The Leaf window is unavailable.');
  if (!['png', 'jpg'].includes(format) || ![rect?.x, rect?.y, rect?.width, rect?.height].every(value => Number.isFinite(Number(value)))) throw new Error('Invalid renderer capture request.');
  const bounds = mainWindow.getContentBounds();
  const x = Math.max(0, Math.floor(Number(rect?.x) || 0));
  const y = Math.max(0, Math.floor(Number(rect?.y) || 0));
  const width = Math.max(1, Math.min(bounds.width - x, Math.ceil(Number(rect?.width) || 0)));
  const height = Math.max(1, Math.min(bounds.height - y, Math.ceil(Number(rect?.height) || 0)));
  if (width <= 0 || height <= 0 || width * height > 80_000_000) throw new Error('The selected object is outside the visible document area.');
  let image = await mainWindow.webContents.capturePage({ x, y, width, height });
  const normalizedScale = Math.max(0.25, Math.min(16, Number(scale) || 1));
  if ((width * normalizedScale) * (height * normalizedScale) > 80_000_000) throw new Error('Export dimensions are too large. Choose a smaller scale.');
  if (normalizedScale !== 1) image = image.resize({ width: Math.max(1, Math.round(width * normalizedScale)), height: Math.max(1, Math.round(height * normalizedScale)), quality: 'best' });
  return format === 'jpg'
    ? `data:image/jpeg;base64,${image.toJPEG(92).toString('base64')}`
    : `data:image/png;base64,${image.toPNG().toString('base64')}`;
}

function setDocumentFullscreen(enabled) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setFullScreen(Boolean(enabled));
  return mainWindow.isFullScreen();
}

function writeRichClipboard({ text, html }) {
  clipboard.write({
    text: String(text ?? ''),
    html: String(html ?? '')
  });
  return true;
}

function writeTextClipboard(text) {
  clipboard.writeText(String(text ?? ''));
  return true;
}

async function openProjectFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Leaf Project',
    properties: ['openFile'],
    filters: [{ name: 'Leaf Project', extensions: ['prj', 'leaf', 'hbeproj', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 100_000_000) throw new Error('Leaf projects must be files smaller than 100 MB.');
  const raw = await fs.readFile(filePath, 'utf8');
  return { filePath, project: JSON.parse(raw) };
}

async function saveProjectFile({ filePath, project }) {
  if (!filePath) throw new Error('No project file path.');
  await atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
}

async function saveProjectFileAs({ suggestedName, project }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project As',
    defaultPath: suggestedName || 'project.prj',
    filters: [{ name: 'Leaf Project', extensions: ['prj'] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!/\.prj$/i.test(filePath)) filePath += '.prj';
  await atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
}

async function readProjectAtPath(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 100_000_000) throw new Error('Leaf projects must be files smaller than 100 MB.');
  const raw = await fs.readFile(filePath, 'utf8');
  return { filePath, project: JSON.parse(raw) };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1660,
    height: 1020,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#17191d',
    title: 'Leaf',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('enter-full-screen', () => mainWindow?.webContents.send('window:documentFullscreenChanged', true));
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('window:documentFullscreenChanged', false));
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('file:importHtml', openHtmlFile);
  ipcMain.handle('file:readHtmlPath', (_e, filePath) => readHtmlPath(filePath));
  ipcMain.handle('file:importPages', openDocumentFiles);
  ipcMain.handle('file:importDocuments', openDocumentFiles); // v0.5.14 compatibility
  ipcMain.handle('file:readPagePath', (_e, filePath) => readDocumentPath(filePath));
  ipcMain.handle('file:readDocumentPath', (_e, filePath) => readDocumentPath(filePath)); // v0.5.14 compatibility
  ipcMain.handle('file:exportHtml', (_e, payload) => exportHtml(payload));
  ipcMain.handle('file:saveHtmlPath', (_e, payload) => saveHtmlPath(payload));
  ipcMain.handle('file:exportText', (_e, payload) => exportTextFile(payload));
  ipcMain.handle('file:saveTextPath', (_e, payload) => saveTextPath(payload));
  ipcMain.handle('file:copyDocumentAs', (_e, payload) => copyDocumentAs(payload));
  ipcMain.handle('file:exportPageAs', (_e, payload) => exportPageAs(payload));
  ipcMain.handle('file:exportObjectAsset', (_e, payload) => exportObjectAsset(payload));
  ipcMain.handle('file:exportObjectAssets', (_e, payload) => exportObjectAssets(payload));
  ipcMain.handle('file:readLocalAssetDataUrl', (_e, url) => readLocalAssetDataUrl(url));
  ipcMain.handle('window:captureRegion', (_e, payload) => captureRendererRegion(payload));
  ipcMain.handle('window:setDocumentFullscreen', (_e, enabled) => setDocumentFullscreen(enabled));
  ipcMain.handle('clipboard:writeRich', (_e, payload) => writeRichClipboard(payload));
  ipcMain.handle('clipboard:writeText', (_e, text) => writeTextClipboard(text));
  ipcMain.handle('project:open', openProjectFile);
  ipcMain.handle('project:readPath', (_e, filePath) => readProjectAtPath(filePath));
  ipcMain.handle('project:save', (_e, payload) => saveProjectFile(payload));
  ipcMain.handle('project:saveAs', (_e, payload) => saveProjectFileAs(payload));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', cleanupSessionTempDir);
