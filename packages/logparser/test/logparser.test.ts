import { describe, it, expect } from 'vitest';
import { buildMessageV2 } from '@wmp/mavlink-codec';
import { parseDataflash, isDataflash } from '../src/dataflash';
import { parseTlog } from '../src/tlog';
import { getSeries, getTrack, listPlottable } from '../src/types';

function putStr(b: Uint8Array, off: number, s: string, len: number): void {
  for (let i = 0; i < len; i++) b[off + i] = i < s.length ? s.charCodeAt(i) : 0;
}
function encFmt(ftype: number, name: string, format: string, labels: string, length: number): Uint8Array {
  const b = new Uint8Array(89);
  b[0] = 0xa3; b[1] = 0x95; b[2] = 128;
  b[3] = ftype; b[4] = length;
  putStr(b, 5, name, 4);
  putStr(b, 9, format, 16);
  putStr(b, 25, labels, 64);
  return b;
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

describe('DataFlash .bin parse', () => {
  it('FMT tanimlar, veri satirlarini cozer', () => {
    const fmtTST = encFmt(200, 'TST', 'Qff', 'TimeUS,A,B', 19);
    const fmtGPS = encFmt(201, 'GPS', 'QLL', 'TimeUS,Lat,Lng', 19);
    const tst = (us: bigint, a: number, b: number): Uint8Array => {
      const d = new Uint8Array(19); d[0] = 0xa3; d[1] = 0x95; d[2] = 200;
      const dv = new DataView(d.buffer);
      dv.setBigUint64(3, us, true); dv.setFloat32(11, a, true); dv.setFloat32(15, b, true);
      return d;
    };
    const gps = (): Uint8Array => {
      const d = new Uint8Array(19); d[0] = 0xa3; d[1] = 0x95; d[2] = 201;
      const dv = new DataView(d.buffer);
      dv.setBigUint64(3, 1000000n, true); dv.setInt32(11, -353600000, true); dv.setInt32(15, 1491600000, true);
      return d;
    };
    const buf = concat(fmtTST, fmtGPS, tst(1000000n, 1.5, -2.5), tst(2000000n, 3.5, 0), gps());
    expect(isDataflash(buf)).toBe(true);
    const data = parseDataflash(buf);

    const tstS = data.messages.get('TST')!;
    expect(tstS.labels).toEqual(['TimeUS', 'A', 'B']);
    expect(tstS.rows).toHaveLength(2);
    expect(tstS.rows[0]).toEqual([1000000, 1.5, -2.5]);

    const series = getSeries(data, 'TST', 'A');
    expect(series.x).toEqual([0, 1]); // 1e6 us fark -> 1 sn
    expect(series.y).toEqual([1.5, 3.5]);

    const track = getTrack(data);
    expect(track).toHaveLength(1);
    expect(track[0]![0]).toBeCloseTo(149.16, 4);
    expect(track[0]![1]).toBeCloseTo(-35.36, 4);

    expect(listPlottable(data).some((f) => f.msg === 'TST' && f.field === 'A')).toBe(true);
  });
});

describe('.tlog parse', () => {
  it('zaman damgali MAVLink cercevelerini cozer', () => {
    const frame = (roll: number): Uint8Array =>
      buildMessageV2({ seq: 0, sysid: 1, compid: 1 }, 30, {
        time_boot_ms: 0, roll, pitch: 0, yaw: 0, rollspeed: 0, pitchspeed: 0, yawspeed: 0,
      })!;
    const withTs = (us: number, f: Uint8Array): Uint8Array => {
      const b = new Uint8Array(8 + f.length);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, Math.floor(us / 4294967296), false);
      dv.setUint32(4, us % 4294967296, false);
      b.set(f, 8);
      return b;
    };
    const buf = concat(withTs(1000000, frame(0.5)), withTs(2000000, frame(0.75)));
    const data = parseTlog(buf);
    const att = data.messages.get('ATTITUDE')!;
    expect(att).toBeTruthy();
    expect(att.rows).toHaveLength(2);
    const s = getSeries(data, 'ATTITUDE', 'roll');
    expect(s.x[0]).toBe(0);
    expect(s.x[1]).toBeCloseTo(1, 5);
    expect(s.y[0]).toBeCloseTo(0.5, 5);
    expect(s.y[1]).toBeCloseTo(0.75, 5);
  });
});
