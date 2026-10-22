const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clock', {
  mouse: (type) => ipcRenderer.send('widget-mouse', type),
  action: (a) => ipcRenderer.send('panel-action', a),
  hidePanel: () => ipcRenderer.send('panel-hide'),
  contextMenu: () => ipcRenderer.send('widget-context-menu'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onPanelShown: (cb) => ipcRenderer.on('panel-shown', () => cb()),
});
