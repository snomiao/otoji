import { createContext } from "react";
import type { DeviceOpt } from "./device-opt";
import type { Recording } from "./RecordingPlayer";
import { LiveStore } from "../graph/live-store";

export interface GraphCtx {
  devices: DeviceOpt[];
  /** This device's stable id (to decide which node previews default to on here). */
  myDeviceId: string;
  onAssign: (nodeId: string, device: string | null) => void;
  /** Update a node's config (e.g. STT model selection). */
  onConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  /** Remove a node (and its edges). */
  onDelete: (nodeId: string) => void;
  /** Records collected at a sink/output node (oldest first), for file export. */
  getRecords: (nodeId: string) => Recording[];
  /** Associate a local file with a file-source node (audio decoded at runtime). */
  setFile: (nodeId: string, file: File) => void;
  /** Stored-data count per node id (badge), e.g. sink transcript/recording count. */
  counts: Record<string, number>;
  /** Per-device ephemeral live preview state (not synced). */
  live: LiveStore;
  /** Open the node context menu at a screen position (right-click / long-press). */
  openNodeMenu?: (nodeId: string, x: number, y: number) => void;
  /** Federation tracker trust: active (connected) + pending (proposed) servers,
   *  with approve/revoke. Drives the Signaling (trackers) node UI. */
  trackerState?: {
    active: string[];
    pending: string[];
    approve: (url: string) => string | void;
    revoke: (url: string) => void;
  };
}

export const GraphContext = createContext<GraphCtx>({
  devices: [],
  myDeviceId: "",
  onAssign: () => {},
  onConfig: () => {},
  onDelete: () => {},
  getRecords: () => [],
  setFile: () => {},
  counts: {},
  live: new LiveStore(),
});
