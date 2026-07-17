// Standart CRC-32 (IEEE, poly 0xEDB88320) - px4 bootloader GET_CRC ile ayni.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Standart CRC-32 (IEEE/zlib): init 0xffffffff + son XOR 0xffffffff. */
export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = (TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * PX4/ArduPilot bootloader GET_CRC ile AYNI: init=0, son XOR YOK (zlib'den farkli!).
 * Bootloader flash'i 4'er bayt okuyup zincirleme bu sekilde hesaplar; state'i dogrudan dondurur.
 */
export function crc32Px4(data: Uint8Array, state = 0): number {
  let c = state >>> 0;
  for (let i = 0; i < data.length; i++) c = (TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return c >>> 0;
}

/** Imaji flash boyutuna 0xff ile doldurup bootloader-uyumlu CRC hesaplar (GET_CRC ile karsilastirmak icin). */
export function expectedFlashCrc(image: Uint8Array, flashSize: number): number {
  const padded = new Uint8Array(flashSize).fill(0xff);
  padded.set(image.subarray(0, flashSize));
  return crc32Px4(padded);
}
