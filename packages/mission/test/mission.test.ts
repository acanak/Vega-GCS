import { describe, it, expect } from 'vitest';
import {
  parseWaypointsFile, serializeWaypointsFile, makeWaypoint,
  missionLine, missionPoints, cmdRoutable, cmdName, FRAME_GLOBAL_REL_ALT,
} from '../src/index';

describe('.waypoints (QGC WPL 110)', () => {
  it('bilinen bir dosyayi cozer', () => {
    const txt = [
      'QGC WPL 110',
      '0\t1\t0\t16\t0\t0\t0\t0\t-35.36\t149.16\t584\t1',
      '1\t0\t3\t22\t0\t0\t0\t0\t-35.36\t149.16\t50\t1',
      '2\t0\t3\t16\t0\t0\t0\t0\t-35.361\t149.161\t60\t1',
    ].join('\n');
    const wps = parseWaypointsFile(txt);
    expect(wps).toHaveLength(3);
    expect(wps[0]!.command).toBe(16);
    expect(wps[1]!.command).toBe(22);
    expect(wps[1]!.alt).toBe(50);
    expect(wps[2]!.lat).toBeCloseTo(-35.361, 5);
  });

  it('round-trip (serialize -> parse) korunur', () => {
    const wps = [
      makeWaypoint(16, -35.36, 149.16, 0),
      makeWaypoint(22, -35.36, 149.16, 50),
      makeWaypoint(16, -35.362, 149.162, 60),
    ];
    const wps2 = parseWaypointsFile(serializeWaypointsFile(wps));
    expect(wps2).toHaveLength(3);
    expect(wps2[2]!.lat).toBeCloseTo(-35.362, 6);
    expect(wps2[2]!.alt).toBe(60);
    expect(wps2[1]!.frame).toBe(FRAME_GLOBAL_REL_ALT);
  });
});

describe('harita geometrisi', () => {
  it('rota home + routable waypoint iceriyor, ROI haric', () => {
    const wps = [
      makeWaypoint(16, 10, 20, 0), // home
      makeWaypoint(22, 10, 20, 50), // takeoff (routable)
      makeWaypoint(201, 10.5, 20.5, 0), // ROI (routable degil)
      makeWaypoint(16, 11, 21, 60), // waypoint (routable)
    ];
    const line = missionLine(wps);
    expect(line).toHaveLength(3); // home + takeoff + waypoint (ROI haric)
    const pts = missionPoints(wps);
    expect(pts.map((p) => p.kind)).toEqual(['home', 'wp', 'roi', 'wp']);
  });

  it('komut katalogu', () => {
    expect(cmdName(16)).toBe('WAYPOINT');
    expect(cmdRoutable(201)).toBe(false);
    expect(cmdRoutable(16)).toBe(true);
  });
});
