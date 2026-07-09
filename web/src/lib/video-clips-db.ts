// IndexedDB store for video clips recorded by graph nodes. Stores WebM blobs
// directly; IndexedDB keeps Blob data off the JS heap in modern browsers.

export interface VideoClip {
  id: string;
  nodeId?: string;
  at: number;
  durationMs: number;
  mimeType: string;
  blob: Blob;
}

const DB_NAME = "otoji-video-clips";
const STORE = "clips";
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

export const videoClipsDB = {
  async put(clip: VideoClip): Promise<void> {
    await tx("readwrite", (s) => s.put(clip));
  },
  async all(): Promise<VideoClip[]> {
    const list = await tx<VideoClip[]>("readonly", (s) => s.getAll() as IDBRequest<VideoClip[]>);
    return list.sort((a, b) => b.at - a.at);
  },
  async get(id: string): Promise<VideoClip | undefined> {
    return tx<VideoClip | undefined>("readonly", (s) => s.get(id) as IDBRequest<VideoClip | undefined>);
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
