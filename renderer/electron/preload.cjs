const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPrinter', {
  list: () => ipcRenderer.invoke('printer:list'),
  test: (printerName) => ipcRenderer.invoke('printer:test', { printerName }),
  print: (request) => ipcRenderer.invoke('printer:print', request),
});

contextBridge.exposeInMainWorld('desktopRuntime', {
  getStartupStatus: () => ipcRenderer.invoke('runtime:startup-status'),
});
