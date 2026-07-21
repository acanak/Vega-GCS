import { registerPlugin } from '@capacitor/core';

// Not: web-gcs bu modülü import ETMEZ — plugin'e window.Capacitor.Plugins
// üzerinden erişir (bkz. apps/web-gcs/src/gcs/native/vega-native-link.ts).
// Bu dosya, plugin'i Capacitor'a kaydetmek ve tip sözleşmesini belgelendirmek içindir.

export interface UsbDeviceInfo { deviceId: number; name: string; vid: number; pid: number; driver: string }
export interface BleDeviceInfo { deviceId: string; name: string; rssi: number }

export interface VegaNativeLinkPlugin {
  /** Yerel UDP portunu dinlemeye başla (GCS telemetri: varsayılan 14550). */
  udpBind(o: { localPort: number }): Promise<{ id: string }>;
  udpSend(o: { id: string; host: string; port: number; data: string }): Promise<void>;
  tcpConnect(o: { host: string; port: number }): Promise<{ id: string }>;
  tcpSend(o: { id: string; data: string }): Promise<void>;
  /** Takılı USB seri aygıtları listele (yalnız Android). */
  usbList(): Promise<{ devices: UsbDeviceInfo[] }>;
  usbOpen(o: { deviceId: number; baud: number }): Promise<{ id: string }>;
  usbSend(o: { id: string; data: string }): Promise<void>;
  /** Nordic UART Service (NUS) yayınlayan BLE aygıtları tara. */
  bleScan(o: { timeoutMs: number }): Promise<{ devices: BleDeviceInfo[] }>;
  bleConnect(o: { deviceId: string }): Promise<{ id: string }>;
  bleSend(o: { id: string; data: string }): Promise<void>;
  /** Her tür bağlantıyı kapat. */
  close(o: { id: string }): Promise<void>;
}

export const VegaNativeLink = registerPlugin<VegaNativeLinkPlugin>('VegaNativeLink');
