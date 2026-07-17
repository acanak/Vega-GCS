// Takilabilir baglanti katmani. Mission Planner'daki ICommsSerial'in web karsiligi:
// tek bir cift yonlu bayt-kanali arayuzu; ustune MAVLink protokol motoru oturur.

export type LinkKind = 'webserial' | 'websocket';

export interface Link {
  readonly kind: LinkKind;
  readonly isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  /** RX baytlari icin abone ol; aboneligi iptal eden fonksiyon doner. */
  onData(cb: (chunk: Uint8Array) => void): () => void;
  /** Baglanti kapandiginda/hata aldiginda cagrilir. */
  onClose(cb: (err?: Error) => void): () => void;
}

/** Kucuk dinleyici yardimcisi. */
export class Listeners<T extends (...args: never[]) => void> {
  private set = new Set<T>();
  add(cb: T): () => void {
    this.set.add(cb);
    return () => {
      this.set.delete(cb);
    };
  }
  emit(...args: Parameters<T>): void {
    for (const cb of this.set) cb(...args);
  }
  clear(): void {
    this.set.clear();
  }
}
