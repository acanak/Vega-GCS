import { useEffect, useRef, useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import { useT } from './gcs/i18n';
import { useGcs } from './gcs/useGcs';
import { useTelemetry } from './gcs/useTelemetry';
import { ConnectionBar } from './components/ConnectionBar';
import { FlightDataView } from './components/FlightDataView';
import { StatusView } from './components/StatusView';
import { PlannerView } from './components/PlannerView';
import { PwaBadge } from './components/PwaBadge';
import { SettingsMenu } from './components/SettingsMenu';
import { SetupView } from './components/SetupView';
import { LogView } from './components/LogView';
import type { MissionDoc } from './gcs/mission-doc';
import { emptyMission } from './gcs/mission-doc';

type View = 'flight' | 'status' | 'plan' | 'setup' | 'logs';

export function App() {
  const t = useT();
  const gcs = useGcs();
  const telemetry = useTelemetry(gcs.connRef);
  const [view, setView] = useState<View>('flight');
  const [mission, setMission] = useState<MissionDoc>(emptyMission());
  const [params, setParams] = useState<ParamEntry[]>([]);
  const [paramLoad, setParamLoad] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const autoFetched = useRef(false);

  // Baglaninca parametreleri otomatik cek (MAVFtp ile hizli; yoksa klasik).
  useEffect(() => {
    if (gcs.status === 'connected') {
      if (autoFetched.current) return;
      autoFetched.current = true;
      setParamLoad('loading');
      gcs.connRef.current
        ?.downloadParams()
        .then((p) => { if (p.length) { setParams(p); setParamLoad('ready'); } else setParamLoad('error'); })
        .catch(() => setParamLoad('error'));
    } else if (gcs.status === 'disconnected' || gcs.status === 'error') {
      autoFetched.current = false;
      setParamLoad('idle');
    }
  }, [gcs.status, gcs.connRef]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◈</span> WEB MISSION PLANNER</div>
        <nav className="viewnav">
          <button className={view === 'flight' ? 'active' : ''} onClick={() => setView('flight')}>{t('Uçuş Verisi')}</button>
          <button className={view === 'status' ? 'active' : ''} onClick={() => setView('status')}>{t('Durum')}</button>
          <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>{t('Plan')}</button>
          <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>{t('Kurulum')}</button>
          <button className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}>{t('Loglar')}</button>
        </nav>
        {paramLoad === 'loading' && <span className="param-load">{t('Parametreler indiriliyor…')}</span>}
        {paramLoad === 'error' && <span className="param-load err">{t('Parametre indirilemedi')}</span>}
        <SettingsMenu />
        <ConnectionBar status={gcs.status} error={gcs.error} onConnect={gcs.connect} onDisconnect={gcs.disconnect} />
      </header>
      {/* Gorunumler mount'ta KALIR; sekme degisince unmount olmaz -> harita/HUD/iz/durum korunur.
          Yalniz CSS ile gizlenir (display:contents aktif, display:none pasif). */}
      <div className={'view-host' + (view === 'flight' ? '' : ' view-hidden')}><FlightDataView gcs={gcs} params={params} setParams={setParams} /></div>
      <div className={'view-host' + (view === 'status' ? '' : ' view-hidden')}><StatusView gcs={gcs} telemetry={telemetry} /></div>
      <div className={'view-host' + (view === 'plan' ? '' : ' view-hidden')}><PlannerView gcs={gcs} telemetry={telemetry} mission={mission} setMission={setMission} /></div>
      <div className={'view-host' + (view === 'setup' ? '' : ' view-hidden')}><SetupView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} /></div>
      <div className={'view-host' + (view === 'logs' ? '' : ' view-hidden')}><LogView gcs={gcs} /></div>
      <PwaBadge />
    </div>
  );
}
