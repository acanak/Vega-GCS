import { useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
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
import { BatterySetupView } from './BatterySetupView';
import { PidTuneView } from './PidTuneView';
import { TecsTuneView } from './TecsTuneView';
import { SerialPortsView } from './SerialPortsView';
import { OSDView } from './OSDView';
import { ParamConfigView } from './ParamConfigView';
import { SikRadioView } from './SikRadioView';
import { GPS_FIELDS, GIMBAL_FIELDS, ADSB_FIELDS, FLOW_FIELDS } from '../gcs/ardupilot-config';

type Section = 'params' | 'firmware' | 'accel' | 'compass' | 'radio' | 'rc' | 'servo' | 'plane' | 'battery' | 'tune' | 'tecs' | 'modes' | 'failsafe' | 'serial' | 'osd' | 'gps' | 'gimbal' | 'adsb' | 'flow' | 'sik';
// Menü, aracı sıfırdan yapılandırma sırasına göre (ground-up) düzenlidir:
// Temel kurulum (sıralı, numaralı adımlar) -> Donanım -> Ayar -> (en altta) Parametreler.
const GROUPS: Array<{ title: string; numbered?: boolean; items: Array<[Section, string]> }> = [
  { title: 'Temel kurulum', numbered: true, items: [
    ['firmware', 'Firmware'],       // 1 — önce yazılım
    ['plane', 'Airframe'],          // 2 — çerçeve / uçak tipi
    ['rc', 'Alıcı'],                // 3 — alıcı protokolü
    ['radio', 'Radyo'],             // 4 — RC kalibrasyonu
    ['servo', 'Servo Çıkış'],       // 5 — çıkış eşleme
    ['accel', 'İvmeölçer'],         // 6 — ivmeölçer
    ['compass', 'Pusula'],          // 7 — pusula
    ['modes', 'Uçuş Modları'],      // 8 — uçuş modları
    ['failsafe', 'Failsafe'],       // 9 — güvenlik
  ] },
  { title: 'Donanım', items: [
    ['battery', 'Pil / Güç'], ['gps', 'GPS'], ['serial', 'Seri Portlar'], ['sik', 'SiK Radyo'],
    ['gimbal', 'Gimbal / Kamera'], ['flow', 'Optik Akış'], ['adsb', 'ADS-B'], ['osd', 'OSD'],
  ] },
  { title: 'Ayar', items: [
    ['tune', 'PID Ayar'], ['tecs', 'TECS (Uçak)'],
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
  const help = SETUP_HELP[section]?.[lang] ?? SETUP_HELP[section]?.en;
  return (
    <main className="setup">
      <nav className="setup-nav">
        {GROUPS.map((g) => (
          <div className="setup-nav-group" key={g.title}>
            <div className="setup-nav-hd">{t(g.title)}</div>
            {g.items.map(([id, label], idx) => (
              <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
                {g.numbered && <span className="setup-nav-step">{idx + 1}</span>}{t(label)}
              </button>
            ))}
          </div>
        ))}
        <div className="setup-nav-group setup-nav-bottom">
          <button className={section === 'params' ? 'active' : ''} onClick={() => setSection('params')}>{t('Parametreler')}</button>
        </div>
      </nav>
      <div className="setup-content">
        {section === 'params' && <ParamsView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'firmware' && <FirmwareView />}
        {section === 'accel' && <AccelCalView gcs={gcs} />}
        {section === 'compass' && <CompassCalView gcs={gcs} />}
        {section === 'radio' && <RadioCalView gcs={gcs} />}
        {section === 'rc' && <RCView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'modes' && <FlightModesView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'failsafe' && <FailsafeView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {section === 'servo' && <ServoOutputView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'plane' && <PlaneSetupView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'battery' && <BatterySetupView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {section === 'tune' && <PidTuneView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {section === 'tecs' && <TecsTuneView gcs={gcs} params={params} setParams={setParams} telemetry={telemetry} />}
        {section === 'serial' && <SerialPortsView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'osd' && <OSDView gcs={gcs} params={params} setParams={setParams} />}
        {section === 'gps' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('GPS')} note={t('GPS tipi, ikinci GPS, otomatik seçim/blend ve öncelik.')} fields={GPS_FIELDS} />}
        {section === 'gimbal' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('Gimbal / Kamera')} note={t('Gimbal tipi, varsayılan mod, eksen limitleri ve kamera tetik tipi.')} fields={GIMBAL_FIELDS} />}
        {section === 'flow' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('Optik Akış')} note={t('Optik akış sensörü tipi, yönelim ve konum.')} fields={FLOW_FIELDS} />}
        {section === 'adsb' && <ParamConfigView gcs={gcs} params={params} setParams={setParams} title={t('ADS-B')} note={t('ADS-B alıcı tipi ve çarpışma önleme (avoidance).')} fields={ADSB_FIELDS} />}
        {section === 'sik' && <SikRadioView gcs={gcs} />}
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
