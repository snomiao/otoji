// IndexedDB store for persisted recordings (Opus packets + compact peaks +
// transcript). Survives reloads; shares the origin storage quota.

import type { StoredOpus } from "./opus";

export interface StoredRecording {
  id: string;
  at: number;
  durationMs: number;
  text: string;
  peaks: Int16Array; // packed min/max, see peaks.ts
  opus: StoredOpus;
}

const DB_NAME = "otoji-recordings";
const STORE = "recordings";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export const recordingsDB = {
  async put(rec: StoredRecording): Promise<void> {
    await tx("readwrite", (s) => s.put(rec));
  },
  async all(): Promise<StoredRecording[]> {
    const list = await tx<StoredRecording[]>("readonly", (s) => s.getAll() as IDBRequest<StoredRecording[]>);
    return list.sort((a, b) => b.at - a.at);
  },
  async delete(id: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(id));
  },
  async clear(): Promise<void> {
    await tx("readwrite", (s) => s.clear());
  },
  available(): boolean {
    return typeof indexedDB !== "undefined";
  },
};

/** Ask the browser to make storage persistent (exempt from auto-eviction). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
