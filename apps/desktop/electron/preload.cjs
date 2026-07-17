'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Uygulamaya masaüstü olduğunu, platformu ve WebSerial port seçici köprüsünü bildir.
contextBridge.exposeInMainWorld('roostDesktop', {
  isDesktop: true,
  platform: process.platform,
  serial: {
    // Ana süreç port listesini gönderdiğinde çağrılır; aboneliği kaldıran fonksiyon döner.
    onPorts: (cb) => {
      const listener = (_e, ports) => cb(ports);
      ipcRenderer.on('serial:ports', listener);
      return () => ipcRenderer.removeListener('serial:ports', listener);
    },
    choose: (portId) => ipcRenderer.send('serial:choose', portId),
    cancel: () => ipcRenderer.send('serial:cancel'),
  },
});
