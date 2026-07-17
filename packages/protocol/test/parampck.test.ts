import { describe, it, expect } from 'vitest';
import { decodeParamPck } from '../src/index';

const u16 = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];

describe('decodeParamPck (@PARAM/param.pck)', () => {
  it('header, delta-isim, PAD ve tipleri cozer', () => {
    const b: number[] = [];
    b.push(...u16(0x671b), ...u16(2), ...u16(2)); // magic, num_params, total_params
    // param1: FORMAT_VERSION (int16=120). b0=ptype2|flags0; b1=common0|(nameLen-1)<<4
    const n1 = 'FORMAT_VERSION';
    b.push(0x02, ((n1.length - 1) << 4) | 0, ...[...n1].map((c) => c.charCodeAt(0)), ...u16(120));
    b.push(0x00, 0x00); // PAD baytlari (girisin onunde atlanmali)
    // param2: FORMAT_XYZ, "FORMAT_"(7) ortak, float=1.5. b0=ptype4; b1=common7|(len-1)<<4
    const suf = 'XYZ';
    const f = new Uint8Array(new Float32Array([1.5]).buffer);
    b.push(0x04, ((suf.length - 1) << 4) | 7, ...[...suf].map((c) => c.charCodeAt(0)), ...f);

    const out = decodeParamPck(Uint8Array.from(b));
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({ name: 'FORMAT_VERSION', value: 120, type: 4 }); // INT16 -> MAV 4
    expect(out[1]!.name).toBe('FORMAT_XYZ');
    expect(out[1]!.value).toBeCloseTo(1.5);
    expect(out[1]!.type).toBe(9); // FLOAT -> REAL32
  });

  it('kotu magic reddeder', () => {
    expect(() => decodeParamPck(Uint8Array.from([0, 0, 0, 0, 0, 0]))).toThrow();
  });
});
