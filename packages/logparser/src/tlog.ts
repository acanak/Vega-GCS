// Telemetri logu (.tlog): 8 bayt big-endian mikro-saniye zaman damgasi + MAVLink cerceve.
import { MavlinkParser, crcExtraFor, decodeMessage, messageNameFor } from '@wmp/mavlink-codec';
import type { LogData, LogSeries, Cell } from './types';

export function parseTlog(buf: Uint8Array): LogData {
  const messages = new Map<string, LogSeries>();
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = buf.length;
  let i = 0;
  let t0: number | null = null;

  while (i + 8 < n) {
    // 8 bayt BE mikro-saniye
    const hi = view.getUint32(i, false);
    const lo = view.getUint32(i + 4, false);
    const usec = hi * 4294967296 + lo;
    const o = i + 8;
    const stx = buf[o];
    if (stx !== 0xfd && stx !== 0xfe) { i++; continue; }
    const payloadLen = buf[o + 1] ?? 0;
    const total = stx === 0xfd ? 12 + payloadLen + (((buf[o + 2] ?? 0) & 1) ? 13 : 0) : 8 + payloadLen;
    if (o + total > n) break;

    const frame = buf.subarray(o, o + total);
    const parsed = new MavlinkParser(crcExtraFor).push(frame)[0];
    if (parsed && parsed.crcOk !== false) {
      const name = messageNameFor(parsed.msgid);
      const fields = decodeMessage(parsed.msgid, parsed.payload);
      if (name && fields) {
        if (t0 === null) t0 = usec;
        const timeSec = (usec - t0) / 1e6;
        let s = messages.get(name);
        if (!s) {
          s = { labels: ['time', ...Object.keys(fields)], timeLabel: 'time', rows: [] };
          messages.set(name, s);
        }
        const row: Cell[] = [timeSec];
        for (let k = 1; k < s.labels.length; k++) {
          const val = fields[s.labels[k]!];
          row.push(typeof val === 'bigint' ? Number(val) : Array.isArray(val) ? NaN : (val ?? NaN));
        }
        s.rows.push(row);
      }
    }
    i = o + total;
  }
  return { messages };
}
