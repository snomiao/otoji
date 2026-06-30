import { createContext } from "react";
import type { DeviceOpt } from "./VoiceNode";
import type { Recording } from "./RecordingPlayer";
import { LiveStore } from "../graph/live-store";

export interface GraphCtx {
  devices: DeviceOpt[];
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
}

export const GraphContext = createContext<GraphCtx>({
  devices: [],
  onAssign: () => {},
  onConfig: () => {},
  onDelete: () => {},
  getRecords: () => [],
  setFile: () => {},
  counts: {},
  live: new LiveStore(),
});
