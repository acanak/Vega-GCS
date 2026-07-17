import { useEffect, useRef } from 'react';
import { MSG, vehicleModes } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// ArduPilot 6-pozisyon mod anahtarı PWM eşikleri (Plane control_modes.cpp).
const bandOf = (pwm: number): number =>
  pwm <= 1230 ? 0 : pwm <= 1360 ? 1 : pwm <= 1490 ? 2 : pwm <= 1620 ? 3 : pwm <= 1749 ? 4 : 5;
const BANDS = ['≤ 1230', '1231–1360', '1361–1490', '1491–1620', '1621–1749', '≥ 1750'];

export function FlightModesView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const modeCh = Math.round(pget('FLTMODE_CH')?.value ?? 5);
  const modes = vehicleModes(gcs.connRef.current?.telemetry.vehicleType ?? 0);
  // Aktif pozisyon vurgusu + canlı PWM imperatif yazılır (setState olsaydı her RC mesajında
  // yeniden render olup açık <select> kapanırdı).
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pwmRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RC_CHANNELS, (f) => {
      const pwm = Number(f['chan' + modeCh + '_raw']) || 0;
      if (pwmRef.current) pwmRef.current.textContent = pwm ? pwm + ' µs' : '—';
      const b = pwm > 0 ? bandOf(pwm) : -1;
      for (let i = 0; i < 6; i++) slotRefs.current[i]?.classList.toggle('active', i === b);
    });
  }, [gcs.status, gcs.connRef, modeCh]);

  const write = (name: string, val: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, val, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value: val } : p)));
  };
  const setMode = (i: number, val: number): void => write('FLTMODE' + (i + 1), val);

  const has = !!pget('FLTMODE1');
  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd">
          <h2>{t('Uçuş modları')}</h2>
          <span className="params-spacer" />
          <span className="hd-note">{t('Canlı PWM')}: <b ref={pwmRef}>—</b></span>
        </div>
        <div className="card-body setup-body">
          {!has && <div className="empty">{t('FLTMODE parametreleri yok — Parametreler sekmesinden indirin')}</div>}

          {has && (
            <div className="mode-ch-row">
              <span>{t('Mod kanalı')} (FLTMODE_CH)</span>
              <select disabled={!pget('FLTMODE_CH')} value={modeCh} onChange={(e) => write('FLTMODE_CH', Number(e.target.value))}>
                {Array.from({ length: 16 }, (_, k) => k + 1).map((c) => <option key={c} value={c}>CH{c}</option>)}
              </select>
            </div>
          )}

          {has && [0, 1, 2, 3, 4, 5].map((i) => {
            const val = Math.round(pget('FLTMODE' + (i + 1))?.value ?? 0);
            return (
              <div key={i} ref={(el) => { slotRefs.current[i] = el; }} className="mode-slot">
                <span className="mode-slot-idx">{t('Pozisyon')} {i + 1}</span>
                <span className="mode-slot-band">{BANDS[i]} µs</span>
                <select value={String(val)} onChange={(e) => setMode(i, Number(e.target.value))}>
                  {Object.entries(modes).map(([id, nm]) => <option key={id} value={id}>{nm}</option>)}
                </select>
              </div>
            );
          })}

          {has && <div className="setup-desc">{t('Mod kanalını (FLTMODE_CH) seçin; vericide anahtarı oynatınca aktif pozisyon vurgulanır. Her pozisyonun yanında beklenen PWM aralığı yazılıdır.')}</div>}
        </div>
      </div>
    </div>
  );
}
