import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../gcs/theme';
import { osmStyle } from '../gcs/mapStyle';

function line(coords: Array<[number, number]>) {
  return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} };
}

export function LogTrackMap({ track }: { track: Array<[number, number]> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { effective } = useTheme();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const map = new maplibregl.Map({ container: c, style: osmStyle(effective), center: track[0] ?? [0, 20], zoom: track.length ? 14 : 2 });
    map.on('load', () => {
      map.addSource('t', { type: 'geojson', data: line(track) });
      map.addLayer({ id: 't', type: 'line', source: 't', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#46e0d0', 'line-width': 2 } });
      if (track.length > 1) {
        const b = new maplibregl.LngLatBounds(track[0], track[0]);
        for (const p of track) b.extend(p);
        map.fitBounds(b, { padding: 30, duration: 0 });
      }
    });
    return () => map.remove();
  }, [track, effective]);
  return <div ref={ref} className="log-map" />;
}
