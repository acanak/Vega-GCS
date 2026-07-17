// Ana thread baglanti nesnesi: Link + protokol Web Worker'ini birbirine baglar.
import type { Link } from '@wmp/link';
import type { VehicleTelemetry, RawMissionItem, ParamEntry, FtpEntry } from '@wmp/protocol';
import { emptyTelemetry } from '@wmp/protocol';
import type { GcsConnection, MainToWorker, WorkerToMain, DecodedFields } from './protocol-shared';

export interface WorkerConnectionOptions {
  link: Link;
  gcsSystemId?: number;
  gcsComponentId?: number;
  heartbeatHz?: number;
  requestStreamHz?: number;
}

function applySnapshot(t: VehicleTelemetry, s: VehicleTelemetry): void {
  t.connected = s.connected;
  t.sysid = s.sysid;
  t.compid = s.compid;
  t.armed = s.armed;
  t.baseMode = s.baseMode;
  t.customMode = s.customMode;
  t.vehicleType = s.vehicleType;
  t.packetsReceived = s.packetsReceived;
  t.attitude = s.attitude;
  t.position = s.position;
  t.vfr = s.vfr;
  t.battery = s.battery;
  t.gps = s.gps;
  t.seenMessages = s.seenMessages;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (received: number, total: number) => void;
}

export class WorkerConnection implements GcsConnection {
  readonly telemetry: VehicleTelemetry = emptyTelemetry();

  private link: Link;
  private opts: WorkerConnectionOptions;
  private worker: Worker | null = null;
  private unsubData: (() => void) | undefined;
  private connectedCbs = new Set<(sysid: number, compid: number) => void>();
  private statusTextCbs = new Set<(severity: number, text: string) => void>();
  private msgSubs = new Map<number, Set<(f: DecodedFields) => void>>();
  private pending = new Map<number, Pending>();
  private nextReqId = 1;

  constructor(opts: WorkerConnectionOptions) {
    this.link = opts.link;
    this.opts = opts;
  }

  async open(): Promise<void> {
    this.worker = new Worker(new URL('./protocol.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent): void => this.onWorkerMessage(ev.data as WorkerToMain);
    this.post({
      type: 'config',
      gcsSystemId: this.opts.gcsSystemId,
      gcsComponentId: this.opts.gcsComponentId,
      requestStreamHz: this.opts.requestStreamHz,
      heartbeatHz: this.opts.heartbeatHz ?? 1,
    });
    await this.link.open();
    this.unsubData = this.link.onData((chunk) => this.post({ type: 'rx', bytes: chunk }));
  }

  async close(): Promise<void> {
    this.post({ type: 'close' });
    this.unsubData?.();
    this.unsubData = undefined;
    this.worker?.terminate();
    this.worker = null;
    this.msgSubs.clear();
    for (const p of this.pending.values()) p.reject(new Error('Bağlantı kapatıldı'));
    this.pending.clear();
    await this.link.close();
    this.telemetry.connected = false;
  }

  onConnected(cb: (sysid: number, compid: number) => void): () => void {
    this.connectedCbs.add(cb);
    return () => this.connectedCbs.delete(cb);
  }
  onStatusText(cb: (severity: number, text: string) => void): () => void {
    this.statusTextCbs.add(cb);
    return () => this.statusTextCbs.delete(cb);
  }
  async arm(force = false): Promise<void> {
    this.post({ type: 'arm', force });
  }
  async disarm(force = false): Promise<void> {
    this.post({ type: 'disarm', force });
  }
  async setMode(customMode: number): Promise<void> {
    this.post({ type: 'setMode', customMode });
  }
  commandLong(command: number, params: number[]): void {
    this.post({ type: 'command', command, params });
  }
  sendMessage(msgid: number, fields: Record<string, number | bigint | string>): void {
    this.post({ type: 'sendMessage', msgid, fields });
  }
  subscribeMessage(msgid: number, cb: (fields: DecodedFields) => void): () => void {
    let set = this.msgSubs.get(msgid);
    if (!set) {
      set = new Set();
      this.msgSubs.set(msgid, set);
      this.post({ type: 'subscribe', msgid });
    }
    set.add(cb);
    return () => {
      const s = this.msgSubs.get(msgid);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) {
        this.msgSubs.delete(msgid);
        this.post({ type: 'unsubscribe', msgid });
      }
    };
  }

  downloadMission(onProgress?: (received: number, total: number) => void, missionType = 0): Promise<RawMissionItem[]> {
    return this.request<RawMissionItem[]>((reqId) => ({ type: 'downloadMission', reqId, missionType }), onProgress);
  }
  uploadMission(items: RawMissionItem[], onProgress?: (sent: number, total: number) => void, missionType = 0): Promise<number> {
    return this.request<number>((reqId) => ({ type: 'uploadMission', reqId, items, missionType }), onProgress);
  }
  downloadParams(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]> {
    return this.request<ParamEntry[]>((reqId) => ({ type: 'downloadParams', reqId }), onProgress);
  }
  setParam(name: string, value: number, type: number): Promise<number> {
    return this.request<number>((reqId) => ({ type: 'setParam', reqId, name, value, ptype: type }));
  }
  listDirectory(path: string): Promise<FtpEntry[]> {
    return this.request<FtpEntry[]>((reqId) => ({ type: 'ftpList', reqId, path }));
  }
  downloadFile(path: string, onProgress?: (received: number, total: number) => void): Promise<Uint8Array> {
    return this.request<Uint8Array>((reqId) => ({ type: 'ftpRead', reqId, path }), onProgress);
  }

  private request<T>(build: (reqId: number) => MainToWorker, onProgress?: (r: number, t: number) => void): Promise<T> {
    const reqId = this.nextReqId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.post(build(reqId));
    });
  }

  private post(msg: MainToWorker): void {
    this.worker?.postMessage(msg);
  }

  private onWorkerMessage(msg: WorkerToMain): void {
    switch (msg.type) {
      case 'tx':
        void this.link.write(msg.bytes);
        break;
      case 'telemetry':
        applySnapshot(this.telemetry, msg.snapshot);
        break;
      case 'connected':
        this.telemetry.connected = true;
        for (const cb of this.connectedCbs) cb(msg.sysid, msg.compid);
        break;
      case 'statustext':
        for (const cb of this.statusTextCbs) cb(msg.severity, msg.text);
        break;
      case 'message': {
        const set = this.msgSubs.get(msg.msgid);
        if (set) for (const cb of set) cb(msg.fields);
        break;
      }
      case 'missionProgress':
      case 'paramProgress':
      case 'ftpProgress':
        this.pending.get(msg.reqId)?.onProgress?.(msg.received, msg.total);
        break;
      case 'missionResult': {
        const p = this.pending.get(msg.reqId);
        if (!p) break;
        this.pending.delete(msg.reqId);
        if (!msg.ok) p.reject(new Error(msg.error ?? 'Görev işlemi başarısız'));
        else p.resolve(msg.items ?? msg.result ?? 0);
        break;
      }
      case 'paramResult': {
        const p = this.pending.get(msg.reqId);
        if (!p) break;
        this.pending.delete(msg.reqId);
        if (!msg.ok) p.reject(new Error(msg.error ?? 'Parametre işlemi başarısız'));
        else p.resolve(msg.params ?? msg.value ?? 0);
        break;
      }
      case 'ftpListResult': {
        const p = this.pending.get(msg.reqId);
        if (!p) break;
        this.pending.delete(msg.reqId);
        if (!msg.ok) p.reject(new Error(msg.error ?? 'MAVFtp liste başarısız'));
        else p.resolve(msg.entries ?? []);
        break;
      }
      case 'ftpReadResult': {
        const p = this.pending.get(msg.reqId);
        if (!p) break;
        this.pending.delete(msg.reqId);
        if (!msg.ok) p.reject(new Error(msg.error ?? 'MAVFtp okuma başarısız'));
        else p.resolve(msg.bytes ?? new Uint8Array(0));
        break;
      }
    }
  }
}
