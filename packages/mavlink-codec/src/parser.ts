// MAVLink v1/v2 için akışlı (streaming) çözümleyici.
// Baytları biriktirir, tam çerçeveleri çıkarır, çöp/hizasızlıkta STX'e resync olur.

import { crcAccumulate, crcCalculate } from './crc';
import {
  MAVLINK_STX_V1,
  MAVLINK_STX_V2,
  MAVLINK_IFLAG_SIGNED,
  MAVLINK_SIGNATURE_BLOCK_LEN,
} from './frame';
import type { ParsedFrame } from './frame';

/** msgid -> crc_extra tohum baytı. Diyalektten üretilir. */
export type CrcExtraLookup = (msgid: number) => number | undefined;

const EMPTY = new Uint8Array(0);

export class MavlinkParser {
  private buf: Uint8Array = EMPTY;
  private crcExtra: CrcExtraLookup | undefined;

  constructor(crcExtra?: CrcExtraLookup) {
    this.crcExtra = crcExtra;
  }

  /** Yeni baytları besler ve bu çağrıda tamamlanan çerçeveleri döndürür. */
  push(chunk: Uint8Array): ParsedFrame[] {
    if (this.buf.length === 0) {
      this.buf = chunk.slice();
    } else {
      const merged = new Uint8Array(this.buf.length + chunk.length);
      merged.set(this.buf, 0);
      merged.set(chunk, this.buf.length);
      this.buf = merged;
    }

    const frames: ParsedFrame[] = [];
    const buf = this.buf;
    const n = buf.length;
    let i = 0;

    while (i < n) {
      const stx = buf[i]!;
      if (stx !== MAVLINK_STX_V1 && stx !== MAVLINK_STX_V2) {
        i++; // çöp baytı atla
        continue;
      }
      if (i + 1 >= n) break; // uzunluk baytı henüz yok
      const payloadLen = buf[i + 1]!;

      if (stx === MAVLINK_STX_V2) {
        if (i + 10 > n) break; // başlık tamamlanmadı
        const incompat = buf[i + 2]!;
        const signed = (incompat & MAVLINK_IFLAG_SIGNED) !== 0;
        const sigLen = signed ? MAVLINK_SIGNATURE_BLOCK_LEN : 0;
        const total = 12 + payloadLen + sigLen;
        if (i + total > n) break; // çerçeve tamamlanmadı

        const msgid = buf[i + 7]! | (buf[i + 8]! << 8) | (buf[i + 9]! << 16);
        const ckA = buf[i + 10 + payloadLen]!;
        const ckB = buf[i + 11 + payloadLen]!;
        const crcOk = this.checkCrc(buf, i + 1, i + 10 + payloadLen, msgid, ckA, ckB);
        if (crcOk === false) { i++; continue; } // yanlış STX -> resync

        frames.push({
          version: 2,
          seq: buf[i + 4]!,
          sysid: buf[i + 5]!,
          compid: buf[i + 6]!,
          msgid,
          incompatFlags: incompat,
          compatFlags: buf[i + 3]!,
          payload: buf.slice(i + 10, i + 10 + payloadLen),
          signature: signed
            ? buf.slice(i + 12 + payloadLen, i + 12 + payloadLen + MAVLINK_SIGNATURE_BLOCK_LEN)
            : undefined,
          crcOk,
          raw: buf.slice(i, i + total),
        });
        i += total;
      } else {
        if (i + 6 > n) break; // başlık tamamlanmadı
        const total = 8 + payloadLen;
        if (i + total > n) break; // çerçeve tamamlanmadı

        const msgid = buf[i + 5]!;
        const ckA = buf[i + 6 + payloadLen]!;
        const ckB = buf[i + 7 + payloadLen]!;
        const crcOk = this.checkCrc(buf, i + 1, i + 6 + payloadLen, msgid, ckA, ckB);
        if (crcOk === false) { i++; continue; }

        frames.push({
          version: 1,
          seq: buf[i + 2]!,
          sysid: buf[i + 3]!,
          compid: buf[i + 4]!,
          msgid,
          incompatFlags: 0,
          compatFlags: 0,
          payload: buf.slice(i + 6, i + 6 + payloadLen),
          crcOk,
          raw: buf.slice(i, i + total),
        });
        i += total;
      }
    }

    this.buf = i >= n ? EMPTY : buf.slice(i);
    return frames;
  }

  /** crc_extra biliniyorsa CRC'yi doğrular; bilinmiyorsa undefined döner. */
  private checkCrc(
    buf: Uint8Array,
    crcStart: number,
    crcEnd: number,
    msgid: number,
    ckA: number,
    ckB: number,
  ): boolean | undefined {
    const extra = this.crcExtra?.(msgid);
    if (extra === undefined) return undefined;
    let crc = crcCalculate(buf, crcStart, crcEnd);
    crc = crcAccumulate(extra, crc);
    return (crc & 0xff) === ckA && ((crc >> 8) & 0xff) === ckB;
  }

  reset(): void {
    this.buf = EMPTY;
  }
}
