import { useRef, useState } from 'react';
import { parseApj, flashApj, Px4Bootloader } from '@wmp/flasher';
import type { SerialIO } from '@wmp/flasher';
import { openSerialIO } from '../gcs/serial-io';
import { useT } from '../gcs/i18n';

export function FirmwareView() {
  const t = useT();
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ioRef = useRef<{ io: SerialIO; close: () => Promise<void> } | null>(null);
  const addLog = (m: string): void => setLog((l) => [...l, m].slice(-120));

  const connect = async (): Promise<void> => {
    setLog([]);
    setInfo(null);
    try {
      const s = await openSerialIO(115200);
      ioRef.current = s;
      addLog(t('Port açıldı, senkronize ediliyor…'));
      const bl = new Px4Bootloader(s.io);
      await bl.sync();
      const bi = await bl.getInfo();
      setInfo(t('Kart') + ' ' + bi.boardId + ' · BL rev ' + bi.blRev + ' · ' + Math.floor(bi.flashSize / 1024) + ' KB');
      setConnected(true);
      addLog(t('Bağlandı: kart') + ' ' + bi.boardId);
    } catch (e) {
      addLog(t('Hata:') + ' ' + (e instanceof Error ? e.message : String(e)));
      await disconnect();
    }
  };
  const disconnect = async (): Promise<void> => {
    await ioRef.current?.close();
    ioRef.current = null;
    setConnected(false);
  };
  const flash = async (file: File): Promise<void> => {
    const s = ioRef.current;
    if (!s) { addLog(t('Önce bootloader\'a bağlanın')); return; }
    setBusy(true);
    setProgress({ done: 0, total: 1 });
    try {
      addLog(file.name + ' ' + t('çözülüyor…'));
      const apj = await parseApj(await file.text());
      await flashApj(s.io, apj, (done, total) => setProgress({ done, total }), addLog);
      addLog(t('Tamamlandı') + ' ✓');
    } catch (e) {
      addLog(t('Flash hatası:') + ' ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <div className="setup-panel">
      <div className="card">
        <div className="card-hd"><h2>{t('Firmware kurulum')}</h2></div>
        <div className="card-body setup-body">
          <p className="setup-desc">{t('Otopilotu')} <b>{t('bootloader modunda')}</b> {t('USB ile bağlayın (yalnızca Chromium/Edge). Bağlanın, ardından bir')} <b>.apj</b> {t('firmware dosyası seçin. Bu ekran MAVLink bağlantısından ayrıdır.')}</p>
          <div className="setup-actions">
            {connected
              ? <button className="btn-disarm" disabled={busy} onClick={() => void disconnect()}>{t('Bağlantıyı kes')}</button>
              : <button className="btn-primary" onClick={() => void connect()}>{t("Bootloader'a bağlan (WebSerial)")}</button>}
            <button className="btn-ghost" disabled={!connected || busy} onClick={() => fileRef.current?.click()}>{t('Firmware seç (.apj)')}</button>
            <input ref={fileRef} type="file" accept=".apj" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void flash(f); e.target.value = ''; }} />
          </div>
          {info && <div className="setup-result ok">{info}</div>}
          {progress && <div className="fw-bar"><div className="fw-fill" style={{ width: pct + '%' }} /><span>{pct}%</span></div>}
          <div className="setup-log">
            <div className="setup-log-hd">{t('Günlük')}</div>
            {log.length === 0 && <div className="empty">—</div>}
            {log.map((m, i) => <div key={i} className="setup-log-line">{m}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
