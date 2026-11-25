// Device role + capabilities. Role is a user choice (persisted locally) shared
// via presence so other devices can auto-assign work and label the network from
// each viewer's perspective. Roles map onto node ownership:
//   mic   -> owns mic-vad (captures + streams segments)
//   model -> owns stt/polish (can be a headless/beefy provider)
//   viewer-> owns the sink (receives transcripts/recordings), no capture/compute
//   general -> no preference

export type DeviceRole = "general" | "mic" | "model" | "viewer";

export const ROLES: { id: DeviceRole; label: string }[] = [
  { id: "general", label: "General" },
  { id: "mic", label: "🎙 Mic" },
  { id: "model", label: "🧠 Model" },
  { id: "viewer", label: "👁 Viewer" },
];

const KEY = "otoji.role";

export function getRole(): DeviceRole {
  try {
    return (localStorage.getItem(KEY) as DeviceRole) || "general";
  } catch {
    return "general";
  }
}

export function setRole(r: DeviceRole): void {
  try {
    localStorage.setItem(KEY, r);
  } catch {
    /* ignore */
  }
}

export interface DeviceCaps {
  hasMic?: boolean;
}

const MIC_NODE_TYPES = new Set(["mic-vad", "mic-raw", "web-speech"]);

/** Whether an auto-assignment may place this node type on a device. */
export function canHostNode(nodeType: string, deviceCaps?: DeviceCaps | null): boolean {
  return !MIC_NODE_TYPES.has(nodeType) || deviceCaps?.hasMic !== false;
}

export async function detectCaps(): Promise<DeviceCaps> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return {};
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return { hasMic: devices.some((device) => device.kind === "audioinput") };
  } catch {
    // Capability is advisory. Stay permissive when enumeration is unavailable.
    return {};
  }
}
