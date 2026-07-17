import { useEffect, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import type { StatusTextEntry } from '../gcs/useGcs';
import { SYS_SENSORS } from '../gcs/ardupilot-sys';
import { useT } from '../gcs/i18n';

interface SysBits { present: number; enabled: number; health: number; }

export function PrearmPanel({ connRef, connected, statusTexts }: {
  connRef: { current: GcsConnection | null }; connected: boolean; statusTexts: StatusTextEntry[];
}) {
  const t = useT();
  const [sys, setSys] = useState<SysBits | null>(null);

  useEffect(() => {
    if (!connected) { setSys(null); return; }
    const conn = connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.SYS_STATUS, (f) => setSys({
      present: Number(f.onboard_control_sensors_present) >>> 0,
      enabled: Number(f.onboard_control_sensors_enabled) >>> 0,
      health: Number(f.onboard_control_sensors_health) >>> 0,
    }));
  }, [connected, connRef]);

  const present = SYS_SENSORS.filter((s) => sys && (sys.present & (1 << s.bit)) !== 0);
  const unhealthy = present.filter((s) => sys && (sys.health & (1 << s.bit)) === 0);

  const prearm = statusTexts.filter((e) => /prearm|arm:/i.test(e.text)).slice(-6).reverse();

  const ready = sys ? unhealthy.length === 0 : null;

  return (
    <div className="card prearm-panel">
      <div className="card-hd">
        <h2>{t('Prearm / Sensörler')}</h2>
        {ready !== null && <span className={'pa-state ' + (ready ? 'ok' : 'bad')}>{ready ? t('HAZIR') : unhealthy.length + ' ' + t('sorun')}</span>}
      </div>
      <div className="card-body">
        {!sys ? (
          <div className="empty">{connected ? t('SYS_STATUS bekleniyor…') : t('Bağlı değil')}</div>
        ) : (
          <div className="sensor-grid">
            {present.map((s) => {
              const healthy = (sys.health & (1 << s.bit)) !== 0;
              return <span key={s.bit} className={'sensor-chip ' + (healthy ? 'ok' : 'bad')} title={s.name}>{s.tr}</span>;
            })}
          </div>
        )}
        {prearm.length > 0 && (
          <div className="prearm-msgs">
            <div className="pa-hd">{t('Ön-arm mesajları')}</div>
            {prearm.map((e) => <div key={e.id} className="pa-line">{e.text}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}