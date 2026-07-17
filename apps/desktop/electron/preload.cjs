'use strict';
const { contextBridge } = require('electron');
// Uygulamaya masaüstü olduğunu ve platformu bildir (opsiyonel kullanım).
contextBridge.exposeInMainWorld('roostDesktop', {
  isDesktop: true,
  platform: process.platform,
});
