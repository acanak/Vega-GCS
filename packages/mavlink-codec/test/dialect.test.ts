import { describe, it, expect } from 'vitest';
import { crcExtraFor, MESSAGE_IDS, MESSAGES } from '../src/dialect';

describe('uretilmis dialect (mavgen)', () => {
  it('bilinen crc_extra degerleri dogru', () => {
    const known: Record<number, number> = {
      0: 50, 1: 124, 24: 24, 30: 39, 33: 104, 66: 148, 74: 20, 76: 152, 77: 143, 253: 83,
    };
    for (const [id, v] of Object.entries(known)) {
      expect(crcExtraFor(Number(id))).toBe(v);
    }
  });

  it('HEARTBEAT tel-duzeni beklenen offsetlerde', () => {
    const m = MESSAGES[0]!;
    expect(m.wireLength).toBe(9);
    expect(m.fields[0]).toMatchObject({ name: 'custom_mode', offset: 0 });
    expect(m.fields.find((f) => f.name === 'type')!.offset).toBe(4);
  });

  it('GLOBAL_POSITION_INT lat/lon offsetleri elle decoder ile ayni', () => {
    const m = MESSAGES[33]!;
    expect(m.wireLength).toBe(28);
    expect(m.fields.find((f) => f.name === 'lat')!.offset).toBe(4);
    expect(m.fields.find((f) => f.name === 'lon')!.offset).toBe(8);
  });

  it('mesaj isim/kimlik haritasi', () => {
    expect(MESSAGE_IDS.HEARTBEAT).toBe(0);
    expect(MESSAGE_IDS.GLOBAL_POSITION_INT).toBe(33);
    expect(Object.keys(MESSAGES).length).toBeGreaterThan(200);
  });
});
