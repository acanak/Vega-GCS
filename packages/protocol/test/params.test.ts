import { describe, it, expect } from 'vitest';
import { MavlinkParser, buildMessageV2, decodeMessage } from '@wmp/mavlink-codec';
import { ProtocolEngine, crcExtraFor, MSG } from '../src/index';

const parser = new MavlinkParser(crcExtraFor);
const parseOne = (frame: Uint8Array) => parser.push(frame)[0]!;
const HDR = { seq: 0, sysid: 1, compid: 1 };

function paramValue(id: string, value: number, index: number, count: number, type = 9): Uint8Array {
  return buildMessageV2(HDR, MSG.PARAM_VALUE, {
    param_value: value, param_count: count, param_index: index, param_id: id, param_type: type,
  })!;
}

describe('parametre protokolu (ProtocolEngine)', () => {
  it('downloadParams: PARAM_VALUE akisini toplar', async () => {
    const params = [
      { id: 'RC1_MIN', v: 1100, i: 0 },
      { id: 'RC1_MAX', v: 1900, i: 1 },
      { id: 'WPNAV_SPEED', v: 500, i: 2 },
    ];
    let eng: ProtocolEngine;
    eng = new ProtocolEngine({
      emit: (frame) => {
        const f = parseOne(frame);
        if (f.msgid === MSG.PARAM_REQUEST_LIST) {
          for (const p of params) eng.ingest(paramValue(p.id, p.v, p.i, params.length));
        }
      },
    });
    const got = await eng.downloadParamsClassic();
    expect(got).toHaveLength(3);
    expect(got.map((p) => p.name)).toEqual(['RC1_MIN', 'RC1_MAX', 'WPNAV_SPEED']);
    expect(got[2]!.value).toBe(500);
  });

  it('setParam: PARAM_SET gonderir, echo edilen degeri doner', async () => {
    let eng: ProtocolEngine;
    let sentName = '';
    let sentVal = 0;
    eng = new ProtocolEngine({
      emit: (frame) => {
        const f = parseOne(frame);
        if (f.msgid === MSG.PARAM_SET) {
          const d = decodeMessage(MSG.PARAM_SET, f.payload)!;
          sentName = String(d.param_id);
          sentVal = Number(d.param_value);
          eng.ingest(paramValue(sentName, sentVal, 5, 100));
        }
      },
    });
    const echoed = await eng.setParam('WPNAV_SPEED', 650, 9);
    expect(sentName).toBe('WPNAV_SPEED');
    expect(sentVal).toBe(650);
    expect(echoed).toBe(650);
  });
});
