import { useState } from 'react';
import type { ParamEntry } from '@wmp/protocol';
import type { UseGcs } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

// Ayar ekranları sabittir: araçta henüz var olmayan parametrelerin alanları soluk
// görünür. Bu not, eksik parametrelerin nasıl oluşturulacağını yerinde çözer:
// (özelliği etkinleştir →) kartı yeniden başlat → parametreleri yeniden indir.

const MAV_CMD_PREFLIGHT_REBOOT = 246; // param1 = 1 → otopilotu yeniden başlat

export function ParamRefreshNote({ gcs, setParams, text }: {
  gcs: UseGcs; setParams: (p: ParamEntry[]) => void; text: string;
}) {
  const t = useT();
  const connected = gcs.status === 'connected';
  const [rebootArm, setRebootArm] = useState(false); // yanlışlıkla yeniden başlatmaya karşı iki adım
  const [refreshing, setRefreshing] = useState(false);

  const reboot = (): void => {
    const c = gcs.connRef.current;
    if (!c || c.telemetry.armed) return;
    c.commandLong(MAV_CMD_PREFLIGHT_REBOOT, [1, 0, 0, 0, 0, 0, 0]);
    setRebootArm(false);
  };
  const refresh = (): void => {
    const c = gcs.connRef.current;
    if (!c) return;
    setRefreshing(true);
    c.downloadParams().then((p) => { if (p.length) setParams(p); }).catch(() => {}).finally(() => setRefreshing(false));
  };

  return (
    <div className="lidar-note">
      <p className="setup-desc">{text}</p>
      <div className="act-row">
        {rebootArm ? (
          <>
            <button className="btn-disarm" disabled={!connected} onClick={reboot}>{t('Emin misiniz? Yeniden başlat')}</button>
            <button className="btn-ghost" onClick={() => setRebootArm(false)}>{t('Vazgeç')}</button>
          </>
        ) : (
          <button className="btn-ghost" disabled={!connected} onClick={() => setRebootArm(true)}>⟳ {t('Kartı yeniden başlat')}</button>
        )}
        <button className="btn-primary" disabled={!connected || refreshing} onClick={refresh}>
          {refreshing ? t('İndiriliyor…') : t('Parametreleri yeniden indir')}
        </button>
      </div>
    </div>
  );
}
