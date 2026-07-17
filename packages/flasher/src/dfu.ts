// WebUSB STM32 DfuSe flasher. _with_bl imajını (ham .bin veya .hex) 0x08000000'a yazar.
// Not: DfuSe protokolü (ST bootloader, VID 0x0483 PID 0xDF11). Windows'ta WinUSB sürücüsü (Zadig) gerekebilir.
// Deneysel — gerçek donanımda doğrulanmalı.

// WebUSB tipleri lib.dom'da yok; ihtiyacımız olan yüzeyi minimal tanımlıyoruz.
interface UsbInTransfer { data?: DataView; status?: string }
interface UsbAlt { interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number; alternateSetting: number }
interface UsbIface { interfaceNumber: number; alternates: UsbAlt[] }
interface UsbConfig { interfaces: UsbIface[] }
export interface UsbDevice {
  productName?: string;
  configuration: UsbConfig | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(v: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  controlTransferOut(setup: object, data?: Uint8Array): Promise<{ status?: string; bytesWritten?: number }>;
  controlTransferIn(setup: object, length: number): Promise<UsbInTransfer>;
}

const REQ_DNLOAD = 1;
const REQ_GETSTATUS = 3;
const REQ_CLRSTATUS = 4;
// const REQ_ABORT = 6;
const STATE_dfuERROR = 10;
const DEFAULT_XFER = 2048;
const DEFAULT_ADDR = 0x08000000;

export interface DfuOptions {
  address?: number;
  transferSize?: number;
  onProgress?: (done: number, total: number) => void;
  onLog?: (msg: string) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function usb(): { requestDevice(opts: object): Promise<UsbDevice> } {
  const u = (navigator as unknown as { usb?: { requestDevice(opts: object): Promise<UsbDevice> } }).usb;
  if (!u) throw new Error('WebUSB bu tarayıcıda desteklenmiyor (Chromium/Edge gerekir)');
  return u;
}

/** DFU cihazı seçtir (ST DFU: VID 0x0483). */
export function requestDfuDevice(): Promise<UsbDevice> {
  return usb().requestDevice({ filters: [{ vendorId: 0x0483 }] });
}

function findDfuInterface(dev: UsbDevice): number {
  const cfg = dev.configuration;
  if (!cfg) throw new Error('USB yapılandırması yok');
  for (const i of cfg.interfaces) {
    for (const a of i.alternates) {
      if (a.interfaceClass === 0xfe && a.interfaceSubclass === 0x01) return i.interfaceNumber;
    }
  }
  throw new Error('DFU arayüzü bulunamadı (aygıt DFU modunda mı?)');
}

async function ctrlOut(dev: UsbDevice, iface: number, req: number, value: number, data: Uint8Array): Promise<void> {
  const r = await dev.controlTransferOut(
    { requestType: 'class', recipient: 'interface', request: req, value, index: iface },
    data.byteLength ? data : undefined,
  );
  if (r.status && r.status !== 'ok') throw new Error('USB kontrol yazma hatası: ' + r.status);
}

interface DfuStatus { status: number; poll: number; state: number }
async function getStatus(dev: UsbDevice, iface: number): Promise<DfuStatus> {
  const r = await dev.controlTransferIn(
    { requestType: 'class', recipient: 'interface', request: REQ_GETSTATUS, value: 0, index: iface }, 6,
  );
  const d = r.data!;
  return { status: d.getUint8(0), poll: d.getUint8(1) | (d.getUint8(2) << 8) | (d.getUint8(3) << 16), state: d.getUint8(4) };
}

// DNLOAD wValue=0 ile DfuSe komutu gönder ve tamamlanmasını bekle.
async function dfuseCmd(dev: UsbDevice, iface: number, bytes: Uint8Array): Promise<void> {
  await ctrlOut(dev, iface, REQ_DNLOAD, 0, bytes);
  let s = await getStatus(dev, iface); // komutu tetikler (dfuDNBUSY)
  if (s.poll) await sleep(s.poll);
  s = await getStatus(dev, iface);
  if (s.state === STATE_dfuERROR) throw new Error('DfuSe komut hatası (status ' + s.status + ')');
}

function addrCmd(op: number, addr: number): Uint8Array {
  return Uint8Array.of(op, addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, (addr >>> 24) & 0xff);
}

/** DfuSe ile imajı yaz: mass erase -> set address -> blok blok DNLOAD -> manifest. */
export async function flashDfu(dev: UsbDevice, image: Uint8Array, opts: DfuOptions = {}): Promise<void> {
  const base = opts.address ?? DEFAULT_ADDR;
  const xfer = opts.transferSize ?? DEFAULT_XFER;
  const log = opts.onLog;
  await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  const iface = findDfuInterface(dev);
  await dev.claimInterface(iface);
  log?.('DFU arayüzü ' + iface + ' açıldı');
  try {
    // Hata durumunu temizle
    let s = await getStatus(dev, iface);
    if (s.state === STATE_dfuERROR) { await ctrlOut(dev, iface, REQ_CLRSTATUS, 0, new Uint8Array()); }

    log?.('Mass erase…');
    await dfuseCmd(dev, iface, Uint8Array.of(0x41)); // tam silme (adres yok)

    log?.('Adres 0x' + base.toString(16) + ' ayarlanıyor');
    await dfuseCmd(dev, iface, addrCmd(0x21, base)); // set address pointer

    const total = image.length;
    let off = 0;
    let block = 2; // DfuSe veri blokları wBlockNum=2'den başlar; adres otomatik artar
    log?.('Yazılıyor… (' + Math.round(total / 1024) + ' KB)');
    while (off < total) {
      const chunk = image.subarray(off, Math.min(off + xfer, total));
      await ctrlOut(dev, iface, REQ_DNLOAD, block, chunk);
      s = await getStatus(dev, iface); // yazımı tetikler/bekler
      if (s.poll) await sleep(s.poll);
      if (s.state === STATE_dfuERROR) throw new Error('DFU yazma hatası @0x' + (base + off).toString(16));
      off += chunk.length;
      block++;
      opts.onProgress?.(off, total);
    }

    log?.('Manifest / yeniden başlatma');
    // Sıfır uzunluklu DNLOAD -> manifestation (cihaz uygulamaya geçer)
    await ctrlOut(dev, iface, REQ_DNLOAD, 0, new Uint8Array());
    try { await getStatus(dev, iface); } catch { /* cihaz reset atınca kopabilir — normal */ }
    log?.('Tamamlandı ✓');
  } finally {
    try { await dev.releaseInterface(iface); } catch { /* yok say */ }
    try { await dev.close(); } catch { /* yok say */ }
  }
}
