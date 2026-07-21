import { useEffect, useRef, useState } from 'react';
import { MSG, modeName, vehicleModeIds, frameClass } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const R2D = 180 / Math.PI;
interface PidGroup { title: string; params: string[] }
// Kopter — Mission Planner "Extended Tuning" paritesi (parametre adları verbatim;
// yalnızca araçta var olanlar gösterilir, IMAX/filtreler dahil).
const COPTER_GROUPS: PidGroup[] = [
  { title: 'Roll hız (rate)', params: ['ATC_RAT_RLL_P', 'ATC_RAT_RLL_I', 'ATC_RAT_RLL_D', 'ATC_RAT_RLL_IMAX', 'ATC_RAT_RLL_FLTD', 'ATC_RAT_RLL_FLTT'] },
  { title: 'Pitch hız (rate)', params: ['ATC_RAT_PIT_P', 'ATC_RAT_PIT_I', 'ATC_RAT_PIT_D', 'ATC_RAT_PIT_IMAX', 'ATC_RAT_PIT_FLTD', 'ATC_RAT_PIT_FLTT'] },
  { title: 'Yaw hız (rate)', params: ['ATC_RAT_YAW_P', 'ATC_RAT_YAW_I', 'ATC_RAT_YAW_D', 'ATC_RAT_YAW_IMAX', 'ATC_RAT_YAW_FLTE', 'ATC_RAT_YAW_FLTT'] },
  { title: 'Açı (angle) P · RC hissi', params: ['ATC_ANG_RLL_P', 'ATC_ANG_PIT_P', 'ATC_ANG_YAW_P', 'ATC_INPUT_TC'] },
  { title: 'İrtifa tutma (Z)', params: ['PSC_POSZ_P', 'PSC_VELZ_P'] },
  { title: 'Gaz ivmesi (accel Z)', params: ['PSC_ACCZ_P', 'PSC_ACCZ_I', 'PSC_ACCZ_D', 'PSC_ACCZ_IMAX'] },
  { title: 'Pozisyon / hız XY', params: ['PSC_POSXY_P', 'PSC_VELXY_P', 'PSC_VELXY_I', 'PSC_VELXY_D'] },
  { title: 'Görev hızları (WPNAV)', params: ['WPNAV_SPEED', 'WPNAV_SPEED_UP', 'WPNAV_SPEED_DN', 'WPNAV_RADIUS', 'WPNAV_ACCEL'] },
  { title: 'Loiter', params: ['LOIT_SPEED', 'LOIT_ACC_MAX', 'LOIT_BRK_ACCEL', 'LOIT_BRK_DELAY', 'LOIT_ANG_MAX'] },
];
// TUNE — RC ayar düğmesi (MP "CH6 Opt" karşılığı): uçuşta bir kanalla canlı parametre ayarı.
// Kod → etiket (ArduCopter TUNE parametre listesinden yaygın seçenekler).
const TUNE_OPTIONS: ReadonlyArray<[number, string]> = [
  [0, 'Kapalı'],
  [1, 'Stabilize Roll/Pitch kP'], [3, 'Stabilize Yaw kP'],
  [4, 'Rate Roll/Pitch kP'], [5, 'Rate Roll/Pitch kI'], [21, 'Rate Roll/Pitch kD'],
  [6, 'Rate Yaw kP'], [26, 'Rate Yaw kD'], [56, 'Rate Yaw filtresi'],
  [14, 'AltHold kP'], [7, 'Gaz hızı (throttle rate) kP'],
  [34, 'Gaz ivmesi kP'], [35, 'Gaz ivmesi kI'], [36, 'Gaz ivmesi kD'],
  [12, 'Loiter pozisyon kP'], [22, 'Hız XY kP'], [28, 'Hız XY kI'],
  [10, 'WP hızı'], [39, 'Circle dönüş hızı'],
  [25, 'Acro Roll/Pitch kP'], [40, 'Acro Yaw kP'], [45, 'RC hissi (INPUT_TC)'],
  [55, 'Motor yaw payı'], [38, 'Pusula sapması (declination)'],
];
// AUTOTUNE_AXES bit maskesi
const AUTOTUNE_AXES_BITS: ReadonlyArray<[number, string]> = [[1, 'Roll'], [2, 'Pitch'], [4, 'Yaw'], [8, 'Yaw D']];
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

  // Kopter-özel: AUTOTUNE eksen maskesi ve TUNE (RC ayar düğmesi)
  const axesEntry = fc === 'copter' ? pget('AUTOTUNE_AXES') : undefined;
  const axesVal = Math.round(axesEntry?.value ?? 0);
  const tuneEntry = fc === 'copter' ? pget('TUNE') : undefined;
  const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

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
            {axesEntry && (
              <div className="act-row" style={{ marginTop: 6 }}>
                <span className="setup-desc">{t('Eksenler:')}</span>
                {AUTOTUNE_AXES_BITS.map(([bit, label]) => (
                  <label key={bit} className="chk">
                    <input type="checkbox" disabled={!connected} checked={(axesVal & bit) > 0}
                      onChange={(e) => write('AUTOTUNE_AXES', e.target.checked ? axesVal | bit : axesVal & ~bit)} />
                    <span>{label}</span>
                  </label>
                ))}
                <span className="p-units">AUTOTUNE_AXES = {axesVal}</span>
              </div>
            )}
          </section>

          {tuneEntry && (
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('RC ayar düğmesi (TUNE)')}</div>
              <p className="setup-desc">{t('Kumandadaki bir potansiyometre kanalıyla uçuşta canlı parametre ayarı. Kanal, RCn_OPTION = 219 (Transmitter Tuning) ile seçilir; düğmenin uçları TUNE_MIN/TUNE_MAX değerlerine eşlenir.')}</p>
              <div className="act-row">
                <select disabled={!connected} value={Math.round(tuneEntry.value)} onChange={(e) => write('TUNE', Number(e.target.value))}>
                  {TUNE_OPTIONS.map(([code, label]) => <option key={code} value={code}>{code} — {t(label)}</option>)}
                </select>
                {pget('TUNE_MIN') && (
                  <label className="chk plane-fp">
                    <span>TUNE_MIN</span>
                    <input disabled={!connected} value={pget('TUNE_MIN')!.value} onChange={(e) => write('TUNE_MIN', num(e.target.value))} />
                  </label>
                )}
                {pget('TUNE_MAX') && (
                  <label className="chk plane-fp">
                    <span>TUNE_MAX</span>
                    <input disabled={!connected} value={pget('TUNE_MAX')!.value} onChange={(e) => write('TUNE_MAX', num(e.target.value))} />
                  </label>
                )}
              </div>
            </section>
          )}

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
