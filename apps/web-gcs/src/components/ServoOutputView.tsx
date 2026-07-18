import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { SERVO_FUNCTIONS } from '../gcs/ardupilot-servo';

const CMD_DO_SET_SERVO = 183;
const CMD_DO_MOTOR_TEST = 209;
const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pwmPct = (v: number): number => Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));

export function ServoOutputView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  // canlı PWM imperatif (setState fonksiyon <select>'lerini gereksiz render'lardan korur)
  const barRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const valRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const [testPwm, setTestPwm] = useState(1500);
  const [mt, setMt] = useState({ motor: 1, pct: 8, sec: 3 });

  const channels: number[] = [];
  for (let n = 1; n <= 32; n++) if (pget('SERVO' + n + '_FUNCTION')) channels.push(n);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.SERVO_OUTPUT_RAW, (f) => {
      for (let i = 1; i <= 16; i++) {
        const v = Number(f['servo' + i + '_raw']) || 0;
        const bar = barRefs.current[i]; if (bar) bar.style.width = pwmPct(v) + '%';
        const val = valRefs.current[i]; if (val) val.textContent = v ? String(v) : '—';
      }
    });
  }, [gcs.status, gcs.connRef]);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };
  const testServo = (n: number): void => gcs.connRef.current?.commandLong(CMD_DO_SET_SERVO, [n, testPwm, 0, 0, 0, 0, 0]);
  const motorTest = (): void => gcs.connRef.current?.commandLong(CMD_DO_MOTOR_TEST, [mt.motor, 0, mt.pct, mt.sec, 0, 0, 0]);

  const funcSelect = (n: number) => {
    const cur = Math.round(pget('SERVO' + n + '_FUNCTION')?.value ?? 0);
    const known = SERVO_FUNCTIONS.some((o) => o.code === cur);
    return (
      <select disabled={!connected} value={cur} onChange={(e) => write('SERVO' + n + '_FUNCTION', Number(e.target.value))}>
        {!known && <option value={cur}>{t('Bilinmeyen')} ({cur})</option>}
        {SERVO_FUNCTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
      </select>
    );
  };

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd"><h2>{t('Servo çıkış')}</h2><span className="hd-note">{channels.length} {t('kanal')}</span></div>
        <div className="card-body grid-scroll">
          {channels.length === 0 ? (
            <div className="empty">{t('SERVO parametreleri yok — Parametreler sekmesinden indirin')}</div>
          ) : (
            <>
              <div className="servo-warn">⚠ {t('Test etmeden önce pervaneleri çıkarın! Motorlar dönebilir.')}</div>
              <div className="servo-test-bar">
                <span>{t('Test PWM')}</span>
                <input className="act-num" type="number" value={testPwm} onChange={(e) => setTestPwm(num(e.target.value))} />
                <span className="p-units">{t('satırdaki Test ile o çıkışa uygulanır')}</span>
              </div>
              <table className="cmd-grid">
                <thead><tr><th>#</th><th>{t('PWM (canlı)')}</th><th>{t('Fonksiyon')}</th><th>Min</th><th>Trim</th><th>Max</th><th>{t('Ters')}</th><th>{t('Test')}</th></tr></thead>
                <tbody>
                  {channels.map((n) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td>
                        <div className="rc-track" style={{ minWidth: 90 }}><div className="rc-fill" ref={(el) => { barRefs.current[n] = el; }} style={{ width: '0%' }} /></div>
                        <span className="p-units" ref={(el) => { valRefs.current[n] = el; }}>—</span>
                      </td>
                      <td>{funcSelect(n)}</td>
                      <td><input value={Math.round(pget('SERVO' + n + '_MIN')?.value ?? 1000)} onChange={(e) => write('SERVO' + n + '_MIN', num(e.target.value))} /></td>
                      <td><input value={Math.round(pget('SERVO' + n + '_TRIM')?.value ?? 1500)} onChange={(e) => write('SERVO' + n + '_TRIM', num(e.target.value))} /></td>
                      <td><input value={Math.round(pget('SERVO' + n + '_MAX')?.value ?? 2000)} onChange={(e) => write('SERVO' + n + '_MAX', num(e.target.value))} /></td>
                      <td><input type="checkbox" disabled={!connected} checked={(pget('SERVO' + n + '_REVERSED')?.value ?? 0) > 0} onChange={(e) => write('SERVO' + n + '_REVERSED', e.target.checked ? 1 : 0)} /></td>
                      <td><button className="btn-ghost" disabled={!connected} onClick={() => testServo(n)}>{t('Test')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="servo-motor-test">
                <div className="rc-sec-hd">{t('Motor testi (kopter / çok-motor)')}</div>
                <div className="servo-mt-row">
                  <label>{t('Motor')}<input className="act-num" type="number" value={mt.motor} onChange={(e) => setMt({ ...mt, motor: num(e.target.value) })} /></label>
                  <label>{t('Gaz %')}<input className="act-num" type="number" value={mt.pct} onChange={(e) => setMt({ ...mt, pct: num(e.target.value) })} /></label>
                  <label>{t('Süre (sn)')}<input className="act-num" type="number" value={mt.sec} onChange={(e) => setMt({ ...mt, sec: num(e.target.value) })} /></label>
                  <button className="btn-arm" disabled={!connected} onClick={motorTest}>{t('Motoru çalıştır')}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
