import { describe, it, expect } from 'vitest';
import { MavlinkParser } from '../src/parser';
import { buildFrameV2 } from '../src/serialize';

// Ornek crc_extra degerleri (gercek diyalektten): HEARTBEAT=50, ATTITUDE=39.
const CRC_EXTRA: Record<number, number> = { 0: 50, 30: 39 };
const lookup = (id: number): number | undefined => CRC_EXTRA[id];

describe('MavlinkParser (v2)', () => {
  it('kurulan bir cerceveyi round-trip cozer, CRC dogru', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 0, 0, 7]); // son bayt sifir degil
    const frame = buildFrameV2({ seq: 5, sysid: 1, compid: 1, msgid: 30, payload, crcExtra: 39 });
    const frames = new MavlinkParser(lookup).push(frame);
    expect(frames).toHaveLength(1);
    const f = frames[0]!;
    expect(f.version).toBe(2);
    expect(f.msgid).toBe(30);
    expect(f.seq).toBe(5);
    expect(f.sysid).toBe(1);
    expect(f.crcOk).toBe(true);
    expect(Array.from(f.payload)).toEqual([1, 2, 3, 4, 0, 0, 7]);
  });

  it('bastaki cop baytlari atlayip gercek cerceveyi bulur', () => {
    const frame = buildFrameV2({
      seq: 1, sysid: 1, compid: 1, msgid: 0,
      payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), crcExtra: 50,
    });
    const garbage = new Uint8Array([0x11, 0x22, 0x00, 0x7e]); // STX icermez
    const combined = new Uint8Array(garbage.length + frame.length);
    combined.set(garbage, 0);
    combined.set(frame, garbage.length);
    const frames = new MavlinkParser(lookup).push(combined);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.msgid).toBe(0);
    expect(frames[0]!.crcOk).toBe(true);
  });

  it('parcali (fragmented) teslimati birden fazla push arasinda birlestirir', () => {
    const frame = buildFrameV2({
      seq: 2, sysid: 1, compid: 1, msgid: 30,
      payload: new Uint8Array([9, 8, 7]), crcExtra: 39,
    });
    const parser = new MavlinkParser(lookup);
    const mid = Math.floor(frame.length / 2);
    expect(parser.push(frame.subarray(0, mid))).toHaveLength(0);
    const frames = parser.push(frame.subarray(mid));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.msgid).toBe(30);
  });

  it('crc_extra bozuk cerceveyi reddeder (crcOk=false, cerce yok)', () => {
    const frame = buildFrameV2({
      seq: 3, sysid: 1, compid: 1, msgid: 30,
      payload: new Uint8Array([1, 2, 3]), crcExtra: 39,
    });
    frame[frame.length - 1] = (frame[frame.length - 1]! ^ 0xff) & 0xff; // CRC'yi boz
    const frames = new MavlinkParser(lookup).push(frame);
    expect(frames).toHaveLength(0);
  });

  it('ardisik iki cerceveyi tek push icinde cozer', () => {
    const a = buildFrameV2({ seq: 1, sysid: 1, compid: 1, msgid: 0, payload: new Uint8Array([1]), crcExtra: 50 });
    const b = buildFrameV2({ seq: 2, sysid: 1, compid: 1, msgid: 30, payload: new Uint8Array([2]), crcExtra: 39 });
    const combined = new Uint8Array(a.length + b.length);
    combined.set(a, 0);
    combined.set(b, a.length);
    const frames = new MavlinkParser(lookup).push(combined);
    expect(frames).toHaveLength(2);
    expect(frames[0]!.msgid).toBe(0);
    expect(frames[1]!.msgid).toBe(30);
  });
});
