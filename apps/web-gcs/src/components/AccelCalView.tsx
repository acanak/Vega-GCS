import { useEffect, useState } from 'react';
import { MSG, MAV_CMD_PREFLIGHT_CALIBRATION, MAV_CMD_ACCELCAL_VEHICLE_POS } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// --- Pozisyon cizimleri: ustten quadcopter (yuvarlak motorlar) + yon oku ---
const RINGS: Array<[number, number]> = [[-19, -19], [19, -19], [-19, 19], [19, 19]];
function Quad() {
  return (
    <g>
      {RINGS.map(([x, y], i) => (
        <g key={i}>
          <line className="ql" x1={0} y1={0} x2={x} y2={y} />
          <circle className="ql" cx={x} cy={y} r={10} />
        </g>
      ))}
      <circle className="ql qhub" cx={0} cy={0} r={7} />
    </g>
  );
}

// Pozisyon yonu: 1=level, 2=sol, 3=sag, 4=burun asagi, 5=burun yukari, 6=sirt ustu
function Indicator({ pos }: { pos: number }) {
  if (pos === 1) {
    return (<g><line className="qa" x1={-13} y1={0} x2={13} y2={0} /><circle className="qa-f" cx={0} cy={0} r={3.5} /></g>);
  }
  if (pos === 6) {
    return (<g><path className="qa" d="M3 -13 A13 13 0 1 1 -11 -7" /><path className="qa-f" d="M-11 -7 l-6 -1 l3 6 z" /></g>);
  }
  const rot: Record<number, number> = { 2: -90, 3: 90, 4: 180, 5: 0 };
  return (
    <g transform={`rotate(${rot[pos] ?? 0})`}>
      <line className="qa" x1={0} y1={13} x2={0} y2={-5} />
      <path className="qa-f" d="M0 -15 L7 -3 L-7 -3 Z" />
    </g>
  );
}

function PoseIcon({ pos }: { pos: number }) {
  return (
    <svg className="pose-icon" viewBox="0 0 100 100" role="img" aria-hidden>
      <line x1={32} y1={88} x2={68} y2={88} className="ac-ground" />
      <g transform="translate(50 44)"><Quad /><Indicator pos={pos} /></g>
    </svg>
  );
}

export function AccelCalView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const [pos, setPos] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const connected = gcs.status === 'connected';

  const STEPS: Array<{ pos: number; name: string; tip: string }> = [
    { pos: 1, name: t('Düz (Level)'), tip: t('Aracı düz, yatay bir zemine koyun') },
    { pos: 2, name: t('Sol yan'), tip: t('Sol yanının üzerine yatırın') },
    { pos: 3, name: t('Sağ yan'), tip: t('Sağ yanının üzerine yatırın') },
    { pos: 4, name: t('Burun aşağı'), tip: t('Burnu yere bakacak şekilde dik tutun') },
    { pos: 5, name: t('Burun yukarı'), tip: t('Burnu göğe bakacak şekilde dik tutun') },
    { pos: 6, name: t('Sırt üstü'), tip: t('Ters çevirin (sırt üstü)') },
  ];

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.COMMAND_LONG, (f) => {
      if (Number(f.command) !== MAV_CMD_ACCELCAL_VEHICLE_POS) return;
      const p = Number(f.param1);
      if (p === 16777215) { setResult(t('Kalibrasyon başarılı ✓')); setRunning(false); setPos(null); }
      else if (p === 16777216) { setResult(t('Kalibrasyon başarısız ✗')); setRunning(false); setPos(null); }
      else { setPos(p); }
    });
  }, [gcs.status, gcs.connRef]);

  const start = (): void => { setResult(null); setPos(null); setRunning(true); gcs.connRef.current?.commandLong(MAV_CMD_PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 1, 0, 0]); };
  const level = (): void => { setResult(t('Seviye kalibrasyonu gönderildi')); gcs.connRef.current?.commandLong(MAV_CMD_PREFLIGHT_CALIBRATION, [0, 0, 0, 0, 2, 0, 0]); };
  const next = (): void => { if (pos != null) gcs.connRef.current?.commandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, [pos, 0, 0, 0, 0, 0, 0]); };

  const success = !!result && result.includes('✓');
  const isDone = (p: number): boolean => success || (pos != null && p < pos);
  const isCurrent = (p: number): boolean => running && pos === p;
  const current = STEPS.find((s) => s.pos === pos);
  const recent = gcs.statusTexts.slice(-6).reverse();

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('İvmeölçer kalibrasyonu')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t('6 nokta kalibrasyonu: aracı aşağıdaki her konuma sırayla getirin ve')} <b>{t('Sonraki')}</b>{t("'ye basın. Seviye kalibrasyonu aracı düz zeminde tek adımda ayarlar.")}</p>
          <div className="setup-actions">
            <button className="btn-primary" disabled={!connected} onClick={start}>{t('6-nokta başlat')}</button>
            <button className="btn-ghost" disabled={!connected} onClick={level}>{t('Seviye (level)')}</button>
          </div>

          <div className="accel-steps">
            {STEPS.map((s) => (
              <div key={s.pos} className={'accel-step' + (isCurrent(s.pos) ? ' current' : '') + (isDone(s.pos) ? ' done' : '')}>
                <div className="accel-step-hd">{t('Adım')} {s.pos} · {s.name}</div>
                <div className="accel-step-body">
                  <PoseIcon pos={s.pos} />
                  {isDone(s.pos) && <span className="accel-check" aria-label="tamam">✓</span>}
                </div>
                {isCurrent(s.pos) && <div className="accel-step-tip">{s.tip}</div>}
              </div>
            ))}
          </div>

          {running && (
            <div className="accel-stage">
              <div className="accel-label">{current ? t('Adım') + ' ' + current.pos + ' · ' + current.name : t('Araçtan yanıt bekleniyor…')}</div>
              <div className="accel-sub">{current ? current.tip : t('Aracı hareketsiz tutun')}</div>
              <button className="btn-primary" disabled={pos == null} onClick={next}>{t('Sonraki')}</button>
            </div>
          )}
          {result && <div className={'setup-result ' + (result.includes('✓') ? 'ok' : result.includes('✗') ? 'err' : '')}>{result}</div>}

          <div className="setup-log">
            <div className="setup-log-hd">{t('Mesajlar')}</div>
            {recent.length === 0 && <div className="empty">—</div>}
            {recent.map((m) => <div key={m.id} className="setup-log-line">{m.text}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
