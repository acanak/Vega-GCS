// Editor gorev belgesi (home + items + polygon + fence + rally) ile MAVLink / .waypoints donusumleri.
import type { Waypoint, LatLon } from '@wmp/mission';
import { FRAME_GLOBAL, FRAME_GLOBAL_REL_ALT, CMD_FENCE_POLYGON_INCLUSION, CMD_NAV_RALLY_POINT } from '@wmp/mission';
import type { RawMissionItem } from '@wmp/protocol';

export interface HomePos { lat: number; lon: number; alt: number; }
export interface MissionDoc {
  home: HomePos | null;
  items: Waypoint[];
  polygon: LatLon[];
  fence: LatLon[];
  rally: LatLon[];
}

export function emptyMission(): MissionDoc {
  return { home: null, items: [], polygon: [], fence: [], rally: [] };
}

export function rawToDoc(raw: RawMissionItem[]): MissionDoc {
  const doc = emptyMission();
  if (raw.length === 0) return doc;
  const h = raw[0]!;
  doc.home = { lat: h.x / 1e7, lon: h.y / 1e7, alt: h.z };
  doc.items = raw.slice(1).map<Waypoint>((r) => ({
    command: r.command, p1: r.param1, p2: r.param2, p3: r.param3, p4: r.param4,
    lat: r.x / 1e7, lon: r.y / 1e7, alt: r.z, frame: r.frame, autocontinue: r.autocontinue,
  }));
  return doc;
}

export function docToRaw(doc: MissionDoc): RawMissionItem[] {
  const home = doc.home ?? { lat: doc.items[0]?.lat ?? 0, lon: doc.items[0]?.lon ?? 0, alt: 0 };
  const raw: RawMissionItem[] = [{
    seq: 0, frame: FRAME_GLOBAL, command: 16, current: 1, autocontinue: 1,
    param1: 0, param2: 0, param3: 0, param4: 0,
    x: Math.round(home.lat * 1e7), y: Math.round(home.lon * 1e7), z: home.alt,
  }];
  doc.items.forEach((w, i) => raw.push({
    seq: i + 1, frame: w.frame, command: w.command, current: 0, autocontinue: w.autocontinue,
    param1: w.p1, param2: w.p2, param3: w.p3, param4: w.p4,
    x: Math.round(w.lat * 1e7), y: Math.round(w.lon * 1e7), z: w.alt,
  }));
  return raw;
}

export function docToWaypoints(doc: MissionDoc): Waypoint[] {
  const home = doc.home ?? { lat: doc.items[0]?.lat ?? 0, lon: doc.items[0]?.lon ?? 0, alt: 0 };
  const homeWp: Waypoint = { command: 16, p1: 0, p2: 0, p3: 0, p4: 0, lat: home.lat, lon: home.lon, alt: home.alt, frame: FRAME_GLOBAL, autocontinue: 1 };
  return [homeWp, ...doc.items];
}

export function waypointsToDoc(wps: Waypoint[]): MissionDoc {
  const doc = emptyMission();
  if (wps.length === 0) return doc;
  const h = wps[0]!;
  doc.home = { lat: h.lat, lon: h.lon, alt: h.alt };
  doc.items = wps.slice(1);
  return doc;
}

// ---- Geofence (inclusion poligonu) ----
export function fenceToRaw(poly: LatLon[]): RawMissionItem[] {
  return poly.map((v, i) => ({
    seq: i, frame: FRAME_GLOBAL, command: CMD_FENCE_POLYGON_INCLUSION, current: 0, autocontinue: 1,
    param1: poly.length, param2: 0, param3: 0, param4: 0,
    x: Math.round(v.lat * 1e7), y: Math.round(v.lon * 1e7), z: 0,
  }));
}
export function rawToFence(raw: RawMissionItem[]): LatLon[] {
  return raw.filter((r) => r.command === CMD_FENCE_POLYGON_INCLUSION).map((r) => ({ lat: r.x / 1e7, lon: r.y / 1e7 }));
}

// ---- Rally noktalari ----
export function rallyToRaw(pts: LatLon[], alt = 30): RawMissionItem[] {
  return pts.map((v, i) => ({
    seq: i, frame: FRAME_GLOBAL_REL_ALT, command: CMD_NAV_RALLY_POINT, current: 0, autocontinue: 1,
    param1: 0, param2: 0, param3: 0, param4: 0,
    x: Math.round(v.lat * 1e7), y: Math.round(v.lon * 1e7), z: alt,
  }));
}
export function rawToRally(raw: RawMissionItem[]): LatLon[] {
  return raw.filter((r) => r.command === CMD_NAV_RALLY_POINT).map((r) => ({ lat: r.x / 1e7, lon: r.y / 1e7 }));
}
