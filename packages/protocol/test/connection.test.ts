import { describe, it, expect } from 'vitest';
import { MavlinkParser } from '@wmp/mavlink-codec';
import type { Link, LinkKind } from '@wmp/link';
import {
  MavConnection,
  crcExtraFor,
  MSG,
  encodeHeartbeat,
  frameFor,
} from '../src/index';

/** Testler icin bellek-ici Link: yazilanlari toplar, feed() ile RX bayti enjekte eder. */
class MockLink implements Link {
  readonly kind: LinkKind = 'websocket';
  isOpen = false;
  sent: Uint8Array[] = [];
  private dataCbs = new Set<(c: Uint8Array) => void>();
  private closeCbs = new Set<(e?: Error) => void>();

  async open(): Promise<void> {
    this.isOpen = true;
  }
  async close(): Promise<void> {
    this.isOpen = false;
    for (const cb of this.closeCbs) cb(undefined);
  }
  async write(data: Uint8Array): Promise<void> {
    this.sent.push(data.slice());
  }
  onData(cb: (c: Uint8Array) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }
  onClose(cb: (e?: Error) => void): () => void {
    this.closeCbs.add(cb);
    return () => this.closeCbs.delete(cb);
  }
  feed(bytes: Uint8Array): void {
    for (const cb of this.dataCbs) cb(bytes);
  }
}

function vehicleHeartbeat(customMode: number, armed: boolean): Uint8Array {
  return frameFor(
    MSG.HEARTBEAT,
    encodeHeartbeat({
      type: 2,
      autopilot: 3, // ARDUPILOTMEGA (INVALID degil)
      baseMode: armed ? 0x80 : 0x00,
      customMode,
      systemStatus: 4,
    }),
    { seq: 0, sysid: 1, compid: 1 },
  );
}

describe('MavConnection (MockLink ile)', () => {
  it('arac HEARTBEAT ile baglanti tespit eder ve veri akisi ister', async () => {
    const link = new MockLink();
    const conn = new MavConnection({ link, heartbeatHz: 0 });
    let connectedSysid = -1;
    conn.onConnected((sysid) => (connectedSysid = sysid));
    await conn.open();

    expect(conn.telemetry.connected).toBe(false);
    link.feed(vehicleHeartbeat(5, true));

    expect(conn.telemetry.connected).toBe(true);
    expect(conn.telemetry.sysid).toBe(1);
    expect(conn.telemetry.armed).toBe(true);
    expect(conn.telemetry.customMode).toBe(5);
    expect(connectedSysid).toBe(1);

    // Baglaninca REQUEST_DATA_STREAM yazilmis olmali
    const parser = new MavlinkParser(crcExtraFor);
    const sentMsgIds = link.sent.flatMap((b) => parser.push(b)).map((f) => f.msgid);
    expect(sentMsgIds).toContain(MSG.REQUEST_DATA_STREAM);

    await conn.close();
  });

  it('kendi GCS heartbeatini (sysid 255) yok sayar', async () => {
    const link = new MockLink();
    const conn = new MavConnection({ link, heartbeatHz: 0 });
    await conn.open();
    const gcsHb = frameFor(
      MSG.HEARTBEAT,
      encodeHeartbeat({ type: 6, autopilot: 8, baseMode: 0, customMode: 0, systemStatus: 4 }),
      { seq: 0, sysid: 255, compid: 190 },
    );
    link.feed(gcsHb);
    expect(conn.telemetry.connected).toBe(false);
    await conn.close();
  });

  it('ATTITUDE telemetriyi gunceller', async () => {
    const link = new MockLink();
    const conn = new MavConnection({ link, heartbeatHz: 0 });
    await conn.open();
    link.feed(vehicleHeartbeat(0, false));

    const p = new Uint8Array(28);
    new DataView(p.buffer).setFloat32(4, 0.75, true); // roll
    link.feed(frameFor(MSG.ATTITUDE, p, { seq: 1, sysid: 1, compid: 1 }));
    expect(conn.telemetry.attitude.roll).toBeCloseTo(0.75, 5);

    await conn.close();
  });

  it('arm() dogru COMMAND_LONG cercevesi yazar', async () => {
    const link = new MockLink();
    const conn = new MavConnection({ link, heartbeatHz: 0 });
    await conn.open();
    link.feed(vehicleHeartbeat(0, false));
    link.sent = []; // veri-akis istegini temizle
    await conn.arm();

    const parser = new MavlinkParser(crcExtraFor);
    const frames = link.sent.flatMap((b) => parser.push(b));
    const cmd = frames.find((f) => f.msgid === MSG.COMMAND_LONG);
    expect(cmd).toBeDefined();
    const v = new DataView(cmd!.payload.buffer, cmd!.payload.byteOffset, cmd!.payload.byteLength);
    expect(v.getUint16(28, true)).toBe(400); // MAV_CMD_COMPONENT_ARM_DISARM
    expect(v.getFloat32(0, true)).toBe(1); // arm
    await conn.close();
  });
});
