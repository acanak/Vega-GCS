// Uretilen diyalekt tel-duzeni metadata'sini (MESSAGES) kullanarak HERHANGI bir mesaji
// jenerik olarak decode/encode eder. Elle mesaj-basi codec yazmaya gerek kalmaz.

import { buildFrameV2 } from './serialize';
import type { FrameToSend } from './serialize';
import { MESSAGES, CRC_EXTRA } from './dialect';

export type FieldValue = number | bigint | string | Array<number | bigint>;

interface TypeInfo {
  size: number;
  get: (v: DataView, o: number) => number | bigint;
  set: (v: DataView, o: number, x: number | bigint) => void;
}

const T: Readonly<Record<string, TypeInfo>> = {
  char: { size: 1, get: (v, o) => v.getUint8(o), set: (v, o, x) => v.setUint8(o, Number(x) & 0xff) },
  int8_t: { size: 1, get: (v, o) => v.getInt8(o), set: (v, o, x) => v.setInt8(o, Number(x)) },
  uint8_t: { size: 1, get: (v, o) => v.getUint8(o), set: (v, o, x) => v.setUint8(o, Number(x) & 0xff) },
  int16_t: { size: 2, get: (v, o) => v.getInt16(o, true), set: (v, o, x) => v.setInt16(o, Number(x), true) },
  uint16_t: { size: 2, get: (v, o) => v.getUint16(o, true), set: (v, o, x) => v.setUint16(o, Number(x) & 0xffff, true) },
  int32_t: { size: 4, get: (v, o) => v.getInt32(o, true), set: (v, o, x) => v.setInt32(o, Number(x), true) },
  uint32_t: { size: 4, get: (v, o) => v.getUint32(o, true), set: (v, o, x) => v.setUint32(o, Number(x) >>> 0, true) },
  int64_t: { size: 8, get: (v, o) => v.getBigInt64(o, true), set: (v, o, x) => v.setBigInt64(o, BigInt(x), true) },
  uint64_t: { size: 8, get: (v, o) => v.getBigUint64(o, true), set: (v, o, x) => v.setBigUint64(o, BigInt(x), true) },
  float: { size: 4, get: (v, o) => v.getFloat32(o, true), set: (v, o, x) => v.setFloat32(o, Number(x), true) },
  double: { size: 8, get: (v, o) => v.getFloat64(o, true), set: (v, o, x) => v.setFloat64(o, Number(x), true) },
};

/** Payload'i (v2'de kirpilmis olabilir) tam wireLength'e sifirla doldurup DataView doner. */
function viewOf(payload: Uint8Array, wireLength: number): DataView {
  if (payload.length >= wireLength) return new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const b = new Uint8Array(wireLength);
  b.set(payload);
  return new DataView(b.buffer);
}

/** msgid + payload -> { alanAdi: deger } (bilinmeyen msgid icin undefined). */
export function decodeMessage(msgid: number, payload: Uint8Array): Record<string, FieldValue> | undefined {
  const msg = MESSAGES[msgid];
  if (!msg) return undefined;
  const v = viewOf(payload, msg.wireLength);
  const out: Record<string, FieldValue> = {};
  for (const f of msg.fields) {
    const ti = T[f.type];
    if (!ti) continue;
    if (f.arrayLen === 0) {
      out[f.name] = ti.get(v, f.offset);
    } else if (f.type === 'char') {
      let s = '';
      for (let i = 0; i < f.arrayLen; i++) {
        const c = v.getUint8(f.offset + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      out[f.name] = s;
    } else {
      const arr: Array<number | bigint> = [];
      for (let i = 0; i < f.arrayLen; i++) arr.push(ti.get(v, f.offset + i * ti.size));
      out[f.name] = arr;
    }
  }
  return out;
}

/** { alanAdi: deger } -> tam wireLength payload (bilinmeyen msgid icin undefined). */
export function encodeMessagePayload(
  msgid: number,
  values: Record<string, FieldValue>,
): Uint8Array | undefined {
  const msg = MESSAGES[msgid];
  if (!msg) return undefined;
  const buf = new Uint8Array(msg.wireLength);
  const v = new DataView(buf.buffer);
  for (const f of msg.fields) {
    const ti = T[f.type];
    if (!ti) continue;
    const val = values[f.name];
    if (val === undefined) continue;
    if (f.arrayLen === 0) {
      if (typeof val === 'number' || typeof val === 'bigint') ti.set(v, f.offset, val);
    } else if (f.type === 'char' && typeof val === 'string') {
      for (let i = 0; i < f.arrayLen && i < val.length; i++) v.setUint8(f.offset + i, val.charCodeAt(i) & 0xff);
    } else if (Array.isArray(val)) {
      for (let i = 0; i < f.arrayLen && i < val.length; i++) {
        const el = val[i];
        if (el !== undefined) ti.set(v, f.offset + i * ti.size, el);
      }
    }
  }
  return buf;
}

/** Jenerik: msgid + alan degerlerinden imzasiz v2 cerceve kurar. */
export function buildMessageV2(
  header: Omit<FrameToSend, 'msgid' | 'payload' | 'crcExtra'>,
  msgid: number,
  values: Record<string, FieldValue>,
): Uint8Array | undefined {
  const payload = encodeMessagePayload(msgid, values);
  const crcExtra = CRC_EXTRA[msgid];
  if (payload === undefined || crcExtra === undefined) return undefined;
  return buildFrameV2({ ...header, msgid, payload, crcExtra });
}
