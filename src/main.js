const { app, BrowserWindow, dialog, ipcMain, clipboard } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mainWindow;
let sessionTempDir = null;
const initialHtmlSnapshots = new Map();

app.setName('Leaf');
if (process.platform === 'win32') app.setAppUserModelId('com.leaf.editor');

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

async function openHtmlFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import HTML',
    properties: ['openFile'],
    filters: [{ name: 'HTML Documents', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return readHtmlPath(filePath);
}

async function exportHtml({ suggestedName, source }) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export HTML',
    defaultPath: suggestedName || 'page.html',
    filters: [{ name: 'HTML Document', extensions: ['html', 'htm'] }]
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
    defaultPath: suggestedName || `document.${safeExtension}`,
    filters: [{ name: `${safeExtension.toUpperCase()} File`, extensions: [safeExtension] }]
  });
  if (result.canceled || !result.filePath) return null;

  let filePath = result.filePath;
  const suffix = `.${safeExtension}`.toLowerCase();
  if (!filePath.toLowerCase().endsWith(suffix)) filePath += suffix;
  await atomicWriteFile(filePath, String(source ?? ''), 'utf8');
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
    title: 'Open Project',
    properties: ['openFile'],
    filters: [{ name: 'Leaf Document', extensions: ['hbeproj', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
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
    defaultPath: suggestedName || 'project.hbeproj',
    filters: [{ name: 'Leaf Document', extensions: ['hbeproj'] }]
  });
  if (result.canceled || !result.filePath) return null;
  let filePath = result.filePath;
  if (!/\.hbeproj$/i.test(filePath)) filePath += '.hbeproj';
  await atomicWriteFile(filePath, JSON.stringify(project, null, 2), 'utf8');
  return filePath;
}

async function readProjectAtPath(filePath) {
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
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('file:importHtml', openHtmlFile);
  ipcMain.handle('file:readHtmlPath', (_e, filePath) => readHtmlPath(filePath));
  ipcMain.handle('file:exportHtml', (_e, payload) => exportHtml(payload));
  ipcMain.handle('file:saveHtmlPath', (_e, payload) => saveHtmlPath(payload));
  ipcMain.handle('file:exportText', (_e, payload) => exportTextFile(payload));
  ipcMain.handle('file:exportObjectAsset', (_e, payload) => exportObjectAsset(payload));
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
