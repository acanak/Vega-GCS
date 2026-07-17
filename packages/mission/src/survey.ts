// Alan tarama (survey) grid ureteci: bir poligon icin lawnmower (bicerdover) rotasi.
// Kucuk alanlar icin lokal equirectangular projeksiyon (yeterli dogruluk) kullanir.
import type { Waypoint } from './waypoint';
import { FRAME_GLOBAL_REL_ALT } from './waypoint';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SurveyOpts {
  spacingM: number; // hat araligi (metre)
  angleDeg: number; // tarama acisi
  altitude: number; // irtifa (m)
  frame?: number;
}

/** Kamera + irtifa + sidelap'ten hat araligini (metre) hesaplar. */
export function computeLineSpacing(o: {
  altitude: number;
  sensorWidthMm: number;
  focalLengthMm: number;
  sidelapPct: number;
}): number {
  const footprint = (o.altitude * o.sensorWidthMm) / o.focalLengthMm;
  return Math.max(1, footprint * (1 - o.sidelapPct / 100));
}

/** Poligon icinde boustrophedon (gidis-donus) tarama waypoint'leri uretir. */
export function generateLawnmower(poly: LatLon[], opts: SurveyOpts): Waypoint[] {
  if (poly.length < 3 || opts.spacingM <= 0) return [];
  const refLat = poly.reduce((s, p) => s + p.lat, 0) / poly.length;
  const refLon = poly[0]!.lon;
  const refLat0 = poly[0]!.lat;
  const mLat = 111320;
  const mLon = 111320 * Math.cos((refLat * Math.PI) / 180);
  const a = (opts.angleDeg * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);

  // projekte et + tarama hatlari yatay olacak sekilde dondur
  const pr = poly.map((p) => {
    const x = (p.lon - refLon) * mLon;
    const y = (p.lat - refLat0) * mLat;
    return { x: x * ca + y * sa, y: -x * sa + y * ca };
  });
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const p of pr) {
    ymin = Math.min(ymin, p.y);
    ymax = Math.max(ymax, p.y);
  }

  const wps: Waypoint[] = [];
  let flip = false;
  for (let y = ymin + opts.spacingM / 2; y < ymax; y += opts.spacingM) {
    const xs: number[] = [];
    for (let i = 0; i < pr.length; i++) {
      const p1 = pr[i]!;
      const p2 = pr[(i + 1) % pr.length]!;
      if ((p1.y <= y && y < p2.y) || (p2.y <= y && y < p1.y)) {
        const t = (y - p1.y) / (p2.y - p1.y);
        xs.push(p1.x + t * (p2.x - p1.x));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x1 = xs[k]!;
      const x2 = xs[k + 1]!;
      const seg: Array<[number, number]> = flip ? [[x2, y], [x1, y]] : [[x1, y], [x2, y]];
      for (const [rx, ry] of seg) {
        const ux = rx * ca - ry * sa;
        const uy = rx * sa + ry * ca;
        wps.push({
          command: 16, p1: 0, p2: 0, p3: 0, p4: 0,
          lat: refLat0 + uy / mLat,
          lon: refLon + ux / mLon,
          alt: opts.altitude,
          frame: opts.frame ?? FRAME_GLOBAL_REL_ALT,
          autocontinue: 1,
        });
      }
    }
    flip = !flip;
  }
  return wps;
}
