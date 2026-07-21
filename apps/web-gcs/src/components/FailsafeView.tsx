import { frameClass } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// ---------------------------------------------------------------------------
// Failsafe ekranı: parametre listesi araç sınıfına göre seçilir (kopter/uçak).
// Eylem parametreleri enum listesiyle (select) sunulur; yalnızca araçta var
// olan parametreler gösterilir.
// ---------------------------------------------------------------------------

interface FsField { n: string; label: string; opts?: ReadonlyArray<[number, string]> }
interface FsGroup { title: string; fields: FsField[] }

// Batarya FS eylemleri (ArduCopter BATT_FS_LOW_ACT / BATT_FS_CRT_ACT)
const COPTER_BATT_ACTS: ReadonlyArray<[number, string]> = [
  [0, 'Yok (yalnız uyarı)'], [1, 'Land'], [2, 'RTL'], [3, 'SmartRTL → RTL'], [4, 'SmartRTL → Land'], [5, 'Terminate'],
];

const COPTER_FS: FsGroup[] = [
  { title: 'RC kaybı (throttle failsafe)', fields: [
    { n: 'FS_THR_ENABLE', label: 'Eylem', opts: [
      [0, 'Kapalı'], [1, 'RTL'], [2, 'Auto görevde devam, değilse RTL'], [3, 'Land'],
      [4, 'SmartRTL → RTL'], [5, 'SmartRTL → Land'], [6, 'Brake → Land'],
    ] },
    { n: 'FS_THR_VALUE', label: 'PWM eşiği' },
  ] },
  { title: 'Batarya', fields: [
    { n: 'BATT_LOW_VOLT', label: 'Düşük voltaj (V)' },
    { n: 'BATT_LOW_MAH', label: 'Düşük kapasite (mAh)' },
    { n: 'BATT_FS_LOW_ACT', label: 'Düşük batarya eylemi', opts: COPTER_BATT_ACTS },
    { n: 'BATT_CRT_VOLT', label: 'Kritik voltaj (V)' },
    { n: 'BATT_CRT_MAH', label: 'Kritik kapasite (mAh)' },
    { n: 'BATT_FS_CRT_ACT', label: 'Kritik batarya eylemi', opts: COPTER_BATT_ACTS },
  ] },
  { title: 'GCS / EKF', fields: [
    { n: 'FS_GCS_ENABLE', label: 'GCS failsafe', opts: [
      [0, 'Kapalı'], [1, 'RTL'], [2, 'Auto görevde devam, değilse RTL'],
      [3, 'SmartRTL → RTL'], [4, 'SmartRTL → Land'], [5, 'Land'],
    ] },
    { n: 'FS_EKF_ACTION', label: 'EKF eylemi', opts: [[1, 'Land'], [2, 'AltHold'], [3, 'Land (her modda)']] },
    { n: 'FS_EKF_THRESH', label: 'EKF eşiği (0.6 sıkı · 0.8 varsayılan · 1.0 gevşek)' },
    { n: 'FS_OPTIONS', label: 'FS seçenekleri (bitmask)' },
  ] },
  { title: 'RTL / iniş davranışı', fields: [
    { n: 'RTL_ALT', label: 'RTL irtifası (cm)' },
    { n: 'RTL_ALT_FINAL', label: 'RTL son irtifa (cm · 0 = iniş)' },
    { n: 'RTL_LOIT_TIME', label: 'RTL bekleme (ms)' },
    { n: 'LAND_SPEED', label: 'Son iniş hızı (cm/s)' },
  ] },
];

const PLANE_FS: FsGroup[] = [
  { title: 'RC kaybı', fields: [
    { n: 'THR_FAILSAFE', label: 'Throttle failsafe', opts: [[0, 'Kapalı'], [1, 'Etkin'], [2, 'Yalnız tespit (eylem yok)']] },
    { n: 'THR_FS_VALUE', label: 'PWM eşiği' },
    { n: 'FS_SHORT_ACTN', label: 'Kısa FS eylemi', opts: [[0, 'CIRCLE / devam'], [1, 'CIRCLE'], [2, 'FBWA (süzülme)'], [3, 'Devre dışı']] },
    { n: 'FS_SHORT_TIMEOUT', label: 'Kısa FS süresi (sn)' },
    { n: 'FS_LONG_ACTN', label: 'Uzun FS eylemi', opts: [[0, 'Devam'], [1, 'RTL'], [2, 'FBWA (süzülme)'], [3, 'Paraşüt']] },
    { n: 'FS_LONG_TIMEOUT', label: 'Uzun FS süresi (sn)' },
  ] },
  { title: 'Batarya', fields: [
    { n: 'BATT_LOW_VOLT', label: 'Düşük voltaj (V)' },
    { n: 'BATT_LOW_MAH', label: 'Düşük kapasite (mAh)' },
    { n: 'BATT_FS_LOW_ACT', label: 'Düşük batarya eylemi', opts: [[0, 'Yok (yalnız uyarı)'], [1, 'RTL'], [2, 'Land'], [3, 'Terminate'], [4, 'QLand']] },
    { n: 'BATT_CRT_VOLT', label: 'Kritik voltaj (V)' },
    { n: 'BATT_FS_CRT_ACT', label: 'Kritik batarya eylemi', opts: [[0, 'Yok (yalnız uyarı)'], [1, 'RTL'], [2, 'Land'], [3, 'Terminate'], [4, 'QLand']] },
  ] },
  { title: 'GCS', fields: [
    { n: 'FS_GCS_ENABL', label: 'GCS failsafe', opts: [[0, 'Kapalı'], [1, 'Etkin'], [2, 'Etkin (heartbeat + AUTO)']] },
  ] },
];

// Araç sınıfı bilinmiyorsa (heartbeat yok / rover) eski düz liste — geriye dönük davranış.
const GENERIC_FS: FsGroup[] = [
  { title: 'Failsafe', fields: [
    { n: 'FS_THR_ENABLE', label: 'Throttle failsafe' },
    { n: 'FS_THR_VALUE', label: 'Throttle FS PWM' },
    { n: 'BATT_LOW_VOLT', label: 'Düşük voltaj (V)' },
    { n: 'BATT_LOW_MAH', label: 'Düşük kapasite (mAh)' },
    { n: 'BATT_FS_LOW_ACT', label: 'Batarya FS eylemi' },
    { n: 'FS_GCS_ENABLE', label: 'GCS failsafe' },
    { n: 'FS_EKF_ACTION', label: 'EKF failsafe eylemi' },
    { n: 'FS_OPTIONS', label: 'FS seçenekleri' },
  ] },
];

export function FailsafeView({ gcs, params, setParams, telemetry }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null }) {
  const translate = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };
  const t = telemetry;
  const fc = t?.connected && t.vehicleType > 0 ? frameClass(t.vehicleType) : null;
  const groups = fc === 'copter' ? COPTER_FS : fc === 'plane' ? PLANE_FS : GENERIC_FS;
  const visible = groups.map((g) => ({ ...g, fields: g.fields.filter((f) => pget(f.n)) })).filter((g) => g.fields.length > 0);
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
          {visible.length === 0 && <div className="empty">{translate('Failsafe parametreleri yok — Parametreler sekmesinden indirin')}</div>}
          {visible.map((g) => (
            <section key={g.title}>
              <div className="rc-sec-hd" style={{ marginBottom: 8 }}>{translate(g.title)}</div>
              <div className="setup-body">
                {g.fields.map((f) => {
                  const e = pget(f.n)!;
                  return (
                    <label key={f.n} className="fs-field">
                      <span>{translate(f.label)} <em>{f.n}</em></span>
                      {f.opts ? (
                        <select value={Math.round(e.value)} onChange={(ev) => write(f.n, Number(ev.target.value))}>
                          {/* mevcut değer listede yoksa kaybolmasın diye ekle */}
                          {!f.opts.some(([c]) => c === Math.round(e.value)) && <option value={Math.round(e.value)}>{Math.round(e.value)}</option>}
                          {f.opts.map(([code, label]) => <option key={code} value={code}>{code} — {translate(label)}</option>)}
                        </select>
                      ) : (
                        <input value={e.value} onChange={(ev) => write(f.n, Number(ev.target.value))} />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
