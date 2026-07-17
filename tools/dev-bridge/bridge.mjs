#!/usr/bin/env node
// Gelistirme koprusu: aracin MAVLink akisini (UDP veya TCP) tarayiciya WebSocket ile aktarir.
// Tarayici ham TCP/UDP acamadigi icin bu kopru zorunludur (bkz. PLAN.md 2. bolum).
//
// Mod secimi (oncelik: CLI argumani > ortam degiskeni MODE > varsayilan udp):
//   node tools/dev-bridge/bridge.mjs tcp        (veya --tcp, --mode=tcp)
//   node tools/dev-bridge/bridge.mjs udp        (veya --udp, --mode=udp)
//   MODE=tcp TCP_PORT=5760 node tools/dev-bridge/bridge.mjs
//
// TCP modu SITL/arac hazir degilse ya da yeniden baslarsa otomatik yeniden baglanir.

import { WebSocketServer } from 'ws';
import dgram from 'node:dgram';
import net from 'node:net';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';

// --- Mod: CLI > env > varsayilan ---
function pickMode() {
  for (const a of process.argv.slice(2)) {
    if (a === 'tcp' || a === '--tcp') return 'tcp';
    if (a === 'udp' || a === '--udp') return 'udp';
    if (a.startsWith('--mode=')) return a.slice(7);
  }
  return process.env.MODE ?? 'udp';
}
const MODE = pickMode() === 'tcp' ? 'tcp' : 'udp';

const WS_PORT = Number(process.env.WS_PORT ?? 8080);
const UDP_PORT = Number(process.env.UDP_PORT ?? 14550);
const TCP_HOST = process.env.TCP_HOST ?? '127.0.0.1';
const TCP_PORT = Number(process.env.TCP_PORT ?? 5760);
const RETRY_MS = Number(process.env.RETRY_MS ?? 1000);

// --- LLM asistan proxy (cok backend: codex / openai / anthropic) ---
// CHAT_BACKEND: codex | openai | anthropic | auto (varsayilan auto)
//   codex  -> ChatGPT ABONELIGI ile Codex CLI (once `codex login`). CODEX_CMD ile komut ozellestirilebilir.
//   openai -> OPENAI_API_KEY (API faturasi). OPENAI_MODEL.
//   anthropic -> ANTHROPIC_API_KEY. CHAT_MODEL.
const CHAT_BACKEND = process.env.CHAT_BACKEND ?? 'auto';
const CHAT_MODEL = process.env.CHAT_MODEL ?? 'claude-haiku-4-5-20251001';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const CODEX_CMD = process.env.CODEX_CMD ?? 'codex exec --skip-git-repo-check';
const CHAT_SYSTEM =
  'Sen bir ArduPilot web yer kontrol istasyonu (GCS) asistanisin. CONTEXT canli telemetriyi icerir. ' +
  'Kullanicinin dilinde KISA cevap ver. Dosya duzenleme/komut calistirma YAPMA; sadece yanit uret. ' +
  'Bir ARAC EYLEMI gerekiyorsa, yanitin SON satirinda TAM olarak "@CMD " ardindan tek satir JSON yaz (baska metin ekleme). Desteklenen komutlar:\n' +
  '{"type":"arm"} {"type":"disarm"} (kullanici israr ederse "force":true ekle)\n' +
  '{"type":"mode","name":"RTL"} {"type":"takeoff","alt":50} {"type":"speed","value":15}\n' +
  '{"type":"setParam","name":"WPNAV_SPEED","value":500} {"type":"getParam","name":"RC1_MAX"}\n' +
  'Sorulara CONTEXT ile cevap ver; parametre degeri UYDURMA. arm/kalkis gibi tehlikeli komutlari yalniz kullanici acikca isterse ver.';

let codexAvailable = false;
{
  const bin = CODEX_CMD.split(/\s+/)[0];
  execFile(bin, ['--version'], (err) => { codexAvailable = !err; });
}
function backend() {
  if (CHAT_BACKEND !== 'auto') return CHAT_BACKEND;
  if (codexAvailable) return 'codex';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'none';
}
function backendModel(be) {
  return be === 'codex' ? CODEX_CMD : be === 'openai' ? OPENAI_MODEL : be === 'anthropic' ? CHAT_MODEL : '-';
}

async function callAnthropic(messages, context) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CHAT_MODEL, max_tokens: 400, system: CHAT_SYSTEM + '\n\nCONTEXT:\n' + context, messages }),
  });
  if (!r.ok) throw new Error('anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
async function callOpenAI(messages, context) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: OPENAI_MODEL, max_tokens: 400, messages: [{ role: 'system', content: CHAT_SYSTEM + '\n\nCONTEXT:\n' + context }, ...messages] }),
  });
  if (!r.ok) throw new Error('openai ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? '').trim();
}
// ChatGPT aboneligi ile Codex CLI (codex login sonrasi). Prompt stdin'den verilir, stdout doner.
function callCodex(messages, context) {
  return new Promise((resolve, reject) => {
    const parts = CODEX_CMD.split(/\s+/);
    const convo = messages.map((m) => (m.role === 'user' ? 'Kullanıcı' : 'Asistan') + ': ' + m.content).join('\n');
    const prompt = CHAT_SYSTEM + '\n\nCONTEXT:\n' + context + '\n\n' + convo + '\n\nAsistan olarak kısa yanıt ver:';
    // codex exec prompt'u pozisyonel argüman olarak alır: `codex exec "..."`
    const child = spawn(parts[0], [...parts.slice(1), prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('codex zaman aşımı')); }, 90000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(to); reject(e); });
    child.on('close', (code) => {
      clearTimeout(to);
      const text = out.trim();
      if (text) resolve(text);
      else reject(new Error('codex boş çıktı (kod ' + code + '): ' + err.slice(0, 200)));
    });
  });
}

async function handleChat(req, res) {
  const be = backend();
  if (be === 'none') { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'no_backend' })); return; }
  let body = '';
  for await (const ch of req) body += ch;
  let data;
  try { data = JSON.parse(body || '{}'); } catch { res.writeHead(400); res.end('{}'); return; }
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const context = String(data.context ?? '');
  try {
    const text = be === 'codex' ? await callCodex(messages, context)
      : be === 'openai' ? await callOpenAI(messages, context)
      : await callAnthropic(messages, context);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text, backend: be }));
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: be, detail: String((e && e.message) || e) }));
  }
}

function handleHttp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST' && req.url === '/chat') { void handleChat(req, res); return; }
  if (req.method === 'GET' && req.url === '/chat') {
    const be = backend();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, llm: be !== 'none', backend: be, model: backendModel(be) }));
    return;
  }
  res.writeHead(404); res.end();
}

const httpServer = http.createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[ws] istemci baglandi (' + clients.size + ')');
  ws.on('close', () => {
    clients.delete(ws);
    console.log('[ws] istemci ayrildi (' + clients.size + ')');
  });
  ws.on('message', (data) => sendToVehicle(data));
});

function broadcast(buf) {
  for (const ws of clients) if (ws.readyState === 1) ws.send(buf);
}

let sendToVehicle = () => {};

if (MODE === 'udp') {
  const sock = dgram.createSocket('udp4');
  let remote = null;
  sock.on('message', (msg, rinfo) => {
    remote = rinfo;
    broadcast(msg);
  });
  sock.on('error', (e) => console.error('[udp] hata:', e.message));
  sock.bind(UDP_PORT, () => console.log('[udp] dinleniyor :' + UDP_PORT));
  sendToVehicle = (buf) => {
    if (remote) sock.send(buf, remote.port, remote.address);
  };
} else {
  // TCP: yeniden baglanabilen istemci (SITL hazir degilse/yeniden baslarsa bekler ve tekrar baglanir)
  let sock = null;
  let connected = false;
  let warned = false;
  const connect = () => {
    sock = net.connect(TCP_PORT, TCP_HOST);
    sock.on('connect', () => {
      connected = true;
      warned = false;
      console.log('[tcp] baglandi ' + TCP_HOST + ':' + TCP_PORT);
    });
    sock.on('data', (d) => broadcast(d));
    sock.on('error', (e) => {
      if (!warned) {
        console.error('[tcp] ' + e.message + ' — ' + RETRY_MS / 1000 + 's sonra yeniden denenecek');
        warned = true;
      }
    });
    sock.on('close', () => {
      if (connected) console.log('[tcp] baglanti koptu, yeniden baglaniliyor…');
      connected = false;
      sock.removeAllListeners();
      setTimeout(connect, RETRY_MS);
    });
  };
  console.log('[tcp] hedef ' + TCP_HOST + ':' + TCP_PORT + ' — baglaniliyor…');
  connect();
  sendToVehicle = (buf) => {
    if (connected && sock) sock.write(buf);
  };
}

httpServer.listen(WS_PORT, () => {
  console.log('[ws] WebSocket kopru dinleniyor: ws://localhost:' + WS_PORT + '  (mod=' + MODE + ')');
  setTimeout(() => {
    const be = backend();
    console.log('[chat] Asistan proxy: http://localhost:' + WS_PORT + '/chat  (backend=' + CHAT_BACKEND + ' → ' + be + (be === 'none' ? ' · yerel moda düşer' : ' · ' + backendModel(be)) + ')');
    if (CHAT_BACKEND === 'codex' && !codexAvailable) console.log('[chat] UYARI: codex bulunamadı. Codex CLI kurup `codex login` yapın (ChatGPT aboneliği).');
  }, 300);
});
