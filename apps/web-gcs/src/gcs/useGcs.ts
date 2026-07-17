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
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    await connRef.current?.close();
    connRef.current = null;
    setStatus('disconnected');
  }, []);

  return { status, error, connRef, statusTexts, connect, disconnect };
}
