import { describe, it, expect } from 'vitest';
import { MavlinkParser } from '@wmp/mavlink-codec';
import { ProtocolEngine, crcExtraFor, MSG, encodeHeartbeat, frameFor } from '../src/index';

function vehicleHeartbeat(customMode: number, armed: boolean): Uint8Array {
  return frameFor(
    MSG.HEARTBEAT,
    encodeHeartbeat({ type: 2, autopilot: 3, baseMode: armed ? 0x80 : 0, customMode, systemStatus: 4 }),
    { seq: 0, sysid: 1, compid: 1 },
  );
}
function idsOf(frames: Uint8Array[]): number[] {
  const parser = new MavlinkParser(crcExtraFor);
  return frames.flatMap((b) => parser.push(b)).map((f) => f.msgid);
}

describe('ProtocolEngine (link-bagimsiz cekirdek)', () => {
  it('arac heartbeat ile baglanir ve veri akisi istegi emit eder', () => {
    const emitted: Uint8Array[] = [];
    const eng = new ProtocolEngine({ emit: (f) => void emitted.push(f) });
    eng.ingest(vehicleHeartbeat(5, true));
    expect(eng.telemetry.connected).toBe(true);
    expect(eng.telemetry.customMode).toBe(5);
    expect(eng.telemetry.armed).toBe(true);
    expect(idsOf(emitted)).toContain(MSG.REQUEST_DATA_STREAM);
  });

  it('arm() dogru COMMAND_LONG cercevesi emit eder', () => {
    const emitted: Uint8Array[] = [];
    const eng = new ProtocolEngine({ emit: (f) => void emitted.push(f) });
    eng.ingest(vehicleHeartbeat(0, false));
    emitted.length = 0;
    eng.arm();
    const parser = new MavlinkParser(crcExtraFor);
    const cmd = emitted.flatMap((b) => parser.push(b)).find((f) => f.msgid === MSG.COMMAND_LONG);
    expect(cmd).toBeDefined();
    const v = new DataView(cmd!.payload.buffer, cmd!.payload.byteOffset, cmd!.payload.byteLength);
    expect(v.getUint16(28, true)).toBe(400);
    expect(v.getFloat32(0, true)).toBe(1);
  });

  it('ATTITUDE telemetriyi gunceller', () => {
    const eng = new ProtocolEngine({ emit: () => {} });
    eng.ingest(vehicleHeartbeat(0, false));
    const p = new Uint8Array(28);
    new DataView(p.buffer).setFloat32(4, 0.5, true);
    eng.ingest(frameFor(MSG.ATTITUDE, p, { seq: 1, sysid: 1, compid: 1 }));
    expect(eng.telemetry.attitude.roll).toBeCloseTo(0.5, 5);
  });
});
