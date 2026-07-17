import { useState } from 'react';
import { vehicleModeIds, quickModes } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useT } from '../gcs/i18n';
import { NumberPromptModal } from './NumberPromptModal';

// MAV_CMD kodlari (constants'ta tanimli degil, dogrudan)
const CMD_NAV_TAKEOFF = 22;
const CMD_DO_CHANGE_SPEED = 178;

interface Props {
  connRef: { current: GcsConnection | null };
  connected: boolean;
  onOpenReplay?: () => void;
  vehicleType: number;
}

export function ActionsPanel({ connRef, connected, onOpenReplay, vehicleType }: Props) {
  const t = useT();
  const [mode, setMode] = useState('GUIDED');
  const [takeoffAlt, setTakeoffAlt] = useState(10);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
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
          <button className="btn-ghost" disabled={!connected} onClick={() => setTakeoffOpen(true)}>{t('Kalkış')}</button>
        </div>

        <div className="act-row">
          <button className="btn-ghost" disabled={!connected} onClick={changeSpeed}>{t('Hız')}</button>
          <input className="act-num" type="number" disabled={!connected} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          <span className="p-units">m/s</span>
        </div>
        <p className="setup-desc act-hint">{t('Guided git için haritada bir noktaya sağ tıklayın. Kalkış GUIDED modda çalışır.')}</p>

        {onOpenReplay && (
          <div className="act-replay">
            <button className="btn-ghost" onClick={onOpenReplay}>▶ {t('Kayıt oynat (.tlog / .bin)')}</button>
          </div>
        )}
      </div>

      {takeoffOpen && (
        <NumberPromptModal
          title={t('Kalkış')}
          message={t('GUIDED moda geçilip ARM edilecek ve otomatik kalkış yapılacak. Emin misiniz?')}
          label={t('Hedef irtifa')}
          value={takeoffAlt}
          onValue={setTakeoffAlt}
          confirmLabel={t('Kalkış')}
          danger
          onConfirm={() => { takeoff(); setTakeoffOpen(false); }}
          onClose={() => setTakeoffOpen(false)}
        />
      )}
    </div>
  );
}
