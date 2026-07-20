import { useT } from '../gcs/i18n';
import { APP_VERSION, CHANNEL, buildId } from '../gcs/version';

export { APP_VERSION };

/** Hakkında ekranı: sürüm, masaüstü indirme, bağış, lisans (AGPL-3.0) ve copyright. */
export function AboutModal({ onClose, onOpenSupport }: { onClose: () => void; onOpenSupport: () => void }) {
  const t = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box about-box" onClick={(e) => e.stopPropagation()}>
        <div className="about-hd">
          <span className="about-mark">◈</span>
          <div>
            <div className="about-title">Vega GCS {CHANNEL && <span className="beta-badge">{CHANNEL}</span>}</div>
            <div className="about-ver">v{APP_VERSION}</div>
          </div>
        </div>

        <div className="about-build" title={t('Yayınlanan yapının kimliği (sürüm · commit · zaman)')}>{buildId()}</div>

        <p className="about-desc">{t('ArduPilot için tarayıcı tabanlı yer kontrol istasyonu — uçak / kopter / rover.')}</p>

        <div className="about-sec">
          <div className="about-sec-hd">{t('Destek ol')}</div>
          <button className="btn-ghost about-btn about-donate" onClick={onOpenSupport}>♥ {t('Bağış / Sponsor')}</button>
        </div>

        <div className="about-copy">© 2026 Vega GCS · {t('AGPL-3.0 lisansı ile lisanslanmıştır.')}</div>

        <div className="modal-ft"><button className="btn-ghost" onClick={onClose}>{t('Kapat')}</button></div>
      </div>
    </div>
  );
}
