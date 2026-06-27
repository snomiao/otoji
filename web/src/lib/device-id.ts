// Stable per-browser device identity, persisted in localStorage. Unlike the
// ephemeral signaling peerId (new on every WebSocket connect), this survives
// reloads/reconnects, so graph node assignments and "offline/online" status
// track a device across disconnects.

import { ADJECTIVES, ANIMALS, pickWord } from "./words";

const ID_KEY = "otoji.deviceId";
const NAME_KEY = "otoji.deviceName";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return uuid(); // private mode: ephemeral, but stable within the session run
  }
}

/** A friendly random device name like "swift-otter". */
export function generateDeviceName(): string {
  return `${pickWord(ADJECTIVES)}-${pickWord(ANIMALS)}`;
}

/** Persisted friendly device name; generated + cached on first use. */
export function getDeviceName(): string {
  try {
    let n = localStorage.getItem(NAME_KEY);
    if (!n) {
      n = generateDeviceName();
      localStorage.setItem(NAME_KEY, n);
    }
    return n;
  } catch {
    return generateDeviceName();
  }
}

export function setDeviceName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
