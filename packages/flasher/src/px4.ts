// px4 serial bootloader istemcisi (WebSerial uzerinden). Referans: MissionPlanner Uploader.cs.
import { expectedFlashCrc } from './crc32';
import type { Apj } from './apj';

const OK = 0x10;
const INSYNC = 0x12;
const EOC = 0x20;
const GET_SYNC = 0x21;
const GET_DEVICE = 0x22;
const CHIP_ERASE = 0x23;
const PROG_MULTI = 0x27;
const GET_CRC = 0x29;
const BOOT = 0x30;
const INFO_BL_REV = 1;
const INFO_BOARD_ID = 2;
const INFO_FLASH_SIZE = 4;
const PROG_MAX = 64;

/** Bootloader ile bayt-duzeyi haberlesme arayuzu. */
export interface SerialIO {
  write(data: Uint8Array): Promise<void>;
  read(n: number, timeoutMs: number): Promise<Uint8Array>;
}

export interface BoardInfo {
  blRev: number;
  boardId: number;
  flashSize: number;
}

export class Px4Bootloader {
  private io: SerialIO;
  constructor(io: SerialIO) {
    this.io = io;
  }

  private async expectSync(timeoutMs = 1000): Promise<void> {
    const r = await this.io.read(2, timeoutMs);
    if (r[0] !== INSYNC || r[1] !== OK) throw new Error('Bootloader senkron değil');
  }
  async sync(): Promise<void> {
    await this.io.write(Uint8Array.of(GET_SYNC, EOC));
    await this.expectSync();
  }
  private async getParam(param: number): Promise<number> {
    await this.io.write(Uint8Array.of(GET_DEVICE, param, EOC));
    const v = await this.io.read(4, 1000);
    const val = new DataView(v.buffer, v.byteOffset, 4).getUint32(0, true);
    await this.expectSync();
    return val >>> 0;
  }
  async getInfo(): Promise<BoardInfo> {
    return { blRev: await this.getParam(INFO_BL_REV), boardId: await this.getParam(INFO_BOARD_ID), flashSize: await this.getParam(INFO_FLASH_SIZE) };
  }
  async erase(): Promise<void> {
    await this.io.write(Uint8Array.of(CHIP_ERASE, EOC));
    await this.expectSync(30000);
  }
  async program(image: Uint8Array, onProgress?: (done: number, total: number) => void): Promise<void> {
    for (let off = 0; off < image.length; off += PROG_MAX) {
      const chunk = image.subarray(off, off + PROG_MAX);
      const pkt = new Uint8Array(chunk.length + 3);
      pkt[0] = PROG_MULTI;
      pkt[1] = chunk.length;
      pkt.set(chunk, 2);
      pkt[chunk.length + 2] = EOC;
      await this.io.write(pkt);
      await this.expectSync(3000);
      onProgress?.(Math.min(off + PROG_MAX, image.length), image.length);
    }
  }
  async getCrc(): Promise<number> {
    await this.io.write(Uint8Array.of(GET_CRC, EOC));
    const v = await this.io.read(4, 5000);
    const crc = new DataView(v.buffer, v.byteOffset, 4).getUint32(0, true);
    await this.expectSync();
    return crc >>> 0;
  }
  async reboot(): Promise<void> {
    await this.io.write(Uint8Array.of(BOOT, EOC));
  }
}

/**
 * Ham imaj flash: sync -> info -> (varsa kart kontrolu) -> erase -> program -> CRC dogrula -> reboot.
 * expectBoardId verilmezse kart uyumu KONTROL EDILMEZ (ham .bin icin — dogru kartı kullanıcı doğrular).
 */
export async function flashImage(
  io: SerialIO,
  image: Uint8Array,
  onProgress?: (done: number, total: number) => void,
  onLog?: (msg: string) => void,
  expectBoardId?: number,
): Promise<BoardInfo> {
  const bl = new Px4Bootloader(io);
  onLog?.('Senkronizasyon…');
  await bl.sync();
  const info = await bl.getInfo();
  onLog?.('Kart ' + info.boardId + ' · BL rev ' + info.blRev + ' · flash ' + info.flashSize + ' B');
  if (expectBoardId && info.boardId && expectBoardId !== info.boardId) {
    throw new Error('Kart uyumsuz: firmware ' + expectBoardId + ' ≠ kart ' + info.boardId);
  }
  if (image.length > info.flashSize) throw new Error('İmaj flash boyutundan büyük (' + image.length + ' > ' + info.flashSize + ')');
  onLog?.('Flash siliniyor…');
  await bl.erase();
  onLog?.('Yazılıyor… (' + Math.round(image.length / 1024) + ' KB)');
  await bl.program(image, onProgress);
  onLog?.('Doğrulanıyor…');
  const exp = expectedFlashCrc(image, info.flashSize);
  const act = await bl.getCrc();
  if (exp !== act) throw new Error('CRC uyuşmuyor (beklenen ' + exp + ', gelen ' + act + ')');
  onLog?.('CRC OK · yeniden başlatılıyor');
  await bl.reboot();
  return info;
}

/** Uctan uca .apj flash (kart uyumu apj.board_id ile kontrol edilir). */
export function flashApj(
  io: SerialIO,
  apj: Apj,
  onProgress?: (done: number, total: number) => void,
  onLog?: (msg: string) => void,
): Promise<BoardInfo> {
  return flashImage(io, apj.image, onProgress, onLog, apj.boardId);
}
