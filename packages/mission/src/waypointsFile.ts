// QGC WPL 110 (.waypoints) dosya formati - Mission Planner ile uyumlu tab-ayrilmis metin.
import type { Waypoint } from './waypoint';

const HEADER = 'QGC WPL 110';

/** Metni Waypoint dizisine cozer (indeks 0 = home). */
export function parseWaypointsFile(text: string): Waypoint[] {
  const out: Waypoint[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('QGC WPL')) continue;
    const f = line.split(/\s+/);
    if (f.length < 12) continue;
    out.push({
      frame: parseInt(f[2]!, 10),
      command: parseInt(f[3]!, 10),
      p1: parseFloat(f[4]!),
      p2: parseFloat(f[5]!),
      p3: parseFloat(f[6]!),
      p4: parseFloat(f[7]!),
      lat: parseFloat(f[8]!),
      lon: parseFloat(f[9]!),
      alt: parseFloat(f[10]!),
      autocontinue: parseInt(f[11]!, 10),
    });
  }
  return out;
}

const fmt = (x: number): string => String(parseFloat((Number.isFinite(x) ? x : 0).toFixed(6)));
const fmtCoord = (x: number): string => (Number.isFinite(x) ? x : 0).toFixed(8);

/** Waypoint dizisini QGC WPL 110 metnine cevirir. */
export function serializeWaypointsFile(wps: Waypoint[]): string {
  const rows = [HEADER];
  wps.forEach((w, i) => {
    rows.push(
      [
        i, i === 0 ? 1 : 0, w.frame, w.command,
        fmt(w.p1), fmt(w.p2), fmt(w.p3), fmt(w.p4),
        fmtCoord(w.lat), fmtCoord(w.lon), fmt(w.alt), w.autocontinue,
      ].join('\t'),
    );
  });
  return rows.join('\n') + '\n';
}
