import { useT } from '../gcs/i18n';

export const REPO_URL = 'https://github.com/acanak/Vega-GCS';
export const RELEASES_URL = REPO_URL + '/releases';
export const LICENSE_URL = REPO_URL + '/blob/main/LICENSE';
export const DONATE_URL = 'https://github.com/sponsors/acanak';
export const APP_VERSION = '1.0.0';

/** Hakkında ekranı: sürüm, masaüstü indirme, bağış, lisans (AGPL-3.0) ve copyright. */
export function AboutModal({ onClose, onOpenSupport }: { onClose: () => void; onOpenSupport: () => void }) {
  const t = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box about-box" onClick={(e) => e.stopPropagation()}>
        <div className="about-hd">
          <span className="about-mark">◈</span>
          <div>
            <div className="about-title">Vega GCS</div>
            <div className="about-ver">v{APP_VERSION}</div>
          </div>
        </div>

        <p className="about-desc">{t('ArduPilot için tarayıcı tabanlı yer kontrol istasyonu — uçak / kopter / rover.')}</p>

        <div className="about-sec">
          <div className="about-sec-hd">{t('Masaüstü uygulaması')}</div>
          <p className="about-note">{t('Windows / macOS / Linux kurulum dosyaları:')}</p>
          <a className="btn-primary about-btn" href={RELEASES_URL} target="_blank" rel="noreferrer">{t('İndir (Releases)')}</a>
        </div>

        <div className="about-sec">
          <div className="about-sec-hd">{t('Destek ol')}</div>
          <button className="btn-ghost about-btn about-donate" onClick={onOpenSupport}>♥ {t('Bağış / Sponsor')}</button>
        </div>

        <div className="about-links">
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href={LICENSE_URL} target="_blank" rel="noreferrer">{t('Lisans')}: AGPL-3.0</a>
        </div>
        <div className="about-copy">© 2026 Vega GCS · {t('AGPL-3.0 lisansı ile lisanslanmıştır.')}</div>

        <div className="modal-ft"><button className="btn-ghost" onClick={onClose}>{t('Kapat')}</button></div>
      </div>
    </div>
  );
}
