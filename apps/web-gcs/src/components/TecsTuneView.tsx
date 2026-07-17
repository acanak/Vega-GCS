import { useEffect, useRef, useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// TECS = Total Energy Control System. Ucus profili uzerinde her verinin nerede
// olculdugunu gosterir; canli telemetriden yakalayip araca yazar.

type SegKey = 'climb' | 'cruise' | 'glide' | 'descent' | null;
const f1 = (v: number): string => (Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—');

// Ucus profili cizimi — aktif adimin segmenti vurgulanir
function Profile({ seg }: { seg: SegKey }) {
  const on = (k: SegKey): string => 'tecs-seg' + (seg === k ? ' on' : '');
  return (
    <svg viewBox="0 0 400 190" className="tecs-svg" role="img" aria-label="TECS profil">
      <line x1={10} y1={172} x2={392} y2={172} className="tecs-ground" />
      {/* segmentler */}
      <line x1={24} y1={160} x2={126} y2={48} className={on('climb')} />
      <line x1={126} y1={48} x2={244} y2={48} className={on('cruise')} />
      <line x1={244} y1={48} x2={338} y2={104} className={on('glide')} />
      <line x1={338} y1={104} x2={386} y2={162} className={on('descent')} />
      {/* ucak glyph (seyir noktasinda) */}
      <g transform="translate(185 40)" className="tecs-plane">
        <path d="M0 -3 L14 0 L0 3 L4 0 Z" />
        <path d="M2 0 L-9 -7 M2 0 L-9 7" />
      </g>
      {/* etiketler */}
      <text x={40} y={104} className={'tecs-lbl' + (seg === 'climb' ? ' on' : '')}>↑ TECS_CLMB_MAX</text>
      <text x={128} y={38} className={'tecs-lbl' + (seg === 'cruise' ? ' on' : '')}>TRIM_ARSPD · TRIM_THR</text>
      <text x={250} y={82} className={'tecs-lbl' + (seg === 'glide' ? ' on' : '')}>↓ TECS_SINK_MIN</text>
      <text x={300} y={150} className={'tecs-lbl' + (seg === 'descent' ? ' on' : '')}>↓↓ TECS_SINK_MAX</text>
    </svg>
  );
}

// Küçük, param değerine tekrar senkronlanan sayı girişi
function Num({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [d, setD] = useState(String(value));
  useEffect(() => { setD(String(value)); }, [value]);
  return (
    <input className="tecs-num" value={d} disabled={disabled}
      onChange={(e) => setD(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={() => { const v = parseFloat(d); if (Number.isFinite(v)) onCommit(v); }} />
  );
}

interface Props { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null }

export function TecsTuneView({ gcs, params, setParams, telemetry }: Props) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const [step, setStep] = useState(0);

  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const pval = (n: string, d = 0): number => pget(n)?.value ?? d;
  const setP = (n: string, v: number): void => {
    const e = pget(n);
    const type = e?.type ?? 9;
    gcs.connRef.current?.setParam(n, v, type).catch(() => {});
    if (e) setParams(params.map((p) => (p.name === n ? { ...p, value: v } : p)));
    else setParams([...params, { name: n, value: v, type, index: -1 }]);
  };

  // Canli telemetri + tepe (peak) tutma
  const aspd = telemetry ? telemetry.vfr.airspeed : 0;
  const climb = telemetry ? telemetry.vfr.climb : 0;
  const thr = telemetry ? telemetry.vfr.throttle : 0;
  const peaks = useRef({ climb: 0, sink: 0 });
  const [, force] = useState(0);
  useEffect(() => {
    if (!telemetry) return;
    const c = telemetry.vfr.climb;
    let ch = false;
    if (c > peaks.current.climb) { peaks.current.climb = c; ch = true; }
    if (-c > peaks.current.sink) { peaks.current.sink = -c; ch = true; }
    if (ch) force((x) => x + 1);
  }, [telemetry]);
  const resetPeaks = (): void => { peaks.current = { climb: 0, sink: 0 }; force((x) => x + 1); };
  const sinkNow = Math.max(0, -climb);

  const STEPS: Array<{ seg: SegKey; title: string }> = [
    { seg: null, title: t('1 · Ön koşul') },
    { seg: 'cruise', title: t('2 · Seyir (cruise)') },
    { seg: 'climb', title: t('3 · Maks. tırmanma') },
    { seg: 'glide', title: t('4 · Süzülme (min sink)') },
    { seg: 'descent', title: t('5 · Maks. alçalma') },
    { seg: null, title: t('6 · İnce ayar') },
  ];

  const cap = (name: string, v: number, dec = false): void => setP(name, dec ? Math.round(v * 10) / 10 : Math.round(v));

  return (
    <div className="setup-panel tecs-view">
      <div className="card">
        <div className="card-hd"><h2>{t('TECS Ayar (Uçak)')}</h2><span className="hd-note">{connected ? t('canlı') : t('bağlı değil')}</span></div>
        <div className="card-body">
          <div className="tecs-top">
            <Profile seg={STEPS[step]!.seg} />
            <div className="tecs-live">
              <div className="tecs-live-hd">{t('Canlı')}</div>
              <div className="tecs-live-row"><span>{t('Hava hızı')}</span><b>{f1(aspd)}<small> m/s</small></b></div>
              <div className="tecs-live-row"><span>{climb >= 0 ? t('Tırmanma') : t('Alçalma')}</span><b className={climb >= 0 ? 'go' : 'warn'}>{f1(Math.abs(climb))}<small> m/s</small></b></div>
              <div className="tecs-live-row"><span>{t('Gaz')}</span><b>{Math.round(thr)}<small>%</small></b></div>
              <div className="tecs-live-sep" />
              <div className="tecs-live-row"><span>{t('Tepe tırmanma')}</span><b className="go">{f1(peaks.current.climb)}</b></div>
              <div className="tecs-live-row"><span>{t('Tepe alçalma')}</span><b className="warn">{f1(peaks.current.sink)}</b></div>
              <button className="btn-ghost tecs-reset" onClick={resetPeaks}>{t('Tepeleri sıfırla')}</button>
            </div>
          </div>

          <div className="tecs-steps">
            {STEPS.map((s, i) => (
              <button key={i} className={'tecs-step-tab' + (i === step ? ' active' : '')} onClick={() => setStep(i)}>{s.title}</button>
            ))}
          </div>

          <div className="tecs-body">
            {step === 0 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('TECS öncesi: pitch/roll denetleyicileri (veya AUTOTUNE) ayarlı, hava hızı sensörü sağlıklı olmalı. Stall üstü min/maks hızları girin.')}</p>
                <div className="tecs-field"><label>ARSPD_FBW_MIN</label><Num value={pval('ARSPD_FBW_MIN', 9)} onCommit={(v) => setP('ARSPD_FBW_MIN', v)} disabled={!connected} /><span className="p-units">m/s ({t('min')})</span></div>
                <div className="tecs-field"><label>ARSPD_FBW_MAX</label><Num value={pval('ARSPD_FBW_MAX', 22)} onCommit={(v) => setP('ARSPD_FBW_MAX', v)} disabled={!connected} /><span className="p-units">m/s ({t('maks')})</span></div>
              </div>
            )}
            {step === 1 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('FBWA veya CRUISE modunda düz ve yatay uçun, istediğiniz seyir hızına oturtun. Sonra yakalayın:')}</p>
                <div className="tecs-field"><label>TRIM_ARSPD_CM</label><Num value={pval('TRIM_ARSPD_CM', 1200)} onCommit={(v) => setP('TRIM_ARSPD_CM', v)} disabled={!connected} /><span className="p-units">cm/s</span>
                  <button className="btn-primary tecs-cap" disabled={!connected} onClick={() => cap('TRIM_ARSPD_CM', aspd * 100)}>{t('Yakala')} ← {f1(aspd)} m/s</button></div>
                <div className="tecs-field"><label>TRIM_THROTTLE</label><Num value={pval('TRIM_THROTTLE', 45)} onCommit={(v) => setP('TRIM_THROTTLE', v)} disabled={!connected} /><span className="p-units">%</span>
                  <button className="btn-primary tecs-cap" disabled={!connected} onClick={() => cap('TRIM_THROTTLE', thr)}>{t('Yakala')} ← {Math.round(thr)}%</button></div>
              </div>
            )}
            {step === 2 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('Tam gaz verin ve burnu seyir hızını koruyacak şekilde tutarak düzenli tırmanın. Kararlı tepe tırmanma hızını yakalayın.')}</p>
                <div className="tecs-field"><label>TECS_CLMB_MAX</label><Num value={pval('TECS_CLMB_MAX', 5)} onCommit={(v) => setP('TECS_CLMB_MAX', v)} disabled={!connected} /><span className="p-units">m/s</span>
                  <button className="btn-primary tecs-cap" disabled={!connected} onClick={() => cap('TECS_CLMB_MAX', peaks.current.climb, true)}>{t('Yakala')} ← {f1(peaks.current.climb)} ({t('tepe')})</button></div>
              </div>
            )}
            {step === 3 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('Gazı tamamen kesin (0%) ve seyir hızında süzülün. Kararlı alçalma (sink) hızını yakalayın.')}</p>
                <div className="tecs-field"><label>TECS_SINK_MIN</label><Num value={pval('TECS_SINK_MIN', 2)} onCommit={(v) => setP('TECS_SINK_MIN', v)} disabled={!connected} /><span className="p-units">m/s</span>
                  <button className="btn-primary tecs-cap" disabled={!connected} onClick={() => cap('TECS_SINK_MIN', sinkNow, true)}>{t('Yakala')} ← {f1(sinkNow)} ({t('anlık')})</button></div>
              </div>
            )}
            {step === 4 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('TECS’in komuta edebileceği en yüksek alçalma hızı. Kontrollü bir dalışta tepe alçalmayı yakalayın veya istediğiniz değeri girin.')}</p>
                <div className="tecs-field"><label>TECS_SINK_MAX</label><Num value={pval('TECS_SINK_MAX', 5)} onCommit={(v) => setP('TECS_SINK_MAX', v)} disabled={!connected} /><span className="p-units">m/s</span>
                  <button className="btn-primary tecs-cap" disabled={!connected} onClick={() => cap('TECS_SINK_MAX', peaks.current.sink, true)}>{t('Yakala')} ← {f1(peaks.current.sink)} ({t('tepe')})</button></div>
              </div>
            )}
            {step === 5 && (
              <div className="tecs-panel">
                <p className="setup-desc">{t('İnce ayar kazançları. Varsayılanlar iyi bir başlangıçtır; salınım varsa sönümlemeyi artırın, tepki yavaşsa zaman sabitini düşürün.')}</p>
                <div className="tecs-field"><label>TECS_TIME_CONST</label><Num value={pval('TECS_TIME_CONST', 5)} onCommit={(v) => setP('TECS_TIME_CONST', v)} disabled={!connected} /><span className="p-units">s</span></div>
                <div className="tecs-field"><label>TECS_THR_DAMP</label><Num value={pval('TECS_THR_DAMP', 0.5)} onCommit={(v) => setP('TECS_THR_DAMP', v)} disabled={!connected} /></div>
                <div className="tecs-field"><label>TECS_PTCH_DAMP</label><Num value={pval('TECS_PTCH_DAMP', 0.3)} onCommit={(v) => setP('TECS_PTCH_DAMP', v)} disabled={!connected} /></div>
                <div className="tecs-field"><label>TECS_INTEG_GAIN</label><Num value={pval('TECS_INTEG_GAIN', 0.3)} onCommit={(v) => setP('TECS_INTEG_GAIN', v)} disabled={!connected} /></div>
                <div className="tecs-field"><label>TECS_SPDWEIGHT</label><Num value={pval('TECS_SPDWEIGHT', 1)} onCommit={(v) => setP('TECS_SPDWEIGHT', v)} disabled={!connected} /><span className="p-units">0=irtifa · 2=hız</span></div>
              </div>
            )}
          </div>

          <div className="tecs-nav">
            <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← {t('Önceki')}</button>
            <span className="tecs-nav-pos">{step + 1} / {STEPS.length}</span>
            <button className="btn-ghost" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>{t('Sonraki')} →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
