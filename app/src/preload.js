const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('socketAI', {
  saveStl: (stlText) => ipcRenderer.invoke('save-stl', stlText),
  saveHtmlReport: (htmlText) => ipcRenderer.invoke('save-html-report', htmlText)
});
