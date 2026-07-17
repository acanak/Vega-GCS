import type { Link, LinkKind } from './link';
import { Listeners } from './link';

// Web Serial API'nin kullandigimiz alt kumesi (tam tipler icin @types/w3c-web-serial).
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  requestPort(options?: unknown): Promise<SerialPortLike>;
}

export interface WebSerialOptions {
  baudRate?: number;
  /** Onceden secilmis port; verilmezse requestPort() cagrilir (kullanici jesti gerekir). */
  port?: SerialPortLike;
}

/** USB otopilot / SiK telemetri radyosuna dogrudan baglanan link (Chromium, HTTPS). */
export class WebSerialLink implements Link {
  readonly kind: LinkKind = 'webserial';
  private port: SerialPortLike | undefined;
  private baudRate: number;
  private providedPort: SerialPortLike | undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private open_ = false;
  private dataListeners = new Listeners<(chunk: Uint8Array) => void>();
  private closeListeners = new Listeners<(err?: Error) => void>();

  constructor(options: WebSerialOptions = {}) {
    this.baudRate = options.baudRate ?? 57600;
    this.providedPort = options.port;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    const serial = (navigator as unknown as { serial?: SerialLike }).serial;
    let port = this.providedPort;
    if (!port) {
      if (!serial) throw new Error('Web Serial API desteklenmiyor (Chromium + HTTPS gerekir)');
      port = await serial.requestPort();
    }
    await port.open({ baudRate: this.baudRate });
    this.port = port;
    this.open_ = true;
    if (port.writable) this.writer = port.writable.getWriter();
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;
    const reader = this.port.readable.getReader();
    this.reader = reader;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.dataListeners.emit(value);
      }
    } catch (err) {
      this.closeListeners.emit(err instanceof Error ? err : new Error(String(err)));
    } finally {
      reader.releaseLock();
    }
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Seri port acik degil / yazilabilir degil');
    await this.writer.write(data);
  }

  async close(): Promise<void> {
    this.open_ = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* yoksay */
    }
    try {
      this.writer?.releaseLock();
    } catch {
      /* yoksay */
    }
    try {
      await this.port?.close();
    } catch {
      /* yoksay */
    }
    this.port = undefined;
    this.closeListeners.emit(undefined);
  }

  onData(cb: (chunk: Uint8Array) => void): () => void {
    return this.dataListeners.add(cb);
  }
  onClose(cb: (err?: Error) => void): () => void {
    return this.closeListeners.add(cb);
  }
}
