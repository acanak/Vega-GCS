// ArduPilot DataFlash (.bin) parser - kendini tanimlayan FMT formati.
// Her mesaj: 0xA3 0x95 <type> <payload>. FMT (type 128) diger tiplerin duzenini tanimlar.
import type { LogData, LogSeries, Cell } from './types';

const HEAD1 = 0xa3;
const HEAD2 = 0x95;
const FMT_TYPE = 128;

interface Fmt { name: string; length: number; format: string; columns: string[]; }

// format karakteri -> bayt boyutu
const SIZE: Record<string, number> = {
  a: 64, b: 1, B: 1, h: 2, H: 2, i: 4, I: 4, f: 4, d: 8,
  n: 4, N: 16, Z: 64, c: 2, C: 2, e: 4, E: 4, L: 4, M: 1, q: 8, Q: 8,
};

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readVal(v: DataView, off: number, ch: string): Cell {
  switch (ch) {
    case 'b': return v.getInt8(off);
    case 'B': case 'M': return v.getUint8(off);
    case 'h': return v.getInt16(off, true);
    case 'H': return v.getUint16(off, true);
    case 'i': case 'L': return v.getInt32(off, true);
    case 'I': return v.getUint32(off, true);
    case 'f': return v.getFloat32(off, true);
    case 'd': return v.getFloat64(off, true);
    case 'c': return v.getInt16(off, true) / 100;
    case 'C': return v.getUint16(off, true) / 100;
    case 'e': return v.getInt32(off, true) / 100;
    case 'E': return v.getUint32(off, true) / 100;
    case 'q': return Number(v.getBigInt64(off, true));
    case 'Q': return Number(v.getBigUint64(off, true));
    default: return NaN;
  }
}

export function parseDataflash(buf: Uint8Array): LogData {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const fmts = new Map<number, Fmt>();
  const messages = new Map<string, LogSeries>();
  const n = buf.length;
  let i = 0;

  while (i + 3 <= n) {
    if (buf[i] !== HEAD1 || buf[i + 1] !== HEAD2) { i++; continue; }
    const type = buf[i + 2]!;

    if (type === FMT_TYPE) {
      if (i + 89 > n) break;
      const ftype = buf[i + 3]!;
      const flen = buf[i + 4]!;
      const name = readStr(buf, i + 5, 4);
      const format = readStr(buf, i + 9, 16);
      const columns = readStr(buf, i + 25, 64).split(',').filter((c) => c.length > 0);
      fmts.set(ftype, { name, length: flen, format, columns });
      i += 89;
      continue;
    }

    const fmt = fmts.get(type);
    if (!fmt || fmt.length < 3) { i++; continue; }
    if (i + fmt.length > n) break;

    // alanlari coz
    let off = i + 3;
    const row: Cell[] = [];
    let bad = false;
    for (let k = 0; k < fmt.format.length; k++) {
      const ch = fmt.format[k]!;
      const sz = SIZE[ch];
      if (sz === undefined) { bad = true; break; }
      if (ch === 'n' || ch === 'N' || ch === 'Z') row.push(readStr(buf, off, sz));
      else if (ch === 'a') row.push(NaN);
      else row.push(readVal(view, off, ch));
      off += sz;
    }
    if (!bad) {
      let s = messages.get(fmt.name);
      if (!s) {
        const timeLabel = fmt.columns.includes('TimeUS') ? 'TimeUS' : fmt.columns.includes('TimeMS') ? 'TimeMS' : (fmt.columns[0] ?? '');
        s = { labels: fmt.columns, timeLabel, rows: [] };
        messages.set(fmt.name, s);
      }
      s.rows.push(row);
    }
    i += fmt.length;
  }

  return { messages };
}

/** Ilk baytlardan DataFlash .bin olup olmadigini anlar. */
export function isDataflash(buf: Uint8Array): boolean {
  return buf.length >= 3 && buf[0] === HEAD1 && buf[1] === HEAD2;
}
