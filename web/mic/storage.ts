import { normalizeMicConfig, patchMicConfig, type MicConfig, type MicConfigPatch } from "./config";

type MaybePromise<T> = T | Promise<T>;
export type StorageChangeListener = (value: unknown, remote: boolean) => void;

/** An adapter must remain in the isolated userscript world; never expose it through postMessage. */
export interface MicStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  listen(key: string, listener: StorageChangeListener): Promise<() => void>;
}

export interface GmStorageApi {
  getValue(key: string, fallback?: unknown): MaybePromise<unknown>;
  setValue(key: string, value: unknown): MaybePromise<void>;
  addValueChangeListener(
    key: string,
    listener: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void,
  ): MaybePromise<number>;
  removeValueChangeListener?(id: number): MaybePromise<void>;
}

export interface LegacyGmStorageApi {
  GM_getValue: GmStorageApi["getValue"];
  GM_setValue: GmStorageApi["setValue"];
  GM_addValueChangeListener: GmStorageApi["addValueChangeListener"];
  GM_removeValueChangeListener?: GmStorageApi["removeValueChangeListener"];
}

/** Pass GM or explicit legacy functions from the entry point, never the page window. */
export function createGmStorage(api: GmStorageApi | LegacyGmStorageApi): MicStorage {
  const modern =
    "getValue" in api
      ? api
      : {
          getValue: api.GM_getValue,
          setValue: api.GM_setValue,
          addValueChangeListener: api.GM_addValueChangeListener,
          removeValueChangeListener: api.GM_removeValueChangeListener,
        };
  return {
    async get(key) {
      return modern.getValue.call(api, key);
    },
    async set(key, value) {
      await modern.setValue.call(api, key, value);
    },
    async listen(key, listener) {
      let active = true;
      const id = await modern.addValueChangeListener.call(
        api,
        key,
        (_name, _old, value, remote) => {
          if (active) listener(value, remote);
        },
      );
      return () => {
        active = false;
        void Promise.resolve(modern.removeValueChangeListener?.call(api, id)).catch(() => {});
      };
    },
  };
}

export const MIC_CONFIG_KEY = "otoji:mic:config:v1";

export interface MicConfigStore {
  load(): Promise<MicConfig>;
  save(value: MicConfig): Promise<MicConfig>;
  update(patch: MicConfigPatch): Promise<MicConfig>;
  subscribe(listener: (config: MicConfig) => void): () => void;
  dispose(): void;
}

export function createMicConfigStore(storage: MicStorage): MicConfigStore {
  const listeners = new Set<(config: MicConfig) => void>();
  let disposed = false;
  const emit = (value: unknown) => {
    if (!disposed) for (const listener of listeners) listener(normalizeMicConfig(value));
  };
  const stop = storage.listen(MIC_CONFIG_KEY, (value) => emit(value));
  void stop.catch(() => {});
  // Serialize writes from one tab; changes from other tabs remain last-writer-wins.
  let writes: Promise<unknown> = Promise.resolve();
  const save = (value: MicConfig): Promise<MicConfig> => {
    const config = normalizeMicConfig(value);
    const operation = writes.then(async () => {
      if (disposed) throw new Error("Microphone configuration store is disposed");
      await storage.set(MIC_CONFIG_KEY, config);
      emit(config);
      return config;
    });
    writes = operation.catch(() => {});
    return operation;
  };
  return {
    async load() {
      await stop;
      return normalizeMicConfig(await storage.get(MIC_CONFIG_KEY));
    },
    save,
    update(patch) {
      const operation = writes.then(async () => {
        if (disposed) throw new Error("Microphone configuration store is disposed");
        const config = patchMicConfig(normalizeMicConfig(await storage.get(MIC_CONFIG_KEY)), patch);
        await storage.set(MIC_CONFIG_KEY, config);
        emit(config);
        return config;
      });
      writes = operation.catch(() => {});
      return operation;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      void stop.then((unsubscribe) => unsubscribe()).catch(() => {});
    },
  };
}
