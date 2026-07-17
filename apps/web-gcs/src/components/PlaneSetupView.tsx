import { useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { PLANE_SURFACES, PLANE_LAYOUTS, servoFuncLabel } from '../gcs/ardupilot-servo';
import { useT } from '../gcs/i18n';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
type PlaneType = 'standard' | 'elevon' | 'vtail';
const TYPES: Array<[PlaneType, string, string]> = [
  ['standard', 'Standart', 'Ayrı aileron · elevator · rudder'],
  ['elevon', 'Elevon (kanat)', 'Karışık elevon L/R (flying wing)'],
  ['vtail', 'V-Kuyruk', 'Aileron + V-tail L/R'],
];

export function PlaneSetupView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const [type, setType] = useState<PlaneType>('standard');
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const pval = (n: string, d = 0): number => Math.round(pget(n)?.value ?? d);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 6);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  const channels: number[] = [];
  for (let n = 1; n <= 16; n++) if (pget('SERVO' + n + '_FUNCTION')) channels.push(n);
  const hasServo = channels.length > 0;

  // hangi kanal(lar) bu fonksiyona atanmis?
  const channelsFor = (code: number): number[] => channels.filter((n) => pval('SERVO' + n + '_FUNCTION', -999) === code);

  // yuzeyi bir kanala tasi: eski birincili Disabled yap, yeni kanala fonksiyonu ata
  const assign = (code: number, oldPrimary: number | undefined, newChan: number): void => {
    if (oldPrimary && oldPrimary !== newChan) write('SERVO' + oldPrimary + '_FUNCTION', 0);
    if (newChan > 0) write('SERVO' + newChan + '_FUNCTION', code);
  };

  const surfaces = PLANE_LAYOUTS[type].map((key) => ({ key, ...PLANE_SURFACES[key]! }));
  const showMixing = type === 'elevon' || type === 'vtail';

  const FLIGHT_PARAMS: Array<[string, string]> = [
    ['TRIM_THROTTLE', 'Seyir gazı (%)'], ['ARSPD_FBW_MIN', 'Min hız (FBW)'], ['ARSPD_FBW_MAX', 'Max hız (FBW)'],
  ];
  const flightParams = FLIGHT_PARAMS.filter(([n]) => pget(n));

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('Airframe — kanat / kuyruk karışımı')}</h2><span className="params-spacer" />{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body rc-input">
          {!hasServo ? (
            <div className="empty">{t('SERVO parametreleri yok — Parametreler sekmesinden indirin')}</div>
          ) : (
            <>
              <section className="rc-sec">
                <div className="rc-sec-hd">{t('Uçak tipi')}</div>
                <div className="plane-types">
                  {TYPES.map(([ty, name, desc]) => (
                    <button key={ty} className={'plane-type' + (type === ty ? ' active' : '')} onClick={() => setType(ty)}>
                      <span className="pt-name">{t(name)}</span>
                      <span className="pt-desc">{t(desc)}</span>
                    </button>
                  ))}
                </div>
                <p className="setup-desc">{t('Kanal seçince ilgili')} <code>SERVOn_FUNCTION</code> {t('ayarlanır; yüzey başka bir kanaldaysa eski kanal “Disabled” yapılır.')}</p>
              </section>

              <section className="rc-sec">
                <div className="rc-sec-hd">{t('Kumanda yüzeyleri → çıkış kanalı')}</div>
                <table className="cmd-grid rc-grid">
                  <thead><tr><th>{t('Yüzey')}</th><th>{t('Çıkış kanalı')}</th><th>{t('Ters')}</th><th>Min</th><th>Trim</th><th>Max</th></tr></thead>
                  <tbody>
                    {surfaces.map((s) => {
                      const assigned = channelsFor(s.code);
                      const primary = assigned[0];
                      const sp = primary ? 'SERVO' + primary : '';
                      return (
                        <tr key={s.key}>
                          <td className="p-name">{s.label}{assigned.length > 1 && <span className="p-units"> +{assigned.length - 1}</span>}</td>
                          <td>
                            <select disabled={!connected} value={primary ?? 0} onChange={(e) => assign(s.code, primary, Number(e.target.value))}>
                              <option value={0}>{t('— (yok)')}</option>
                              {channels.map((n) => {
                                const fn = pval('SERVO' + n + '_FUNCTION', 0);
                                const busy = fn !== 0 && fn !== s.code;
                                return <option key={n} value={n}>SERVO{n}{busy ? ' · ' + servoFuncLabel(fn) : ''}</option>;
                              })}
                            </select>
                          </td>
                          <td>{primary ? <input type="checkbox" disabled={!connected} checked={pval(sp + '_REVERSED') > 0} onChange={(e) => write(sp + '_REVERSED', e.target.checked ? 1 : 0)} /> : <span className="p-units">—</span>}</td>
                          <td>{primary ? <input disabled={!connected} value={pval(sp + '_MIN', 1000)} onChange={(e) => write(sp + '_MIN', num(e.target.value))} /> : <span className="p-units">—</span>}</td>
                          <td>{primary ? <input disabled={!connected} value={pval(sp + '_TRIM', 1500)} onChange={(e) => write(sp + '_TRIM', num(e.target.value))} /> : <span className="p-units">—</span>}</td>
                          <td>{primary ? <input disabled={!connected} value={pval(sp + '_MAX', 2000)} onChange={(e) => write(sp + '_MAX', num(e.target.value))} /> : <span className="p-units">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              {showMixing && pget('MIXING_GAIN') && (
                <section className="rc-sec">
                  <div className="rc-sec-hd">{t('Karışım kazancı (MIXING_GAIN)')}</div>
                  <p className="setup-desc">{t('Elevon / V-tail çıkışlarının karışım kazancı (tipik 0.5). Yüzeyler doyuma ulaşıyorsa düşürün.')}</p>
                  <input disabled={!connected} value={pget('MIXING_GAIN')?.value ?? 0.5}
                    onChange={(e) => write('MIXING_GAIN', num(e.target.value))} style={{ width: 90 }} />
                </section>
              )}

              {flightParams.length > 0 && (
                <section className="rc-sec">
                  <div className="rc-sec-hd">{t('Temel uçuş ayarları')}</div>
                  <div className="chk-grid">
                    {flightParams.map(([name, label]) => (
                      <label key={name} className="chk plane-fp">
                        <span>{t(label)}</span>
                        <input disabled={!connected} value={pget(name)?.value ?? 0} onChange={(e) => write(name, num(e.target.value))} />
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
