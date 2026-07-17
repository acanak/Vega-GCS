'use strict';
// Roost GCS masaüstü (Electron) ana süreç.
// - Derlenmiş web uygulamasını yerel http ile sunar (PWA/relatif yollar sorunsuz).
// - MAVLink köprüsünü (UDP:14550 <-> ws:8080) başlatır (ağ telemetrisi).
// - WebSerial'i (USB otopilot) etkinleştirir.
const { app, BrowserWindow, session } = require('electron');
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
  // WebSerial: navigator.serial.requestPort() -> ilk seri portu ver (v1). Gerçek seçici sonradan eklenebilir.
  win.webContents.session.on('select-serial-port', (event, portList, callback) => {
    event.preventDefault();
    callback(portList.length ? portList[0].portId : '');
  });
  win.setMenuBarVisibility(false);
  await win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
app.on('window-all-closed', () => { app.quit(); });
