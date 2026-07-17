import { useEffect, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { SERVO_FUNCTIONS } from '../gcs/ardupilot-servo';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export function ServoOutputView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const [pwm, setPwm] = useState<number[]>([]);
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);

  const channels: number[] = [];
  for (let n = 1; n <= 32; n++) if (pget('SERVO' + n + '_FUNCTION')) channels.push(n);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.SERVO_OUTPUT_RAW, (f) => {
      const arr: number[] = [];
      for (let i = 1; i <= 16; i++) arr.push(Number(f['servo' + i + '_raw']) || 0);
      setPwm(arr);
    });
  }, [gcs.status, gcs.connRef]);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('Servo çıkış')}</h2><span className="hd-note">{channels.length} {t('kanal')}</span></div>
        <div className="card-body grid-scroll">
          {channels.length === 0 ? (
            <div className="empty">{t('SERVO parametreleri yok — Parametreler sekmesinden indirin')}</div>
          ) : (
            <table className="cmd-grid">
              <thead><tr><th>#</th><th>{t('PWM (canlı)')}</th><th>{t('Fonksiyon')}</th><th>Min</th><th>Trim</th><th>Max</th><th>{t('Ters')}</th></tr></thead>
              <tbody>
                {channels.map((n) => {
                  const fn = pget('SERVO' + n + '_FUNCTION');
                  const live = pwm[n - 1] ?? 0;
                  const pct = Math.max(0, Math.min(100, ((live - 1000) / 1000) * 100));
                  return (
                    <tr key={n}>
                      <td>{n}</td>
                      <td>
                        <div className="rc-track" style={{ minWidth: 90 }}>
                          <div className="rc-fill" style={{ width: pct + '%' }} />
                        </div>
                        <span className="p-units">{live || '—'}</span>
                      </td>
                      <td>
                        {(() => {
                          const cur = Math.round(fn?.value ?? 0);
                          const known = SERVO_FUNCTIONS.some((o) => o.code === cur);
                          return (
                            <select disabled={!connected} value={cur} onChange={(e) => write('SERVO' + n + '_FUNCTION', Number(e.target.value))}>
                              {!known && <option value={cur}>{t('Bilinmeyen')} ({cur})</option>}
                              {SERVO_FUNCTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
                            </select>
                          );
                        })()}
                      </td>
                      <td><input value={Math.round(pget('SERVO' + n + '_MIN')?.value ?? 1000)} onChange={(e) => write('SERVO' + n + '_MIN', num(e.target.value))} /></td>
                      <td><input value={Math.round(pget('SERVO' + n + '_TRIM')?.value ?? 1500)} onChange={(e) => write('SERVO' + n + '_TRIM', num(e.target.value))} /></td>
                      <td><input value={Math.round(pget('SERVO' + n + '_MAX')?.value ?? 2000)} onChange={(e) => write('SERVO' + n + '_MAX', num(e.target.value))} /></td>
                      <td><input type="checkbox" disabled={!connected} checked={(pget('SERVO' + n + '_REVERSED')?.value ?? 0) > 0} onChange={(e) => write('SERVO' + n + '_REVERSED', e.target.checked ? 1 : 0)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
