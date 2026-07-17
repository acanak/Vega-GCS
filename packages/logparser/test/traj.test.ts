import { describe, it, expect } from 'vitest';
import { parseDataflash } from '../src/dataflash';
import { getTrajectory } from '../src/types';

function putStr(b: Uint8Array, off: number, s: string, len: number): void { for (let i = 0; i < len; i++) b[off + i] = i < s.length ? s.charCodeAt(i) : 0; }
function encFmt(ftype: number, name: string, format: string, labels: string, length: number): Uint8Array {
  const b = new Uint8Array(89); b[0] = 0xa3; b[1] = 0x95; b[2] = 128; b[3] = ftype; b[4] = length;
  putStr(b, 5, name, 4); putStr(b, 9, format, 16); putStr(b, 25, labels, 64); return b;
}
function concat(...a: Uint8Array[]): Uint8Array { const n = a.reduce((s, x) => s + x.length, 0); const o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }

describe('getTrajectory', () => {
  it('GPS + ATT birlestirip yorunge uretir', () => {
    const fmtGPS = encFmt(201, 'GPS', 'QLLf', 'TimeUS,Lat,Lng,Alt', 23);
    const fmtATT = encFmt(202, 'ATT', 'Qfff', 'TimeUS,Roll,Pitch,Yaw', 23);
    const gps = (us: bigint, lat: number, lng: number, alt: number): Uint8Array => {
      const d = new Uint8Array(23); d[0] = 0xa3; d[1] = 0x95; d[2] = 201; const v = new DataView(d.buffer);
      v.setBigUint64(3, us, true); v.setInt32(11, lat, true); v.setInt32(15, lng, true); v.setFloat32(19, alt, true); return d;
    };
    const attm = (us: bigint, r: number, p: number, y: number): Uint8Array => {
      const d = new Uint8Array(23); d[0] = 0xa3; d[1] = 0x95; d[2] = 202; const v = new DataView(d.buffer);
      v.setBigUint64(3, us, true); v.setFloat32(11, r, true); v.setFloat32(15, p, true); v.setFloat32(19, y, true); return d;
    };
    const buf = concat(fmtGPS, fmtATT, attm(900000n, 30, 0, 90), gps(1000000n, -353600000, 1491600000, 100), gps(2000000n, -353610000, 1491610000, 120));
    const traj = getTrajectory(parseDataflash(buf));
    expect(traj).toHaveLength(2);
    expect(traj[0]!.lat).toBeCloseTo(-35.36, 4);
    expect(traj[0]!.alt).toBe(100);
    expect(traj[0]!.roll).toBeCloseTo((30 * Math.PI) / 180, 4); // ATT deg -> rad
    expect(traj[1]!.t).toBeCloseTo(1, 5);
  });
});
