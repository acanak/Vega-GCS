// ---------------------------------------------------------------------------
// Uçuş telemetri kaydı (tlog): gelen/giden ham MAVLink çerçeveleri IndexedDB'de
// oturum bazlı saklanır. Format Mission Planner .tlog ile uyumludur:
// her çerçeve öncesinde 8 bayt big-endian zaman damgası (epoch µs).
// Worker'da (yazma) ve main thread'de (okuma/dışa aktarma) çalışır — DOM yok.
// ---------------------------------------------------------------------------

const DB_NAME = 'wmp-flightlog';
const DB_VER = 1;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // ring limiti: toplam ~64MB (en eski oturumlar silinir)
const FLUSH_MS = 1000;      // tampon boşaltma aralığı
const FLUSH_BYTES = 64 * 1024; // ya da tampon bu boyuta ulaşınca

export interface LogSession {
  id: number;        // Date.now() — oturum kimliği ve başlangıç zamanı
  start: number;     // epoch ms
  end: number;       // epoch ms (yazım sürerken son flush zamanı)
  bytes: number;     // toplam tlog baytı
  frames: number;    // çerçeve sayısı
  label: string;     // bağlantı türü vb. ('webserial', 'ws://…')
}

interface LogChunk { key: string; sessionId: number; seq: number; data: Uint8Array }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) {
        const st = db.createObjectStore('chunks', { keyPath: 'key' });
        st.createIndex('bySession', 'sessionId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB açılamadı'));
  });
}

const tx = (db: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction => db.transaction(stores, mode);
const done = (t: IDBTransaction): Promise<void> => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const getAll = <T>(st: IDBObjectStore | IDBIndex, q?: IDBKeyRange): Promise<T[]> => new Promise((res, rej) => { const r = st.getAll(q); r.onsuccess = () => res(r.result as T[]); r.onerror = () => rej(r.error); });

/** Aktif kayıt oturumu — worker tarafı. append() ana yoldan çağrılır, I/O arka planda. */
export class FlightLogWriter {
  private db: IDBDatabase | null = null;
  private session: LogSession;
  private buf: Uint8Array[] = [];
  private bufBytes = 0;
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  private constructor(session: LogSession) { this.session = session; }

  static async start(label: string): Promise<FlightLogWriter> {
    const now = Date.now();
    const w = new FlightLogWriter({ id: now, start: now, end: now, bytes: 0, frames: 0, label });
    w.db = await openDb();
    await w.persistMeta();
    await pruneToLimit(w.db, MAX_TOTAL_BYTES, w.session.id);
    w.timer = setInterval(() => { void w.flush(); }, FLUSH_MS);
    return w;
  }

  /** Bir MAVLink çerçevesi ekle (yön farkı tlog'da tutulmaz — MP de tek akış yazar). */
  append(raw: Uint8Array): void {
    if (this.closed) return;
    const rec = new Uint8Array(8 + raw.length);
    const us = BigInt(Date.now()) * 1000n;
    new DataView(rec.buffer).setBigUint64(0, us, false); // big-endian
    rec.set(raw, 8);
    this.buf.push(rec);
    this.bufBytes += rec.length;
    this.session.frames++;
    if (this.bufBytes >= FLUSH_BYTES) void this.flush();
  }

  private async flush(): Promise<void> {
    if (!this.db || this.buf.length === 0) return;
    const parts = this.buf; this.buf = [];
    const nbytes = this.bufBytes; this.bufBytes = 0;
    const data = new Uint8Array(nbytes);
    let o = 0;
    for (const p of parts) { data.set(p, o); o += p.length; }
    const chunk: LogChunk = { key: this.session.id + ':' + String(this.seq++).padStart(6, '0'), sessionId: this.session.id, seq: this.seq, data };
    this.session.bytes += nbytes;
    this.session.end = Date.now();
    try {
      const t = tx(this.db, ['chunks', 'sessions'], 'readwrite');
      t.objectStore('chunks').put(chunk);
      t.objectStore('sessions').put(this.session);
      await done(t);
    } catch { /* kota dolu vb. — kaydı sessizce bırak, uçuşu etkileme */ this.closed = true; if (this.timer) clearInterval(this.timer); }
  }

  private async persistMeta(): Promise<void> {
    if (!this.db) return;
    const t = tx(this.db, ['sessions'], 'readwrite');
    t.objectStore('sessions').put(this.session);
    await done(t);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
    this.closed = true;
    this.db?.close();
    this.db = null;
  }
}

/** Ring bakımı: toplam bayt sınırı aşılırsa en eski oturumları sil (aktif hariç). */
async function pruneToLimit(db: IDBDatabase, limit: number, keepId: number): Promise<void> {
  const sessions = (await getAll<LogSession>(tx(db, ['sessions'], 'readonly').objectStore('sessions'))).sort((a, b) => a.id - b.id);
  let total = sessions.reduce((s, x) => s + x.bytes, 0);
  for (const s of sessions) {
    if (total <= limit) break;
    if (s.id === keepId) continue;
    await deleteSession(s.id, db);
    total -= s.bytes;
  }
}

// --- Okuma / dışa aktarma (main thread) -------------------------------------

export async function listSessions(): Promise<LogSession[]> {
  const db = await openDb();
  try {
    return (await getAll<LogSession>(tx(db, ['sessions'], 'readonly').objectStore('sessions'))).sort((a, b) => b.id - a.id);
  } finally { db.close(); }
}

/** Oturumun tüm chunk'larını sırayla birleştirip .tlog içeriği döndürür. */
export async function readSessionTlog(id: number): Promise<Uint8Array> {
  const db = await openDb();
  try {
    const idx = tx(db, ['chunks'], 'readonly').objectStore('chunks').index('bySession');
    const chunks = (await getAll<LogChunk>(idx, IDBKeyRange.only(id))).sort((a, b) => a.key < b.key ? -1 : 1);
    const total = chunks.reduce((s, c) => s + c.data.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c.data, o); o += c.data.length; }
    return out;
  } finally { db.close(); }
}

export async function deleteSession(id: number, existingDb?: IDBDatabase): Promise<void> {
  const db = existingDb ?? await openDb();
  try {
    const t = tx(db, ['chunks', 'sessions'], 'readwrite');
    const idx = t.objectStore('chunks').index('bySession');
    const keys: string[] = await new Promise((res, rej) => {
      const r = idx.getAllKeys(IDBKeyRange.only(id));
      r.onsuccess = () => res(r.result as string[]);
      r.onerror = () => rej(r.error);
    });
    for (const k of keys) t.objectStore('chunks').delete(k);
    t.objectStore('sessions').delete(id);
    await done(t);
  } finally { if (!existingDb) db.close(); }
}
