import { useEffect, useState } from 'react';
import type { ConnStatus, ConnectKind, ConnectOptions } from '../gcs/useGcs';
import { isNative, nativePlatform } from '../gcs/native/vega-native-link';
import { useT } from '../gcs/i18n';

// Bağlantı hatası toast'ı: uzun mesajlar topbar'ı bozmasın diye satır içi değil,
// topbar'ın altında sabit bir baloncukta gösterilir; 10 sn sonra ya da ✕ ile kapanır.
function ErrorToast({ error }: { error: string | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!error) { setVisible(false); return; }
    setVisible(true);
    const id = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(id);
  }, [error]);
  if (!error || !visible) return null;
  return (
    <div className="conn-toast" role="alert">
      <span className="conn-toast-msg">{error}</span>
      <button className="conn-toast-x" aria-label="close" onClick={() => setVisible(false)}>✕</button>
    </div>
  );
}

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

// Platforma göre taşıyıcı listesi: web/masaüstünde WebSerial+WebSocket;
// mobilde (Capacitor) UDP/TCP/USB-OTG/BLE + WebSocket (SITL/dev için).
// Android USB seri destekler; iOS'ta USB yolu yoktur (PLAN-MOBILE.md).
type KindDef = { kind: ConnectKind; label: string };
function availableKinds(): KindDef[] {
  if (!isNative()) {
    return [
      { kind: 'webserial', label: 'WebSerial · USB' },
      { kind: 'websocket', label: 'WebSocket · köprü' },
    ];
  }
  const kinds: KindDef[] = [{ kind: 'udp', label: 'UDP · WiFi telemetri' }, { kind: 'tcp', label: 'TCP' }];
  if (nativePlatform() === 'android') kinds.push({ kind: 'usbserial', label: 'USB · OTG' });
  kinds.push({ kind: 'ble', label: 'Bluetooth LE' });
  kinds.push({ kind: 'websocket', label: 'WebSocket · köprü' });
  return kinds;
}

// Son bağlantı ayarları hatırlanır (state sürdürme: sayfa yenilense de aynı ayarlar gelir)
const PREF_KEY = 'wmp-conn';
interface ConnPrefs { kind: ConnectKind; url: string; baud: number; host: string; port: number }
function loadPrefs(): ConnPrefs {
  const valid = new Set(availableKinds().map((k) => k.kind));
  const fallback: ConnectKind = isNative() ? 'udp' : 'webserial';
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '') as Partial<ConnPrefs>;
    return {
      kind: p.kind && valid.has(p.kind) ? p.kind : fallback,
      url: typeof p.url === 'string' ? p.url : 'ws://localhost:8080',
      baud: typeof p.baud === 'number' ? p.baud : 115200,
      host: typeof p.host === 'string' ? p.host : '127.0.0.1',
      port: typeof p.port === 'number' ? p.port : 14550,
    };
  } catch { return { kind: fallback, url: 'ws://localhost:8080', baud: 115200, host: '127.0.0.1', port: 14550 }; }
}

export function ConnectionBar({ status, error, onConnect, onDisconnect }: Props) {
  const t = useT();
  const [prefs] = useState(loadPrefs);
  const [kind, setKind] = useState<ConnectKind>(prefs.kind);
  const [url, setUrl] = useState(prefs.url);
  const [baud, setBaud] = useState(prefs.baud);
  const [host, setHost] = useState(prefs.host);
  const [port, setPort] = useState(prefs.port);
  const busy = status === 'connecting' || status === 'connected';
  const connectClick = (): void => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ kind, url, baud, host, port })); } catch { /* özel mod vb. */ }
    void onConnect(kind, { url, baud, host, port });
  };

  return (
    <div className="connbar">
      <ErrorToast error={error} />
      <span className="datalink">
        <span className={'dot ' + status} />
        {LABEL[status]}
      </span>
      <select value={kind} onChange={(e) => setKind(e.target.value as ConnectKind)} disabled={busy} aria-label={t('Link tipi')}>
        {availableKinds().map((k) => <option key={k.kind} value={k.kind}>{t(k.label)}</option>)}
      </select>
      {kind === 'websocket' && (
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} aria-label="WebSocket URL" />
      )}
      {(kind === 'webserial' || kind === 'usbserial') && (
        <select className="baud" value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={busy} aria-label="Baud">
          {BAUDS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      {kind === 'udp' && (
        <input className="baud" value={port} onChange={(e) => setPort(Number(e.target.value) || 14550)} disabled={busy} aria-label="UDP port" title={t('Dinlenecek yerel port')} />
      )}
      {kind === 'tcp' && (
        <>
          <input value={host} onChange={(e) => setHost(e.target.value)} disabled={busy} aria-label="TCP host" placeholder="127.0.0.1" />
          <input className="baud" value={port} onChange={(e) => setPort(Number(e.target.value) || 5760)} disabled={busy} aria-label="TCP port" />
        </>
      )}
      {/* BLE: giriş yok — bağlanınca NUS yayını yapan aygıt taranır */}
      {busy ? (
        <button className="btn-disarm" onClick={() => void onDisconnect()}>{t('Bağlantıyı kes')}</button>
      ) : (
        <button className="btn-primary" onClick={connectClick}>{t('Bağlan')}</button>
      )}
    </div>
  );
}
