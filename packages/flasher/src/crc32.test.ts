import { describe, it, expect } from 'vitest';
import { crc32, crc32Px4, expectedFlashCrc } from './crc32';

const enc = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('crc32', () => {
  it('zlib/IEEE standart kontrol değeri (123456789 -> 0xCBF43926)', () => {
    expect(crc32(enc('123456789')) >>> 0).toBe(0xcbf43926);
  });

  it('px4 varyantı (init=0, son XOR yok) zlib\'den farklı', () => {
    // init 0 + son XOR yok -> zlib ile aynı olmaz
    expect(crc32Px4(enc('123456789')) >>> 0).toBe(771566984);
    expect(crc32Px4(enc('123456789'))).not.toBe(crc32(enc('123456789')));
  });

  it('expectedFlashCrc bootloader (px4) varyantını kullanır — 0xff dolgu', () => {
    const img = enc('ArduPilot');
    const flashSize = 64;
    const padded = new Uint8Array(flashSize).fill(0xff);
    padded.set(img);
    expect(expectedFlashCrc(img, flashSize)).toBe(crc32Px4(padded));
    // Regresyon: eskiden zlib varyantı kullanılıyordu (CRC uyuşmuyor hatasına yol açıyordu)
    expect(expectedFlashCrc(img, flashSize)).not.toBe(crc32(padded));
  });
});
