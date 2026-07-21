import { useEffect, useRef, useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import { useT } from './gcs/i18n';
import { useGcs } from './gcs/useGcs';
import { useTelemetry } from './gcs/useTelemetry';
import { ConnectionBar } from './components/ConnectionBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FlightDataView } from './components/FlightDataView';
import { StatusView } from './components/StatusView';
import { PlannerView } from './components/PlannerView';
import { PwaBadge } from './components/PwaBadge';
import { SerialPortPicker } from './components/SerialPortPicker';
import { SettingsMenu } from './components/SettingsMenu';
import { LangSwitch } from './components/LangSwitch';
import { AboutModal } from './components/AboutModal';
import { CHANNEL } from './gcs/version';
import { SupportModal } from './components/SupportModal';
import { SetupView } from './components/SetupView';
import { LogView } from './components/LogView';
import type { MissionDoc } from './gcs/mission-doc';
import { emptyMission } from './gcs/mission-doc';
import { persistGet, persistSet } from './gcs/persist';

type View = 'flight' | 'status' | 'plan' | 'setup' | 'logs';

export function App() {
  const t = useT();
  const gcs = useGcs();
  const telemetry = useTelemetry(gcs.connRef);
  const [view, setView] = useState<View>('flight');
  const [mission, setMission] = useState<MissionDoc>(emptyMission());
  const [params, setParams] = useState<ParamEntry[]>([]);
  const [paramLoad, setParamLoad] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  // Loglar ekranından seçilen kayıt; uçuş ekranına aktarılır ve oynatma başlar
  const [replayFile, setReplayFile] = useState<File | null>(null);
  const autoFetched = useRef(false);

  // Açılışta önbellekten parametreleri yükle (çevrimdışı Setup gezinmesi için;
  // yazma girişleri bağlantı yokken zaten kapalı). Bağlanınca tazesi indirilip üzerine yazılır.
  useEffect(() => {
    persistGet<ParamEntry[]>('params:last')
      .then((cached) => { if (cached?.length) setParams((cur) => (cur.length ? cur : cached)); })
      .catch(() => {});
  }, []);

  // Açılışta görev taslağını geri yükle; her değişiklikte otokaydet (sekme kapansa da plan kaybolmaz).
  const missionRestored = useRef(false);
  useEffect(() => {
    persistGet<MissionDoc>('mission:draft')
      .then((draft) => {
        missionRestored.current = true;
        if (draft && (draft.items.length || draft.polygon.length || draft.fence.length || draft.rally.length)) {
          setMission((cur) => (cur.items.length || cur.polygon.length ? cur : draft));
        }
      })
      .catch(() => { missionRestored.current = true; });
  }, []);
  useEffect(() => {
    if (!missionRestored.current) return; // geri yükleme bitmeden boş taslakla ezme
    const id = setTimeout(() => { void persistSet('mission:draft', mission).catch(() => {}); }, 800);
    return () => clearTimeout(id);
  }, [mission]);

  // Baglaninca parametreleri otomatik cek (MAVFtp ile hizli; yoksa klasik).
  useEffect(() => {
    if (gcs.status === 'connected') {
      if (autoFetched.current) return;
      autoFetched.current = true;
      setParamLoad('loading');
      gcs.connRef.current
        ?.downloadParams()
        .then((p) => {
          if (p.length) {
            setParams(p);
            setParamLoad('ready');
            void persistSet('params:last', p).catch(() => {}); // çevrimdışı önbellek
          } else setParamLoad('error');
        })
        .catch(() => setParamLoad('error'));
    } else if (gcs.status === 'disconnected' || gcs.status === 'error') {
      autoFetched.current = false;
      setParamLoad('idle');
    }
  }, [gcs.status, gcs.connRef]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">◈</span> VEGA GCS{CHANNEL && <span className="beta-badge" title={t('Ön-yayın sürümü')}>{CHANNEL}</span>}</div>
        <nav className="viewnav">
          <button className={view === 'flight' ? 'active' : ''} onClick={() => setView('flight')}>{t('Uçuş')}</button>
          <button className={view === 'status' ? 'active' : ''} onClick={() => setView('status')}>{t('Durum')}</button>
          <button className={view === 'plan' ? 'active' : ''} onClick={() => setView('plan')}>{t('Plan')}</button>
          <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>{t('Kurulum')}</button>
          <button className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}>{t('Loglar')}</button>
        </nav>
        {paramLoad === 'loading' && <span className="param-load">{t('Parametreler indiriliyor…')}</span>}
        {paramLoad === 'error' && <span className="param-load err">{t('Parametre indirilemedi')}</span>}
        <LangSwitch />
        <SettingsMenu />
        <button className="topbar-icon donate" onClick={() => setSupportOpen(true)} title={t('Projeyi destekle')} aria-label={t('Projeyi destekle')}>♥</button>
        <button className="topbar-icon" onClick={() => setAboutOpen(true)} title={t('Hakkında')} aria-label={t('Hakkında')}>ⓘ</button>
        <ConnectionBar status={gcs.status} error={gcs.error} onConnect={gcs.connect} onDisconnect={gcs.disconnect} />
      </header>
      {/* Gorunumler mount'ta KALIR; sekme degisince unmount olmaz -> harita/HUD/iz/durum korunur.
          Yalniz CSS ile gizlenir (display:contents aktif, display:none pasif). */}
      <div className={'view-host' + (view === 'flight' ? '' : ' view-hidden')}><ErrorBoundary name="Flight"><FlightDataView gcs={gcs} params={params} setParams={setParams} replayFile={replayFile} onReplayConsumed={() => setReplayFile(null)} /></ErrorBoundary></div>
      <div className={'view-host' + (view === 'status' ? '' : ' view-hidden')}><ErrorBoundary name="Status"><StatusView gcs={gcs} telemetry={telemetry} /></ErrorBoundary></div>
      <div className={'view-host' + (view === 'plan' ? '' : ' view-hidden')}><ErrorBoundary name="Plan"><PlannerView gcs={gcs} telemetry={telemetry} mission={mission} setMission={setMission} /></ErrorBoundary></div>
      <div className={'view-host' + (view === 'setup' ? '' : ' view-hidden')}><ErrorBoundary name="Setup"><SetupView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} /></ErrorBoundary></div>
      <div className={'view-host' + (view === 'logs' ? '' : ' view-hidden')}><ErrorBoundary name="Logs"><LogView gcs={gcs} onReplay={(f) => { setReplayFile(f); setView('flight'); }} /></ErrorBoundary></div>
      <PwaBadge />
      <SerialPortPicker />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} onOpenSupport={() => { setAboutOpen(false); setSupportOpen(true); }} />}
      {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
    </div>
  );
}
