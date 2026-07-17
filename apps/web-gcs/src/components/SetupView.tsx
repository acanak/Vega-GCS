import { useState } from 'react';
import type { ParamEntry, VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
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

type Section = 'params' | 'firmware' | 'accel' | 'compass' | 'radio' | 'rc' | 'servo' | 'plane' | 'battery' | 'tune' | 'tecs' | 'modes' | 'failsafe' | 'serial' | 'osd';
const SECTIONS: Array<[Section, string]> = [
  ['params', 'Parametreler'], ['firmware', 'Firmware'], ['accel', 'İvmeölçer'], ['compass', 'Pusula'],
  ['radio', 'Radyo'], ['rc', 'RC / Alıcı'], ['servo', 'Servo Çıkış'], ['plane', 'Uçak (VTail/Elevon)'],
  ['battery', 'Pil / Güç'], ['tune', 'PID Ayar'], ['tecs', 'TECS (Uçak)'], ['modes', 'Uçuş Modları'], ['failsafe', 'Failsafe'], ['serial', 'Seri Portlar'], ['osd', 'OSD'],
];

interface Props {
  gcs: UseGcs;
  params: ParamEntry[];
  setParams: (p: ParamEntry[]) => void;
  telemetry: VehicleTelemetry | null;
}

export function SetupView({ gcs, params, setParams, telemetry }: Props) {
  const t = useT();
  const [section, setSection] = useState<Section>('params');
  return (
    <main className="setup">
      <nav className="setup-nav">
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{t(label)}</button>
        ))}
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
      </div>
    </main>
  );
}
