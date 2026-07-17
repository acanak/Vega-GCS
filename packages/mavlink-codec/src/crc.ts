// CRC-16/MCRF4XX (X.25 kalıntısı, MAVLink'in kullandığı checksum).
// crc_extra tohum baytı her mesaj için ayrıca accumulate edilir.

export const X25_INIT_CRC = 0xffff;

/** Tek bir baytı mevcut crc'ye karıştırır. */
export function crcAccumulate(byte: number, crc: number): number {
  let tmp = (byte ^ (crc & 0xff)) & 0xff;
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

/** [start, end) aralığındaki baytların X.25 CRC'sini hesaplar. */
export function crcCalculate(data: Uint8Array, start = 0, end = data.length): number {
  let crc = X25_INIT_CRC;
  for (let i = start; i < end; i++) crc = crcAccumulate(data[i]!, crc);
  return crc;
}
