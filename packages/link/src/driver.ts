// Native taşıyıcı sürücü arayüzleri. Sürücüler "aptal"dır: yalnız bayt taşır;
// eş öğrenme / yeniden bağlanma gibi mantık Link sınıflarında yaşar. Böylece
// linkler sahte sürücülerle birim test edilir, native taraf ince kalır.
// Uygulayıcılar: Capacitor plugin köprüleri (mobil), Node soketleri (masaüstü/test).

/** Bağlantı-yönelimli bayt akışı (TCP, USB seri, BLE). */
export interface StreamDriver {
  open(): Promise<void>;
  send(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  /** RX baytları; abonelik iptal fonksiyonu döner. */
  onData(cb: (chunk: Uint8Array) => void): () => void;
  /** Akış kapandığında/hata aldığında (yalnız bir kez) çağrılır. */
  onClose(cb: (err?: Error) => void): () => void;
}

/** Datagram taşıyıcı (UDP). */
export interface DatagramDriver {
  /** Yerel portu dinlemeye başla. */
  bind(localPort: number): Promise<void>;
  send(data: Uint8Array, host: string, port: number): Promise<void>;
  close(): Promise<void>;
  onDatagram(cb: (data: Uint8Array, fromHost: string, fromPort: number) => void): () => void;
  onClose(cb: (err?: Error) => void): () => void;
}
