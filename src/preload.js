const { contextBridge, ipcRenderer, webUtils } = require('electron');

// This preload is sandboxed, so require() resolves only Electron's allowlist.
// Reading package.json from disk here throws before the contextBridge surface
// is exposed, which leaves the renderer without electronAPI entirely.
async function startupInfo() {
  let appVersion = null;
  try {
    appVersion = await ipcRenderer.invoke('app:version');
  } catch {}
  return {
    diagnostics: 'preload-startup-info-v1',
    appVersion,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    sandboxed: process.sandboxed === true
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  startupInfo: () => Promise.resolve(startupInfo()),
  importHtml: () => ipcRenderer.invoke('file:importHtml'),
  readHtmlPath: (filePath) => ipcRenderer.invoke('file:readHtmlPath', filePath),
  readDroppedHtml: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) throw new Error('Dropped file is not backed by a local path.');
    return ipcRenderer.invoke('file:readHtmlPath', filePath);
  },
  importPages: () => ipcRenderer.invoke('file:importPages'),
  importDocuments: () => ipcRenderer.invoke('file:importDocuments'),
  readDroppedDocument: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) throw new Error('Dropped file is not backed by a local path.');
    return ipcRenderer.invoke('file:readDocumentPath', filePath);
  },
  readDroppedPage: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) return Promise.reject(new Error('A valid dropped page is required.'));
    return ipcRenderer.invoke('file:readPagePath', filePath);
  },
  // Following a link inside a preview needs both halves: resolve the href
  // against the linking Page's base, then read that file if it is not open yet.
  resolveLinkTarget: (payload) => ipcRenderer.invoke('file:resolveLinkTarget', payload),
  readPageAtPath: (filePath) => {
    if (!filePath) return Promise.reject(new Error('A page path is required.'));
    return ipcRenderer.invoke('file:readPagePath', filePath);
  },
  openExternalLink: (url) => ipcRenderer.invoke('shell:openExternal', url),
  // Fetching a Page over the network. Every guard lives in main - the renderer
  // cannot widen what is reachable by passing a different URL.
  fetchPageAtUrl: (url) => {
    if (!url) return Promise.reject(new Error('A URL is required.'));
    return ipcRenderer.invoke('net:fetchPage', url);
  },
  fetchStylesheetText: (url) => {
    if (!url) return Promise.reject(new Error('A stylesheet URL is required.'));
    return ipcRenderer.invoke('net:fetchStylesheet', url);
  },
  downloadFonts: (payload) => ipcRenderer.invoke('fonts:download', payload),
  onPreviewFrameNavigated: (callback) => {
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('preview:frameNavigated', listener);
    return () => ipcRenderer.removeListener('preview:frameNavigated', listener);
  },
  armPdfAnnotationSave: (payload) => ipcRenderer.invoke('pdf:armAnnotationSave', payload),
  onPdfAnnotationSaved: (callback) => {
    const listener = (_event, result) => callback(result || {});
    ipcRenderer.on('pdf:annotationSaved', listener);
    return () => ipcRenderer.removeListener('pdf:annotationSaved', listener);
  },
  exportHtml: (payload) => ipcRenderer.invoke('file:exportHtml', payload),
  saveHtmlPath: (payload) => ipcRenderer.invoke('file:saveHtmlPath', payload),
  exportText: (payload) => ipcRenderer.invoke('file:exportText', payload),
  saveTextPath: (payload) => ipcRenderer.invoke('file:saveTextPath', payload),
  copyDocumentAs: (payload) => ipcRenderer.invoke('file:copyDocumentAs', payload),
  exportPageAs: (payload) => ipcRenderer.invoke('file:exportPageAs', payload),
  exportObjectAsset: (payload) => ipcRenderer.invoke('file:exportObjectAsset', payload),
  exportObjectAssets: (payload) => ipcRenderer.invoke('file:exportObjectAssets', payload),
  readLocalAssetDataUrl: (url) => ipcRenderer.invoke('file:readLocalAssetDataUrl', url),
  captureRegion: (payload) => ipcRenderer.invoke('window:captureRegion', payload),
  setDocumentFullscreen: (enabled) => ipcRenderer.invoke('window:setDocumentFullscreen', enabled),
  onDocumentFullscreenChanged: (callback) => {
    const listener = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on('window:documentFullscreenChanged', listener);
    return () => ipcRenderer.removeListener('window:documentFullscreenChanged', listener);
  },
  writeRichClipboard: (payload) => ipcRenderer.invoke('clipboard:writeRich', payload),
  writeTextClipboard: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  openProject: () => ipcRenderer.invoke('project:open'),
  readProjectPath: (filePath) => ipcRenderer.invoke('project:readPath', filePath),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('project:saveAs', payload)
});
