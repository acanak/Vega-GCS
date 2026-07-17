import { describe, it, expect } from 'vitest';
import { generateLawnmower, computeLineSpacing } from '../src/survey';
import type { LatLon } from '../src/survey';

// ~100m x 100m kare (ekvatorda)
const square: LatLon[] = [
  { lat: 0, lon: 0 },
  { lat: 0, lon: 0.0009 },
  { lat: 0.0009, lon: 0.0009 },
  { lat: 0.0009, lon: 0 },
];

describe('survey lawnmower', () => {
  it('kareyi ~spacing araliginda tarar', () => {
    const wps = generateLawnmower(square, { spacingM: 20, angleDeg: 0, altitude: 50 });
    // ~100m / 20m ≈ 5 hat, her hat 2 uc = ~10 waypoint
    expect(wps.length).toBeGreaterThanOrEqual(8);
    expect(wps.length % 2).toBe(0);
    // hepsi poligon bbox'i icinde
    for (const w of wps) {
      expect(w.lat).toBeGreaterThanOrEqual(-1e-6);
      expect(w.lat).toBeLessThanOrEqual(0.0009 + 1e-6);
      expect(w.lon).toBeGreaterThanOrEqual(-1e-6);
      expect(w.lon).toBeLessThanOrEqual(0.0009 + 1e-6);
      expect(w.alt).toBe(50);
    }
  });

  it('boustrophedon: ardisik hatlar ters yonde', () => {
    const wps = generateLawnmower(square, { spacingM: 25, angleDeg: 0, altitude: 40 });
    // ilk hat soldan saga (lon artan), ikinci hat sagdan sola (lon azalan)
    expect(wps[0]!.lon).toBeLessThan(wps[1]!.lon);
    expect(wps[2]!.lon).toBeGreaterThan(wps[3]!.lon);
  });

  it('gecersiz girdi -> bos', () => {
    expect(generateLawnmower([{ lat: 0, lon: 0 }], { spacingM: 10, angleDeg: 0, altitude: 10 })).toEqual([]);
    expect(generateLawnmower(square, { spacingM: 0, angleDeg: 0, altitude: 10 })).toEqual([]);
  });

  it('computeLineSpacing kamera+sidelap', () => {
    // 50m irtifa, 13.2mm sensor, 8.8mm focal -> footprint 75m; %70 sidelap -> ~22.5m
    const s = computeLineSpacing({ altitude: 50, sensorWidthMm: 13.2, focalLengthMm: 8.8, sidelapPct: 70 });
    expect(s).toBeCloseTo(22.5, 1);
  });
});
