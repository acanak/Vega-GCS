import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const FS = [
  { n: 'FS_THR_ENABLE', label: 'Throttle failsafe' },
  { n: 'FS_THR_VALUE', label: 'Throttle FS PWM' },
  { n: 'BATT_LOW_VOLT', label: 'Düşük voltaj (V)' },
  { n: 'BATT_LOW_MAH', label: 'Düşük kapasite (mAh)' },
  { n: 'BATT_FS_LOW_ACT', label: 'Batarya FS eylemi' },
  { n: 'FS_GCS_ENABLE', label: 'GCS failsafe' },
  { n: 'FS_EKF_ACTION', label: 'EKF failsafe eylemi' },
  { n: 'FS_OPTIONS', label: 'FS seçenekleri' },
];

export function FailsafeView({ gcs, params, setParams, telemetry }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null }) {
  const translate = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const present = FS.filter((f) => pget(f.n));
  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };
  const t = telemetry;
  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>Failsafe</h2></div>
        <div className="card-body setup-body">
          {t?.connected && (
            <div className="fs-status">
              <span className={t.armed ? 'go' : ''}>{t.armed ? 'ARMED' : 'disarmed'}</span>
              <span>{translate('Batarya')} {Number.isFinite(t.battery.voltage) ? t.battery.voltage.toFixed(1) + 'V' : '—'}</span>
              <span>GPS {t.gps.fixType >= 3 ? '3D' : translate('yok')}</span>
            </div>
          )}
          {present.length === 0 && <div className="empty">{translate('Failsafe parametreleri yok — Parametreler sekmesinden indirin')}</div>}
          {present.map((f) => (
            <label key={f.n} className="fs-field">
              <span>{translate(f.label)} <em>{f.n}</em></span>
              <input value={pget(f.n)!.value} onChange={(e) => write(f.n, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
