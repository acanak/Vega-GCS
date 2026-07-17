import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../gcs/i18n';

export function PwaBadge() {
  const t = useT();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;
  return (
    <div className="pwa-badge">
      {needRefresh ? (
        <>
          <span>{t('Yeni sürüm var')}</span>
          <button className="btn-primary" onClick={() => void updateServiceWorker(true)}>{t('Yenile')}</button>
        </>
      ) : (
        <span>{t('Çevrimdışı kullanıma hazır ✓')}</span>
      )}
      <button className="pwa-x" onClick={() => { setOfflineReady(false); setNeedRefresh(false); }} aria-label={t('Kapat')}>×</button>
    </div>
  );
}