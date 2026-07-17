import { describe, it, expect } from 'vitest';
import { MavlinkParser } from '../src/parser';
import { crcExtraFor, MESSAGES } from '../src/dialect';
import { decodeMessage, encodeMessagePayload, buildMessageV2 } from '../src/message';

const lookup = crcExtraFor;

function parseOne(frame: Uint8Array) {
  const frames = new MavlinkParser(lookup).push(frame);
  expect(frames).toHaveLength(1);
  return frames[0]!;
}

describe('jenerik mesaj codec (dialect metadata)', () => {
  it('HEARTBEAT build -> parse -> decode alanlari korur', () => {
    const frame = buildMessageV2({ seq: 0, sysid: 1, compid: 1 }, 0, {
      custom_mode: 5,
      type: 2,
      autopilot: 3,
      base_mode: 0x80,
      system_status: 4,
      mavlink_version: 3,
    })!;
    const f = parseOne(frame);
    expect(f.crcOk).toBe(true);
    const d = decodeMessage(0, f.payload)!;
    expect(d.custom_mode).toBe(5);
    expect(d.type).toBe(2);
    expect(d.base_mode).toBe(0x80);
  });

  it('STATUSTEXT char[50] alanini string olarak round-trip eder', () => {
    const frame = buildMessageV2({ seq: 1, sysid: 1, compid: 1 }, 253, {
      severity: 6,
      text: 'PreArm: check failed',
    })!;
    const f = parseOne(frame);
    const d = decodeMessage(253, f.payload)!;
    expect(d.severity).toBe(6);
    expect(d.text).toBe('PreArm: check failed');
  });

  it('GPS_RAW_INT uint64_t time_usec alanini bigint olarak decode eder', () => {
    const frame = buildMessageV2({ seq: 2, sysid: 1, compid: 1 }, 24, {
      time_usec: 123456789n,
      fix_type: 3,
      satellites_visible: 11,
    })!;
    const f = parseOne(frame);
    const d = decodeMessage(24, f.payload)!;
    expect(d.time_usec).toBe(123456789n);
    expect(d.fix_type).toBe(3);
    expect(d.satellites_visible).toBe(11);
  });

  it('sayisal dizi (array) alanini round-trip eder', () => {
    // Dizi alani olan ilk mesaji (char disi) tara ve round-trip et
    const withArray = Object.values(MESSAGES).find((m) =>
      m.fields.some((f) => f.arrayLen > 0 && f.type !== 'char' && f.type !== 'int64_t' && f.type !== 'uint64_t'),
    )!;
    const arrField = withArray.fields.find((f) => f.arrayLen > 0 && f.type !== 'char')!;
    const values = [1, 2, 3].slice(0, arrField.arrayLen);
    while (values.length < arrField.arrayLen) values.push(0);
    const payload = encodeMessagePayload(withArray.id, { [arrField.name]: values })!;
    const d = decodeMessage(withArray.id, payload)!;
    expect(Array.isArray(d[arrField.name])).toBe(true);
    expect((d[arrField.name] as number[]).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('bilinmeyen msgid icin undefined doner', () => {
    expect(decodeMessage(99999, new Uint8Array(0))).toBeUndefined();
    expect(encodeMessagePayload(99999, {})).toBeUndefined();
  });
});
