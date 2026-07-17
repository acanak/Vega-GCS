import { describe, it, expect } from 'vitest';
import { MavlinkParser } from '@wmp/mavlink-codec';
import {
  crcExtraFor,
  MSG,
  decodeHeartbeat,
  decodeAttitude,
  decodeNavControllerOutput,
  decodeCommandAck,
  encodeHeartbeat,
  encodeCommandLong,
  frameFor,
} from '../src/index';

const lookup = crcExtraFor;

describe('mesaj codec round-trip (cerceve -> parser -> decode)', () => {
  it('HEARTBEAT alanlari korunur', () => {
    const payload = encodeHeartbeat({
      type: 2, // QUADROTOR
      autopilot: 3, // ARDUPILOTMEGA
      baseMode: 0x80, // armed
      customMode: 5, // LOITER
      systemStatus: 4,
    });
    const frame = frameFor(MSG.HEARTBEAT, payload, { seq: 0, sysid: 1, compid: 1 });
    const [f] = new MavlinkParser(lookup).push(frame);
    expect(f!.crcOk).toBe(true);
    const hb = decodeHeartbeat(f!.payload);
    expect(hb.type).toBe(2);
    expect(hb.autopilot).toBe(3);
    expect(hb.customMode).toBe(5);
    expect(hb.armed).toBe(true);
  });

  // Regresyon: HEARTBEAT tel-sirasi custom_mode@0, type@4, autopilot@5, base_mode@6, system_status@7.
  // Eski hata base_mode'u offset 4'ten (type) okuyordu -> armed = (type & 0x80) hep false idi.
  it('HEARTBEAT standart tel-sirasindan (base_mode@6) armed cozulur', () => {
    const p = new Uint8Array(9);
    const v = new DataView(p.buffer);
    v.setUint32(0, 5, true); // custom_mode = 5
    v.setUint8(4, 1); // type = FIXED_WING (0x80 yok; eski kodda armed'i yanlislikla belirlerdi)
    v.setUint8(5, 3); // autopilot = ARDUPILOTMEGA
    v.setUint8(6, 0x81); // base_mode = SAFETY_ARMED | CUSTOM_MODE_ENABLED
    v.setUint8(7, 4); // system_status
    v.setUint8(8, 3); // mavlink_version
    const hb = decodeHeartbeat(p);
    expect(hb.type).toBe(1);
    expect(hb.autopilot).toBe(3);
    expect(hb.baseMode).toBe(0x81);
    expect(hb.customMode).toBe(5);
    expect(hb.armed).toBe(true);
  });

  it('HEARTBEAT disarm: base_mode 0x80 yoksa armed=false', () => {
    const p = new Uint8Array(9);
    const v = new DataView(p.buffer);
    v.setUint8(4, 1); // type = FIXED_WING
    v.setUint8(5, 3); // autopilot
    v.setUint8(6, 0x01); // base_mode = CUSTOM_MODE_ENABLED, armed degil
    const hb = decodeHeartbeat(p);
    expect(hb.armed).toBe(false);
    expect(hb.baseMode).toBe(0x01);
  });

  it('COMMAND_LONG param ve komut alanlari korunur', () => {
    const payload = encodeCommandLong({
      command: 400,
      targetSystem: 1,
      targetComponent: 1,
      params: [1, 21196, 0, 0, 0, 0, 0],
    });
    const frame = frameFor(MSG.COMMAND_LONG, payload, { seq: 1, sysid: 255, compid: 190 });
    const [f] = new MavlinkParser(lookup).push(frame);
    expect(f!.crcOk).toBe(true);
    expect(f!.msgid).toBe(MSG.COMMAND_LONG);
    // COMMAND_LONG payload'unda command uint16 offset 28'de
    const v = new DataView(f!.payload.buffer, f!.payload.byteOffset, f!.payload.byteLength);
    expect(v.getUint16(28, true)).toBe(400);
    expect(v.getFloat32(0, true)).toBe(1); // param1 = arm
  });

  it('ATTITUDE float alanlari yaklasik korunur', () => {
    // Ham ATTITUDE payload'i elle kur (offsetler: roll@4, pitch@8, yaw@12)
    const p = new Uint8Array(28);
    const dv = new DataView(p.buffer);
    dv.setUint32(0, 12345, true);
    dv.setFloat32(4, 0.5, true);
    dv.setFloat32(8, -0.25, true);
    dv.setFloat32(12, 1.5, true);
    const frame = frameFor(MSG.ATTITUDE, p, { seq: 0, sysid: 1, compid: 1 });
    const [f] = new MavlinkParser(lookup).push(frame);
    const a = decodeAttitude(f!.payload);
    expect(a.roll).toBeCloseTo(0.5, 5);
    expect(a.pitch).toBeCloseTo(-0.25, 5);
    expect(a.yaw).toBeCloseTo(1.5, 5);
  });

  it('NAV_CONTROLLER_OUTPUT: nav_roll@0, nav_pitch@4 (flight director)', () => {
    const p = new Uint8Array(26);
    const dv = new DataView(p.buffer);
    dv.setFloat32(0, 12.5, true);  // nav_roll (derece)
    dv.setFloat32(4, -3.25, true); // nav_pitch
    dv.setInt16(20, 90, true);     // nav_bearing
    const frame = frameFor(MSG.NAV_CONTROLLER_OUTPUT, p, { seq: 0, sysid: 1, compid: 1 });
    const [f] = new MavlinkParser(lookup).push(frame);
    expect(f!.crcOk).toBe(true); // crc_extra 183 dogru mu
    const n = decodeNavControllerOutput(f!.payload);
    expect(n.navRoll).toBeCloseTo(12.5, 4);
    expect(n.navPitch).toBeCloseTo(-3.25, 4);
    expect(n.navBearing).toBe(90);
  });

  it('COMMAND_ACK cozer', () => {
    const p = new Uint8Array(3);
    const dv = new DataView(p.buffer);
    dv.setUint16(0, 400, true);
    dv.setUint8(2, 0); // MAV_RESULT_ACCEPTED
    const frame = frameFor(MSG.COMMAND_ACK, p, { seq: 0, sysid: 1, compid: 1 });
    const [f] = new MavlinkParser(lookup).push(frame);
    const ack = decodeCommandAck(f!.payload);
    expect(ack.command).toBe(400);
    expect(ack.result).toBe(0);
  });
});
