import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { SERVO_FUNCTIONS } from '../gcs/ardupilot-servo';

const CMD_DO_SET_SERVO = 183;
const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pwmPct = (v: number): number => Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));

// ArduPilot DO_SET_SERVO'yu yalnız şu fonksiyonlardaki çıkışlarda kabul eder
// (AP_ServoRelayEvents): Disabled(0), RCPassThru(1), RCIN1-16(51-66), Scripting(94-109).
// Uçuş fonksiyonu atanmış kanallar "already in use" ile reddedilir.
const canDoSetServo = (fn: number): boolean => fn === 0 || fn === 1 || (fn >= 51 && fn <= 66) || (fn >= 94 && fn <= 109);

export function ServoOutputView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  // canlı PWM imperatif (setState fonksiyon <select>'lerini gereksiz render'lardan korur)
  const barRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const valRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const [testPwm, setTestPwm] = useState(1500);
  const [ack, setAck] = useState<string | null>(null);

  const channels: number[] = [];
  for (let n = 1; n <= 32; n++) if (pget('SERVO' + n + '_FUNCTION')) channels.push(n);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    const subs = [
      conn.subscribeMessage(MSG.SERVO_OUTPUT_RAW, (f) => {
        for (let i = 1; i <= 16; i++) {
          const v = Number(f['servo' + i + '_raw']) || 0;
          const bar = barRefs.current[i]; if (bar) bar.style.width = pwmPct(v) + '%';
          const val = valRefs.current[i]; if (val) val.textContent = v ? String(v) : '—';
        }
      }),
      // Test komutunun sonucunu göster — sessiz başarısızlık yerine geri bildirim
      conn.subscribeMessage(MSG.COMMAND_ACK, (f) => {
        if (Number(f.command) !== CMD_DO_SET_SERVO) return;
        const res = Number(f.result);
        setAck(res === 0 ? 'Servo test: ✓' : 'Servo test: ' + t('reddedildi') + ' (MAV_RESULT ' + res + ')');
      }),
    ];
    return () => subs.forEach((u) => u());
  }, [gcs.status, gcs.connRef, t]);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 9);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };
  const testServo = (n: number): void => { setAck(null); gcs.connRef.current?.commandLong(CMD_DO_SET_SERVO, [n, testPwm, 0, 0, 0, 0, 0]); };

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
                {ack && <span className={'servo-ack' + (ack.includes('✓') ? ' ok' : ' err')}>{ack}</span>}
              </div>
              <p className="setup-desc">{t('Test yalnız Disabled / RCPassThru / RCINx atanmış çıkışlarda çalışır (ArduPilot kısıtı) — uçuş fonksiyonu atanmış bir kanalı denemek için fonksiyonunu geçici olarak Disabled yapın. Emniyet anahtarı basılıysa tüm çıkışlar kapalıdır.')}</p>
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
                      <td>{(() => {
                        const fn = Math.round(pget('SERVO' + n + '_FUNCTION')?.value ?? 0);
                        const ok = canDoSetServo(fn);
                        return (
                          <button className="btn-ghost" disabled={!connected || !ok}
                            title={ok ? undefined : t('Bu çıkış bir uçuş fonksiyonuna atanmış — otopilot testi reddeder. Önce fonksiyonu Disabled yapın.')}
                            onClick={() => testServo(n)}>{t('Test')}</button>
                        );
                      })()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
