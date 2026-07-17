import type { Link, LinkKind } from './link';
import { Listeners } from './link';

/** Bir kopruye (TCP/UDP/serial <-> WS) veya WS uclu araca baglanan link. */
export class WebSocketLink implements Link {
  readonly kind: LinkKind = 'websocket';
  private ws: WebSocket | undefined;
  private url: string;
  private dataListeners = new Listeners<(chunk: Uint8Array) => void>();
  private closeListeners = new Listeners<(err?: Error) => void>();

  constructor(url: string) {
    this.url = url;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = (): void => resolve();
      ws.onerror = (): void => reject(new Error('WebSocket baglanti hatasi: ' + this.url));
      ws.onclose = (ev): void =>
        this.closeListeners.emit(ev.wasClean ? undefined : new Error('WebSocket kapandi (' + ev.code + ')'));
      ws.onmessage = (ev): void => {
        if (ev.data instanceof ArrayBuffer) this.dataListeners.emit(new Uint8Array(ev.data));
      };
    });
  }

  async close(): Promise<void> {
    this.ws?.close();
    this.ws = undefined;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket acik degil');
    this.ws.send(data);
  }

  onData(cb: (chunk: Uint8Array) => void): () => void {
    return this.dataListeners.add(cb);
  }
  onClose(cb: (err?: Error) => void): () => void {
    return this.closeListeners.add(cb);
  }
}
