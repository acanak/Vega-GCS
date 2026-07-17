import { useEffect, useState } from 'react';
import { MSG, vehicleModes } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const bandOf = (pwm: number): number =>
  pwm <= 1230 ? 0 : pwm <= 1360 ? 1 : pwm <= 1490 ? 2 : pwm <= 1620 ? 3 : pwm <= 1749 ? 4 : 5;

export function FlightModesView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const modeCh = Math.round(pget('FLTMODE_CH')?.value ?? 5);
  const modes = vehicleModes(gcs.connRef.current?.telemetry.vehicleType ?? 0);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RC_CHANNELS, (f) => {
      const pwm = Number(f['chan' + modeCh + '_raw']) || 0;
      if (pwm > 0) setActive(bandOf(pwm));
    });
  }, [gcs.status, gcs.connRef, modeCh]);

  const setMode = (i: number, val: number): void => {
    const name = 'FLTMODE' + (i + 1);
    const e = pget(name);
    gcs.connRef.current?.setParam(name, val, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value: val } : p)));
  };

  const has = !!pget('FLTMODE1');
  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Uçuş modları')}</h2></div>
        <div className="card-body setup-body">
          {!has && <div className="empty">{t('FLTMODE parametreleri yok — Parametreler sekmesinden indirin')}</div>}
          {has && [0, 1, 2, 3, 4, 5].map((i) => {
            const val = Math.round(pget('FLTMODE' + (i + 1))?.value ?? 0);
            return (
              <div key={i} className={'mode-slot' + (active === i ? ' active' : '')}>
                <span className="mode-slot-idx">{t('Pozisyon')} {i + 1}</span>
                <select value={String(val)} onChange={(e) => setMode(i, Number(e.target.value))}>
                  {Object.entries(modes).map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
                </select>
                {active === i && <span className="mode-active">● {t('aktif')}</span>}
              </div>
            );
          })}
          {has && <div className="setup-desc">{t('Mod kanalı:')} CH{modeCh}. {t('Vericinizde mod anahtarını hareket ettirin; aktif pozisyon vurgulanır.')}</div>}
        </div>
      </div>
    </div>
  );
}
