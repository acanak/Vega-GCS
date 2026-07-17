import { describe, it, expect } from 'vitest';
import { crcCalculate, crcAccumulate } from '../src/crc';

describe('CRC-16/MCRF4XX', () => {
  it('"123456789" icin standart kontrol degeri 0x6F91', () => {
    // "123456789" ASCII baytlari (0x31..0x39) - platform-bagimsiz olsun diye TextEncoder yok
    const data = Uint8Array.from([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
    expect(crcCalculate(data)).toBe(0x6f91);
  });

  it('crcAccumulate ile crcCalculate tutarli', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    let crc = 0xffff;
    for (const b of data) crc = crcAccumulate(b, crc);
    expect(crc).toBe(crcCalculate(data));
  });
});
