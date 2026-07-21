// Basit IndexedDB anahtar-değer deposu: büyük/yapısal state'in kalıcılığı için
// (parametre önbelleği vb. — localStorage'ın 5MB sınırına ve senkron maliyetine takılmaz).

const DB_NAME = 'wmp-state';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB açılamadı'));
  });
}

export async function persistSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(value, key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } finally { db.close(); }
}

export async function persistGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror = () => rej(r.error);
    });
  } finally { db.close(); }
}

export async function persistDelete(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } finally { db.close(); }
}
