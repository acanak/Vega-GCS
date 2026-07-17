import { useRef } from 'react';
import { useT } from '../gcs/i18n';

interface Props {
  connected: boolean;
  status: string | null;
  onLoad: (f: File) => void;
  onSave: () => void;
  onRead: () => void;
  onWrite: () => void;
  onClear: () => void;
  onSetHome: () => void;
}

export function PlannerToolbar(p: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="card">
      <div className="card-hd">
        <h2>{t('Görev')}</h2>
        {p.status && <span className="hd-note">{p.status}</span>}
      </div>
      <div className="card-body toolbar-grid">
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>{t('Dosya yükle')}</button>
        <button className="btn-ghost" onClick={p.onSave}>{t('Kaydet')}</button>
        <button className="btn-ghost" disabled={!p.connected} onClick={p.onSetHome}>{t('Home = araç')}</button>
        <button className="btn-ghost" onClick={p.onClear}>{t('Temizle')}</button>
        <button className="btn-ghost" disabled={!p.connected} onClick={p.onRead}>{t('Araçtan oku')}</button>
        <button className="btn-primary" disabled={!p.connected} onClick={p.onWrite}>{t('Araca yaz')}</button>
        <input
          ref={fileRef}
          type="file"
          accept=".waypoints,.txt,.mission"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onLoad(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
