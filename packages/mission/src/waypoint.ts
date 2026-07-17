// Gorev modeli - Mission Planner'daki Locationwp'nin web karsiligi.

export interface Waypoint {
  command: number; // MAV_CMD
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  lat: number; // derece
  lon: number; // derece
  alt: number; // metre (secili cerceveye gore)
  frame: number; // MAV_FRAME
  autocontinue: number;
}

// MAV_FRAME (irtifa modu)
export const FRAME_GLOBAL = 0; // mutlak (MSL)
export const FRAME_GLOBAL_REL_ALT = 3; // home'a gore (varsayilan)
export const FRAME_GLOBAL_TERRAIN_ALT = 10; // arazi takip

export const FRAME_NAMES: Readonly<Record<number, string>> = {
  0: 'Mutlak (MSL)',
  3: 'Göreli (home)',
  10: 'Arazi',
};

export function makeWaypoint(command: number, lat: number, lon: number, alt: number): Waypoint {
  return { command, p1: 0, p2: 0, p3: 0, p4: 0, lat, lon, alt, frame: FRAME_GLOBAL_REL_ALT, autocontinue: 1 };
}
