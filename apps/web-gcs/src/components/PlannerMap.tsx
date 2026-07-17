import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../gcs/theme';
import { osmStyle, applyOsmPaint } from '../gcs/mapStyle';
import { cmdHasLocation, cmdRoutable } from '@wmp/mission';
import type { LatLon } from '@wmp/mission';
import type { MissionDoc } from '../gcs/mission-doc';
import type { GcsConnection } from '../gcs/protocol-shared';

const VEHICLE_SVG = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M14 2 L22 24 L14 19 L6 24 Z" fill="#46e0d0" stroke="#04110f" stroke-width="1.6" stroke-linejoin="round"/></svg>';

function lineFeature(coords: Array<[number, number]>) {
  return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} };
}
function polyFeature(verts: LatLon[]) {
  const coords = verts.map((v) => [v.lon, v.lat] as [number, number]);
  if (coords.length >= 3) return { type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: [[...coords, coords[0]!]] }, properties: {} };
  return lineFeature(coords);
}

interface Props {
  mission: MissionDoc;
  mode: 'wp' | 'poly' | 'fence' | 'rally';
  connRef?: { current: GcsConnection | null };
  onMapClick: (lat: number, lon: number) => void;
  onMoveItem: (i: number, lat: number, lon: number) => void;
  onMoveHome: (lat: number, lon: number) => void;
}

export function PlannerMap({ mission, mode, connRef, onMapClick, onMoveItem, onMoveHome }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { effective } = useTheme();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const cb = useRef({ onMapClick, onMoveItem, onMoveHome });
  cb.current = { onMapClick, onMoveItem, onMoveHome };
  const connBox = useRef(connRef);
  connBox.current = connRef;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: osmStyle(effective), center: [0, 20], zoom: 2 });
    mapRef.current = map;
    // Sekme gizliyken 0 boyutta olusabilir; gorununce (boyut degisince) resize et
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    map.on('load', () => {
      map.addSource('poly', { type: 'geojson', data: polyFeature([]) });
      map.addLayer({ id: 'poly-fill', type: 'fill', source: 'poly', paint: { 'fill-color': '#c77dff', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'poly-line', type: 'line', source: 'poly', paint: { 'line-color': '#c77dff', 'line-width': 1.6, 'line-dasharray': [2, 1] } });
      map.addSource('fence', { type: 'geojson', data: polyFeature([]) });
      map.addLayer({ id: 'fence-fill', type: 'fill', source: 'fence', paint: { 'fill-color': '#ff5555', 'fill-opacity': 0.1 } });
      map.addLayer({ id: 'fence-line', type: 'line', source: 'fence', paint: { 'line-color': '#ff5555', 'line-width': 2 } });
      map.addSource('route', { type: 'geojson', data: lineFeature([]) });
      map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f2b134', 'line-width': 2.5, 'line-opacity': 0.9 } });
      setReady(true);
    });
    map.on('click', (e) => cb.current.onMapClick(e.lngLat.lat, e.lngLat.lng));

    // Canli arac isaretcisi: telemetriden konumu takip et
    const vEl = document.createElement('div');
    vEl.className = 'vehicle-marker';
    vEl.innerHTML = VEHICLE_SVG;
    const vGlyph = vEl.firstElementChild as HTMLElement | null;
    const vMarker = new maplibregl.Marker({ element: vEl });
    let vAdded = false;
    let vCentered = false;
    let raf = requestAnimationFrame(function loop(): void {
      raf = requestAnimationFrame(loop);
      const t = connBox.current?.current?.telemetry;
      if (!t) { if (vAdded) { vMarker.remove(); vAdded = false; } return; }
      const { lat, lon, hdg } = t.position;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      vMarker.setLngLat([lon, lat]);
      if (!vAdded) { vMarker.addTo(map); vAdded = true; }
      // Ilk sabitte, harita hala dunya gorunumundeyse araca odaklan (mevcut plan gorunumunu bozma)
      if (!vCentered) { if (map.getZoom() < 5) map.jumpTo({ center: [lon, lat], zoom: 16 }); vCentered = true; }
      if (vGlyph && Number.isFinite(hdg)) vGlyph.style.transform = 'rotate(' + hdg + 'deg)';
    });

    return () => { cancelAnimationFrame(raf); ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const coords: Array<[number, number]> = [];
    const addMarker = (lon: number, lat: number, label: string, cls: string, onDrag?: (lng: number, lat: number) => void): void => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = label;
      const mk = new maplibregl.Marker({ element: el, draggable: !!onDrag }).setLngLat([lon, lat]).addTo(map);
      if (onDrag) mk.on('dragend', () => { const ll = mk.getLngLat(); onDrag(ll.lng, ll.lat); });
      markersRef.current.push(mk);
    };

    if (mission.home) {
      addMarker(mission.home.lon, mission.home.lat, 'H', 'wp-marker home', (lng, lat) => cb.current.onMoveHome(lat, lng));
      coords.push([mission.home.lon, mission.home.lat]);
    }
    mission.items.forEach((w, i) => {
      if (!cmdHasLocation(w.command) || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return;
      const routable = cmdRoutable(w.command);
      addMarker(w.lon, w.lat, String(i + 1), 'wp-marker ' + (routable ? 'wp' : 'roi'), (lng, lat) => cb.current.onMoveItem(i, lat, lng));
      if (routable) coords.push([w.lon, w.lat]);
    });
    mission.polygon.forEach((v) => addMarker(v.lon, v.lat, '', 'poly-vertex'));
    mission.fence.forEach((v) => addMarker(v.lon, v.lat, '', 'fence-vertex'));
    mission.rally.forEach((v, i) => addMarker(v.lon, v.lat, String(i + 1), 'rally-marker'));

    (map.getSource('route') as GeoJSONSource | undefined)?.setData(lineFeature(coords));
    (map.getSource('poly') as GeoJSONSource | undefined)?.setData(polyFeature(mission.polygon));
    (map.getSource('fence') as GeoJSONSource | undefined)?.setData(polyFeature(mission.fence));
  }, [mission, ready]);

  useEffect(() => { const m = mapRef.current; if (m) applyOsmPaint(m, effective); }, [effective]);

  // Imleci canvas'a imperatif uygula; className'i degistirme (React aksi halde MapLibre'nin
  // 'maplibregl-map' sinifini silip konteyneri position:relative'den cikarir -> canvas kaçar).
  useEffect(() => {
    const m = mapRef.current;
    if (m) m.getCanvas().style.cursor = mode !== 'wp' ? 'crosshair' : '';
  }, [mode, ready]);

  return <div ref={containerRef} className="map" />;
}
