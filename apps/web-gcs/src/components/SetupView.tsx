import { useState } from 'react';
import { frameClass } from '@wmp/protocol';
import type { ParamEntry, VehicleTelemetry, FrameClass } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT, useI18n } from '../gcs/i18n';
import { SETUP_HELP } from '../gcs/setup-help';
import { ParamsView } from './ParamsView';
import { FirmwareView } from './FirmwareView';
import { AccelCalView } from './AccelCalView';
import { CompassCalView } from './CompassCalView';
import { RadioCalView } from './RadioCalView';
import { RCView } from './RCView';
import { FlightModesView } from './FlightModesView';
import { FailsafeView } from './FailsafeView';
import { ServoOutputView } from './ServoOutputView';
import { PlaneSetupView } from './PlaneSetupView';
import { CopterFrameView } from './CopterFrameView';
import { BoardOrientationView } from './BoardOrientationView';
import { BatterySetupView } from './BatterySetupView';
import { PidTuneView } from './PidTuneView';
import { TecsTuneView } from './TecsTuneView';
import { SerialPortsView } from './SerialPortsView';
import { OSDView } from './OSDView';
import { ParamConfigView } from './ParamConfigView';
import { SikRadioView } from './SikRadioView';
import { LidarSetupView } from './LidarSetupView';
import { GPS_FIELDS, ADSB_FIELDS, FLOW_FIELDS, NOTCH_FIELDS, LGR_FIELDS } from '../gcs/ardupilot-config';

type Section = 'params' | 'firmware' | 'accel' | 'compass' | 'radio' | 'rc' | 'servo' | 'plane' | 'copter' | 'orient' | 'battery' | 'tune' | 'tecs' | 'notch' | 'lgr' | 'modes' | 'failsafe' | 'serial' | 'osd' | 'gps' | 'lidar' | 'adsb' | 'flow' | 'sik';
// Menü öğesi: [bölüm, etiket, görünür olduğu araç sınıfları?]. frames verilmezse her araçta görünür.
type MenuItem = [Section, string, FrameClass[]?];
// Menü, aracı sıfırdan yapılandırma sırasına göre (ground-up) düzenlidir:
// Temel kurulum (sıralı, numaralı adımlar) -> Donanım -> Ayar -> (en altta) Parametreler.
const GROUPS: Array<{ title: string; numbered?: boolean; items: MenuItem[] }> = [
  { title: 'Temel kurulum', numbered: true, items: [
    ['firmware', 'Firmware'],       // 1 — önce yazılım
    ['plane', 'Airframe', ['plane']], // 2 — çerçeve / uçak tipi (yalnızca uçak)
    ['copter', 'Çerçeve / Motorlar', ['copter']], // 2 — kopter çerçevesi + motor testi (yalnızca kopter)
    ['orient', 'Otopilot Yerleşimi'], // 3 — kart montaj yönü (kalibrasyonlardan önce)
    ['rc', 'Alıcı'],                // 4 — alıcı protokolü
    ['radio', 'Radyo'],             // 5 — RC kalibrasyonu
    ['servo', 'Servo Çıkış'],       // 6 — çıkış eşleme
    ['accel', 'İvmeölçer'],         // 7 — ivmeölçer
    ['compass', 'Pusula'],          // 8 — pusula
    ['modes', 'Uçuş Modları'],      // 9 — uçuş modları
    ['failsafe', 'Failsafe'],       // 10 — güvenlik
  ] },
  { title: 'Donanım', items: [
    ['battery', 'Pil / Güç'], ['gps', 'GPS'], ['serial', 'Seri Portlar'], ['sik', 'SiK Radyo'],
    ['lidar', 'Lidar / Mesafe'], ['flow', 'Optik Akış'], ['adsb', 'ADS-B'], ['osd', 'OSD'],
    ['lgr', 'İniş Takımı'],
  ] },
  { title: 'Ayar', items: [
    ['tune', 'PID Ayar'], ['tecs', 'TECS (Uçak)', ['plane']], ['notch', 'Titreşim Filtresi'],
  ] },
];

interface Props {
  gcs: UseGcs;
  params: ParamEntry[];
  setParams: (p: ParamEntry[]) => void;
  telemetry: VehicleTelemetry | null;
}

export function SetupView({ gcs, params, setParams, telemetry }: Props) {
  const t = useT();
  const { lang } = useI18n();
  const [section, setSection] = useState<Section>('firmware');
  // Araç bağlı ve heartbeat gelmişse (vehicleType>0) menüyü araç sınıfına göre filtrele;
  // bağlantı yokken her öğe görünür (çevrimdışı gezinme bozulmasın).
  const fc: FrameClass | null = telemetry?.connected && telemetry.vehicleType > 0 ? frameClass(telemetry.vehicleType) : null;
  const visible = (it: MenuItem) => !fc || !it[2] || it[2].includes(fc);
  // Aktif bölüm filtreyle gizlendiyse (örn. kopter bağlandı, Airframe açıktı) güvenli bölüme dön.
  const allVisible = GROUPS.flatMap((g) => g.items.filter(visible).map((it) => it[0]));
  const effectiveSection: Section = section === 'params' || allVisible.includes(section) ? section : 'firmware';
  const help = SETUP_HELP[effectiveSection]?.[lang] ?? SETUP_HELP[effectiveSection]?.en;
  return (
    <main className="setup">
      <nav className="setup-nav">
        {GROUPS.map((g) => (
          <div className="setup-nav-group" key={g.title}>
            <div className="setup-nav-hd">{t(g.title)}</div>
            {g.items.filter(visible).map(([id, label], idx) => (
              <button key={id} className={effectiveSection === id ? 'active' : ''} onClick={() => setSection(id)}>
                {g.numbered && <span className="setup-nav-step">{idx + 1}</span>}{t(label)}
              </button>
            ))}
          </div>
        ))}
        <div className="setup-nav-group setup-nav-bottom">
          <button className={effectiveSection === 'params' ? 'active' : ''} onClick={() => setSection('params')}>{t('Parametreler')}</button>
        </div>
      </nav>
      <div className="setup-content">
        {effectiveSection === 'params' && <ParamsView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'firmware' && <FirmwareView />}
        {effectiveSection === 'accel' && <AccelCalView gcs={gcs} />}
        {effectiveSection === 'compass' && <CompassCalView gcs={gcs} telemetry={telemetry} params={params} setParams={setParams} />}
        {effectiveSection === 'radio' && <RadioCalView gcs={gcs} />}
        {effectiveSection === 'rc' && <RCView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'modes' && <FlightModesView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'failsafe' && <FailsafeView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'servo' && <ServoOutputView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'plane' && <PlaneSetupView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'copter' && <CopterFrameView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'orient' && <BoardOrientationView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'battery' && <BatterySetupView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'tune' && <PidTuneView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'tecs' && <TecsTuneView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {effectiveSection === 'serial' && <SerialPortsView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'osd' && <OSDView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'gps' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('GPS')} note={t('GPS tipi, ikinci GPS, otomatik seçim/blend ve öncelik.')} fields={GPS_FIELDS} />}
        {effectiveSection === 'lidar' && <LidarSetupView gcs={gcs} params={params} setParams={setParams} />}
        {effectiveSection === 'flow' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('Optik Akış')} note={t('Optik akış sensörü tipi, yönelim ve konum.')} fields={FLOW_FIELDS} />}
        {effectiveSection === 'adsb' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('ADS-B')} note={t('ADS-B alıcı tipi ve çarpışma önleme (avoidance).')} fields={ADSB_FIELDS} />}
        {effectiveSection === 'sik' && <SikRadioView gcs={gcs} />}
        {effectiveSection === 'notch' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('Titreşim Filtresi')} note={t('Harmonic notch: gyroya ulaşan motor gürültüsünü hedefli süzer. INS_HNTCH_ENABLE = 1 yazıp parametreleri yeniden indirince alt ayarlar görünür.')} fields={NOTCH_FIELDS} />}
        {effectiveSection === 'lgr' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('İniş Takımı')} note={t('Katlanır iniş takımı: SERVOn_FUNCTION = 29 (Landing Gear) atayın; irtifaya göre otomatik aç/kapa.')} fields={LGR_FIELDS} />}
      </div>
      {help && (
        <aside className="setup-help">
          <div className="setup-help-hd">{t('İpucu')}</div>
          <h3 className="setup-help-title">{help.title}</h3>
          <p className="setup-help-body">{help.body}</p>
          {help.tips.length > 0 && (
            <ul className="setup-help-tips">
              {help.tips.map((tp, i) => <li key={i}>{tp}</li>)}
            </ul>
          )}
        </aside>
      )}
    </main>
  );
}
