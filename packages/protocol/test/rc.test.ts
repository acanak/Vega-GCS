import { describe, it, expect } from 'vitest';
import { MavlinkParser, crcExtraFor, decodeMessage } from '@wmp/mavlink-codec';
import { ProtocolEngine, MSG } from '../src/index';

describe('sendMessage (RC_CHANNELS_OVERRIDE)', () => {
  it('alan-adiyla kodlayip dogru cerceve yollar', () => {
    const emitted: Uint8Array[] = [];
    const eng = new ProtocolEngine({ emit: (f) => void emitted.push(f) });
    eng.sendMessage(MSG.RC_CHANNELS_OVERRIDE, {
      target_system: 1, target_component: 1, chan1_raw: 1500, chan2_raw: 1600, chan3_raw: 1100, chan4_raw: 1500,
    });
    const f = new MavlinkParser(crcExtraFor).push(emitted[0]!)[0]!;
    expect(f.msgid).toBe(MSG.RC_CHANNELS_OVERRIDE);
    const d = decodeMessage(MSG.RC_CHANNELS_OVERRIDE, f.payload)!;
    expect(Number(d.chan1_raw)).toBe(1500);
    expect(Number(d.chan2_raw)).toBe(1600);
    expect(Number(d.chan3_raw)).toBe(1100);
  });
});
