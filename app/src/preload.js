const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('socketAI', {
  saveStl: (stlText) => ipcRenderer.invoke('save-stl', stlText)
});
