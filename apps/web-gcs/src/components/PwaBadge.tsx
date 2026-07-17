import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../gcs/i18n';

export function PwaBadge() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // "Çevrimdışı kullanıma hazır" bildirimi gösterilmez; yalnızca güncelleme uyarısı.
  if (!needRefresh) return null;
  return (
    <div className="pwa-badge">
      <span>{t('Yeni sürüm var')}</span>
      <button className="btn-primary" onClick={() => void updateServiceWorker(true)}>{t('Yenile')}</button>
      <button className="pwa-x" onClick={() => setNeedRefresh(false)} aria-label={t('Kapat')}>×</button>
    </div>
  );
}