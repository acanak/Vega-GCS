import { useState } from 'react';
import type { ConnStatus, ConnectKind, ConnectOptions } from '../gcs/useGcs';
import { useT } from '../gcs/i18n';

interface Props {
  status: ConnStatus;
  error: string | null;
  onConnect: (kind: ConnectKind, opts: ConnectOptions) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

const LABEL: Record<ConnStatus, string> = {
  disconnected: 'OFFLINE',
  connecting: 'LINKING',
  connected: 'DATALINK',
  error: 'FAULT',
};

// Yaygın seri hızlar: USB doğrudan 115200/921600, telemetri radyoları 57600
const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000] as const;

export function ConnectionBar({ status, error, onConnect, onDisconnect }: Props) {
  const t = useT();
  const [kind, setKind] = useState<ConnectKind>('webserial');
  const [url, setUrl] = useState('ws://localhost:8080');
  const [baud, setBaud] = useState(115200);
  const busy = status === 'connecting' || status === 'connected';

  return (
    <div className="connbar">
      {error && <span className="err-text">{error}</span>}
      <span className="datalink">
        <span className={'dot ' + status} />
        {LABEL[status]}
      </span>
      <select value={kind} onChange={(e) => setKind(e.target.value as ConnectKind)} disabled={busy} aria-label={t('Link tipi')}>
        <option value="webserial">WebSerial · USB</option>
        <option value="websocket">{t('WebSocket · köprü')}</option>
      </select>
      {kind === 'websocket' ? (
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} aria-label="WebSocket URL" />
      ) : (
        <select className="baud" value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={busy} aria-label="Baud">
          {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      {busy ? (
        <button className="btn-disarm" onClick={() => void onDisconnect()}>{t('Bağlantıyı kes')}</button>
      ) : (
        <button className="btn-primary" onClick={() => void onConnect(kind, { url, baud })}>{t('Bağlan')}</button>
      )}
    </div>
  );
}
