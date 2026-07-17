import type { StatusTextEntry } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

const SEV = ['EMR', 'ALR', 'CRT', 'ERR', 'WRN', 'NOT', 'INF', 'DBG'];
function sevClass(s: number): string {
  if (s <= 3) return 'hi';
  if (s <= 5) return 'mid';
  return '';
}

export function StatusTextPanel({ entries }: { entries: StatusTextEntry[] }) {
  const t = useT();
  const recent = entries.slice(-60).reverse();
  return (
    <div className="card cas">
      <div className="card-hd">
        <h2>{t('Uyarılar')} · CAS</h2>
        <span className="hd-note">{entries.length}</span>
      </div>
      <div className="card-body">
        {recent.length === 0 && <div className="empty">{t('mesaj yok')}</div>}
        {recent.map((e) => (
          <div key={e.id} className={'cas-line ' + sevClass(e.severity)}>
            <span className="sev">{SEV[e.severity] ?? e.severity}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
