import type { Link, LinkKind } from './link';
import { Listeners } from './link';
import type { StreamDriver, DatagramDriver } from './driver';

// ---------------------------------------------------------------------------
// Sürücü tabanlı linkler: TCP / USB seri / BLE tek sınıfta (StreamDriverLink),
// UDP eş-öğrenme mantığıyla ayrı (UdpLink). Native plugin'ler yalnız sürücü
// arayüzünü uygular; buradaki mantık platformdan bağımsız ve test edilebilir.
// ---------------------------------------------------------------------------

/** Bağlantı-yönelimli sürücüyü Link'e çevirir (TCP, USB seri, BLE). */
export class StreamDriverLink implements Link {
  readonly kind: LinkKind;
  private driver: StreamDriver;
  private open_ = false;
  private closed = false; // onClose yalnız bir kez yayılsın
  private dataListeners = new Listeners<(chunk: Uint8Array) => void>();
  private closeListeners = new Listeners<(err?: Error) => void>();

  constructor(kind: LinkKind, driver: StreamDriver) {
    this.kind = kind;
    this.driver = driver;
    this.driver.onData((chunk) => { if (this.open_) this.dataListeners.emit(chunk); });
    this.driver.onClose((err) => this.emitClose(err));
  }

  get isOpen(): boolean { return this.open_; }

  async open(): Promise<void> {
    if (this.open_) throw new Error('link zaten açık');
    if (this.closed) throw new Error('kapanmış link yeniden açılamaz — yeni link oluşturun');
    await this.driver.open();
    this.open_ = true;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.open_) return; // kapanış yarışında sessizce düş — üst katman zaten onClose ile haberdar
    try {
      await this.driver.send(data);
    } catch (err) {
      // Gönderim hatası = taşıyıcı öldü: tek noktadan kapanış yay
      this.emitClose(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async close(): Promise<void> {
    if (!this.open_ && this.closed) return;
    this.open_ = false;
    try { await this.driver.close(); } catch { /* zaten kapalı */ }
    this.emitClose();
  }

  onData(cb: (chunk: Uint8Array) => void): () => void { return this.dataListeners.add(cb); }
  onClose(cb: (err?: Error) => void): () => void { return this.closeListeners.add(cb); }

  private emitClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.open_ = false;
    this.closeListeners.emit(err);
  }
}

export interface UdpLinkOptions {
  driver: DatagramDriver;
  /** Dinlenecek yerel port (ArduPilot GCS varsayılanı 14550). */
  localPort?: number;
  /** Sabit uzak uç; verilmezse ilk datagramın göndericisi eş kabul edilir (öğrenme modu). */
  remoteHost?: string;
  remotePort?: number;
}

/**
 * UDP link — GCS deseni: yerel portu dinle, eşi ilk gelen datagramdan öğren,
 * yanıtları oraya gönder (ESP32/DroneBridge/Herelink telemetri köprüleri böyle çalışır).
 * Eş öğrenilmeden yapılan yazımlar sessizce düşer (datagramda kuyruk anlamsız);
 * telemetri başlar başlamaz heartbeat'ler akmaya başlar.
 */
export class UdpLink implements Link {
  readonly kind: LinkKind = 'udp';
  private driver: DatagramDriver;
  private localPort: number;
  private peer: { host: string; port: number } | null;
  private peerFixed: boolean;
  private open_ = false;
  private closed = false;
  private dataListeners = new Listeners<(chunk: Uint8Array) => void>();
  private closeListeners = new Listeners<(err?: Error) => void>();

  constructor(opts: UdpLinkOptions) {
    this.driver = opts.driver;
    this.localPort = opts.localPort ?? 14550;
    this.peerFixed = !!(opts.remoteHost && opts.remotePort);
    this.peer = this.peerFixed ? { host: opts.remoteHost!, port: opts.remotePort! } : null;
    this.driver.onDatagram((data, fromHost, fromPort) => {
      if (!this.open_) return;
      // Eş öğrenme: sabit eş yoksa ilk göndericiyi kilitle (sonraki farklı kaynaklar yok sayılmaz;
      // telemetri tek kaynaklıdır ama eş NAT ardında port değiştirdiyse güncelle)
      if (!this.peerFixed) this.peer = { host: fromHost, port: fromPort };
      this.dataListeners.emit(data);
    });
    this.driver.onClose((err) => this.emitClose(err));
  }

  get isOpen(): boolean { return this.open_; }
  /** Öğrenilen/sabit eş — teşhis için. */
  get peerAddress(): { host: string; port: number } | null { return this.peer; }

  async open(): Promise<void> {
    if (this.open_) throw new Error('link zaten açık');
    if (this.closed) throw new Error('kapanmış link yeniden açılamaz — yeni link oluşturun');
    await this.driver.bind(this.localPort);
    this.open_ = true;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.open_ || !this.peer) return; // eş henüz yok → düş (datagram; kuyruk yok)
    try {
      await this.driver.send(data, this.peer.host, this.peer.port);
    } catch (err) {
      this.emitClose(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async close(): Promise<void> {
    if (!this.open_ && this.closed) return;
    this.open_ = false;
    try { await this.driver.close(); } catch { /* zaten kapalı */ }
    this.emitClose();
  }

  onData(cb: (chunk: Uint8Array) => void): () => void { return this.dataListeners.add(cb); }
  onClose(cb: (err?: Error) => void): () => void { return this.closeListeners.add(cb); }

  private emitClose(err?: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.open_ = false;
    this.closeListeners.emit(err);
  }
}
