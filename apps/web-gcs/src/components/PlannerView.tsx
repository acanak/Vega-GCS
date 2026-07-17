import { useEffect, useState } from 'react';
import type { VehicleTelemetry } from '@wmp/protocol';
import type { Waypoint } from '@wmp/mission';
import { makeWaypoint, serializeWaypointsFile, parseWaypointsFile, generateLawnmower, MAV_MISSION_TYPE } from '@wmp/mission';
import type { UseGcs } from '../gcs/useGcs';
import type { MissionDoc, HomePos } from '../gcs/mission-doc';
import { docToRaw, rawToDoc, docToWaypoints, waypointsToDoc, fenceToRaw, rawToFence, rallyToRaw, rawToRally } from '../gcs/mission-doc';
import { useT } from '../gcs/i18n';
import { PlannerMap } from './PlannerMap';
import { CommandGrid } from './CommandGrid';
import { PlannerToolbar } from './PlannerToolbar';
import { SurveyPanel } from './SurveyPanel';
import { FenceRallyPanel } from './FenceRallyPanel';

const DEFAULT_ALT = 50;
type Mode = 'wp' | 'poly' | 'fence' | 'rally';

interface Props {
  gcs: UseGcs;
  telemetry: VehicleTelemetry | null;
  mission: MissionDoc;
  setMission: (u: MissionDoc | ((m: MissionDoc) => MissionDoc)) => void;
}

export function PlannerView({ gcs, telemetry, mission, setMission }: Props) {
  const t = useT();
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('wp');
  const [spacing, setSpacing] = useState(15);
  const [angle, setAngle] = useState(0);
  const [alt, setAlt] = useState(DEFAULT_ALT);
  const connected = gcs.status === 'connected';
  const conn = () => gcs.connRef.current;

  // Baglaninca home bos ise aracin konumundan otomatik doldur (H isaretcisi gorunsun)
  useEffect(() => {
    if (!connected || mission.home) return;
    const p = telemetry?.position;
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      setMission((m) => (m.home ? m : { ...m, home: { lat: p.lat, lon: p.lon, alt: 0 } }));
    }
  }, [connected, telemetry, mission.home, setMission]);

  const onMapClick = (lat: number, lon: number): void => {
    if (mode === 'poly') setMission((m) => ({ ...m, polygon: [...m.polygon, { lat, lon }] }));
    else if (mode === 'fence') setMission((m) => ({ ...m, fence: [...m.fence, { lat, lon }] }));
    else if (mode === 'rally') setMission((m) => ({ ...m, rally: [...m.rally, { lat, lon }] }));
    else setMission((m) => ({ ...m, items: [...m.items, makeWaypoint(16, lat, lon, alt)] }));
  };
  const moveItem = (i: number, lat: number, lon: number): void =>
    setMission((m) => { const items = m.items.slice(); const w = items[i]; if (w) items[i] = { ...w, lat, lon }; return { ...m, items }; });
  const moveHome = (lat: number, lon: number): void => setMission((m) => ({ ...m, home: { lat, lon, alt: m.home?.alt ?? 0 } }));
  const patchItem = (i: number, patch: Partial<Waypoint>): void =>
    setMission((m) => { const items = m.items.slice(); const w = items[i]; if (w) items[i] = { ...w, ...patch }; return { ...m, items }; });
  const patchHome = (patch: Partial<HomePos>): void =>
    setMission((m) => ({ ...m, home: { lat: m.home?.lat ?? 0, lon: m.home?.lon ?? 0, alt: m.home?.alt ?? 0, ...patch } }));
  const deleteItem = (i: number): void => setMission((m) => ({ ...m, items: m.items.filter((_, k) => k !== i) }));
  const moveRow = (i: number, dir: -1 | 1): void =>
    setMission((m) => { const items = m.items.slice(); const j = i + dir; if (j < 0 || j >= items.length) return m; const a = items[i]!; items[i] = items[j]!; items[j] = a; return { ...m, items }; });
  const clearAll = (): void => setMission((m) => ({ ...m, items: [] }));
  const clearPolygon = (): void => setMission((m) => ({ ...m, polygon: [] }));
  const generateSurvey = (): void => {
    const wps = generateLawnmower(mission.polygon, { spacingM: spacing, angleDeg: angle, altitude: alt });
    setMission((m) => ({ ...m, items: wps }));
    setStatus(wps.length + t(' waypoint üretildi'));
  };

  const loadFile = async (file: File): Promise<void> => { setMission(waypointsToDoc(parseWaypointsFile(await file.text()))); setStatus(file.name + t(' yüklendi')); };
  const saveFile = (): void => {
    const blob = new Blob([serializeWaypointsFile(docToWaypoints(mission))], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'mission.waypoints'; a.click(); URL.revokeObjectURL(url);
  };
  const runTask = async (label: string, fn: () => Promise<void>): Promise<void> => {
    if (!conn()) return;
    setStatus(label + '…');
    try { await fn(); } catch (e) { setStatus(label + t(' hatası: ') + (e instanceof Error ? e.message : String(e))); }
  };
  const readVehicle = () => runTask(t('Araçtan okunuyor'), async () => {
    const raw = await conn()!.downloadMission((r, t) => setStatus('İndiriliyor ' + r + '/' + t));
    setMission(rawToDoc(raw)); setStatus(raw.length + t(' öğe okundu ✓'));
  });
  const writeVehicle = () => runTask(t('Araca yazılıyor'), async () => {
    const res = await conn()!.uploadMission(docToRaw(mission), (s, t) => setStatus('Yükleniyor ' + s + '/' + t));
    setStatus(res === 0 ? t('Görev yazıldı ✓') : t('Sonuç: ') + res);
  });
  const setHomeToVehicle = (): void => {
    const p = telemetry?.position;
    if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) setMission((m) => ({ ...m, home: { lat: p.lat, lon: p.lon, alt: 0 } }));
  };

  const uploadFence = () => runTask(t('Fence yazılıyor'), async () => { const r = await conn()!.uploadMission(fenceToRaw(mission.fence), undefined, MAV_MISSION_TYPE.FENCE); setStatus(r === 0 ? t('Fence yazıldı ✓') : t('Fence sonuç: ') + r); });
  const downloadFence = () => runTask(t('Fence okunuyor'), async () => { const raw = await conn()!.downloadMission(undefined, MAV_MISSION_TYPE.FENCE); setMission((m) => ({ ...m, fence: rawToFence(raw) })); setStatus(t('Fence okundu ✓')); });
  const clearFence = (): void => setMission((m) => ({ ...m, fence: [] }));
  const uploadRally = () => runTask(t('Rally yazılıyor'), async () => { const r = await conn()!.uploadMission(rallyToRaw(mission.rally, alt), undefined, MAV_MISSION_TYPE.RALLY); setStatus(r === 0 ? t('Rally yazıldı ✓') : t('Rally sonuç: ') + r); });
  const downloadRally = () => runTask(t('Rally okunuyor'), async () => { const raw = await conn()!.downloadMission(undefined, MAV_MISSION_TYPE.RALLY); setMission((m) => ({ ...m, rally: rawToRally(raw) })); setStatus(t('Rally okundu ✓')); });
  const clearRally = (): void => setMission((m) => ({ ...m, rally: [] }));

  return (
    <main className="planner">
      <section className={'planner-map card' + (mode !== 'wp' ? ' draw-mode' : '')}>
        <PlannerMap mission={mission} mode={mode} connRef={gcs.connRef} onMapClick={onMapClick} onMoveItem={moveItem} onMoveHome={moveHome} />
      </section>
      <aside className="planner-side">
        <PlannerToolbar connected={connected} status={status} onLoad={loadFile} onSave={saveFile} onRead={readVehicle} onWrite={writeVehicle} onClear={clearAll} onSetHome={setHomeToVehicle} />
        <SurveyPanel mode={mode} setMode={setMode} spacing={spacing} setSpacing={setSpacing} angle={angle} setAngle={setAngle} alt={alt} setAlt={setAlt} polygonCount={mission.polygon.length} onGenerate={generateSurvey} onClearPolygon={clearPolygon} />
        <FenceRallyPanel mode={mode} setMode={setMode} connected={connected} fenceCount={mission.fence.length} rallyCount={mission.rally.length} onUploadFence={uploadFence} onDownloadFence={downloadFence} onClearFence={clearFence} onUploadRally={uploadRally} onDownloadRally={downloadRally} onClearRally={clearRally} />
        <CommandGrid mission={mission} onPatch={patchItem} onPatchHome={patchHome} onDelete={deleteItem} onMove={moveRow} />
      </aside>
    </main>
  );
}
