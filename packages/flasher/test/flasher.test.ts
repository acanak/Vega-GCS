import { describe, it, expect } from 'vitest';
import { crc32, crc32Px4, expectedFlashCrc } from '../src/crc32';
import { parseApj } from '../src/apj';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([data as BlobPart]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}
function toB64(data: Uint8Array): string {
  let s = '';
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s);
}

describe('crc32', () => {
  it('"123456789" standart kontrol degeri 0xCBF43926', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
  });
  it('expectedFlashCrc: kisa imaj 0xff ile doldurulur (bootloader/px4 varyanti)', () => {
    const img = ascii('AB');
    const padded = new Uint8Array(8).fill(0xff);
    padded.set(img);
    // Bootloader GET_CRC = init 0, son XOR yok (zlib DEGIL)
    expect(expectedFlashCrc(img, 8)).toBe(crc32Px4(padded));
    expect(expectedFlashCrc(img, 8)).not.toBe(crc32(padded));
  });
});

describe('.apj parse', () => {
  it('base64+deflate imaji cozer, board_id doner', async () => {
    const image = ascii('ARDUPILOT-FIRMWARE-IMAGE');
    const apjText = JSON.stringify({ board_id: 9, image: toB64(await deflate(image)) });
    const apj = await parseApj(apjText);
    expect(apj.boardId).toBe(9);
    expect(Array.from(apj.image)).toEqual(Array.from(image));
  });
});
