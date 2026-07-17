import { useCallback, useRef, useState } from 'react';
import { WebSerialLink, WebSocketLink } from '@wmp/link';
import { WorkerConnection } from './WorkerConnection';
import type { GcsConnection } from './protocol-shared';

export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ConnectKind = 'webserial' | 'websocket';
export interface StatusTextEntry { id: number; severity: number; text: string; }
export interface ConnectOptions { url?: string; baud?: number; }

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

  const connect = useCallback(async (kind: ConnectKind, opts: ConnectOptions): Promise<void> => {
    setError(null);
    setStatus('connecting');
    try {
      const link =
        kind === 'webserial'
          ? new WebSerialLink({ baudRate: opts.baud ?? 57600 })
          : new WebSocketLink(opts.url ?? 'ws://localhost:8080');
      const conn = new WorkerConnection({ link });
      conn.onConnected(() => setStatus('connected'));
      conn.onStatusText((severity, text) => {
        setStatusTexts((prev) => [...prev, { id: idRef.current++, severity, text }].slice(-100));
      });
      link.onClose(() => setStatus('disconnected'));
      await conn.open();
      connRef.current = conn;
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
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    await connRef.current?.close();
    connRef.current = null;
    setStatus('disconnected');
  }, []);

  return { status, error, connRef, statusTexts, connect, disconnect };
}
