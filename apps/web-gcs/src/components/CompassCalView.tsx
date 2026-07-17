import { useEffect, useState } from 'react';
import { MSG, MAG_CAL_STATUS, MAV_CMD_DO_START_MAG_CAL, MAV_CMD_DO_ACCEPT_MAG_CAL, MAV_CMD_DO_CANCEL_MAG_CAL } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

interface Prog { pct: number; status: number; }
interface Report { fitness: number; status: number; autosaved: number; ofs: [number, number, number]; }

export function CompassCalView({ gcs }: { gcs: UseGcs }) {
  const t = useT();
  const [progress, setProgress] = useState<Record<number, Prog>>({});
  const [reports, setReports] = useState<Record<number, Report>>({});
  const connected = gcs.status === 'connected';

  useEffect(() => {
    if (gcs.status !== 'connected') return;
    const conn = gcs.connRef.current;
    if (!conn) return;
    const u1 = conn.subscribeMessage(MSG.MAG_CAL_PROGRESS, (f) => {
      const id = Number(f.compass_id);
      setProgress((p) => ({ ...p, [id]: { pct: Number(f.completion_pct), status: Number(f.cal_status) } }));
    });
    const u2 = conn.subscribeMessage(MSG.MAG_CAL_REPORT, (f) => {
      const id = Number(f.compass_id);
      setReports((r) => ({
        ...r,
        [id]: { fitness: Number(f.fitness), status: Number(f.cal_status), autosaved: Number(f.autosaved), ofs: [Number(f.ofs_x), Number(f.ofs_y), Number(f.ofs_z)] },
      }));
    });
    return () => { u1(); u2(); };
  }, [gcs.status, gcs.connRef]);

  const start = (): void => { setProgress({}); setReports({}); gcs.connRef.current?.commandLong(MAV_CMD_DO_START_MAG_CAL, [0, 0, 1, 0, 0, 0, 0]); };
  const accept = (): void => gcs.connRef.current?.commandLong(MAV_CMD_DO_ACCEPT_MAG_CAL, [0, 0, 0, 0, 0, 0, 0]);
  const cancel = (): void => gcs.connRef.current?.commandLong(MAV_CMD_DO_CANCEL_MAG_CAL, [0, 0, 0, 0, 0, 0, 0]);

  const ids = [...new Set([...Object.keys(progress), ...Object.keys(reports)].map(Number))].sort();

  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Pusula kalibrasyonu')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t("Başlat'a basın ve aracı tüm eksenlerde yavaşça döndürün. İlerleme %100 olunca sonuç görünür; başarılıysa Kabul edin.")}</p>
          <div className="setup-actions">
            <button className="btn-primary" disabled={!connected} onClick={start}>{t('Başlat')}</button>
            <button className="btn-arm" disabled={!connected} onClick={accept}>{t('Kabul')}</button>
            <button className="btn-disarm" disabled={!connected} onClick={cancel}>{t('İptal')}</button>
          </div>

          {ids.length === 0 && <div className="empty">{t('Kalibrasyon verisi yok')}</div>}
          {ids.map((id) => {
            const pr = progress[id];
            const rep = reports[id];
            const st = rep?.status ?? pr?.status ?? 0;
            return (
              <div key={id} className="mag-row">
                <div className="mag-hd">
                  <span>{t('Pusula')} {id}</span>
                  <span className={'mag-status s' + st}>{MAG_CAL_STATUS[st] ?? st}</span>
                </div>
                <div className="mag-bar"><div className="mag-fill" style={{ width: (pr?.pct ?? (rep ? 100 : 0)) + '%' }} /></div>
                {rep && (
                  <div className="mag-report">
                    fitness {rep.fitness.toFixed(1)} · ofs {rep.ofs.map((o) => o.toFixed(0)).join(', ')}
                    {rep.autosaved ? ' · ' + t('kaydedildi') : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
