import { useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { BATT_MONITOR_OPTIONS } from '../gcs/ardupilot-sys';
import { useT } from '../gcs/i18n';
import { ParamRefreshNote } from './ParamRefresh';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export function BatterySetupView({ gcs, params, setParams, telemetry }: {
  gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void; telemetry: VehicleTelemetry | null;
}) {
  const t = useT();
  const [measured, setMeasured] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    void gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  const monitor = pget('BATT_MONITOR');
  const monVal = Math.round(monitor?.value ?? 0);
  const monKnown = BATT_MONITOR_OPTIONS.some((o) => o.code === monVal);

  const reported = telemetry?.battery.voltage ?? NaN; // V (SYS_STATUS)
  const multParam = pget('BATT_VOLT_MULT');

  const calibrateVoltage = (): void => {
    const actual = parseFloat(measured);
    const mult = multParam?.value ?? 0;
    if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(reported) || reported <= 0 || !mult) {
      setStatus(t('Kalibrasyon için geçerli ölçülen voltaj + canlı okuma + BATT_VOLT_MULT gerekli'));
      return;
    }
    const newMult = mult * (actual / reported);
    write('BATT_VOLT_MULT', Number(newMult.toFixed(6)));
    setStatus('BATT_VOLT_MULT ' + mult.toFixed(4) + ' → ' + newMult.toFixed(4) + ' (' + t('ölçülen') + ' ' + actual + ' V / ' + t('okunan') + ' ' + reported.toFixed(2) + ' V)');
  };

  const fields: Array<[string, string]> = [
    ['BATT_CAPACITY', 'Kapasite (mAh)'], ['BATT_LOW_VOLT', 'Düşük voltaj eşiği (V)'], ['BATT_CRT_VOLT', 'Kritik voltaj eşiği (V)'],
    ['BATT_VOLT_MULT', 'Voltaj çarpanı'], ['BATT_AMP_PERVLT', 'Akım (A/V)'], ['BATT_AMP_OFFSET', 'Akım ofset (V)'],
  ];
  const anyMissing = !monitor || fields.some(([n]) => !pget(n));

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Pil / güç')}</h2>{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body rc-input">
          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Monitör tipi')} (BATT_MONITOR)</div>
            <select disabled={!connected || !monitor} value={monitor ? monVal : ''} onChange={(e) => write('BATT_MONITOR', Number(e.target.value))}>
              {!monitor && <option value="">—</option>}
              {monitor && !monKnown && <option value={monVal}>{t('Diğer')} ({monVal})</option>}
              {BATT_MONITOR_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
            </select>
            <p className="setup-desc">{t('Değişiklik yeniden başlatma gerektirebilir.')}</p>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Canlı okuma')}</div>
            <div className="batt-live">
              <span className="bl-item"><b>{Number.isFinite(reported) ? reported.toFixed(2) : '—'}</b> V</span>
              <span className="bl-item"><b>{telemetry && telemetry.battery.current >= 0 ? telemetry.battery.current.toFixed(1) : '—'}</b> A</span>
              <span className="bl-item"><b>{telemetry && telemetry.battery.remaining >= 0 ? Math.round(telemetry.battery.remaining) : '—'}</b> %</span>
            </div>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Voltaj kalibrasyonu')}</div>
            <p className="setup-desc">{t('Multimetreyle ölçtüğünüz gerçek voltajı girin; BATT_VOLT_MULT otomatik hesaplanır.')}</p>
            <div className="act-row">
              <input className="act-num" type="number" placeholder={t('ölçülen V')} disabled={!connected || !multParam} value={measured} onChange={(e) => setMeasured(e.target.value)} style={{ width: 110 }} />
              <button className="btn-primary" disabled={!connected || !multParam} onClick={calibrateVoltage}>{t('Voltajı kalibre et')}</button>
            </div>
          </section>

          <section className="rc-sec">
            <div className="rc-sec-hd">{t('Ayarlar')}</div>
            <div className="chk-grid">
              {fields.map(([name, label]) => {
                const e = pget(name);
                return (
                  <label key={name} className={'chk plane-fp' + (e ? '' : ' missing')} title={name}>
                    <span>{t(label)}</span>
                    <input disabled={!connected || !e} value={e ? e.value : ''} placeholder="—" onChange={(ev) => write(name, num(ev.target.value))} />
                  </label>
                );
              })}
            </div>
          </section>

          {connected && anyMissing && (
            <ParamRefreshNote gcs={gcs} setParams={setParams}
              text={t('Soluk alanlar bu araçta henüz yok — BATT_MONITOR’u ayarlayıp kartı yeniden başlatın, ardından parametreleri yeniden indirin.')} />
          )}

          {status && <div className="setup-result ok">{status}</div>}
        </div>
      </div>
    </div>
  );
}
