// Minimal IndexedDB key-value cache with TTL. Falls back to localStorage if IndexedDB is unavailable.
type CacheRecord = {
  value: any;
  expiresAt?: number | null;
};

const DB_NAME = 'portfolio-pilot-cache';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<any | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const rec: CacheRecord | undefined = req.result;
        if (!rec) return resolve(null);
        if (rec.expiresAt && Date.now() > rec.expiresAt) {
          // expired
          resolve(null);
        } else {
          resolve(rec.value);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const rec: CacheRecord = JSON.parse(raw);
      if (rec.expiresAt && Date.now() > rec.expiresAt) return null;
      return rec.value;
    } catch {
      return null;
    }
  }
}

async function idbSet(key: string, value: any, ttlMs?: number): Promise<void> {
  const rec: CacheRecord = { value, expiresAt: ttlMs ? Date.now() + ttlMs : null };
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(rec, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try {
      localStorage.setItem(key, JSON.stringify(rec));
    } catch {
      // ignore
    }
  }
}

async function idbDel(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try { localStorage.removeItem(key); } catch {};
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    try { localStorage.clear(); } catch {};
  }
}

export { idbGet, idbSet, idbDel, idbClear };
