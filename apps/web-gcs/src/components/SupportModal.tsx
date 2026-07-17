import { useT } from '../gcs/i18n';
import { DONATE_URL } from './AboutModal';

export const PATREON_URL = 'https://www.patreon.com/cw/aCanak';

interface Tier { price: string; name: string; perk: string }
// name/perk = TR anahtarları (i18n); price yerelleştirilmez.
const TIERS: Tier[] = [
  { price: '$3', name: 'Yer Ekibi', perk: 'Ad + Discord rozeti + geliştirme günlüğü' },
  { price: '$8', name: 'Pilot', perk: 'Yol haritası oyu + erken sürüm build\'i' },
  { price: '$20', name: 'Kaptan', perk: 'Öncelikli destek + About kredilerinde ad' },
  { price: '$50', name: 'Uçuş Direktörü', perk: 'README/About\'ta logo + aylık soru-cevap' },
  { price: '$150+', name: 'Görev Ortağı', perk: 'Öne çıkan logo + 1:1 görüşme + öncelikli talepler' },
];

/** Destek/bağış ekranı: Patreon + GitHub Sponsors + aylık tier'lar (TR/EN/DE). */
export function SupportModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box support-box" onClick={(e) => e.stopPropagation()}>
        <div className="about-hd">
          <span className="about-mark support-heart">♥</span>
          <div>
            <div className="about-title">{t('Projeyi destekle')}</div>
            <div className="about-ver">Vega GCS · AGPL-3.0</div>
          </div>
        </div>
        <p className="about-desc">{t('Vega GCS açık kaynaktır ve ücretsizdir. Destekleriniz geliştirmeyi sürdürmemizi sağlar.')}</p>

        <div className="support-plat">
          <a className="btn-primary about-btn" href={PATREON_URL} target="_blank" rel="noreferrer">Patreon</a>
          <a className="btn-ghost about-btn" href={DONATE_URL} target="_blank" rel="noreferrer">GitHub Sponsors</a>
        </div>

        <div className="about-sec-hd">{t('Aylık destek seviyeleri')}</div>
        <ul className="tier-list">
          {TIERS.map((ti) => (
            <li key={ti.name} className="tier">
              <span className="tier-price">{ti.price}</span>
              <span className="tier-body">
                <span className="tier-name">{t(ti.name)}</span>
                <span className="tier-perk">{t(ti.perk)}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="modal-ft"><button className="btn-ghost" onClick={onClose}>{t('Kapat')}</button></div>
      </div>
    </div>
  );
}
