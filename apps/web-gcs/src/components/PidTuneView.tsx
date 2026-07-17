import { useEffect, useRef, useState } from 'react';
import { MSG, modeName, vehicleModeIds, frameClass } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const R2D = 180 / Math.PI;
interface PidGroup { title: string; params: string[] }
// Kopter (ATC_*): rate + angle P
const COPTER_GROUPS: PidGroup[] = [
  { title: 'Roll hız (rate)', params: ['ATC_RAT_RLL_P', 'ATC_RAT_RLL_I', 'ATC_RAT_RLL_D'] },
  { title: 'Pitch hız (rate)', params: ['ATC_RAT_PIT_P', 'ATC_RAT_PIT_I', 'ATC_RAT_PIT_D'] },
  { title: 'Yaw hız (rate)', params: ['ATC_RAT_YAW_P', 'ATC_RAT_YAW_I', 'ATC_RAT_YAW_D'] },
  { title: 'Açı (angle) P', params: ['ATC_ANG_RLL_P', 'ATC_ANG_PIT_P', 'ATC_ANG_YAW_P'] },
];
// Uçak (ArduPlane): sabit-kanat rate PID'leri + zaman sabiti (kaynak: APM_Control)
const PLANE_GROUPS: PidGroup[] = [
  { title: 'Roll hız (rate)', params: ['RLL_RATE_P', 'RLL_RATE_I', 'RLL_RATE_D', 'RLL_RATE_FF'] },
  { title: 'Pitch hız (rate)', params: ['PTCH_RATE_P', 'PTCH_RATE_I', 'PTCH_RATE_D', 'PTCH_RATE_FF'] },
  { title: 'Yaw hız (rate)', params: ['YAW_RATE_P', 'YAW_RATE_I', 'YAW_RATE_D', 'YAW_RATE_FF'] },
  { title: 'Zaman sabiti / limit', params: ['RLL2SRV_TCONST', 'PTCH2SRV_TCONST', 'RLL2SRV_RMAX', 'PTCH2SRV_RMAX_UP'] },
];

function PidRow({ p, disabled, onWrite }: { p: ParamEntry; disabled: boolean; onWrite: (n: string, v: number) => void }) {
  const [draft, setDraft] = useState(String(p.value));
  const dirty = draft !== String(p.value);
  const commit = (): void => { const v = parseFloat(draft); if (Number.isFinite(v) && v !== p.value) onWrite(p.name, v); };
  return (
    <label className="chk plane-fp">
      <span>{p.name}</span>
      <input disabled={disabled} className={dirty ? 'dirty' : ''} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </label>
  );
}

export function PidTuneView({ gcs, params, setParams, telemetry }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buf = useRef<{ r: number[]; p: number[]; y: number[] }>({ r: [], p: [], y: [] });
  const pget = (n: string): ParamEntry | undefined => params.find((x) => x.name === n);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    void gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((x) => (x.name === name ? { ...x, value } : x)));
  };

  // Canli gövde hizlari (ATTITUDE.rollspeed/pitchspeed/yawspeed, rad/s -> deg/s)
  useEffect(() => {
    if (!connected) return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    const MAXN = 300;
    return conn.subscribeMessage(MSG.ATTITUDE, (f) => {
      const b = buf.current;
      b.r.push(Number(f.rollspeed) * R2D); b.p.push(Number(f.pitchspeed) * R2D); b.y.push(Number(f.yawspeed) * R2D);
      for (const a of [b.r, b.p, b.y]) if (a.length > MAXN) a.shift();
    });
  }, [connected, gcs.connRef]);

  // Osiloskop cizimi
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const css = getComputedStyle(document.documentElement);
    const col = {
      grid: css.getPropertyValue('--line-soft').trim() || '#1a2431',
      ink: css.getPropertyValue('--ink-faint').trim() || '#566675',
      r: css.getPropertyValue('--warn').trim() || '#ff4d4d',
      p: css.getPropertyValue('--go').trim() || '#3ad07a',
      y: css.getPropertyValue('--data').trim() || '#46e0d0',
    };
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth; const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const b = buf.current;
      const all = [...b.r, ...b.p, ...b.y];
      const peak = Math.max(30, ...all.map((v) => Math.abs(v) || 0));
      const scale = (h / 2) / (peak * 1.15);
      const mid = h / 2;
      // izgara
      ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
      ctx.fillStyle = col.ink; ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('±' + Math.round(peak) + '°/s', 4, 12);
      const series: Array<[number[], string]> = [[b.r, col.r], [b.p, col.p], [b.y, col.y]];
      for (const [arr, color] of series) {
        if (arr.length < 2) continue;
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
        const step = w / (arr.length - 1);
        for (let i = 0; i < arr.length; i++) {
          const x = i * step; const y = mid - arr[i]! * scale;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const curMode = telemetry ? modeName(telemetry.vehicleType, telemetry.customMode) : '—';
  const inAutotune = curMode === 'AUTOTUNE' || curMode === 'QAUTOTUNE';
  const atId = telemetry ? vehicleModeIds(telemetry.vehicleType).AUTOTUNE : undefined;
  const startAutotune = (): void => { if (atId !== undefined) void gcs.connRef.current?.setMode(atId); };

  const fc = frameClass(telemetry?.vehicleType ?? 0);
  const groups = fc === 'plane' ? PLANE_GROUPS : COPTER_GROUPS;
  const fcLabel = fc === 'plane' ? t('Uçak') : fc === 'rover' ? t('Rover') : t('Kopter');
  const hasPids = groups.some((g) => g.params.some((n) => pget(n)));

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('PID ayar')} · {fcLabel}</h2><span className="params-spacer" /><span className="hd-note">{t('Mod:')} {curMode}</span></div>
        <div className="card-body rc-input">
          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Canlı gövde hızları (°/s) —')} <span style={{ color: 'var(--warn)' }}>roll</span> · <span style={{ color: 'var(--go)' }}>pitch</span> · <span style={{ color: 'var(--data)' }}>yaw</span></div>
            <canvas ref={canvasRef} className="pid-scope" />
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">AUTOTUNE</div>
            <div className="act-row">
              <button className={'btn-primary' + (inAutotune ? ' act-armed' : '')} disabled={!connected || atId === undefined} onClick={startAutotune}>
                {inAutotune ? t('AUTOTUNE etkin') : t('AUTOTUNE moduna geç')}
              </button>
              <span className="setup-desc">{t('Havadayken AUTOTUNE moduna alın; ayar bitince güvenli ARM/land ile kaydedin (ilerleme mesajları durum akışında).')}</span>
            </div>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('PID parametreleri')}</div>
            {!hasPids ? (
              <div className="empty">{fcLabel} {t('PID parametreleri yok — Parametreler sekmesinden indirin')}</div>
            ) : (
              <div className="pid-groups">
                {groups.map((g) => {
                  const rows = g.params.map((n) => pget(n)).filter(Boolean) as ParamEntry[];
                  if (!rows.length) return null;
                  return (
                    <div key={g.title} className="pid-group">
                      <div className="pid-group-hd">{t(g.title)}</div>
                      {rows.map((p) => <PidRow key={p.name} p={p} disabled={!connected} onWrite={write} />)}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
