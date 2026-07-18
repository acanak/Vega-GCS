import { useEffect, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

interface RadioStat { rssi: number; remrssi: number; noise: number; remnoise: number; txbuf: number; rxerrors: number; fixed: number; at: number }
// SiK ham RSSI -> yaklaşık dBm
const dbm = (r: number): number => Math.round(r / 1.9 - 127);
const qPct = (rssi: number, noise: number): number => Math.max(0, Math.min(100, Math.round(((rssi - noise) / 2))));

export function SikRadioView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const [s, setS] = useState<RadioStat | null>(null);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RADIO_STATUS, (f) => {
      setS({ rssi: Number(f.rssi), remrssi: Number(f.remrssi), noise: Number(f.noise), remnoise: Number(f.remnoise), txbuf: Number(f.txbuf), rxerrors: Number(f.rxerrors), fixed: Number(f.fixed), at: Date.now() });
    });
  }, [gcs.status, gcs.connRef]);

  const Bar = ({ label, pct, text }: { label: string; pct: number; text: string }) => (
    <div className="sik-metric">
      <div className="sik-metric-hd"><span>{label}</span><span className="p-units">{text}</span></div>
      <div className="mag-bar"><div className="mag-fill" style={{ width: pct + '%', background: pct > 60 ? 'var(--go)' : pct > 30 ? 'var(--amber, #ffb020)' : 'var(--warn)' }} /></div>
    </div>
  );

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('SiK telemetri radyo')}</h2><span className="params-spacer" />{!connected && <span className="hd-note">{t('bağlı değil')}</span>}</div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t('SiK radyo bağlantısının canlı sinyal kalitesi. Radyo kanal/güç/hız (S kayıtları) ayarları radyonun kendi yapılandırma aracıyla yapılır; buradan telemetri linkinin sağlığı izlenir.')}</p>

          {!s ? (
            <div className="empty">{t('RADIO_STATUS verisi yok (SiK radyo bağlı mı?)')}</div>
          ) : (
            <div className="sik-grid">
              <Bar label={t('Yerel sinyal (RSSI)')} pct={qPct(s.rssi, s.noise)} text={s.rssi + ' (' + dbm(s.rssi) + ' dBm)'} />
              <Bar label={t('Uzak sinyal (RSSI)')} pct={qPct(s.remrssi, s.remnoise)} text={s.remrssi + ' (' + dbm(s.remrssi) + ' dBm)'} />
              <div className="sik-stats">
                <div><span className="cfg-name">noise</span> {s.noise} / {s.remnoise}</div>
                <div><span className="cfg-name">txbuf</span> {s.txbuf}%</div>
                <div><span className="cfg-name">rxerrors</span> {s.rxerrors}</div>
                <div><span className="cfg-name">fixed</span> {s.fixed}</div>
              </div>
            </div>
          )}

          <p className="setup-desc">{t('İpucu: telemetri portunun protokolünü MAVLink (1 veya 2), baud’u radyoyla aynı (genelde 57600) yapın. Menzil için S kayıtları (güç, air-speed, ECC) radyo aracından ayarlanır.')}</p>
        </div>
      </div>
    </div>
  );
}
