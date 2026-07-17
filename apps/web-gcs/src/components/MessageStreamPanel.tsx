import type { VehicleTelemetry } from '@wmp/protocol';
import { MESSAGE_NAMES } from '@wmp/mavlink-codec';
import { useT } from '../gcs/i18n';

export function MessageStreamPanel({ telemetry }: { telemetry: VehicleTelemetry | null }) {
  const t = useT();
  const seen = telemetry?.seenMessages ?? {};
  const rows = Object.entries(seen)
    .map(([id, count]) => ({ id: Number(id), count, name: MESSAGE_NAMES[Number(id)] ?? '#' + id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);
  return (
    <div className="card stream">
      <div className="card-hd">
        <h2>{t('Mesaj akışı')}</h2>
        <span className="hd-note">{rows.length}</span>
      </div>
      <div className="card-body">
        {rows.length === 0 && <div className="empty">{t('mesaj yok')}</div>}
        {rows.map((r) => (
          <div key={r.id} className="stream-row">
            <span className="m-name">{r.name}</span>
            <span className="m-count">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
