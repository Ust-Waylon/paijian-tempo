const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tempoDesktop', {
  platform: process.platform,
  pin: (pinned) => ipcRenderer.invoke('tempo:pin', Boolean(pinned)),
  playing: (playing) => ipcRenderer.send('tempo:playing', Boolean(playing)),
  theme: (dark) => ipcRenderer.send('tempo:theme', Boolean(dark)),
  onAction: (callback) =>
    ipcRenderer.on('tempo:action', (_event, action) => callback(action)),
});
