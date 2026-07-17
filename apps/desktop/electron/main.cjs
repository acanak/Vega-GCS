'use strict';
// Vega GCS masaüstü (Electron) ana süreç.
// - Derlenmiş web uygulamasını yerel http ile sunar (PWA/relatif yollar sorunsuz).
// - MAVLink köprüsünü (UDP:14550 <-> ws:8080) başlatır (ağ telemetrisi).
// - WebSerial'i (USB otopilot) etkinleştirir.
const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

require('./bridge.cjs'); // gömülü MAVLink köprüsü

const DIST = app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(__dirname, '..', '..', 'web-gcs', 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

function serveDist() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(DIST, p);
      if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { // SPA geri dönüş
          fs.readFile(path.join(DIST, 'index.html'), (e2, d2) => {
            if (e2) { res.writeHead(404); res.end('build yok — önce web-gcs build alın'); }
            else { res.writeHead(200, { 'content-type': 'text/html' }); res.end(d2); }
          });
          return;
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + srv.address().port));
  });
}

async function createWindow() {
  const url = await serveDist();
  const ses = session.defaultSession;
  ses.setPermissionCheckHandler(() => true);
  ses.setDevicePermissionHandler(() => true);
  const win = new BrowserWindow({
    width: 1440, height: 900, backgroundColor: '#080b0f',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true },
  });
  // WebSerial port seçici: Electron'da tarayıcı seçicisi yoktur; portları renderer'a
  // gönderip kullanıcının seçmesini bekleriz. İMZA 4 argüman: (event, portList, webContents, callback).
  let serialCallback = null;
  let serialPorts = [];
  const mapPort = (p) => ({ portId: p.portId, portName: p.portName, displayName: p.displayName, vendorId: p.vendorId, productId: p.productId, serialNumber: p.serialNumber });
  const sendPorts = () => { if (!win.isDestroyed()) win.webContents.send('serial:ports', serialPorts.map(mapPort)); };
  win.webContents.session.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    // Önceki bekleyen seçim varsa iptal et
    if (serialCallback) { try { serialCallback(''); } catch { /* */ } }
    serialCallback = callback;
    serialPorts = portList.slice();
    // Her zaman seçici göster (tarayıcıdaki gibi). Kullanıcı bir port seçer ya da iptal eder.
    sendPorts();
  });
  win.webContents.session.on('serial-port-added', (_e, port) => { serialPorts.push(port); sendPorts(); });
  win.webContents.session.on('serial-port-removed', (_e, port) => { serialPorts = serialPorts.filter((p) => p.portId !== port.portId); sendPorts(); });
  ipcMain.on('serial:choose', (_e, portId) => { if (serialCallback) { serialCallback(portId || ''); serialCallback = null; } });
  ipcMain.on('serial:cancel', () => { if (serialCallback) { serialCallback(''); serialCallback = null; } });
  // WebUSB (DFU): navigator.usb.requestDevice() -> ST DFU (VID 0x0483) tercih, yoksa ilk aygıt.
  win.webContents.session.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const list = details.deviceList || [];
    const st = list.find((d) => d.vendorId === 0x0483);
    callback((st || list[0])?.deviceId);
  });
  ses.on('usb-device-added', () => {});
  ses.on('usb-device-removed', () => {});
  // Harici linkler (About: GitHub/Releases/Sponsor) sistem tarayıcısında açılsın
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) { void shell.openExternal(u); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.setMenuBarVisibility(false);
  await win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
app.on('window-all-closed', () => { app.quit(); });
