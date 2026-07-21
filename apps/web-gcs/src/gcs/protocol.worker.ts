// Web Worker: MAVLink parse/CRC/decode + protokol durumu + gorev protokolu burada calisir.
import { ProtocolEngine } from '@wmp/protocol';
import type { MainToWorker, WorkerToMain } from './protocol-shared';
import { FlightLogWriter } from './flightlog';

interface WorkerCtx {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
}
const ctx = self as unknown as WorkerCtx;

let engine: ProtocolEngine | null = null;
let flightLog: FlightLogWriter | null = null;
const msgSubs = new Map<number, () => void>();
let heartbeatHz = 1;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let telemetryTimer: ReturnType<typeof setInterval> | undefined;

function stopTimers(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (telemetryTimer) clearInterval(telemetryTimer);
  heartbeatTimer = undefined;
  telemetryTimer = undefined;
}
function startTimers(): void {
  stopTimers();
  if (heartbeatHz > 0) heartbeatTimer = setInterval(() => engine?.sendHeartbeat(), Math.round(1000 / heartbeatHz));
  telemetryTimer = setInterval(() => {
    if (engine) ctx.postMessage({ type: 'telemetry', snapshot: engine.telemetry });
  }, 33);
}

ctx.addEventListener('message', (ev) => {
  const msg = ev.data as MainToWorker;
  switch (msg.type) {
    case 'config':
      heartbeatHz = msg.heartbeatHz ?? 1;
      // Telemetri kaydı (tlog): gelen + giden tüm çerçeveler IndexedDB'ye yazılır.
      // Kayıt başarısız olsa bile bağlantı akışı etkilenmez.
      void FlightLogWriter.start(msg.logLabel ?? 'link').then((w) => { flightLog = w; }).catch(() => { flightLog = null; });
      engine = new ProtocolEngine({
        gcsSystemId: msg.gcsSystemId,
        gcsComponentId: msg.gcsComponentId,
        requestStreamHz: msg.requestStreamHz,
        emit: (frame) => { flightLog?.append(frame); ctx.postMessage({ type: 'tx', bytes: frame }); },
        onRawFrame: (raw) => flightLog?.append(raw),
      });
      engine.onConnected((sysid, compid) => ctx.postMessage({ type: 'connected', sysid, compid }));
      engine.onStatusText((severity, text) => ctx.postMessage({ type: 'statustext', severity, text }));
      startTimers();
      break;
    case 'rx':
      engine?.ingest(msg.bytes);
      break;
    case 'arm':
      engine?.arm(msg.force);
      break;
    case 'disarm':
      engine?.disarm(msg.force);
      break;
    case 'setMode':
      engine?.setMode(msg.customMode);
      break;
    case 'downloadMission': {
      const reqId = msg.reqId;
      if (!engine) {
        ctx.postMessage({ type: 'missionResult', reqId, ok: false, error: 'Bağlantı hazır değil' });
        break;
      }
      engine
        .downloadMission((received, total) => ctx.postMessage({ type: 'missionProgress', reqId, received, total }), msg.missionType)
        .then((items) => ctx.postMessage({ type: 'missionResult', reqId, ok: true, items }))
        .catch((err: unknown) => ctx.postMessage({ type: 'missionResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'uploadMission': {
      const reqId = msg.reqId;
      if (!engine) {
        ctx.postMessage({ type: 'missionResult', reqId, ok: false, error: 'Bağlantı hazır değil' });
        break;
      }
      engine
        .uploadMission(msg.items, (sent, total) => ctx.postMessage({ type: 'missionProgress', reqId, received: sent, total }), msg.missionType)
        .then((result) => ctx.postMessage({ type: 'missionResult', reqId, ok: true, result }))
        .catch((err: unknown) => ctx.postMessage({ type: 'missionResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'downloadParams': {
      const reqId = msg.reqId;
      if (!engine) { ctx.postMessage({ type: 'paramResult', reqId, ok: false, error: 'Bağlantı hazır değil' }); break; }
      engine
        .downloadParams((received, total) => ctx.postMessage({ type: 'paramProgress', reqId, received, total }))
        .then((params) => ctx.postMessage({ type: 'paramResult', reqId, ok: true, params }))
        .catch((err: unknown) => ctx.postMessage({ type: 'paramResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'setParam': {
      const reqId = msg.reqId;
      if (!engine) { ctx.postMessage({ type: 'paramResult', reqId, ok: false, error: 'Bağlantı hazır değil' }); break; }
      engine
        .setParam(msg.name, msg.value, msg.ptype)
        .then((value) => ctx.postMessage({ type: 'paramResult', reqId, ok: true, value }))
        .catch((err: unknown) => ctx.postMessage({ type: 'paramResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'ftpList': {
      const reqId = msg.reqId;
      if (!engine) { ctx.postMessage({ type: 'ftpListResult', reqId, ok: false, error: 'Bağlantı hazır değil' }); break; }
      engine
        .mavftpList(msg.path)
        .then((entries) => ctx.postMessage({ type: 'ftpListResult', reqId, ok: true, entries }))
        .catch((err: unknown) => ctx.postMessage({ type: 'ftpListResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'ftpRead': {
      const reqId = msg.reqId;
      if (!engine) { ctx.postMessage({ type: 'ftpReadResult', reqId, ok: false, error: 'Bağlantı hazır değil' }); break; }
      engine
        .mavftpRead(msg.path, (received, total) => ctx.postMessage({ type: 'ftpProgress', reqId, received, total }))
        .then((bytes) => ctx.postMessage({ type: 'ftpReadResult', reqId, ok: true, bytes }))
        .catch((err: unknown) => ctx.postMessage({ type: 'ftpReadResult', reqId, ok: false, error: String(err instanceof Error ? err.message : err) }));
      break;
    }
    case 'command':
      engine?.commandLong(msg.command, [
        msg.params[0] ?? 0, msg.params[1] ?? 0, msg.params[2] ?? 0, msg.params[3] ?? 0,
        msg.params[4] ?? 0, msg.params[5] ?? 0, msg.params[6] ?? 0,
      ]);
      break;
    case 'sendMessage':
      engine?.sendMessage(msg.msgid, msg.fields);
      break;
    case 'subscribe': {
      if (!engine || msgSubs.has(msg.msgid)) break;
      const mid = msg.msgid;
      msgSubs.set(mid, engine.subscribeDecoded(mid, (fields) => ctx.postMessage({ type: 'message', msgid: mid, fields })));
      break;
    }
    case 'unsubscribe': {
      const unsub = msgSubs.get(msg.msgid);
      if (unsub) { unsub(); msgSubs.delete(msg.msgid); }
      break;
    }
    case 'close':
      stopTimers();
      engine = null;
      void flightLog?.close();
      flightLog = null;
      break;
  }
});
