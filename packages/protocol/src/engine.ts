// Link-bagimsiz MAVLink protokol cekirdegi. Parser + telemetri + abonelik + komut mantigi
// burada; giden cerceveler emit() callback'ine yazilir (ana thread'de link.write, worker'da
// postMessage). Boylece ayni cekirdek hem dogrudan hem Web Worker icinde calisir.

import { MavlinkParser, buildFrameV2, decodeMessage, encodeMessagePayload } from '@wmp/mavlink-codec';
import type { ParsedFrame, FieldValue } from '@wmp/mavlink-codec';
import { decodeParamPck } from './parampck';
import {
  MSG,
  crcExtraFor,
  GCS_SYSTEM_ID,
  MAV_COMP_ID_MISSIONPLANNER,
  MAV_AUTOPILOT_INVALID,
  MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
  MAV_CMD_COMPONENT_ARM_DISARM,
  MAV_CMD_DO_SET_MODE,
  ARM_FORCE_MAGIC,
  MAV_DATA_STREAM_ALL,
} from './constants';
import {
  decodeHeartbeat,
  decodeAttitude,
  decodeGlobalPositionInt,
  decodeVfrHud,
  decodeNavControllerOutput,
  decodeSysStatus,
  decodeGpsRawInt,
  decodeStatusText,
  encodeHeartbeatGCS,
  encodeCommandLong,
  encodeRequestDataStream,
} from './messages';

export interface VehicleTelemetry {
  connected: boolean;
  sysid: number;
  compid: number;
  armed: boolean;
  baseMode: number;
  customMode: number;
  vehicleType: number; // MAV_TYPE (HEARTBEAT.type) -> arac sinifi/mod listesi icin
  attitude: { roll: number; pitch: number; yaw: number };
  position: { lat: number; lon: number; alt: number; relativeAlt: number; hdg: number };
  vfr: { airspeed: number; groundspeed: number; alt: number; climb: number; throttle: number };
  nav: { roll: number; pitch: number; bearing: number; valid: boolean }; // NAV_CONTROLLER_OUTPUT (flight director), derece
  battery: { voltage: number; current: number; remaining: number };
  gps: { fixType: number; satellites: number };
  packetsReceived: number;
  seenMessages: Record<number, number>;
}

export function emptyTelemetry(): VehicleTelemetry {
  return {
    connected: false,
    sysid: 0,
    compid: 0,
    armed: false,
    baseMode: 0,
    customMode: 0,
    vehicleType: 0,
    attitude: { roll: 0, pitch: 0, yaw: 0 },
    position: { lat: NaN, lon: NaN, alt: NaN, relativeAlt: NaN, hdg: NaN },
    vfr: { airspeed: 0, groundspeed: 0, alt: 0, climb: 0, throttle: 0 },
    nav: { roll: 0, pitch: 0, bearing: 0, valid: false },
    battery: { voltage: NaN, current: -1, remaining: -1 },
    gps: { fixType: 0, satellites: 0 },
    packetsReceived: 0,
    seenMessages: {},
  };
}

type StatusTextCb = (severity: number, text: string) => void;
type ConnectedCb = (sysid: number, compid: number) => void;

export interface ProtocolEngineOptions {
  gcsSystemId?: number;
  gcsComponentId?: number;
  requestStreamHz?: number;
  /** Giden cerceve alicisi (link.write veya postMessage). */
  emit: (frame: Uint8Array) => void;
  /** Gelen her gecerli cercevenin ham baytlari (tlog kaydi gibi tuketiciler icin). */
  onRawFrame?: (raw: Uint8Array) => void;
}

export interface ParamEntry {
  name: string;
  value: number;
  type: number;
  index: number;
}

export interface RawMissionItem {
  seq: number; frame: number; command: number; current: number; autocontinue: number;
  param1: number; param2: number; param3: number; param4: number;
  x: number; y: number; z: number;
}

/** MAVFtp dizin girdisi (ListDirectory). */
export interface FtpEntry {
  name: string;
  size: number;
  dir: boolean;
}

interface Waiter {
  msgids: number[];
  pred?: (f: ParsedFrame) => boolean;
  resolve: (f: ParsedFrame) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function toRawItem(d: Record<string, unknown>): RawMissionItem {
  const n = (k: string): number => Number(d[k] ?? 0);
  return {
    seq: n('seq'), frame: n('frame'), command: n('command'), current: n('current'), autocontinue: n('autocontinue'),
    param1: n('param1'), param2: n('param2'), param3: n('param3'), param4: n('param4'),
    x: n('x'), y: n('y'), z: n('z'),
  };
}

function itemToValues(
  it: RawMissionItem,
  base: { target_system: number; target_component: number; mission_type: number },
): Record<string, number> {
  return {
    ...base, seq: it.seq, frame: it.frame, command: it.command, current: it.current, autocontinue: it.autocontinue,
    param1: it.param1, param2: it.param2, param3: it.param3, param4: it.param4, x: it.x, y: it.y, z: it.z,
  };
}

export class ProtocolEngine {
  readonly telemetry: VehicleTelemetry = emptyTelemetry();

  private parser = new MavlinkParser(crcExtraFor);
  private gcsSystemId: number;
  private gcsComponentId: number;
  private ftpSeq = 0;
  private requestStreamHz: number;
  private emit: (frame: Uint8Array) => void;
  private txSeq = 0;
  private waiters: Waiter[] = [];

  private subs = new Map<number, Set<(f: ParsedFrame) => void>>();
  private statusTextCbs = new Set<StatusTextCb>();
  private connectedCbs = new Set<ConnectedCb>();

  constructor(opts: ProtocolEngineOptions) {
    this.gcsSystemId = opts.gcsSystemId ?? GCS_SYSTEM_ID;
    this.gcsComponentId = opts.gcsComponentId ?? MAV_COMP_ID_MISSIONPLANNER;
    this.requestStreamHz = opts.requestStreamHz ?? 4;
    this.emit = opts.emit;
    this.onRawFrame = opts.onRawFrame;
  }

  private onRawFrame?: (raw: Uint8Array) => void;

  /** Gelen ham baytlari isle. */
  ingest(chunk: Uint8Array): void {
    const frames = this.parser.push(chunk);
    for (const f of frames) {
      if (f.crcOk === false) continue;
      this.onRawFrame?.(f.raw);
      this.telemetry.packetsReceived++;
      this.telemetry.seenMessages[f.msgid] = (this.telemetry.seenMessages[f.msgid] ?? 0) + 1;
      this.route(f);
      const set = this.subs.get(f.msgid);
      if (set) for (const cb of set) cb(f);
      this.dispatchWaiters(f);
    }
  }

  subscribe(msgid: number, cb: (f: ParsedFrame) => void): () => void {
    let set = this.subs.get(msgid);
    if (!set) {
      set = new Set();
      this.subs.set(msgid, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }

  subscribeDecoded(msgid: number, cb: (fields: Record<string, FieldValue>) => void): () => void {
    return this.subscribe(msgid, (f) => {
      const d = decodeMessage(f.msgid, f.payload);
      if (d) cb(d);
    });
  }

  decodeFrame(f: ParsedFrame): Record<string, FieldValue> | undefined {
    return decodeMessage(f.msgid, f.payload);
  }

  onStatusText(cb: StatusTextCb): () => void {
    this.statusTextCbs.add(cb);
    return () => this.statusTextCbs.delete(cb);
  }

  onConnected(cb: ConnectedCb): () => void {
    this.connectedCbs.add(cb);
    return () => this.connectedCbs.delete(cb);
  }

  private route(f: ParsedFrame): void {
    const t = this.telemetry;
    switch (f.msgid) {
      case MSG.HEARTBEAT: {
        if (f.sysid === this.gcsSystemId) return;
        const hb = decodeHeartbeat(f.payload);
        if (hb.autopilot === MAV_AUTOPILOT_INVALID) return;
        t.armed = hb.armed;
        t.baseMode = hb.baseMode;
        t.customMode = hb.customMode;
        t.vehicleType = hb.type;
        if (!t.connected) {
          t.connected = true;
          t.sysid = f.sysid;
          t.compid = f.compid;
          for (const cb of this.connectedCbs) cb(f.sysid, f.compid);
          this.requestDataStream(this.requestStreamHz);
        }
        break;
      }
      case MSG.ATTITUDE: {
        const a = decodeAttitude(f.payload);
        t.attitude.roll = a.roll;
        t.attitude.pitch = a.pitch;
        t.attitude.yaw = a.yaw;
        break;
      }
      case MSG.GLOBAL_POSITION_INT: {
        const g = decodeGlobalPositionInt(f.payload);
        t.position.lat = g.lat;
        t.position.lon = g.lon;
        t.position.alt = g.alt;
        t.position.relativeAlt = g.relativeAlt;
        t.position.hdg = g.hdg;
        break;
      }
      case MSG.VFR_HUD: {
        const h = decodeVfrHud(f.payload);
        t.vfr.airspeed = h.airspeed;
        t.vfr.groundspeed = h.groundspeed;
        t.vfr.alt = h.alt;
        t.vfr.climb = h.climb;
        t.vfr.throttle = h.throttle;
        break;
      }
      case MSG.NAV_CONTROLLER_OUTPUT: {
        const n = decodeNavControllerOutput(f.payload);
        t.nav.roll = n.navRoll;
        t.nav.pitch = n.navPitch;
        t.nav.bearing = n.navBearing;
        t.nav.valid = true;
        break;
      }
      case MSG.SYS_STATUS: {
        const s = decodeSysStatus(f.payload);
        t.battery.voltage = s.voltageBattery;
        t.battery.current = s.currentBattery;
        t.battery.remaining = s.batteryRemaining;
        break;
      }
      case MSG.GPS_RAW_INT: {
        const gps = decodeGpsRawInt(f.payload);
        t.gps.fixType = gps.fixType;
        t.gps.satellites = gps.satellitesVisible;
        break;
      }
      case MSG.STATUSTEXT: {
        const st = decodeStatusText(f.payload);
        for (const cb of this.statusTextCbs) cb(st.severity, st.text);
        break;
      }
      default:
        break;
    }
  }

  private nextSeq(): number {
    const s = this.txSeq;
    this.txSeq = (this.txSeq + 1) & 0xff;
    return s;
  }

  // ===== MAVFtp (FILE_TRANSFER_PROTOCOL msg 110) =====
  // Opcode'lar: 1 TerminateSession, 4 OpenFileRO, 5 ReadFile, 128 ACK, 129 NAK. NAK data[0]=6 -> EOF.

  /** MAVFtp ile bir dosyayi okur (OpenFileRO + ardisik ReadFile). */
  async mavftpRead(path: string, onProgress?: (received: number, total: number) => void): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const open = await this.ftpRequest(4, 0, 0, enc.encode(path));
    if (open.opcode === 129) throw new Error('MAVFtp aç hatası: NAK ' + (open.data[0] ?? '?'));
    const session = open.session;
    let fileSize = 0;
    if (open.opcode === 128 && open.size >= 4) fileSize = new DataView(open.data.buffer, open.data.byteOffset, 4).getUint32(0, true);
    const chunks: Uint8Array[] = [];
    let offset = 0;
    try {
      for (let guard = 0; guard < 200000; guard++) {
        const r = await this.ftpRequest(5, session, offset, undefined, 239);
        if (r.opcode === 129) {
          if (r.data[0] === 6) break; // EOF
          throw new Error('MAVFtp oku hatası: NAK ' + (r.data[0] ?? '?'));
        }
        if (r.size === 0) break;
        // v2 sonda-sifir kirpmasina karsi: parcayi tam r.size'a tamamla
        const chunk = r.data.length >= r.size ? r.data.subarray(0, r.size) : (() => { const c = new Uint8Array(r.size); c.set(r.data); return c; })();
        chunks.push(chunk);
        offset += r.size;
        onProgress?.(offset, fileSize || offset);
        if (fileSize && offset >= fileSize) break;
      }
    } finally {
      try { await this.ftpRequest(1, session, 0); } catch { /* terminate best-effort */ }
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    return out;
  }

  /**
   * MAVFtp ile bir dizini listeler (opcode 3 ListDirectory).
   * offset = donulecek ilk girdinin INDEKSI; her yanittaki girdi sayisi kadar artirilir.
   * Girdiler NUL ile sonlanan dizeler: 'F'ad\t<boyut>, 'D'ad, 'S' (atla/bos).
   * Liste bitince NAK (data[0]=6 EOF).
   */
  async mavftpList(path: string): Promise<FtpEntry[]> {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const entries: FtpEntry[] = [];
    const seen = new Set<string>();
    let offset = 0;
    for (let guard = 0; guard < 100000; guard++) {
      const r = await this.ftpRequest(3, 0, offset, enc.encode(path));
      if (r.opcode === 129) {
        if (r.data[0] === 6) break; // EOF
        throw new Error('MAVFtp liste hatası: NAK ' + (r.data[0] ?? '?'));
      }
      if (r.size === 0) break;
      // Girdiler NUL ile sonlanir; ArduPilot her girdiden sonra fazladan bir NUL koyar
      // (girdiler cift-NUL ile ayrilir -> bos token'lar cikar). offset yalniz GERCEK girdilerle ilerler.
      let i = 0;
      let real = 0; // bu yanittaki gercek dizin girdisi sayisi (F/D/S)
      while (i < r.size) {
        let j = i;
        while (j < r.size && r.data[j] !== 0) j++;
        const s = dec.decode(r.data.subarray(i, j));
        i = j + 1;
        if (s.length === 0) continue; // cift-NUL dolgusu -> girdi degil
        real++;
        const type = s[0];
        const rest = s.slice(1);
        if (type === 'F') {
          const tab = rest.indexOf('\t');
          const name = tab >= 0 ? rest.slice(0, tab) : rest;
          const size = tab >= 0 ? parseInt(rest.slice(tab + 1), 10) || 0 : 0;
          if (name && !seen.has(name)) { seen.add(name); entries.push({ name, size, dir: false }); }
        } else if (type === 'D') {
          if (rest && !seen.has(rest)) { seen.add(rest); entries.push({ name: rest, size: 0, dir: true }); }
        }
        // 'S' (skip): gercek girdi say (offset ilerlesin) ama listeye ekleme
      }
      if (real === 0) break;
      offset += real;
    }
    return entries;
  }

  private ftpRequest(
    opcode: number, session: number, offset: number, data?: Uint8Array, readSize = 0,
  ): Promise<{ opcode: number; session: number; size: number; offset: number; data: Uint8Array }> {
    const seq = this.ftpSeq;
    this.ftpSeq = (this.ftpSeq + 2) & 0xffff;
    const dataLen = data ? data.length : 0;
    const ftp = new Uint8Array(12 + dataLen);
    const dv = new DataView(ftp.buffer);
    dv.setUint16(0, seq, true);
    ftp[2] = session & 0xff;
    ftp[3] = opcode & 0xff;
    ftp[4] = (data ? dataLen : readSize) & 0xff;
    dv.setUint32(8, offset >>> 0, true);
    if (data) ftp.set(data, 12);
    return this.ftpTransact(ftp, (seq + 1) & 0xffff);
  }

  private ftpTransact(
    ftp: Uint8Array, expectSeq: number, timeoutMs = 900, retries = 5,
  ): Promise<{ opcode: number; session: number; size: number; offset: number; data: Uint8Array }> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = (): void => { clearTimeout(timer); unsub(); };
      const unsub = this.subscribeDecoded(MSG.FILE_TRANSFER_PROTOCOL, (fields) => {
        const raw = fields.payload as unknown as number[] | undefined;
        if (!raw || raw.length < 12) return;
        const bytes = Uint8Array.from(raw);
        const dv = new DataView(bytes.buffer);
        if (dv.getUint16(0, true) !== expectSeq) return;
        cleanup();
        const size = bytes[4] ?? 0;
        resolve({ opcode: bytes[3] ?? 0, session: bytes[2] ?? 0, size, offset: dv.getUint32(8, true), data: bytes.subarray(12, 12 + size) });
      });
      const send = (): void => {
        this.sendFtp(ftp);
        timer = setTimeout(() => {
          if (++tries > retries) { cleanup(); reject(new Error('MAVFtp zaman aşımı')); }
          else send();
        }, timeoutMs);
      };
      send();
    });
  }

  private sendFtp(ftp: Uint8Array): void {
    const values = {
      target_network: 0,
      target_system: this.telemetry.sysid || 1,
      target_component: this.telemetry.compid || 1,
      payload: Array.from(ftp),
    } as unknown as Record<string, FieldValue>;
    const payload = encodeMessagePayload(MSG.FILE_TRANSFER_PROTOCOL, values);
    if (payload) this.sendFrame(MSG.FILE_TRANSFER_PROTOCOL, payload);
  }

  private sendFrame(msgid: number, payload: Uint8Array): void {
    const crcExtra = crcExtraFor(msgid);
    if (crcExtra === undefined) throw new Error('crc_extra bilinmiyor: msgid=' + msgid);
    this.emit(
      buildFrameV2({
        seq: this.nextSeq(),
        sysid: this.gcsSystemId,
        compid: this.gcsComponentId,
        msgid,
        payload,
        crcExtra,
      }),
    );
  }

  sendHeartbeat(): void {
    this.sendFrame(MSG.HEARTBEAT, encodeHeartbeatGCS());
  }

  requestDataStream(rateHz: number): void {
    this.sendFrame(
      MSG.REQUEST_DATA_STREAM,
      encodeRequestDataStream({
        targetSystem: this.telemetry.sysid || 1,
        targetComponent: 0,
        reqStreamId: MAV_DATA_STREAM_ALL,
        reqMessageRate: rateHz,
        startStop: 1,
      }),
    );
  }

  commandLong(command: number, params: [number, number, number, number, number, number, number]): void {
    this.sendFrame(
      MSG.COMMAND_LONG,
      encodeCommandLong({
        command,
        targetSystem: this.telemetry.sysid || 1,
        targetComponent: 1,
        params,
      }),
    );
  }

  /** Herhangi bir MAVLink mesajini alan-adiyla kodlayip yollar (or. RC_CHANNELS_OVERRIDE). */
  sendMessage(msgid: number, values: Record<string, number | bigint | string>): void {
    this.sendMsg(msgid, values);
  }

  arm(force = false): void {
    this.commandLong(MAV_CMD_COMPONENT_ARM_DISARM, [1, force ? ARM_FORCE_MAGIC : 0, 0, 0, 0, 0, 0]);
  }

  disarm(force = false): void {
    this.commandLong(MAV_CMD_COMPONENT_ARM_DISARM, [0, force ? ARM_FORCE_MAGIC : 0, 0, 0, 0, 0, 0]);
  }

  setMode(customMode: number): void {
    this.commandLong(MAV_CMD_DO_SET_MODE, [MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, customMode, 0, 0, 0, 0, 0]);
  }

  private dispatchWaiters(f: ParsedFrame): void {
    for (const w of [...this.waiters]) {
      if (w.msgids.includes(f.msgid) && (!w.pred || w.pred(f))) {
        clearTimeout(w.timer);
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        w.resolve(f);
      }
    }
  }

  private waitForAny(msgids: number[], timeoutMs: number, pred?: (f: ParsedFrame) => boolean): Promise<ParsedFrame> {
    return new Promise<ParsedFrame>((resolve, reject) => {
      const w: Waiter = {
        msgids, pred, resolve, reject,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error('MAVLink yanit zaman asimi: msgid ' + msgids.join('/')));
        }, timeoutMs),
      };
      this.waiters.push(w);
    });
  }

  private missionBase(): { target_system: number; target_component: number; mission_type: number } {
    return { target_system: this.telemetry.sysid || 1, target_component: this.telemetry.compid || 1, mission_type: 0 };
  }

  private sendMsg(msgid: number, values: Record<string, number | bigint | string>): void {
    const payload = encodeMessagePayload(msgid, values);
    if (!payload) throw new Error('mesaj kodlanamadi: msgid=' + msgid);
    this.sendFrame(msgid, payload);
  }

  /** Aractan gorevi indirir. */
  async downloadMission(onProgress?: (received: number, total: number) => void, missionType = 0): Promise<RawMissionItem[]> {
    const base = { ...this.missionBase(), mission_type: missionType };
    const pCount = this.waitForAny([MSG.MISSION_COUNT], 5000);
    this.sendMsg(MSG.MISSION_REQUEST_LIST, base);
    const cf = await pCount;
    const count = Number(decodeMessage(MSG.MISSION_COUNT, cf.payload)?.count ?? 0);
    const items: RawMissionItem[] = [];
    for (let seq = 0; seq < count; seq++) {
      const pit = this.waitForAny([MSG.MISSION_ITEM_INT], 5000, (f) => {
        const d = decodeMessage(MSG.MISSION_ITEM_INT, f.payload);
        return Number(d?.seq) === seq;
      });
      this.sendMsg(MSG.MISSION_REQUEST_INT, { ...base, seq });
      const itf = await pit;
      const d = decodeMessage(MSG.MISSION_ITEM_INT, itf.payload);
      if (d) items.push(toRawItem(d));
      onProgress?.(seq + 1, count);
    }
    this.sendMsg(MSG.MISSION_ACK, { ...base, type: 0 });
    return items;
  }

  /** Araca gorevi yukler. */
  async uploadMission(items: RawMissionItem[], onProgress?: (sent: number, total: number) => void, missionType = 0): Promise<number> {
    const base = { ...this.missionBase(), mission_type: missionType };
    let waiter = this.waitForAny([MSG.MISSION_REQUEST_INT, MSG.MISSION_REQUEST, MSG.MISSION_ACK], 5000);
    this.sendMsg(MSG.MISSION_COUNT, { ...base, count: items.length });
    for (;;) {
      const f = await waiter;
      if (f.msgid === MSG.MISSION_ACK) {
        return Number(decodeMessage(MSG.MISSION_ACK, f.payload)?.type ?? 0);
      }
      const seq = Number(decodeMessage(f.msgid, f.payload)?.seq ?? 0);
      const it = items[seq];
      waiter = this.waitForAny([MSG.MISSION_REQUEST_INT, MSG.MISSION_REQUEST, MSG.MISSION_ACK], 5000);
      if (it) {
        this.sendMsg(MSG.MISSION_ITEM_INT, itemToValues(it, base));
        onProgress?.(seq + 1, items.length);
      }
    }
  }

  /**
   * Tum parametreleri indirir. Once MAVFtp ile @PARAM/param.pck'i dener (tek dosya, cok hizli);
   * FTP desteklenmiyor/basarisizsa klasik PARAM_REQUEST_LIST yontemine duser.
   */
  async downloadParams(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]> {
    try {
      const params = await this.downloadParamsFtp(onProgress);
      if (params.length > 0) return params;
    } catch {
      /* FTP yok/basarisiz -> klasik yonteme dus */
    }
    return this.downloadParamsClassic(onProgress);
  }

  /** MAVFtp ile @PARAM/param.pck indirip cozer (hizli yol). */
  async downloadParamsFtp(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]> {
    const bytes = await this.mavftpRead('@PARAM/param.pck', onProgress);
    const decoded = decodeParamPck(bytes);
    return decoded.map((p, index) => ({ name: p.name, value: p.value, type: p.type, index }));
  }

  /** Tum parametreleri klasik yolla indirir (PARAM_REQUEST_LIST + PARAM_VALUE toplama, eksikleri yeniden ister). */
  async downloadParamsClassic(onProgress?: (received: number, total: number) => void): Promise<ParamEntry[]> {
    const base = this.missionBase();
    const map = new Map<number, ParamEntry>();
    return new Promise<ParamEntry[]>((resolve) => {
      let total = -1;
      let round = 0;
      let quiet: ReturnType<typeof setTimeout>;
      const finish = (): void => {
        unsub();
        clearTimeout(quiet);
        clearTimeout(hard);
        resolve([...map.values()].sort((a, b) => a.index - b.index));
      };
      const requestMissing = (): void => {
        if (total <= 0) return finish();
        const missing: number[] = [];
        for (let i = 0; i < total; i++) if (!map.has(i)) missing.push(i);
        if (missing.length === 0 || round >= 3) return finish();
        round++;
        for (const idx of missing.slice(0, 60)) this.sendMsg(MSG.PARAM_REQUEST_READ, { ...base, param_id: '', param_index: idx });
        arm();
      };
      const arm = (): void => {
        clearTimeout(quiet);
        quiet = setTimeout(requestMissing, 1500);
      };
      const unsub = this.subscribe(MSG.PARAM_VALUE, (f) => {
        const d = decodeMessage(MSG.PARAM_VALUE, f.payload);
        if (!d) return;
        const count = Number(d.param_count);
        if (Number.isFinite(count) && count > 0) total = count;
        const index = Number(d.param_index);
        map.set(index, { name: String(d.param_id ?? ''), value: Number(d.param_value), type: Number(d.param_type), index });
        onProgress?.(map.size, total > 0 ? total : map.size);
        if (total > 0 && map.size >= total) return finish();
        arm();
      });
      const hard = setTimeout(finish, 40000);
      this.sendMsg(MSG.PARAM_REQUEST_LIST, base);
      arm();
    });
  }

  /** Bir parametre yazar ve echo edilen PARAM_VALUE'yu bekler. */
  async setParam(name: string, value: number, type: number): Promise<number> {
    const base = this.missionBase();
    const p = this.waitForAny([MSG.PARAM_VALUE], 3000, (f) => {
      const d = decodeMessage(MSG.PARAM_VALUE, f.payload);
      return String(d?.param_id ?? '') === name;
    });
    this.sendMsg(MSG.PARAM_SET, { ...base, param_id: name, param_value: value, param_type: type });
    const f = await p;
    return Number(decodeMessage(MSG.PARAM_VALUE, f.payload)?.param_value ?? value);
  }
}
