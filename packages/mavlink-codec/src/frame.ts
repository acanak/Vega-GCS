// MAVLink çerçeve sabitleri ve çözümlenmiş çerçeve tipi.

export const MAVLINK_STX_V1 = 0xfe;
export const MAVLINK_STX_V2 = 0xfd;
export const MAVLINK_IFLAG_SIGNED = 0x01;
export const MAVLINK_SIGNATURE_BLOCK_LEN = 13;

export type MavlinkVersion = 1 | 2;

export interface ParsedFrame {
  version: MavlinkVersion;
  seq: number;
  sysid: number;
  compid: number;
  msgid: number;
  incompatFlags: number;
  compatFlags: number;
  /** v2'de sondaki sıfırlar kırpılmış olabilir; alanlar çıkarılırken sıfırla doldurulur. */
  payload: Uint8Array;
  signature?: Uint8Array;
  /** crc_extra biliniyorsa true/false; bilinmiyorsa (doğrulanamadı) undefined. */
  crcOk: boolean | undefined;
  /** Çerçevenin ham baytları (STX'ten imza sonuna). */
  raw: Uint8Array;
}
