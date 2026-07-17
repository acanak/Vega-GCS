import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { GcsConnection } from '../gcs/protocol-shared';
import { useT } from '../gcs/i18n';

interface Radio { rssi: number; remrssi: number; noise: number; remnoise: number; rxerrors: number; fixed: number; txbuf: number; }

// SiK RSSI ham deger (0-255) -> yaklasik dBm
const dbm = (raw: number): number => Math.round(raw / 1.9 - 127);

export function LinkStatsPanel({ connRef, connected }: {
  connRef: { current: GcsConnection | null }; connected: boolean;
}) {
  const t = useT();
  const [radio, setRadio] = useState<Radio | null>(null);
  const [rate, setRate] = useState(0);
  const last = useRef({ count: 0, t: 0 });

  useEffect(() => {
    if (!connected) { setRadio(null); return; }
    const conn = connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RADIO_STATUS, (f) => setRadio({
      rssi: Number(f.rssi), remrssi: Number(f.remrssi), noise: Number(f.noise),
      remnoise: Number(f.remnoise), rxerrors: Number(f.rxerrors), fixed: Number(f.fixed), txbuf: Number(f.txbuf),
    }));
  }, [connected, connRef]);

  // paket/sn (connRef.telemetry.packetsReceived farkindan)
  useEffect(() => {
    if (!connected) { setRate(0); return; }
    const id = window.setInterval(() => {
      const c = connRef.current?.telemetry.packetsReceived ?? 0;
      const now = performance.now();
      const prev = last.current;
      if (prev.t) setRate(Math.max(0, Math.round(((c - prev.count) / (now - prev.t)) * 1000)));
      last.current = { count: c, t: now };
    }, 1000);
    return () => window.clearInterval(id);
  }, [connected, connRef]);

  const bar = (raw: number): number => Math.max(0, Math.min(100, (raw / 255) * 100));

  return (
    <div className="card link-panel">
      <div className="card-hd"><h2>{t('Bağlantı')}</h2><span className="hd-note">{connected ? rate + ' ' + t('paket/sn') : t('kapalı')}</span></div>
      <div className="card-body">
        {radio ? (
          <div className="link-grid">
            <div className="link-item"><span className="li-k">{t('Yerel RSSI')}</span><div className="rc-track"><div className="rc-fill" style={{ width: bar(radio.rssi) + '%' }} /></div><span className="li-v">{dbm(radio.rssi)} dBm</span></div>
            <div className="link-item"><span className="li-k">{t('Uzak RSSI')}</span><div className="rc-track"><div className="rc-fill" style={{ width: bar(radio.remrssi) + '%' }} /></div><span className="li-v">{dbm(radio.remrssi)} dBm</span></div>
            <div className="link-item"><span className="li-k">{t('Gürültü')}</span><span className="li-v">{radio.noise} / {radio.remnoise}</span></div>
            <div className="link-item"><span className="li-k">{t('RX hata')}</span><span className="li-v">{radio.rxerrors} ({t('düz.')} {radio.fixed})</span></div>
            <div className="link-item"><span className="li-k">{t('TX tampon')}</span><span className="li-v">%{radio.txbuf}</span></div>
          </div>
        ) : (
          <div className="empty">{connected ? t('SiK telemetri telsizi verisi yok (USB doğrudan)') : t('Bağlı değil')}</div>
        )}
      </div>
    </div>
  );
}
