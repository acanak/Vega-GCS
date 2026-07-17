import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

export function RadioCalView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const [chans, setChans] = useState<number[]>([]);
  const [capturing, setCapturing] = useState(false);
  const capRef = useRef(false);
  const mm = useRef<{ min: number[]; max: number[] }>({ min: [], max: [] });
  const [status, setStatus] = useState<string | null>(null);
  const connected = gcs.status === 'connected';

  useEffect(() => { capRef.current = capturing; }, [capturing]);

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    return conn.subscribeMessage(MSG.RC_CHANNELS, (f) => {
      const n = Math.min(Number(f.chancount) || 8, 16);
      const arr: number[] = [];
      for (let i = 1; i <= n; i++) arr.push(Number(f['chan' + i + '_raw']) || 0);
      setChans(arr);
      if (capRef.current) {
        arr.forEach((v, i) => {
          if (v > 800 && v < 2200) {
            mm.current.min[i] = Math.min(mm.current.min[i] ?? v, v);
            mm.current.max[i] = Math.max(mm.current.max[i] ?? v, v);
          }
        });
      }
    });
  }, [gcs.status, gcs.connRef]);

  const start = (): void => { mm.current = { min: [], max: [] }; setCapturing(true); setStatus(t('Tüm çubukları uçlara kadar hareket ettirin…')); };
  const finish = (): void => {
    setCapturing(false);
    const conn = gcs.connRef.current;
    if (!conn) return;
    let written = 0;
    chans.forEach((cur, i) => {
      const mn = mm.current.min[i];
      const mx = mm.current.max[i];
      if (mn === undefined || mx === undefined || mx - mn < 50) return;
      const ch = i + 1;
      conn.setParam('RC' + ch + '_MIN', Math.round(mn), 9);
      conn.setParam('RC' + ch + '_MAX', Math.round(mx), 9);
      conn.setParam('RC' + ch + '_TRIM', Math.round(cur), 9);
      written++;
    });
    setStatus(written + t(' kanal yazıldı ✓'));
  };

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Radyo (RC) kalibrasyonu')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t("Kalibrasyona başlayın, sonra tüm kanalları (stickler + anahtarlar) uçlara kadar hareket ettirin. Bitir'e bastığınızda min/max/trim araca yazılır.")}</p>
          <div className="setup-actions">
            {capturing
              ? <button className="btn-arm" disabled={!connected} onClick={finish}>{t('Bitir & yaz')}</button>
              : <button className="btn-primary" disabled={!connected} onClick={start}>{t('Kalibrasyona başla')}</button>}
          </div>
          {status && <div className="setup-result">{status}</div>}
          <div className="rc-bars">
            {chans.length === 0 && <div className="empty">{t('RC verisi yok')}</div>}
            {chans.map((v, i) => {
              const mn = mm.current.min[i];
              const mx = mm.current.max[i];
              const pct = Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100));
              return (
                <div key={i} className="rc-row">
                  <span className="rc-ch">CH{i + 1}</span>
                  <div className="rc-track">
                    {mn !== undefined && <div className="rc-cap" style={{ left: ((mn - 1000) / 1000) * 100 + '%', width: ((mx! - mn) / 1000) * 100 + '%' }} />}
                    <div className="rc-fill" style={{ width: pct + '%' }} />
                  </div>
                  <span className="rc-val">{v || '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}