// Log parse'ini render thread'inden ayirir (buyuk .bin/.tlog dosyalari icin).
import { parseDataflash, parseTlog, isDataflash } from '@wmp/logparser';
import type { LogData } from '@wmp/logparser';

interface Ctx {
  postMessage(m: { data: LogData } | { error: string }): void;
  addEventListener(t: 'message', cb: (e: MessageEvent) => void): void;
}
const ctx = self as unknown as Ctx;

ctx.addEventListener('message', (e) => {
  const buf = e.data as Uint8Array;
  try {
    const data = isDataflash(buf) ? parseDataflash(buf) : parseTlog(buf);
    ctx.postMessage({ data });
  } catch (err) {
    ctx.postMessage({ error: String(err instanceof Error ? err.message : err) });
  }
});
