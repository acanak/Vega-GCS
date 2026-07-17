// Faz 1 mesaj codec'i: elle yazilmis decode/encode fonksiyonlari.
// MAVLink telde alanlari tip-boyutuna gore azalan sirada dizer (extension alanlari
// bildirim sirasinda sonda). Asagidaki offset'ler bu tel-duzenine gore hesaplanmistir.

import { buildFrameV2 } from '@wmp/mavlink-codec';
import type { FrameToSend } from '@wmp/mavlink-codec';
import {
  MSG,
  crcExtraFor,
  MAV_TYPE_GCS,
  MAV_AUTOPILOT_INVALID,
  MAV_STATE_ACTIVE,
  MAV_MODE_FLAG_SAFETY_ARMED,
} from './constants';

/** Payload'i en az minLen'e sifirla doldurup DataView doner (v2 kirpma icin). */
function dv(p: Uint8Array, minLen: number): DataView {
  if (p.length >= minLen) return new DataView(p.buffer, p.byteOffset, p.byteLength);
  const b = new Uint8Array(minLen);
  b.set(p);
  return new DataView(b.buffer);
}

// ---- Decoders ----

export interface Heartbeat {
  type: number;
  autopilot: number;
  baseMode: number;
  customMode: number;
  systemStatus: number;
  armed: boolean;
}
export function decodeHeartbeat(p: Uint8Array): Heartbeat {
  // MAVLink tel-sirasi (boyuta gore siralanmis): custom_mode@0, type@4, autopilot@5, base_mode@6, system_status@7
  const v = dv(p, 9);
  const customMode = v.getUint32(0, true);
  const baseMode = v.getUint8(6);
  return {
    customMode,
    type: v.getUint8(4),
    autopilot: v.getUint8(5),
    baseMode,
    systemStatus: v.getUint8(7),
    armed: (baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0,
  };
}

export interface Attitude {
  roll: number;
  pitch: number;
  yaw: number;
  rollspeed: number;
  pitchspeed: number;
  yawspeed: number;
}
export function decodeAttitude(p: Uint8Array): Attitude {
  const v = dv(p, 28);
  return {
    roll: v.getFloat32(4, true),
    pitch: v.getFloat32(8, true),
    yaw: v.getFloat32(12, true),
    rollspeed: v.getFloat32(16, true),
    pitchspeed: v.getFloat32(20, true),
    yawspeed: v.getFloat32(24, true),
  };
}

export interface GlobalPositionInt {
  lat: number; // derece
  lon: number; // derece
  alt: number; // m (MSL)
  relativeAlt: number; // m
  hdg: number; // derece (0-360), 65535 = bilinmiyor
}
export function decodeGlobalPositionInt(p: Uint8Array): GlobalPositionInt {
  const v = dv(p, 28);
  const hdgRaw = v.getUint16(26, true);
  return {
    lat: v.getInt32(4, true) / 1e7,
    lon: v.getInt32(8, true) / 1e7,
    alt: v.getInt32(12, true) / 1000,
    relativeAlt: v.getInt32(16, true) / 1000,
    hdg: hdgRaw === 65535 ? NaN : hdgRaw / 100,
  };
}

export interface VfrHud {
  airspeed: number;
  groundspeed: number;
  heading: number;
  throttle: number;
  alt: number;
  climb: number;
}
export function decodeVfrHud(p: Uint8Array): VfrHud {
  const v = dv(p, 20);
  return {
    airspeed: v.getFloat32(0, true),
    groundspeed: v.getFloat32(4, true),
    alt: v.getFloat32(8, true),
    climb: v.getFloat32(12, true),
    heading: v.getInt16(16, true),
    throttle: v.getUint16(18, true),
  };
}

export interface NavControllerOutput {
  navRoll: number;    // derece — otopilotun komut ettiği roll (flight director)
  navPitch: number;   // derece — komut edilen pitch
  navBearing: number; // derece
  targetBearing: number;
  wpDist: number;     // m
}
export function decodeNavControllerOutput(p: Uint8Array): NavControllerOutput {
  const v = dv(p, 26);
  return {
    navRoll: v.getFloat32(0, true),
    navPitch: v.getFloat32(4, true),
    navBearing: v.getInt16(20, true),
    targetBearing: v.getInt16(22, true),
    wpDist: v.getUint16(24, true),
  };
}

export interface SysStatus {
  voltageBattery: number; // V
  currentBattery: number; // A (-1 bilinmiyor)
  batteryRemaining: number; // % (-1 bilinmiyor)
}
export function decodeSysStatus(p: Uint8Array): SysStatus {
  const v = dv(p, 31);
  const mv = v.getUint16(14, true);
  const ca = v.getInt16(16, true);
  return {
    voltageBattery: mv === 0xffff ? NaN : mv / 1000,
    currentBattery: ca === -1 ? -1 : ca / 100,
    batteryRemaining: v.getInt8(30),
  };
}

export interface GpsRawInt {
  fixType: number;
  satellitesVisible: number;
}
export function decodeGpsRawInt(p: Uint8Array): GpsRawInt {
  const v = dv(p, 30);
  return {
    fixType: v.getUint8(28),
    satellitesVisible: v.getUint8(29),
  };
}

export interface StatusText {
  severity: number;
  text: string;
}
export function decodeStatusText(p: Uint8Array): StatusText {
  const severity = p.length > 0 ? p[0]! : 0;
  let end = 1;
  while (end < p.length && end < 51 && p[end] !== 0) end++;
  const text = String.fromCharCode(...p.subarray(1, end));
  return { severity, text };
}

export interface CommandAck {
  command: number;
  result: number;
}
export function decodeCommandAck(p: Uint8Array): CommandAck {
  const v = dv(p, 3);
  return { command: v.getUint16(0, true), result: v.getUint8(2) };
}

// ---- Encoders (payload) ----

export interface HeartbeatFields {
  type: number;
  autopilot: number;
  baseMode: number;
  customMode: number;
  systemStatus: number;
}
export function encodeHeartbeat(f: HeartbeatFields): Uint8Array {
  // MAVLink tel-sirasi: custom_mode@0, type@4, autopilot@5, base_mode@6, system_status@7
  const out = new Uint8Array(9);
  const v = new DataView(out.buffer);
  v.setUint32(0, f.customMode >>> 0, true);
  v.setUint8(4, f.type & 0xff);
  v.setUint8(5, f.autopilot & 0xff);
  v.setUint8(6, f.baseMode & 0xff);
  v.setUint8(7, f.systemStatus & 0xff);
  v.setUint8(8, 3); // mavlink_version
  return out;
}

export function encodeHeartbeatGCS(): Uint8Array {
  return encodeHeartbeat({
    type: MAV_TYPE_GCS,
    autopilot: MAV_AUTOPILOT_INVALID,
    baseMode: 0,
    customMode: 0,
    systemStatus: MAV_STATE_ACTIVE,
  });
}

export interface CommandLongFields {
  command: number;
  targetSystem: number;
  targetComponent: number;
  params: [number, number, number, number, number, number, number];
  confirmation?: number;
}
export function encodeCommandLong(f: CommandLongFields): Uint8Array {
  const out = new Uint8Array(33);
  const v = new DataView(out.buffer);
  for (let i = 0; i < 7; i++) v.setFloat32(i * 4, f.params[i]!, true);
  v.setUint16(28, f.command & 0xffff, true);
  v.setUint8(30, f.targetSystem & 0xff);
  v.setUint8(31, f.targetComponent & 0xff);
  v.setUint8(32, (f.confirmation ?? 0) & 0xff);
  return out;
}

export interface RequestDataStreamFields {
  targetSystem: number;
  targetComponent: number;
  reqStreamId: number;
  reqMessageRate: number;
  startStop: number;
}
export function encodeRequestDataStream(f: RequestDataStreamFields): Uint8Array {
  const out = new Uint8Array(6);
  const v = new DataView(out.buffer);
  v.setUint16(0, f.reqMessageRate & 0xffff, true);
  v.setUint8(2, f.targetSystem & 0xff);
  v.setUint8(3, f.targetComponent & 0xff);
  v.setUint8(4, f.reqStreamId & 0xff);
  v.setUint8(5, f.startStop & 0xff);
  return out;
}

/** Verilen msgid + payload'i imzasiz v2 cerceveye cevirir (crc_extra alt kumesinden). */
export function frameFor(
  msgid: number,
  payload: Uint8Array,
  header: Omit<FrameToSend, 'msgid' | 'payload' | 'crcExtra'>,
): Uint8Array {
  const crcExtra = crcExtraFor(msgid);
  if (crcExtra === undefined) throw new Error('crc_extra bilinmiyor: msgid=' + msgid);
  return buildFrameV2({ ...header, msgid, payload, crcExtra });
}

export { MSG };
