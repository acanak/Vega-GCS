import { useCallback, useEffect, useState } from 'react';
import { listSessions, readSessionTlog, deleteSession } from '../gcs/flightlog';
import type { LogSession } from '../gcs/flightlog';
import { useT } from '../gcs/i18n';

// Kaydedilmiş telemetri (tlog) oturumları: her bağlantı otomatik kaydedilir
// (IndexedDB ring buffer). Buradan indirilebilir, oynatılabilir, silinebilir.

const fmtSize = (b: number): string => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';
const fmtDur = (s: LogSession): string => {
  const sec = Math.max(0, Math.round((s.end - s.start) / 1000));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};
const fmtWhen = (id: number): string => {
  const d = new Date(id);
  const p = (n: number): string => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

export function TlogSessionList({ onReplay }: { onReplay?: (f: File) => void }) {
  const t = useT();
  const [sessions, setSessions] = useState<LogSession[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const refresh = useCallback((): void => {
    listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toFile = async (s: LogSession): Promise<File> => {
    const bytes = await readSessionTlog(s.id);
    return new File([bytes as BlobPart], fmtWhen(s.id).replace(/[: ]/g, '-') + '.tlog', { type: 'application/octet-stream' });
  };
  const download = async (s: LogSession): Promise<void> => {
    setBusy(s.id);
    try {
      const f = await toFile(s);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally { setBusy(null); }
  };
  const replay = async (s: LogSession): Promise<void> => {
    if (!onReplay) return;
    setBusy(s.id);
    try { onReplay(await toFile(s)); } finally { setBusy(null); }
  };
  const remove = async (s: LogSession): Promise<void> => {
    setBusy(s.id);
    try { await deleteSession(s.id); refresh(); } finally { setBusy(null); }
  };

  if (!sessions || sessions.length === 0) return null; // kayıt yoksa bölüm hiç görünmez

  return (
    <div className="log-vehicle">
      <div className="log-vehicle-hd">{t('Telemetri kayıtları')} · tlog</div>
      <div className="vlog-list">
        {sessions.map((s) => (
          <div key={s.id} className="vlog-row" title={s.label + ' · ' + s.frames + ' frame'}>
            <span className="vlog-name">{fmtWhen(s.id)} <span className="tree-count">{fmtDur(s)}</span></span>
            <span className="vlog-size">{fmtSize(s.bytes)}</span>
            {onReplay && <button className="vlog-dl" disabled={busy !== null} title={t('Oynat')} onClick={() => void replay(s)}>▶</button>}
            <button className="vlog-dl" disabled={busy !== null} title={t('İndir')} onClick={() => void download(s)}>↓</button>
            <button className="vlog-dl" disabled={busy !== null} title={t('Sil')} onClick={() => void remove(s)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
