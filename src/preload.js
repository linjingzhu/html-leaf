const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importHtml: () => ipcRenderer.invoke('file:importHtml'),
  readHtmlPath: (filePath) => ipcRenderer.invoke('file:readHtmlPath', filePath),
  readDroppedHtml: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) throw new Error('Dropped file is not backed by a local path.');
    return ipcRenderer.invoke('file:readHtmlPath', filePath);
  },
  exportHtml: (payload) => ipcRenderer.invoke('file:exportHtml', payload),
  saveHtmlPath: (payload) => ipcRenderer.invoke('file:saveHtmlPath', payload),
  exportText: (payload) => ipcRenderer.invoke('file:exportText', payload),
  exportObjectAsset: (payload) => ipcRenderer.invoke('file:exportObjectAsset', payload),
  writeRichClipboard: (payload) => ipcRenderer.invoke('clipboard:writeRich', payload),
  writeTextClipboard: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  openProject: () => ipcRenderer.invoke('project:open'),
  readProjectPath: (filePath) => ipcRenderer.invoke('project:readPath', filePath),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  saveProjectAs: (payload) => ipcRenderer.invoke('project:saveAs', payload)
});
