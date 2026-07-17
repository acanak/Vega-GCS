// Intel HEX -> düz binary + taban adres. ArduPilot *_with_bl.hex için (DFU).
export interface HexImage { data: Uint8Array; base: number }

export function parseIntelHex(text: string): HexImage {
  let upper = 0;
  let minAddr = Infinity;
  let maxAddr = 0;
  const recs: Array<{ abs: number; data: number[] }> = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith(':')) continue;
    const b: number[] = [];
    for (let i = 1; i + 1 < raw.length; i += 2) b.push(parseInt(raw.substr(i, 2), 16));
    if (b.length < 5) continue;
    const len = b[0]!;
    const addr = (b[1]! << 8) | b[2]!;
    const type = b[3]!;
    if (type === 0x00) {
      const abs = (upper << 16) + addr;
      const data = b.slice(4, 4 + len);
      recs.push({ abs, data });
      minAddr = Math.min(minAddr, abs);
      maxAddr = Math.max(maxAddr, abs + len);
    } else if (type === 0x04) {
      upper = ((b[4]! << 8) | b[5]!);
    } else if (type === 0x02) {
      upper = (((b[4]! << 8) | b[5]!) << 4) >>> 16;
    } else if (type === 0x01) {
      break;
    }
  }
  if (!recs.length) throw new Error('Geçerli HEX kaydı yok');
  const size = maxAddr - minAddr;
  const out = new Uint8Array(size).fill(0xff);
  for (const r of recs) out.set(r.data, r.abs - minAddr);
  return { data: out, base: minAddr };
}
