// MAVLink v2 çerçevesi oluşturma (imzasız).

import { crcAccumulate, crcCalculate } from './crc';
import { MAVLINK_STX_V2 } from './frame';

export interface FrameToSend {
  seq: number;
  sysid: number;
  compid: number;
  msgid: number;
  payload: Uint8Array;
  /** Bu msgid'in crc_extra tohum baytı (diyalektten). */
  crcExtra: number;
  incompatFlags?: number;
}

/** v2 payload'unda sondaki sıfır baytları kırpar (spec gereği). */
function trimTrailingZeros(p: Uint8Array): Uint8Array {
  let end = p.length;
  while (end > 0 && p[end - 1] === 0) end--;
  return p.subarray(0, end);
}

/** İmzasız bir MAVLink v2 çerçevesi kurar. */
export function buildFrameV2(msg: FrameToSend): Uint8Array {
  const payload = trimTrailingZeros(msg.payload);
  const len = payload.length;
  const out = new Uint8Array(12 + len);
  out[0] = MAVLINK_STX_V2;
  out[1] = len;
  out[2] = msg.incompatFlags ?? 0;
  out[3] = 0; // compat_flags
  out[4] = msg.seq & 0xff;
  out[5] = msg.sysid & 0xff;
  out[6] = msg.compid & 0xff;
  out[7] = msg.msgid & 0xff;
  out[8] = (msg.msgid >> 8) & 0xff;
  out[9] = (msg.msgid >> 16) & 0xff;
  out.set(payload, 10);
  let crc = crcCalculate(out, 1, 10 + len);
  crc = crcAccumulate(msg.crcExtra, crc);
  out[10 + len] = crc & 0xff;
  out[11 + len] = (crc >> 8) & 0xff;
  return out;
}
