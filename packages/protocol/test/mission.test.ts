import { describe, it, expect } from 'vitest';
import { MavlinkParser, buildMessageV2, decodeMessage } from '@wmp/mavlink-codec';
import { ProtocolEngine, crcExtraFor, MSG } from '../src/index';
import type { RawMissionItem } from '../src/index';

const parser = new MavlinkParser(crcExtraFor);
const parseOne = (frame: Uint8Array) => parser.push(frame)[0]!;
const HDR = { seq: 0, sysid: 1, compid: 1 };
const gcsBase = { target_system: 255, target_component: 190, mission_type: 0 };

function mkItem(seq: number, command: number, x: number, y: number, z: number): RawMissionItem {
  return { seq, frame: 3, command, current: 0, autocontinue: 1, param1: 0, param2: 0, param3: 0, param4: 0, x, y, z };
}

describe('gorev protokolu (ProtocolEngine)', () => {
  it('downloadMission: COUNT + ITEM_INT akisini toplar', async () => {
    const items = [mkItem(0, 16, 100000, 200000, 0), mkItem(1, 22, 100000, 200000, 50), mkItem(2, 16, 110000, 210000, 60)];
    let eng: ProtocolEngine;
    eng = new ProtocolEngine({
      emit: (frame) => {
        const f = parseOne(frame);
        if (f.msgid === MSG.MISSION_REQUEST_LIST) {
          eng.ingest(buildMessageV2(HDR, MSG.MISSION_COUNT, { count: items.length, ...gcsBase })!);
        } else if (f.msgid === MSG.MISSION_REQUEST_INT) {
          const seq = Number(decodeMessage(MSG.MISSION_REQUEST_INT, f.payload)?.seq ?? 0);
          const it = items[seq]!;
          eng.ingest(buildMessageV2(HDR, MSG.MISSION_ITEM_INT, {
            seq: it.seq, frame: it.frame, command: it.command, current: it.current, autocontinue: it.autocontinue,
            param1: 0, param2: 0, param3: 0, param4: 0, x: it.x, y: it.y, z: it.z, ...gcsBase,
          })!);
        }
      },
    });
    const got = await eng.downloadMission();
    expect(got).toHaveLength(3);
    expect(got.map((i) => i.command)).toEqual([16, 22, 16]);
    expect(got[1]!.z).toBe(50);
    expect(got[2]!.x).toBe(110000);
  });

  it('uploadMission: COUNT gonderir, ITEM_INT istekleriyle besler, ACK ile biter', async () => {
    const items = [mkItem(0, 16, 1, 2, 0), mkItem(1, 22, 1, 2, 50), mkItem(2, 16, 3, 4, 60)];
    const sent: number[] = [];
    let eng: ProtocolEngine;
    let count = 0;
    eng = new ProtocolEngine({
      emit: (frame) => {
        const f = parseOne(frame);
        if (f.msgid === MSG.MISSION_COUNT) {
          count = Number(decodeMessage(MSG.MISSION_COUNT, f.payload)?.count ?? 0);
          eng.ingest(buildMessageV2(HDR, MSG.MISSION_REQUEST_INT, { seq: 0, ...gcsBase })!);
        } else if (f.msgid === MSG.MISSION_ITEM_INT) {
          const seq = Number(decodeMessage(MSG.MISSION_ITEM_INT, f.payload)?.seq ?? 0);
          sent.push(seq);
          if (seq < count - 1) {
            eng.ingest(buildMessageV2(HDR, MSG.MISSION_REQUEST_INT, { seq: seq + 1, ...gcsBase })!);
          } else {
            eng.ingest(buildMessageV2(HDR, MSG.MISSION_ACK, { type: 0, ...gcsBase })!);
          }
        }
      },
    });
    const result = await eng.uploadMission(items);
    expect(result).toBe(0);
    expect(sent).toEqual([0, 1, 2]);
  });
});
