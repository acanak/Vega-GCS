// Firmware flash icin WebSerial bayt-kanali (MAVLink baglantisindan ayri).
import type { SerialIO } from '@wmp/flasher';

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface SerialLike { requestPort(): Promise<SerialPortLike>; }

export async function openSerialIO(baudRate = 115200): Promise<{ io: SerialIO; close: () => Promise<void> }> {
  const serial = (navigator as unknown as { serial?: SerialLike }).serial;
  if (!serial) throw new Error('Web Serial desteklenmiyor (Chromium + HTTPS gerekir)');
  const port = await serial.requestPort();
  await port.open({ baudRate });
  const writable = port.writable;
  const readable = port.readable;
  if (!writable || !readable) throw new Error('Seri port akışı yok');
  const writer = writable.getWriter();
  const reader = readable.getReader();
  let buf = new Uint8Array(0);
  let closed = false;
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const m = new Uint8Array(buf.length + value.length);
          m.set(buf);
          m.set(value, buf.length);
          buf = m;
        }
      }
    } catch {
      /* kapandi */
    }
  })();
  const io: SerialIO = {
    async write(d) { await writer.write(d); },
    read(n, timeoutMs) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = (): void => {
          if (buf.length >= n) { const out = buf.slice(0, n); buf = buf.slice(n); resolve(out); return; }
          if (closed) { reject(new Error('port kapandı')); return; }
          if (Date.now() - start > timeoutMs) { reject(new Error('okuma zaman aşımı')); return; }
          setTimeout(tick, 5);
        };
        tick();
      });
    },
  };
  const close = async (): Promise<void> => {
    closed = true;
    try { await reader.cancel(); } catch { /* */ }
    try { writer.releaseLock(); } catch { /* */ }
    try { await port.close(); } catch { /* */ }
  };
  return { io, close };
}
