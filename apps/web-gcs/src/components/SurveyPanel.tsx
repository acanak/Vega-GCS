import { useT } from '../gcs/i18n';

interface Props {
  mode: 'wp' | 'poly' | 'fence' | 'rally';
  setMode: (m: 'wp' | 'poly' | 'fence' | 'rally') => void;
  spacing: number;
  setSpacing: (n: number) => void;
  angle: number;
  setAngle: (n: number) => void;
  alt: number;
  setAlt: (n: number) => void;
  polygonCount: number;
  onGenerate: () => void;
  onClearPolygon: () => void;
}

export function SurveyPanel(p: Props) {
  const t = useT();
  return (
    <div className="card">
      <div className="card-hd">
        <h2>{t('Alan tarama')}</h2>
        <span className="hd-note">{p.polygonCount} {t('köşe')}</span>
      </div>
      <div className="card-body survey-body">
        <div className="mode-toggle">
          <button className={p.mode === 'wp' ? 'active' : ''} onClick={() => p.setMode('wp')}>Waypoint</button>
          <button className={p.mode === 'poly' ? 'active' : ''} onClick={() => p.setMode('poly')}>{t('Poligon çiz')}</button>
        </div>
        <div className="survey-fields">
          <label>{t('Hat aralığı')} (m)<input type="number" value={p.spacing} onChange={(e) => p.setSpacing(Number(e.target.value))} /></label>
          <label>{t('Açı')} (°)<input type="number" value={p.angle} onChange={(e) => p.setAngle(Number(e.target.value))} /></label>
          <label>{t('İrtifa')} (m)<input type="number" value={p.alt} onChange={(e) => p.setAlt(Number(e.target.value))} /></label>
        </div>
        <div className="survey-actions">
          <button className="btn-primary" disabled={p.polygonCount < 3} onClick={p.onGenerate}>{t('Survey üret')}</button>
          <button className="btn-ghost" disabled={p.polygonCount === 0} onClick={p.onClearPolygon}>{t('Poligonu temizle')}</button>
        </div>
        {p.mode === 'poly' && <div className="survey-hint">{t('Haritaya tıklayarak poligon köşeleri ekleyin (≥3), sonra “Survey üret”.')}</div>}
      </div>
    </div>
  );
}
