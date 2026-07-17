'use strict';
// Gömülü MAVLink köprüsü (masaüstü): UDP/TCP telemetri <-> WebSocket :8080.
// USB otopilot WebSerial ile doğrudan çalışır (köprü gerekmez); bu köprü ağ/UDP telemetri içindir.
const { WebSocketServer } = require('ws');
const dgram = require('node:dgram');
const net = require('node:net');

const WS_PORT = Number(process.env.WS_PORT || 8080);
const MODE = process.env.MODE || 'udp';
const UDP_PORT = Number(process.env.UDP_PORT || 14550);
const TCP_HOST = process.env.TCP_HOST || '127.0.0.1';
const TCP_PORT = Number(process.env.TCP_PORT || 5760);
const RETRY_MS = Number(process.env.RETRY_MS || 1000);

const wss = new WebSocketServer({ port: WS_PORT });
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

module.exports = { WS_PORT };
