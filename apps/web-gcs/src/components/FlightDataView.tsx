import { useEffect, useRef, useState } from 'react';
import { MSG, vehicleModeIds } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useAdsb } from '../gcs/useAdsb';
import { useTelemetry } from '../gcs/useTelemetry';
import { PlaybackSource } from '../gcs/PlaybackSource';
import { parseTlog, parseDataflash, isDataflash } from '@wmp/logparser';
import { useT } from '../gcs/i18n';
import type { ParamEntry } from '@wmp/protocol';
import { Hud } from './Hud';
import { MapView } from './MapView';
import { ActionsPanel } from './ActionsPanel';
import { NumberPromptModal } from './NumberPromptModal';
import { SystemsPanel } from './SystemsPanel';
import { ChatPanel } from './ChatPanel';

const POS_TYPE_MASK = 0xff8; // yalniz konum (hiz/ivme/yaw yok sayilir)

const fmtTime = (s: number): string =>
  Math.floor(s / 60).toString().padStart(2, '0') + ':' + Math.floor(s % 60).toString().padStart(2, '0');

export function FlightDataView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const [playback, setPlayback] = useState<PlaybackSource | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(2);
  const playbackRef = useRef<PlaybackSource | null>(null);
  const timeRef = useRef(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { playbackRef.current = playback; }, [playback]);

  const activeRef = (playback ? playbackRef : gcs.connRef) as { current: GcsConnection | null };
  const telemetry = useTelemetry(activeRef);
  const adsb = useAdsb(gcs);
  const connected = gcs.status === 'connected';

  const [gotoAlt, setGotoAlt] = useState(30);
  const [gotoTarget, setGotoTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [guidedTarget, setGuidedTarget] = useState<{ lat: number; lon: number } | null>(null);
  const [sysOpen, setSysOpen] = useState(() => localStorage.getItem('wmp-sys-open') !== '0');
  const toggleSys = (open: boolean): void => { setSysOpen(open); localStorage.setItem('wmp-sys-open', open ? '1' : '0'); };

  // GUIDED: bir noktaya git (SET_POSITION_TARGET_GLOBAL_INT, göreceli irtifa)
  const gotoPoint = (lat: number, lon: number): void => {
    const c = gcs.connRef.current;
    if (!c) return;
    const t = c.telemetry;
    // Araç GUIDED değilse otomatik geç (ArduPilot aksi halde konum hedefini yok sayar)
    const guided = vehicleModeIds(t.vehicleType).GUIDED;
    if (guided !== undefined) void c.setMode(guided);
    c.sendMessage(MSG.SET_POSITION_TARGET_GLOBAL_INT, {
      time_boot_ms: 0,
      lat_int: Math.round(lat * 1e7), lon_int: Math.round(lon * 1e7), alt: gotoAlt,
      vx: 0, vy: 0, vz: 0, afx: 0, afy: 0, afz: 0, yaw: 0, yaw_rate: 0,
      type_mask: POS_TYPE_MASK, target_system: t.sysid || 1, target_component: t.compid || 1, coordinate_frame: 6,
    });
  };
  // Haritada sağ tık -> hedef önerisi (popup). Onaylanınca git + işaretçiyi çiz.
  const confirmGoto = (): void => {
    if (!gotoTarget) return;
    gotoPoint(gotoTarget.lat, gotoTarget.lon);
    setGuidedTarget(gotoTarget);
    setGotoTarget(null);
  };

  const loadReplay = async (file: File): Promise<void> => {
    const buf = new Uint8Array(await file.arrayBuffer());
    const data = isDataflash(buf) ? parseDataflash(buf) : parseTlog(buf);
    const pb = new PlaybackSource(data);
    setPlayback(pb);
    playbackRef.current = pb;
    timeRef.current = 0;
    setTime(0);
    setPlaying(pb.samples.length > 1);
  };
  const exitReplay = (): void => { setPlayback(null); playbackRef.current = null; setPlaying(false); };
  const scrub = (t: number): void => { timeRef.current = t; setTime(t); playback?.seek(t); };

  useEffect(() => {
    if (!playback || !playing) return;
    let raf = 0;
    let last = performance.now();
    let lastShown = -1;
    const step = (now: number): void => {
      raf = requestAnimationFrame(step);
      const dt = (now - last) / 1000;
      last = now;
      let t = timeRef.current + dt * speed;
      if (t >= playback.duration) { t = playback.duration; setPlaying(false); }
      timeRef.current = t;
      playback.seek(t);
      if (Math.abs(t - lastShown) > 0.1) { lastShown = t; setTime(t); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playback, playing, speed]);

  return (
    <main className={'console console-flight' + (sysOpen ? '' : ' sys-collapsed')}>
      <section className="col col-pfd">
        <div className="pfd-frame"><Hud connRef={activeRef} /></div>
        {playback ? (
          <div className="card">
            <div className="card-hd"><h2>{t('Kayıt oynatma')}</h2><span className="hd-note">{fmtTime(time)} / {fmtTime(playback.duration)}</span></div>
            <div className="card-body">
              <div className="transport">
                <button className="btn-primary" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸' : '▶'}</button>
                <input type="range" min={0} max={playback.duration || 1} step={0.1} value={time} onChange={(e) => scrub(Number(e.target.value))} />
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{[1, 2, 4, 8].map((x) => <option key={x} value={x}>{x}x</option>)}</select>
                <button className="btn-ghost" onClick={exitReplay}>{t('Canlıya dön')}</button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ActionsPanel connRef={gcs.connRef} connected={connected} onOpenReplay={() => fileRef.current?.click()} vehicleType={telemetry?.vehicleType ?? 0} />
            <input ref={fileRef} type="file" accept=".tlog,.bin,.log" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadReplay(f); e.target.value = ''; }} />
          </>
        )}
      </section>
      <section className="col col-map">
        <div className="card map-card"><MapView connRef={activeRef} adsb={adsb} onContextGoto={playback ? undefined : (lat, lon) => setGotoTarget({ lat, lon })} guidedTarget={guidedTarget} /></div>
      </section>
      {sysOpen ? (
        <aside className="col col-sys-fill">
          <SystemsPanel telemetry={telemetry} onCollapse={() => toggleSys(false)} />
          <ChatPanel gcs={gcs} telemetry={telemetry} params={params} setParams={setParams} />
        </aside>
      ) : (
        <button className="sys-rail" onClick={() => toggleSys(true)} title={t('Sistemler')} aria-label={t('Sistemler')}>
          <span className="sys-rail-icon">‹</span>
          <span className="sys-rail-label">{t('Sistemler')}</span>
        </button>
      )}
      {gotoTarget && (
        <NumberPromptModal
          title={t('Buraya git (Guided)')}
          message={`${gotoTarget.lat.toFixed(6)}, ${gotoTarget.lon.toFixed(6)}`}
          label={t('Hedef irtifa')}
          value={gotoAlt}
          onValue={setGotoAlt}
          confirmLabel={t('Git')}
          onConfirm={confirmGoto}
          onClose={() => setGotoTarget(null)}
        />
      )}
    </main>
  );
}
