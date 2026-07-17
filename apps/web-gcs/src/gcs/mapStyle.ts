import type { StyleSpecification } from 'maplibre-gl';
import type maplibregl from 'maplibre-gl';
import type { Effective } from './theme';

const paintFor = (t: Effective) =>
  t === 'light'
    ? { 'raster-brightness-max': 1, 'raster-saturation': 0, 'raster-contrast': 0 }
    : { 'raster-brightness-max': 0.72, 'raster-saturation': -0.35, 'raster-contrast': 0.08 };

export function osmStyle(theme: Effective): StyleSpecification {
  return {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
    layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: paintFor(theme) }],
  } as StyleSpecification;
}

export function applyOsmPaint(map: maplibregl.Map, theme: Effective): void {
  if (!map.getLayer('osm')) return;
  const p = paintFor(theme);
  map.setPaintProperty('osm', 'raster-brightness-max', p['raster-brightness-max']);
  map.setPaintProperty('osm', 'raster-saturation', p['raster-saturation']);
  map.setPaintProperty('osm', 'raster-contrast', p['raster-contrast']);
}
