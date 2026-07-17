'use strict';
// Gömülü MAVLink köprüsü (masaüstü): UDP/TCP telemetri <-> WebSocket :8080.
// USB otopilot WebSerial ile doğrudan çalışır (köprü gerekmez); bu köprü ağ/UDP telemetri + firmware proxy içindir.
const { WebSocketServer } = require('ws');
const dgram = require('node:dgram');
const net = require('node:net');
const http = require('node:http');
const tls = require('node:tls');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const WS_PORT = Number(process.env.WS_PORT || 8080);
const MODE = process.env.MODE || 'udp';
const UDP_PORT = Number(process.env.UDP_PORT || 14550);
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = Number(process.env.TCP_PORT || 5760);
const RETRY_MS = Number(process.env.RETRY_MS || 1000);

// ---- ArduPilot firmware proxy (CORS'u aşmak için) ----
const FW_HOST = 'firmware.ardupilot.org';
const FW_MANIFEST = 'https://' + FW_HOST + '/manifest.json.gz';
let fwManifestCache = null;
const FW_CACHE_MS = 60 * 60 * 1000;

function reduceManifest(json) {
  const arr = json && Array.isArray(json.firmware) ? json.firmware : [];
  const out = [];
  for (const e of arr) {
    if (e.format !== 'apj') continue;
    out.push({
      vehicle: e.vehicletype || '', board: e.platform || '', board_id: e.board_id != null ? e.board_id : null,
      rel: e['mav-firmware-version-type'] || '', ver: e['mav-firmware-version'] || e['mav-firmware-version-str'] || '',
      url: e.url || '', sha: (e['git-sha'] || '').slice(0, 8), latest: e.latest ? 1 : 0,
    });
  }
  return out;
}
// ---- Proxy tespiti (kurumsal ağlarda Node doğrudan çıkamaz) ----
let proxyResolved;
function normProxy(v) { return v ? (/^https?:\/\//i.test(v) ? v : 'http://' + v) : null; }
async function getProxy() {
  if (proxyResolved !== undefined) return proxyResolved;
  const env = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.FW_PROXY;
  if (env) { proxyResolved = normProxy(env); console.log('[fw] proxy (env):', proxyResolved); return proxyResolved; }
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf8' });
      if (/HTTPSEnable\s*:\s*1/.test(out)) {
        const h = /HTTPSProxy\s*:\s*(\S+)/.exec(out); const p = /HTTPSPort\s*:\s*(\d+)/.exec(out);
        if (h) { proxyResolved = 'http://' + h[1] + ':' + (p ? p[1] : '8080'); console.log('[fw] proxy (sistem):', proxyResolved); return proxyResolved; }
      }
      const pac = /ProxyAutoConfigURLString\s*:\s*(\S+)/.exec(out);
      if (/ProxyAutoConfigEnable\s*:\s*1/.test(out) && pac) {
        const r = await fetch(pac[1]); const txt = await r.text();
        const m = /PROXY\s+([a-z0-9._-]+:\d+)/i.exec(txt);
        if (m) { proxyResolved = 'http://' + m[1]; console.log('[fw] proxy (PAC):', proxyResolved); return proxyResolved; }
      }
    } catch (e) { console.error('[fw] proxy tespiti başarısız:', String(e && e.message || e)); }
  }
  proxyResolved = null;
  return proxyResolved;
}

// Kurumsal TLS-inceleme proxy'leri kendi CA'larını sunar; sistem (anahtar zinciri) CA'larını ekle.
let caCache = null;
function trustedCA() {
  if (caCache) return caCache;
  try { const g = tls.getCACertificates; caCache = g ? [...g('bundled'), ...g('system')] : undefined; }
  catch { caCache = undefined; }
  return caCache;
}
function dechunk(buf) {
  const out = []; let i = 0;
  while (i < buf.length) {
    const j = buf.indexOf('\r\n', i);
    if (j < 0) break;
    const size = parseInt(buf.slice(i, j).toString('latin1').trim(), 16);
    if (!Number.isFinite(size) || size === 0) break;
    out.push(buf.slice(j + 2, j + 2 + size));
    i = j + 2 + size + 2;
  }
  return Buffer.concat(out);
}
function proxyGet(targetUrl, proxyUrl, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) { reject(new Error('çok fazla yönlendirme')); return; }
    const t = new URL(targetUrl); const p = new URL(proxyUrl);
    const hostport = t.hostname + ':' + (t.port || 443);
    const req = http.request({ host: p.hostname, port: Number(p.port) || 80, method: 'CONNECT', path: hostport, headers: { Host: hostport } });
    req.setTimeout(30000, () => req.destroy(new Error('proxy zaman aşımı')));
    req.on('error', reject);
    req.on('connect', (resC, socket) => {
      if (resC.statusCode !== 200) { socket.destroy(); reject(new Error('CONNECT ' + resC.statusCode)); return; }
      const s = tls.connect({ socket, servername: t.hostname, ca: trustedCA() }, () => {
        s.write('GET ' + (t.pathname + t.search) + ' HTTP/1.1\r\nHost: ' + t.hostname + '\r\nUser-Agent: RoostGCS/1.0\r\nAccept: */*\r\nConnection: close\r\n\r\n');
      });
      const chunks = [];
      s.on('data', (d) => chunks.push(d));
      s.on('error', reject);
      s.on('end', () => {
        const raw = Buffer.concat(chunks);
        const sep = raw.indexOf('\r\n\r\n');
        if (sep < 0) { reject(new Error('bozuk yanıt')); return; }
        const head = raw.slice(0, sep).toString('latin1');
        let body = raw.slice(sep + 4);
        const status = Number(head.split('\r\n')[0].split(' ')[1]);
        if (status >= 300 && status < 400) {
          const loc = /^location:\s*(\S+)/im.exec(head);
          if (loc) { resolve(proxyGet(new URL(loc[1], targetUrl).href, proxyUrl, depth + 1)); return; }
        }
        if (status !== 200) { reject(new Error('HTTP ' + status + ' @ ' + targetUrl)); return; }
        if (/^transfer-encoding:\s*chunked/im.test(head)) body = dechunk(body);
        if (/^content-encoding:\s*gzip/im.test(head)) { try { body = zlib.gunzipSync(body); } catch { /* yok say */ } }
        resolve(body);
      });
    });
    req.end();
  });
}
async function fetchBuf(url) {
  const proxy = await getProxy();
  if (proxy) return proxyGet(url, proxy);
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'RoostGCS/1.0', accept: '*/*' }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(to); }
}
async function getManifest() {
  if (fwManifestCache && (Date.now() - fwManifestCache.at) < FW_CACHE_MS) return fwManifestCache.list;
  let buf;
  try { buf = await fetchBuf(FW_MANIFEST); }
  catch (e1) {
    try { buf = await fetchBuf('https://' + FW_HOST + '/manifest.json'); }
    catch (e2) { throw new Error((e1 && e1.message || e1) + ' / ' + (e2 && e2.message || e2)); }
  }
  let text;
  try { text = zlib.gunzipSync(buf).toString('utf8'); } catch { text = buf.toString('utf8'); }
  const list = reduceManifest(JSON.parse(text));
  fwManifestCache = { at: Date.now(), list };
  return list;
}
function handleHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/fw/manifest') {
    getManifest().then((list) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: list.length, list }));
    }).catch((e) => { const detail = String((e && e.message) || e); console.error('[fw] manifest hatası:', detail); res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'manifest', detail })); });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/fw/download')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const target = u.searchParams.get('url') || '';
      const parsed = new URL(target);
      if (parsed.hostname !== FW_HOST) { res.writeHead(403); res.end('bad host'); return; }
      fetchBuf(target).then((buf) => {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': buf.length });
        res.end(buf);
      }).catch((e) => { const detail = String((e && e.message) || e); console.error('[fw] indirme hatası:', detail); res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'download', detail })); });
    } catch (e) { res.writeHead(400); res.end(String((e && e.message) || e)); }
    return;
  }
  res.writeHead(404); res.end();
}

const httpServer = http.createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (d) => sendToVehicle(d));
});
function broadcast(buf) { for (const ws of clients) if (ws.readyState === 1) ws.send(buf); }
let sendToVehicle = () => {};

if (MODE === 'udp') {
  const sock = dgram.createSocket('udp4');
  let remote = null;
  sock.on('message', (m, r) => { remote = r; broadcast(m); });
  sock.on('error', () => {});
  sock.bind(UDP_PORT);
  sendToVehicle = (buf) => { if (remote) sock.send(buf, remote.port, remote.address); };
} else {
  let sock = null; let connected = false;
  const connect = () => {
    sock = net.connect(TCP_PORT, TCP_HOST);
    sock.on('connect', () => { connected = true; });
    sock.on('data', (d) => broadcast(d));
    sock.on('error', () => {});
    sock.on('close', () => { connected = false; sock.removeAllListeners(); setTimeout(connect, RETRY_MS); });
  };
  connect();
  sendToVehicle = (buf) => { if (connected && sock) sock.write(buf); };
}

httpServer.listen(WS_PORT);

module.exports = { WS_PORT };
