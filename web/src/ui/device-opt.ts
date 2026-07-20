// A device that can host graph nodes — online (present) or referenced offline.
// Drives device pickers, the network view, and per-node ownership.
export interface DeviceOpt {
  deviceId: string;
  peerId?: string; // current ephemeral peer id when online
  name: string;
  me: boolean;
  online: boolean;
  role: string;
  hasMic?: boolean;
  runtime?: string; // "browser" | "node" | "native" — drives the connection-type badge
  net?: string; // "lan" | "wan" for a node peer
}
