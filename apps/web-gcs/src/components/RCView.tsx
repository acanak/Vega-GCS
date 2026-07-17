import { useEffect, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { RC_AUX_OPTIONS, RC_PROTOCOL_BITS, RC_OPTION_BITS, RSSI_TYPES, SERIAL_PROTOCOL_RCIN } from '../gcs/ardupilot-rc';
import { useT } from '../gcs/i18n';

const num = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pwmPct = (v: number): number => Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));

type Tab = 'channels' | 'input';

export function RCView({ gcs, params, setParams }: { gcs: UseGcs; params: ParamEntry[]; setParams: (p: ParamEntry[]) => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('channels');
  const [pwm, setPwm] = useState<number[]>([]);
  const [rssi, setRssi] = useState<number>(-1);
  const connected = gcs.status === 'connected';
  const pget = (n: string): ParamEntry | undefined => params.find((p) => p.name === n);
  const pval = (n: string, d = 0): number => Math.round(pget(n)?.value ?? d);

  const write = (name: string, value: number): void => {
    const e = pget(name);
    gcs.connRef.current?.setParam(name, value, e?.type ?? 6);
    if (e) setParams(params.map((p) => (p.name === name ? { ...p, value } : p)));
  };
  const bitWrite = (name: string, bit: number, on: boolean): void => {
    const cur = pval(name);
    const next = on ? (cur | (1 << bit)) >>> 0 : (cur & ~(1 << bit)) >>> 0;
    write(name, next);
  };

  const channels: number[] = [];
  for (let n = 1; n <= 16; n++) if (pget('RC' + n + '_MIN') || pget('RC' + n + '_OPTION')) channels.push(n);

  const serialPorts: number[] = [];
  for (let n = 0; n <= 8; n++) if (pget('SERIAL' + n + '_PROTOCOL')) serialPorts.push(n);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RC_CHANNELS, (f) => {
      const arr: number[] = [];
      for (let i = 1; i <= 16; i++) arr.push(Number(f['chan' + i + '_raw']) || 0);
      setPwm(arr);
      const r = Number(f.rssi);
      setRssi(Number.isFinite(r) && r !== 255 ? Math.round((r / 254) * 100) : -1);
    });
  }, [gcs.status, gcs.connRef]);

  const AuxSelect = ({ n }: { n: number }) => {
    const cur = pval('RC' + n + '_OPTION');
    const known = RC_AUX_OPTIONS.some((o) => o.code === cur);
    return (
      <select disabled={!connected} value={cur} onChange={(e) => write('RC' + n + '_OPTION', Number(e.target.value))}>
        {!known && <option value={cur}>{t('Bilinmeyen')} ({cur})</option>}
        {RC_AUX_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
      </select>
    );
  };

  return (
    <div className="setup-panel setup-wide">
      <div className="card">
        <div className="card-hd">
          <h2>{t('RC — Kanallar & Protokol')}</h2>
          <div className="seg" style={{ marginLeft: 12 }}>
            <button className={tab === 'channels' ? 'active' : ''} onClick={() => setTab('channels')}>{t('Kanallar')}</button>
            <button className={tab === 'input' ? 'active' : ''} onClick={() => setTab('input')}>{t('Giriş & Protokol')}</button>
          </div>
          <span className="params-spacer" />
          {rssi >= 0 && <span className="hd-note">RSSI %{rssi}</span>}
          {!connected && <span className="hd-note">{t('bağlı değil')}</span>}
        </div>

        {channels.length === 0 && serialPorts.length === 0 ? (
          <div className="card-body"><div className="empty">{t('RC/SERIAL parametreleri yok — Parametreler sekmesinden indirin')}</div></div>
        ) : tab === 'channels' ? (
          <div className="card-body grid-scroll">
            {channels.length === 0 ? (
              <div className="empty">{t('RC kanal parametreleri yok')}</div>
            ) : (
              <table className="cmd-grid rc-grid">
                <thead><tr><th>#</th><th>{t('PWM (canlı)')}</th><th>Min</th><th>Trim</th><th>Max</th><th>{t('Ölü B.')}</th><th>{t('Ters')}</th><th>{t('Aux Fonksiyon')} (RCn_OPTION)</th></tr></thead>
                <tbody>
                  {channels.map((n) => {
                    const live = pwm[n - 1] ?? 0;
                    return (
                      <tr key={n}>
                        <td>{n}</td>
                        <td>
                          <div className="rc-track" style={{ minWidth: 90 }}><div className="rc-fill" style={{ width: pwmPct(live) + '%' }} /></div>
                          <span className="p-units">{live || '—'}</span>
                        </td>
                        <td><input disabled={!connected} value={pval('RC' + n + '_MIN', 1000)} onChange={(e) => write('RC' + n + '_MIN', num(e.target.value))} /></td>
                        <td><input disabled={!connected} value={pval('RC' + n + '_TRIM', 1500)} onChange={(e) => write('RC' + n + '_TRIM', num(e.target.value))} /></td>
                        <td><input disabled={!connected} value={pval('RC' + n + '_MAX', 2000)} onChange={(e) => write('RC' + n + '_MAX', num(e.target.value))} /></td>
                        <td><input disabled={!connected} value={pval('RC' + n + '_DZ')} onChange={(e) => write('RC' + n + '_DZ', num(e.target.value))} /></td>
                        <td><input type="checkbox" disabled={!connected} checked={pval('RC' + n + '_REVERSED') > 0} onChange={(e) => write('RC' + n + '_REVERSED', e.target.checked ? 1 : 0)} /></td>
                        <td>{pget('RC' + n + '_OPTION') ? <AuxSelect n={n} /> : <span className="p-units">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="card-body rc-input">
            {/* ---- RC protokolleri ---- */}
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('RC Protokolleri')} (RC_PROTOCOLS){pget('RC_PROTOCOLS') ? '' : ' — ' + t('param yok')}</div>
              <p className="setup-desc">{t('“All” işaretliyse tüm protokoller otomatik denenir. Belirli bir alıcı için sadece onu işaretleyip “All”ı kaldırabilirsiniz.')}</p>
              <div className="chk-grid">
                {RC_PROTOCOL_BITS.map((b) => (
                  <label key={b.bit} className="chk">
                    <input type="checkbox" disabled={!connected || !pget('RC_PROTOCOLS')} checked={(pval('RC_PROTOCOLS') & (1 << b.bit)) !== 0} onChange={(e) => bitWrite('RC_PROTOCOLS', b.bit, e.target.checked)} />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* ---- Seri port RC girişi ---- */}
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('Seri Port RC Girişi')}</div>
              <p className="setup-desc">{t("CRSF/ELRS/FPort gibi bir alıcı bir UART'a bağlıysa, o portun protokolünü")} <b>RCIN</b> ({SERIAL_PROTOCOL_RCIN}) {t('yapın')}.</p>
              {serialPorts.length === 0 ? <div className="empty">{t('SERIAL parametreleri yok')}</div> : (
                <div className="rc-serial">
                  {serialPorts.map((n) => {
                    const proto = pval('SERIAL' + n + '_PROTOCOL', -1);
                    const isRcin = proto === SERIAL_PROTOCOL_RCIN;
                    return (
                      <div key={n} className={'rc-serial-row' + (isRcin ? ' on' : '')}>
                        <span className="rc-serial-name">SERIAL{n}</span>
                        <span className="p-units">{t('protokol')} {proto}</span>
                        {isRcin
                          ? <span className="rc-badge">✓ {t('RC girişi')}</span>
                          : <button disabled={!connected} onClick={() => write('SERIAL' + n + '_PROTOCOL', SERIAL_PROTOCOL_RCIN)}>{t('RC girişi yap')}</button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ---- RSSI ---- */}
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('Sinyal Gücü')} (RSSI_TYPE){pget('RSSI_TYPE') ? '' : ' — ' + t('param yok')}</div>
              <select disabled={!connected || !pget('RSSI_TYPE')} value={pval('RSSI_TYPE')} onChange={(e) => write('RSSI_TYPE', Number(e.target.value))}>
                {RSSI_TYPES.map((o) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
              </select>
            </section>

            {/* ---- RC seçenekleri ---- */}
            <section className="rc-sec">
              <div className="rc-sec-hd">{t('RC Seçenekleri')} (RC_OPTIONS){pget('RC_OPTIONS') ? '' : ' — ' + t('param yok')}</div>
              <div className="chk-grid">
                {RC_OPTION_BITS.map((b) => (
                  <label key={b.bit} className="chk">
                    <input type="checkbox" disabled={!connected || !pget('RC_OPTIONS')} checked={(pval('RC_OPTIONS') & (1 << b.bit)) !== 0} onChange={(e) => bitWrite('RC_OPTIONS', b.bit, e.target.checked)} />
                    <span>{b.label}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
