import { useCallback, useEffect, useRef, useState } from 'react';
import { WebSerialLink, WebSocketLink, UdpLink, StreamDriverLink } from '@wmp/link';
import type { Link } from '@wmp/link';
import { CapacitorDatagramDriver, CapacitorStreamDriver, listUsbDevices, scanBleDevices } from './native/vega-native-link';
import { WorkerConnection } from './WorkerConnection';
import type { GcsConnection } from './protocol-shared';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ConnectKind = 'webserial' | 'websocket' | 'udp' | 'tcp' | 'usbserial' | 'ble';
export interface StatusTextEntry { id: number; severity: number; text: string; }
export interface ConnectOptions { url?: string; baud?: number; host?: string; port?: number; }

// Otomatik yeniden bağlanma: beklenmedik kopuşta üstel geri çekilme ile dener.
const MAX_RETRIES = 8;
const retryDelay = (n: number): number => Math.min(30_000, 1000 * 2 ** (n - 1)); // 1s..30s

// Yeniden bağlanırken WebSerial için daha önce izin verilmiş portu (jest gerekmeden) al.
interface SerialPortLike { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null }
async function grantedPort(): Promise<SerialPortLike | undefined> {
  const serial = (navigator as unknown as { serial?: { getPorts(): Promise<SerialPortLike[]> } }).serial;
  try { return (await serial?.getPorts())?.[0]; } catch { return undefined; }
}

export interface UseGcs {
  status: ConnStatus;
  error: string | null;
  connRef: { current: GcsConnection | null };
  statusTexts: StatusTextEntry[];
  connect: (kind: ConnectKind, opts: ConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useGcs(): UseGcs {
  const connRef = useRef<GcsConnection | null>(null);
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [statusTexts, setStatusTexts] = useState<StatusTextEntry[]>([]);
  const idRef = useRef(0);
  // Yeniden bağlanma durumu: son başarılı bağlantı ayarları + deneme sayacı.
  const lastRef = useRef<{ kind: ConnectKind; opts: ConnectOptions } | null>(null);
  const manualCloseRef = useRef(false);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pushStatus = useCallback((severity: number, text: string): void => {
    setStatusTexts((prev) => [...prev, { id: idRef.current++, severity, text }].slice(-100));
  }, []);

  const doConnect = useCallback(async (kind: ConnectKind, opts: ConnectOptions, isRetry: boolean): Promise<void> => {
    setError(null);
    setStatus('connecting');
    // Eski worker/oturum varsa kapat (yeniden bağlanmada tlog oturumu da düzgün biter)
    await connRef.current?.close().catch(() => {});
    connRef.current = null;
    let link: Link;
    let logLabel: string;
    switch (kind) {
      case 'webserial': {
        // Yeniden denemede kullanıcı jesti yok — daha önce izin verilen portu kullan.
        const port = isRetry ? await grantedPort() : undefined;
        if (isRetry && !port) throw new Error('izinli seri port yok');
        link = new WebSerialLink({ baudRate: opts.baud ?? 115200, port });
        logLabel = 'USB · ' + (opts.baud ?? 115200);
        break;
      }
      case 'udp': {
        // WiFi telemetri köprüsü (ESP32/DroneBridge/Herelink): yerel portu dinle, eşi öğren.
        link = new UdpLink({ driver: new CapacitorDatagramDriver(), localPort: opts.port ?? 14550 });
        logLabel = 'UDP :' + (opts.port ?? 14550);
        break;
      }
      case 'tcp': {
        const host = opts.host ?? '127.0.0.1';
        const port = opts.port ?? 5760;
        link = new StreamDriverLink('tcp', CapacitorStreamDriver.tcp(host, port));
        logLabel = 'TCP ' + host + ':' + port;
        break;
      }
      case 'usbserial': {
        // Android OTG: takılı ilk USB seri cihaz (izin diyaloğunu native taraf açar).
        const devices = await listUsbDevices();
        const dev = devices[0];
        if (!dev) throw new Error('USB seri cihaz bulunamadı — OTG kablosunu ve aygıtı kontrol edin');
        link = new StreamDriverLink('usbserial', CapacitorStreamDriver.usb(dev.deviceId, opts.baud ?? 115200));
        logLabel = 'USB-OTG ' + dev.name + ' · ' + (opts.baud ?? 115200);
        break;
      }
      case 'ble': {
        const found = await scanBleDevices(5000);
        const dev = found[0];
        if (!dev) throw new Error('BLE telemetri cihazı bulunamadı (NUS servisi yayınlayan aygıt yok)');
        link = new StreamDriverLink('ble', CapacitorStreamDriver.ble(dev.deviceId));
        logLabel = 'BLE ' + (dev.name || dev.deviceId);
        break;
      }
      default:
        link = new WebSocketLink(opts.url ?? 'ws://localhost:8080');
        logLabel = opts.url ?? 'ws';
    }
    const conn = new WorkerConnection({ link, logLabel });
    conn.onConnected(() => { retryRef.current = 0; setStatus('connected'); });
    conn.onStatusText((severity, text) => pushStatus(severity, text));
    link.onClose(() => {
      setStatus('disconnected');
      scheduleReconnect();
    });
    await conn.open();
    connRef.current = conn;
  }, [pushStatus]); // eslint-disable-line react-hooks/exhaustive-deps -- scheduleReconnect aşağıda tanımlı (karşılıklı özyineleme)

  const scheduleReconnect = useCallback((): void => {
    if (manualCloseRef.current || !lastRef.current) return;
    if (retryTimerRef.current) return; // zaten planlı
    retryRef.current++;
    if (retryRef.current > MAX_RETRIES) {
      setError('Bağlantı koptu — yeniden bağlanma denemeleri tükendi.');
      setStatus('error');
      retryRef.current = 0;
      return;
    }
    const delay = retryDelay(retryRef.current);
    pushStatus(4, `Bağlantı koptu — ${Math.round(delay / 1000)}s içinde yeniden denenecek (${retryRef.current}/${MAX_RETRIES})`);
    setStatus('connecting');
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = undefined;
      const last = lastRef.current;
      if (!last || manualCloseRef.current) return;
      void doConnect(last.kind, last.opts, true).catch(() => scheduleReconnect());
    }, delay);
  }, [doConnect, pushStatus]);

  const connect = useCallback(async (kind: ConnectKind, opts: ConnectOptions): Promise<void> => {
    manualCloseRef.current = false;
    retryRef.current = 0;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = undefined; }
    try {
      await doConnect(kind, opts, false);
      lastRef.current = { kind, opts }; // yalnızca ilk bağlantı başarılıysa hatırla
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Kullanıcı port seçmeden kapattı / seçilebilir port yok -> arıza değil, nazik uyarı
      const cancelled = (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'AbortError'))
        || /No port selected|No device selected|cancel/i.test(msg);
      if (cancelled) {
        setError('Port seçilmedi. Otopilotu USB ile bağlayıp tekrar Connect deneyin (masaüstü uygulamasında port listesi açılır).');
        setStatus('disconnected');
      } else {
        setError(msg);
        setStatus('error');
      }
    }
  }, [doConnect]);

  const disconnect = useCallback(async (): Promise<void> => {
    manualCloseRef.current = true;
    lastRef.current = null;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = undefined; }
    await connRef.current?.close();
    connRef.current = null;
    setStatus('disconnected');
  }, []);

  // Unmount'ta bekleyen zamanlayıcıyı temizle
  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  return { status, error, connRef, statusTexts, connect, disconnect };
}
