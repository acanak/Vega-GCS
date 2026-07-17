import { useT } from '../gcs/i18n';

type Mode = 'wp' | 'poly' | 'fence' | 'rally';

interface Props {
  mode: Mode;
  setMode: (m: Mode) => void;
  connected: boolean;
  fenceCount: number;
  rallyCount: number;
  onUploadFence: () => void;
  onDownloadFence: () => void;
  onClearFence: () => void;
  onUploadRally: () => void;
  onDownloadRally: () => void;
  onClearRally: () => void;
}

export function FenceRallyPanel(p: Props) {
  const t = useT();
  return (
    <div className="card">
      <div className="card-hd"><h2>Geofence & Rally</h2></div>
      <div className="card-body survey-body">
        <div className="fence-block">
          <div className="fence-row">
            <button className={'chip' + (p.mode === 'fence' ? ' active-fence' : '')} onClick={() => p.setMode('fence')}>{t('Fence çiz')}</button>
            <span className="hd-note">{p.fenceCount} {t('köşe')}</span>
          </div>
          <div className="survey-actions">
            <button className="btn-ghost" disabled={!p.connected} onClick={p.onDownloadFence}>{t('Oku')}</button>
            <button className="btn-primary" disabled={!p.connected || p.fenceCount < 3} onClick={p.onUploadFence}>{t('Yaz')}</button>
            <button className="btn-ghost" disabled={p.fenceCount === 0} onClick={p.onClearFence}>{t('Temizle')}</button>
          </div>
        </div>
        <div className="fence-block">
          <div className="fence-row">
            <button className={'chip' + (p.mode === 'rally' ? ' active-rally' : '')} onClick={() => p.setMode('rally')}>{t('Rally çiz')}</button>
            <span className="hd-note">{p.rallyCount} {t('nokta')}</span>
          </div>
          <div className="survey-actions">
            <button className="btn-ghost" disabled={!p.connected} onClick={p.onDownloadRally}>{t('Oku')}</button>
            <button className="btn-primary" disabled={!p.connected || p.rallyCount === 0} onClick={p.onUploadRally}>{t('Yaz')}</button>
            <button className="btn-ghost" disabled={p.rallyCount === 0} onClick={p.onClearRally}>{t('Temizle')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
