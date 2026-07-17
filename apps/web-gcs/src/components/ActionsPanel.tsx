import { useState } from 'react';
import { vehicleModeIds, quickModes } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useT } from '../gcs/i18n';

// MAV_CMD kodlari (constants'ta tanimli degil, dogrudan)
const CMD_NAV_TAKEOFF = 22;
const CMD_DO_CHANGE_SPEED = 178;

interface Props {
  connRef: { current: GcsConnection | null };
  connected: boolean;
  gotoAlt: number;
  setGotoAlt: (v: number) => void;
  clickGoto: boolean;
  setClickGoto: (v: boolean) => void;
  onAltitudeGo: () => void;
  onOpenReplay?: () => void;
  vehicleType: number;
}

export function ActionsPanel({ connRef, connected, gotoAlt, setGotoAlt, clickGoto, setClickGoto, onAltitudeGo, onOpenReplay, vehicleType }: Props) {
  const t = useT();
  const [mode, setMode] = useState('GUIDED');
  const [takeoffAlt, setTakeoffAlt] = useState(10);
  const [speed, setSpeed] = useState(5);
  const [msg, setMsg] = useState<string | null>(null);
  const conn = (): GcsConnection | null => connRef.current;

  const ids = vehicleModeIds(vehicleType);
  const modeNames = Object.keys(ids);
  const quicks = quickModes(vehicleType);

  const flash = (txt: string): void => { setMsg(txt); window.setTimeout(() => setMsg((m) => (m === txt ? null : m)), 3000); };
  const applyMode = (name: string): void => {
    const id = ids[name];
    if (id !== undefined) { void conn()?.setMode(id); flash(name); }
  };
  const takeoff = (): void => {
    const c = conn();
    if (!c) return;
    void c.setMode(ids.GUIDED ?? ids.AUTO ?? 4);
    void c.arm();
    window.setTimeout(() => { c.commandLong(CMD_NAV_TAKEOFF, [0, 0, 0, 0, 0, 0, takeoffAlt]); }, 1200);
    flash('GUIDED + ARM + ' + t('Kalkış') + ' ' + takeoffAlt + ' m');
  };
  const changeSpeed = (): void => { conn()?.commandLong(CMD_DO_CHANGE_SPEED, [1, speed, -1, 0, 0, 0, 0]); flash(t('Hız') + ' → ' + speed + ' m/s'); };

  return (
    <div className="card actions-panel">
      <div className="card-hd"><h2>{t('Kontrol')}</h2>{msg && <span className="hd-note act-msg">{msg}</span>}</div>
      <div className="card-body">
        <div className="arm-row">
          <button className="btn-arm" disabled={!connected} onClick={() => void conn()?.arm()}>{t('ARM')}</button>
          <button className="btn-disarm" disabled={!connected} onClick={() => void conn()?.disarm()}>{t('DISARM')}</button>
        </div>

        <div className="mode-row">
          <select value={modeNames.includes(mode) ? mode : (modeNames[0] ?? '')} onChange={(e) => setMode(e.target.value)} disabled={!connected} aria-label={t('Uçuş modu')}>
            {modeNames.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
          </select>
          <button className="btn-ghost" disabled={!connected} onClick={() => applyMode(mode)}>{t('Ayarla')}</button>
        </div>
        <div className="act-quick">
          {quicks.map((nm) => (
            <button key={nm} className="btn-ghost" disabled={!connected} onClick={() => applyMode(nm)}>{nm === 'LAND' ? t('İniş') : nm}</button>
          ))}
        </div>

        <div className="act-row">
          <button className="btn-primary" disabled={!connected} onClick={takeoff}>{t('Kalkış')}</button>
          <input className="act-num" type="number" disabled={!connected} value={takeoffAlt} onChange={(e) => setTakeoffAlt(Number(e.target.value))} />
          <span className="p-units">m</span>
          <button className="btn-ghost" disabled={!connected} onClick={changeSpeed}>{t('Hız')}</button>
          <input className="act-num" type="number" disabled={!connected} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          <span className="p-units">m/s</span>
        </div>

        <div className="act-row">
          <button className={'btn-ghost' + (clickGoto ? ' act-armed' : '')} disabled={!connected} onClick={() => setClickGoto(!clickGoto)}>
            {clickGoto ? t('Haritaya tıkla…') : t('Tıkla-git')}
          </button>
          <button className="btn-ghost" disabled={!connected} onClick={onAltitudeGo} title={t('Mevcut konumda irtifayı değiştir')}>{t('İrtifa git')}</button>
          <input className="act-num" type="number" disabled={!connected} value={gotoAlt} onChange={(e) => setGotoAlt(Number(e.target.value))} />
          <span className="p-units">m</span>
        </div>
        <p className="setup-desc act-hint">{t('Tıkla-git ve İrtifa git komutları GUIDED modda çalışır. Hedef irtifa göreceli (home’a göre).')}</p>

        {onOpenReplay && (
          <div className="act-replay">
            <button className="btn-ghost" onClick={onOpenReplay}>▶ {t('Kayıt oynat (.tlog / .bin)')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
