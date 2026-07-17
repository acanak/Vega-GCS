import { useEffect, useRef, useState } from 'react';
import { MSG } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const NCH = 16;
const active = (v: number): boolean => v >= 800 && v <= 2200;
// raw (~1000..2000) -> -1..1 (merkez 1500)
const norm = (v: number): number => (active(v) ? Math.max(-1, Math.min(1, (v - 1500) / 500)) : 0);

// Gimbal: x sağa, y yukarı (throttle/pitch için ekranda ters)
function Gimbal({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <div className="rc-gimbal-wrap">
      <div className="rc-gimbal">
        <div className="rc-knob" style={{ left: (x + 1) * 50 + '%', top: (1 - y) * 50 + '%' }} />
      </div>
      <div className="rc-gimbal-lbl">{label}</div>
    </div>
  );
}

export function RadioCalView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const [chans, setChans] = useState<number[]>(Array(NCH).fill(0));
  const [, force] = useState(0);
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
      const arr: number[] = [];
      for (let i = 1; i <= NCH; i++) arr.push(Number(f['chan' + i + '_raw']) || 0);
      setChans(arr);
      if (capRef.current) {
        let changed = false;
        arr.forEach((v, i) => {
          if (active(v)) {
            const nmin = Math.min(mm.current.min[i] ?? v, v);
            const nmax = Math.max(mm.current.max[i] ?? v, v);
            if (nmin !== mm.current.min[i] || nmax !== mm.current.max[i]) changed = true;
            mm.current.min[i] = nmin; mm.current.max[i] = nmax;
          }
        });
        if (changed) force((x) => x + 1);
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

  const roll = norm(chans[0] ?? 0);
  const pitch = norm(chans[1] ?? 0);
  const thr = norm(chans[2] ?? 0);
  const yaw = norm(chans[3] ?? 0);
  const anyData = chans.some(active);

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Radyo (RC) kalibrasyonu')}</h2><span className="hd-note">{chans.filter(active).length} / {NCH}</span></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t("Kalibrasyona başlayın, sonra tüm kanalları (stickler + anahtarlar) uçlara kadar hareket ettirin. Bitir'e bastığınızda min/max/trim araca yazılır.")}</p>
          <div className="setup-actions">
            {capturing
              ? <button className="btn-arm" disabled={!connected} onClick={finish}>{t('Bitir & yaz')}</button>
              : <button className="btn-primary" disabled={!connected} onClick={start}>{t('Kalibrasyona başla')}</button>}
          </div>
          {status && <div className="setup-result">{status}</div>}

          <div className="rc-sticks">
            <Gimbal x={yaw} y={thr} label={t('Sol: Gaz / Yaw')} />
            <Gimbal x={roll} y={pitch} label={t('Sağ: Roll / Pitch')} />
          </div>

          {!anyData && <div className="empty">{t('RC verisi yok — vericiyi/alıcıyı açın')}</div>}
          <div className="rc-bars">
            {chans.map((v, i) => {
              const mn = mm.current.min[i];
              const mx = mm.current.max[i];
              const on = active(v);
              const pct = on ? Math.max(0, Math.min(100, ((v - 1000) / 1000) * 100)) : 0;
              const roleName = ['R', 'P', 'T', 'Y'][i]; // ch1-4 rol
              return (
                <div key={i} className={'rc-row' + (on ? '' : ' rc-off')}>
                  <span className="rc-ch">{i + 1}{roleName ? <small>{roleName}</small> : null}</span>
                  <div className="rc-track">
                    {mn !== undefined && mx !== undefined && <div className="rc-cap" style={{ left: ((mn - 1000) / 1000) * 100 + '%', width: ((mx - mn) / 1000) * 100 + '%' }} />}
                    <div className="rc-fill" style={{ width: pct + '%' }} />
                    {mn !== undefined && <span className="rc-mm" style={{ left: ((mn - 1000) / 1000) * 100 + '%' }} />}
                    {mx !== undefined && <span className="rc-mm" style={{ left: ((mx - 1000) / 1000) * 100 + '%' }} />}
                  </div>
                  <span className="rc-val">{on ? v : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
