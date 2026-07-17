// Harita icin gorev geometrisi: rota cizgisi ve marker noktalari.
import type { Waypoint } from './waypoint';
import { cmdRoutable, cmdHasLocation } from './commands';

const hasValidCoord = (w: Waypoint): boolean =>
  Number.isFinite(w.lat) && Number.isFinite(w.lon) && !(w.lat === 0 && w.lon === 0);

/** Rota cizgisi: home + rotaya dahil (routable) waypoint'ler, [lon,lat]. */
export function missionLine(wps: Waypoint[]): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  wps.forEach((w, i) => {
    if (!hasValidCoord(w)) return;
    if (i === 0 || cmdRoutable(w.command)) pts.push([w.lon, w.lat]);
  });
  return pts;
}

export type PointKind = 'home' | 'wp' | 'roi' | 'other';
export interface MissionPoint {
  seq: number;
  lon: number;
  lat: number;
  alt: number;
  kind: PointKind;
  command: number;
}

/** Konum tasiyan tum ogeler icin marker noktalari. */
export function missionPoints(wps: Waypoint[]): MissionPoint[] {
  const out: MissionPoint[] = [];
  wps.forEach((w, i) => {
    if (i !== 0 && !cmdHasLocation(w.command)) return;
    if (!hasValidCoord(w)) return;
    const kind: PointKind = i === 0 ? 'home' : w.command === 201 ? 'roi' : cmdRoutable(w.command) ? 'wp' : 'other';
    out.push({ seq: i, lon: w.lon, lat: w.lat, alt: w.alt, kind, command: w.command });
  });
  return out;
}
