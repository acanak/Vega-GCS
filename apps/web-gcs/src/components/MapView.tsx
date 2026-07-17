import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../gcs/theme';
import { useT } from '../gcs/i18n';
import { osmStyle, applyOsmPaint } from '../gcs/mapStyle';
import type { GcsConnection } from '../gcs/protocol-shared';
import type { AdsbContact } from '../gcs/useAdsb';

const MARKER_SVG = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M14 2 L22 24 L14 19 L6 24 Z" fill="#46e0d0" stroke="#04110f" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const ADSB_SVG = '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2 L14 10 L22 14 L22 16 L14 13 L13 20 L16 22 L16 23 L12 22 L8 23 L8 22 L11 20 L10 13 L2 16 L2 14 L10 10 Z" fill="#f2b134" stroke="#04110f" stroke-width="0.8"/></svg>';

function lineFeature(coords: Array<[number, number]>) {
  return { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: coords }, properties: {} };
}

const GOTO_SVG = '<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="none" stroke="#f2b134" stroke-width="2"/><circle cx="13" cy="13" r="2.5" fill="#f2b134"/><path d="M13 1 V6 M13 20 V25 M1 13 H6 M20 13 H25" stroke="#f2b134" stroke-width="2"/></svg>';

// --- Olcek/koordinat yardimcilari ---
const EARTH_C = 40075016.686; // ekvator cevresi (m)
const CSS_PX_PER_CM = 96 / 2.54; // CSS referans: 96px/inch -> ~37.795 px/cm
// MapLibre 512px doseme semasi: dunya = 512 * 2^z CSS px => m/px = C*cos(lat)/2^(z+9)
const metersPerPixel = (lat: number, zoom: number): number =>
  (EARTH_C * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 9);
const fmtDist = (m: number): string =>
  m >= 1000 ? (m / 1000 >= 10 ? Math.round(m / 1000) : (m / 1000).toFixed(1)) + ' km'
    : (m >= 10 ? Math.round(m) : m.toFixed(m >= 1 ? 1 : 2)) + ' m';
const fmtLat = (v: number): string => Math.abs(v).toFixed(6) + '°' + (v >= 0 ? 'N' : 'S');
const fmtLon = (v: number): string => Math.abs(v).toFixed(6) + '°' + (v >= 0 ? 'E' : 'W');
// En fazla maxPx genisligindeki "yuvarlak" olcek mesafesi (1/2/3/5 * 10^n)
const niceScale = (mpp: number, maxPx = 90): { meters: number; px: number } => {
  const maxM = mpp * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(maxM)));
  const d = maxM / pow;
  const nice = d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1;
  const meters = nice * pow;
  return { meters, px: meters / mpp };
};

export function MapView({ connRef, adsb = [], onContextGoto, guidedTarget }: {
  connRef: { current: GcsConnection | null }; adsb?: AdsbContact[];
  onContextGoto?: (lat: number, lon: number) => void;
  guidedTarget?: { lat: number; lon: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { effective } = useTheme();
  const t = useT();
  const mapRef = useRef<maplibregl.Map | null>(null);
  const adsbMarkers = useRef<maplibregl.Marker[]>([]);
  const gotoRef = useRef<{ cb?: (lat: number, lon: number) => void }>({});
  const gotoMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [autoPan, setAutoPan] = useState(true);
  const autoPanRef = useRef(true);
  useEffect(() => { autoPanRef.current = autoPan; }, [autoPan]);
  gotoRef.current = { cb: onContextGoto };

  // Overlay okumalari: re-render yerine dogrudan DOM'a yazilir (mousemove/move cok sik tetiklenir)
  const coordRef = useRef<HTMLSpanElement | null>(null);
  const zoomRef = useRef<HTMLSpanElement | null>(null);
  const cmRef = useRef<HTMLSpanElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const barLblRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({ container, style: osmStyle(effective), center: [0, 20], zoom: 2 });
    mapRef.current = map;

    // Konteyner boyutu degisince (panel duzeni degisimi vb.) WebGL canvas'i siyah kalmasin
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);

    // Overlay: imlec koordinati + zoom/olcek
    const updateCoord = (lng: number, lat: number): void => {
      if (coordRef.current) coordRef.current.textContent = fmtLat(lat) + '  ' + fmtLon(lng);
    };
    const updateScale = (): void => {
      const z = map.getZoom();
      const mpp = metersPerPixel(map.getCenter().lat, z);
      if (zoomRef.current) zoomRef.current.textContent = 'Z ' + z.toFixed(1);
      if (cmRef.current) cmRef.current.textContent = '1 cm ≈ ' + fmtDist(mpp * CSS_PX_PER_CM);
      const { meters, px } = niceScale(mpp);
      if (barRef.current) barRef.current.style.width = px.toFixed(1) + 'px';
      if (barLblRef.current) barLblRef.current.textContent = fmtDist(meters);
    };
    map.on('mousemove', (e) => updateCoord(e.lngLat.lng, e.lngLat.lat));
    map.on('move', updateScale);

    // Sağ tık (contextmenu) -> guided goto hedefi öner. İşaretçi onaydan sonra (guidedTarget) çizilir.
    map.on('contextmenu', (e) => {
      const g = gotoRef.current;
      if (!g.cb) return;
      e.preventDefault();
      g.cb(e.lngLat.lat, e.lngLat.lng);
    });

    const el = document.createElement('div');
    el.className = 'vehicle-marker';
    el.innerHTML = MARKER_SVG;
    const glyph = el.firstElementChild as HTMLElement | null;
    const marker = new maplibregl.Marker({ element: el });

    const track: Array<[number, number]> = [];
    let centered = false;
    let loaded = false;
    map.on('load', () => {
      map.addSource('track', { type: 'geojson', data: lineFeature([]) });
      map.addLayer({ id: 'track', type: 'line', source: 'track', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#46e0d0', 'line-width': 2, 'line-opacity': 0.85 } });
      loaded = true;
      setReady(true);
      const c = map.getCenter();
      updateCoord(c.lng, c.lat);
      updateScale();
    });

    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const t = connRef.current?.telemetry;
      if (!t) return;
      const { lat, lon, hdg } = t.position;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      marker.setLngLat([lon, lat]);
      if (!centered) { marker.addTo(map); map.jumpTo({ center: [lon, lat], zoom: 17 }); centered = true; }
      else if (autoPanRef.current) { map.setCenter([lon, lat]); } // otomatik takip
      if (glyph && Number.isFinite(hdg)) glyph.style.transform = 'rotate(' + hdg + 'deg)';
      const last = track[track.length - 1];
      if (loaded && (!last || Math.abs(last[0] - lon) > 1e-6 || Math.abs(last[1] - lat) > 1e-6)) {
        track.push([lon, lat]);
        if (track.length > 800) track.shift();
        (map.getSource('track') as GeoJSONSource | undefined)?.setData(lineFeature(track));
      }
    };
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); map.remove(); mapRef.current = null; setReady(false); };
  }, [connRef]);

  // ADS-B işaretçileri
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    adsbMarkers.current.forEach((m) => m.remove());
    adsbMarkers.current = [];
    for (const c of adsb) {
      const el = document.createElement('div');
      el.className = 'adsb-marker';
      el.innerHTML = ADSB_SVG + '<span class="adsb-label">' + (c.callsign || c.icao.toString(16)) + '</span>';
      const svg = el.firstElementChild as HTMLElement | null;
      if (svg && Number.isFinite(c.heading)) svg.style.transform = 'rotate(' + c.heading + 'deg)';
      adsbMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
    }
  }, [adsb, ready]);

  useEffect(() => { const m = mapRef.current; if (m) applyOsmPaint(m, effective); }, [effective]);

  // Guided hedef işaretçisi: onaylanan noktaya çiz; hedef temizlenince kaldır.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (guidedTarget) {
      if (!gotoMarker.current) {
        const el = document.createElement('div');
        el.className = 'goto-marker';
        el.innerHTML = GOTO_SVG;
        gotoMarker.current = new maplibregl.Marker({ element: el });
      }
      gotoMarker.current.setLngLat([guidedTarget.lon, guidedTarget.lat]).addTo(m);
    } else {
      gotoMarker.current?.remove();
    }
  }, [guidedTarget, ready]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map" />
      <label className="map-ctrl map-ctrl-tr" title={t('Aracı haritada merkezde tut')}>
        <input type="checkbox" checked={autoPan} onChange={(e) => setAutoPan(e.target.checked)} />
        <span>{t('Otomatik pan')}</span>
      </label>
      <div className="map-ovl map-ovl-bl">
        <span ref={coordRef} className="mo-coord">—</span>
      </div>
      <div className="map-ovl map-ovl-bc">
        <span className="mo-scalebar"><span ref={barLblRef} className="mo-bar-lbl">—</span><span ref={barRef} className="mo-bar" /></span>
        <span ref={cmRef} className="mo-cm">1 cm ≈ —</span>
        <span ref={zoomRef} className="mo-zoom">Z —</span>
      </div>
    </div>
  );
}
