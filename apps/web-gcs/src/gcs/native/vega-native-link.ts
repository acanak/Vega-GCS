// ---------------------------------------------------------------------------
// VegaNativeLink Capacitor plugin'ine tipli köprü (mobil: iOS/Android).
// @capacitor/core'a bağımlılık YOK — plugin'e window.Capacitor globalinden
// erişilir; native platform değilsek her şey kapalı kalır (web build etkilenmez).
// Plugin kaynakları: apps/mobile/plugins/vega-native-link
// ---------------------------------------------------------------------------
import type { StreamDriver, DatagramDriver } from '@wmp/link';

// --- Plugin API tipleri (native tarafla sözleşme — değişirse iki taraf birlikte) ---
interface PluginListenerHandle { remove: () => Promise<void> }
interface UsbDeviceInfo { deviceId: number; name: string; vid: number; pid: number; driver: string }
interface BleDeviceInfo { deviceId: string; name: string; rssi: number }
interface VegaNativeLinkPlugin {
  udpBind(o: { localPort: number }): Promise<{ id: string }>;
  udpSend(o: { id: string; host: string; port: number; data: string }): Promise<void>;
  tcpConnect(o: { host: string; port: number }): Promise<{ id: string }>;
  tcpSend(o: { id: string; data: string }): Promise<void>;
  usbList(): Promise<{ devices: UsbDeviceInfo[] }>;
  usbOpen(o: { deviceId: number; baud: number }): Promise<{ id: string }>;
  usbSend(o: { id: string; data: string }): Promise<void>;
  bleScan(o: { timeoutMs: number }): Promise<{ devices: BleDeviceInfo[] }>;
  bleConnect(o: { deviceId: string }): Promise<{ id: string }>;
  bleSend(o: { id: string; data: string }): Promise<void>;
  close(o: { id: string }): Promise<void>;
  addListener(event: 'data', cb: (e: { id: string; data: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'datagram', cb: (e: { id: string; data: string; host: string; port: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'closed', cb: (e: { id: string; error?: string }) => void): Promise<PluginListenerHandle>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}
const cap = (): CapacitorGlobal | undefined => (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;

/** Native (Capacitor) ortamında mıyız? */
export const isNative = (): boolean => cap()?.isNativePlatform?.() === true;
/** 'ios' | 'android' | 'web' */
export const nativePlatform = (): string => cap()?.getPlatform?.() ?? 'web';

function plugin(): VegaNativeLinkPlugin {
  const p = cap()?.Plugins?.['VegaNativeLink'] as VegaNativeLinkPlugin | undefined;
  if (!p) throw new Error('VegaNativeLink plugin yok — bu taşıyıcı yalnız mobil uygulamada kullanılabilir');
  return p;
}

// --- base64 ↔ bytes (Capacitor köprüsü string taşır) ---
const b64encode = (d: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64decode = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// --- Ortak yaşam döngüsü: id'ye göre olay filtreleme + dinleyici temizliği ----
type Cleanup = () => void;
class ListenerBag {
  private handles: Promise<PluginListenerHandle>[] = [];
  add(h: Promise<PluginListenerHandle>): void { this.handles.push(h); }
  async removeAll(): Promise<void> {
    for (const h of this.handles) { try { (await h).remove(); } catch { /* plugin gitti */ } }
    this.handles = [];
  }
}

/** TCP / USB seri / BLE için Capacitor StreamDriver köprüsü. */
export class CapacitorStreamDriver implements StreamDriver {
  private id: string | null = null;
  private bag = new ListenerBag();
  private dataCbs = new Set<(c: Uint8Array) => void>();
  private closeCbs = new Set<(e?: Error) => void>();
  private openFn: () => Promise<{ id: string }>;
  private sendFn: (id: string, data: string) => Promise<void>;

  private constructor(openFn: () => Promise<{ id: string }>, sendFn: (id: string, data: string) => Promise<void>) {
    this.openFn = openFn;
    this.sendFn = sendFn;
  }

  static tcp(host: string, port: number): CapacitorStreamDriver {
    return new CapacitorStreamDriver(() => plugin().tcpConnect({ host, port }), (id, data) => plugin().tcpSend({ id, data }));
  }
  static usb(deviceId: number, baud: number): CapacitorStreamDriver {
    return new CapacitorStreamDriver(() => plugin().usbOpen({ deviceId, baud }), (id, data) => plugin().usbSend({ id, data }));
  }
  static ble(deviceId: string): CapacitorStreamDriver {
    return new CapacitorStreamDriver(() => plugin().bleConnect({ deviceId }), (id, data) => plugin().bleSend({ id, data }));
  }

  async open(): Promise<void> {
    const { id } = await this.openFn();
    this.id = id;
    this.bag.add(plugin().addListener('data', (e) => { if (e.id === this.id) for (const cb of this.dataCbs) cb(b64decode(e.data)); }));
    this.bag.add(plugin().addListener('closed', (e) => {
      if (e.id !== this.id) return;
      const err = e.error ? new Error(e.error) : undefined;
      for (const cb of this.closeCbs) cb(err);
      void this.bag.removeAll();
    }));
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.id) throw new Error('sürücü açık değil');
    await this.sendFn(this.id, b64encode(data));
  }

  async close(): Promise<void> {
    if (!this.id) return;
    const id = this.id;
    this.id = null;
    try { await plugin().close({ id }); } finally { void this.bag.removeAll(); }
  }

  onData(cb: (chunk: Uint8Array) => void): Cleanup { this.dataCbs.add(cb); return () => this.dataCbs.delete(cb); }
  onClose(cb: (err?: Error) => void): Cleanup { this.closeCbs.add(cb); return () => this.closeCbs.delete(cb); }
}

/** UDP için Capacitor DatagramDriver köprüsü. */
export class CapacitorDatagramDriver implements DatagramDriver {
  private id: string | null = null;
  private bag = new ListenerBag();
  private dgramCbs = new Set<(d: Uint8Array, h: string, p: number) => void>();
  private closeCbs = new Set<(e?: Error) => void>();

  async bind(localPort: number): Promise<void> {
    const { id } = await plugin().udpBind({ localPort });
    this.id = id;
    this.bag.add(plugin().addListener('datagram', (e) => { if (e.id === this.id) for (const cb of this.dgramCbs) cb(b64decode(e.data), e.host, e.port); }));
    this.bag.add(plugin().addListener('closed', (e) => {
      if (e.id !== this.id) return;
      const err = e.error ? new Error(e.error) : undefined;
      for (const cb of this.closeCbs) cb(err);
      void this.bag.removeAll();
    }));
  }

  async send(data: Uint8Array, host: string, port: number): Promise<void> {
    if (!this.id) throw new Error('sürücü bağlı değil');
    await plugin().udpSend({ id: this.id, host, port, data: b64encode(data) });
  }

  async close(): Promise<void> {
    if (!this.id) return;
    const id = this.id;
    this.id = null;
    try { await plugin().close({ id }); } finally { void this.bag.removeAll(); }
  }

  onDatagram(cb: (data: Uint8Array, fromHost: string, fromPort: number) => void): Cleanup { this.dgramCbs.add(cb); return () => this.dgramCbs.delete(cb); }
  onClose(cb: (err?: Error) => void): Cleanup { this.closeCbs.add(cb); return () => this.closeCbs.delete(cb); }
}

/** Android USB cihaz listesi (OTG). */
export const listUsbDevices = (): Promise<UsbDeviceInfo[]> => plugin().usbList().then((r) => r.devices);
/** BLE tarama (NUS servisi yayınlayanlar). */
export const scanBleDevices = (timeoutMs = 5000): Promise<BleDeviceInfo[]> => plugin().bleScan({ timeoutMs }).then((r) => r.devices);
export type { UsbDeviceInfo, BleDeviceInfo };
