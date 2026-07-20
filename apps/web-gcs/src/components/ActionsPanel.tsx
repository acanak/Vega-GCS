import { useState } from 'react';
import { vehicleModeIds, quickModes, MAV_CMD_PREFLIGHT_CALIBRATION } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useT } from '../gcs/i18n';
import { NumberPromptModal } from './NumberPromptModal';

// MAV_CMD kodlari (constants'ta tanimli degil, dogrudan)
const CMD_NAV_TAKEOFF = 22;

interface Props {
  connRef: { current: GcsConnection | null };
  connected: boolean;
  vehicleType: number;
}

export function ActionsPanel({ connRef, connected, vehicleType }: Props) {
  const t = useT();
  const [mode, setMode] = useState('GUIDED');
  const [takeoffAlt, setTakeoffAlt] = useState(10);
  const [takeoffOpen, setTakeoffOpen] = useState(false);
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
  // Preflight (pre-arm) kalibrasyon: gyro (param1) + barometre (param3). Araç sabit ve DISARM olmalı.
  const preflightCal = (): void => {
    const c = conn();
    if (!c) return;
    if (c.telemetry.armed) { flash(t('ARM’lıyken kalibrasyon yapılamaz')); return; }
    c.commandLong(MAV_CMD_PREFLIGHT_CALIBRATION, [1, 0, 1, 0, 0, 0, 0]);
    flash(t('Preflight kalibrasyon gönderildi — aracı sabit tutun'));
  };

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

        <button className="btn-ghost act-precal" disabled={!connected} onClick={preflightCal}
          title={t('Gyro + barometreyi yeniden sıfırlar. Araç yerde, sabit ve DISARM olmalı.')}>
          ⚙ {t('Preflight Kalibrasyon')}
        </button>
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
