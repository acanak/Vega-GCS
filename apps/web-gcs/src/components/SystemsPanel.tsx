import type { VehicleTelemetry } from '@wmp/protocol';
import { modeName } from '@wmp/protocol';
import type { StatusTextEntry } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const GPS_FIX = ['Yok', 'Fix yok', '2D', '3D', 'DGPS', 'RTK Float', 'RTK Fixed'];
const SEV = ['EMR', 'ALR', 'CRT', 'ERR', 'WRN', 'NOT', 'INF', 'DBG'];
const sevClass = (s: number): string => (s <= 3 ? 'hi' : s <= 5 ? 'mid' : '');

function Tile({ label, value, sub, tone, wide }: { label: string; value: string; sub?: string; tone?: string; wide?: boolean }) {
  return (
    <div className={'tile' + (wide ? ' wide' : '')}>
      <div className="t-label">{label}</div>
      <div className={'t-value' + (tone ? ' ' + tone : '')}>{value}</div>
      {sub ? <div className="t-sub">{sub}</div> : null}
    </div>
  );
}

export function SystemsPanel({ telemetry, onCollapse, statusTexts }: { telemetry: VehicleTelemetry | null; onCollapse?: () => void; statusTexts?: StatusTextEntry[] }) {
  const tr = useT();
  const t = telemetry;
  const msgs = statusTexts ? statusTexts.slice(-60).reverse() : null;
  const num = (x: number | undefined, d = 1): string => (x !== undefined && Number.isFinite(x) ? x.toFixed(d) : '—');
  const battTone = !t ? '' : t.battery.remaining < 0 ? '' : t.battery.remaining < 20 ? 'warn' : t.battery.remaining < 40 ? 'caution' : 'go';
  const gpsTone = !t ? '' : t.gps.fixType >= 3 ? 'go' : t.gps.fixType === 2 ? 'caution' : 'warn';

  return (
    <div className="card">
      <div className="card-hd">
        <h2>{tr('Sistemler')}</h2>
        <div className="hd-right">
          <span className="hd-note">{t?.connected ? t.sysid + ':' + t.compid : tr('bağlı değil')}</span>
          {onCollapse && <button className="hd-btn" onClick={onCollapse} title={tr('Gizle')} aria-label={tr('Gizle')}>›</button>}
        </div>
      </div>
      <div className={'card-body' + (msgs ? ' sys-body' : '')}>
        <div className="tiles">
          <Tile label={tr('Batarya')} value={t ? num(t.battery.voltage, 2) + 'V' : '—'} sub={t && t.battery.remaining >= 0 ? t.battery.remaining + '%' : ''} tone={battTone} />
          <Tile label="GPS" value={t ? tr(GPS_FIX[t.gps.fixType] ?? '?') : '—'} sub={t ? t.gps.satellites + ' ' + tr('uydu') : ''} tone={gpsTone} />
          <Tile label={tr('Yer hızı')} value={t ? num(t.vfr.groundspeed) : '—'} sub="m/s" tone="data" />
          <Tile label={tr('İrtifa')} value={t ? num(t.position.relativeAlt) : '—'} sub="m · rel" tone="data" />
          <Tile label={tr('Mod')} value={t ? modeName(t.vehicleType, t.customMode) : '—'} sub={t ? (t.armed ? 'ARMED' : 'disarmed') : ''} tone={t && t.armed ? 'go' : ''} wide />
          <Tile label={tr('Paket')} value={t ? String(t.packetsReceived) : '—'} sub={tr('alındı')} wide />
        </div>
        {msgs && (
          <div className="sys-msgs">
            <div className="sys-msgs-hd">{tr('Mesajlar')}</div>
            <div className="sys-msgs-list">
              {msgs.length === 0 && <div className="empty">{tr('mesaj yok')}</div>}
              {msgs.map((e) => (
                <div key={e.id} className={'cas-line ' + sevClass(e.severity)}>
                  <span className="sev">{SEV[e.severity] ?? e.severity}</span>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
