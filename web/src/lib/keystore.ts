const PREFIX = "otoji.keys.";

export interface OtojiKeys {
  IFLYTEK_APP_ID?: string;
  IFLYTEK_API_KEY?: string;
  IFLYTEK_TTS_API_KEY?: string;
  IFLYTEK_TTS_API_SECRET?: string;
  IFLYTEK_TTS_VOICE?: string;
  IFLYTEK_TTS_AUE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  GOOGLE_OAUTH_TOKEN?: string;
  GOOGLE_DOC_ID?: string;
}

export type KeyName = keyof OtojiKeys;

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class KeyStore {
  constructor(private storage: Storage) {}

  get(name: KeyName): string | undefined {
    const v = this.storage.getItem(PREFIX + name);
    return v == null ? undefined : v;
  }

  set(name: KeyName, value: string): void {
    this.storage.setItem(PREFIX + name, value);
  }

  remove(name: KeyName): void {
    this.storage.removeItem(PREFIX + name);
  }

  getAll(): OtojiKeys {
    const names: KeyName[] = [
      "IFLYTEK_APP_ID",
      "IFLYTEK_API_KEY",
      "IFLYTEK_TTS_API_KEY",
      "IFLYTEK_TTS_API_SECRET",
      "IFLYTEK_TTS_VOICE",
      "IFLYTEK_TTS_AUE",
      "OPENAI_API_KEY",
      "OPENAI_BASE_URL",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL",
      "GOOGLE_OAUTH_TOKEN",
      "GOOGLE_DOC_ID",
    ];
    const out: OtojiKeys = {};
    for (const n of names) {
      const v = this.get(n);
      if (v !== undefined) out[n] = v;
    }
    return out;
  }

  setAll(keys: OtojiKeys): void {
    for (const [k, v] of Object.entries(keys)) {
      if (v != null && v !== "") this.set(k as KeyName, v);
    }
  }
}

export function browserKeyStore(): KeyStore {
  return new KeyStore(globalThis.localStorage);
}

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
  removeItem(k: string): void { this.data.delete(k); }
}
