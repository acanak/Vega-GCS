import type { VehicleTelemetry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';
import { SystemsPanel } from './SystemsPanel';
import { PrearmPanel } from './PrearmPanel';
import { LinkStatsPanel } from './LinkStatsPanel';
import { StatusTextPanel } from './StatusTextPanel';
import { JoystickPanel } from './JoystickPanel';

// Ayrilmis durum panosu: ust bolumde kartlar, altta kalan alani otopilot mesajlari (STATUSTEXT) doldurur.
export function StatusView({ gcs, telemetry }: { gcs: UseGcs; telemetry: VehicleTelemetry | null }) {
  const t = useT();
  const connected = gcs.status === 'connected';
  return (
    <main className="status-view" aria-label={t('Durum')}>
      <div className="status-grid">
        <SystemsPanel telemetry={telemetry} />
        <PrearmPanel connRef={gcs.connRef} connected={connected} statusTexts={gcs.statusTexts} />
        <LinkStatsPanel connRef={gcs.connRef} connected={connected} />
        <JoystickPanel connRef={gcs.connRef} connected={connected} />
      </div>
      <div className="status-messages">
        <StatusTextPanel entries={gcs.statusTexts} />
      </div>
    </main>
  );
}
