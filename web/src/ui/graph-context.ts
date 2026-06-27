import { createContext } from "react";
import type { DeviceOpt } from "./VoiceNode";

export interface GraphCtx {
  devices: DeviceOpt[];
  onAssign: (nodeId: string, device: string | null) => void;
  /** Update a node's config (e.g. STT model selection). */
  onConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  /** Stored-data count per node id (badge), e.g. sink transcript/recording count. */
  counts: Record<string, number>;
}

export const GraphContext = createContext<GraphCtx>({
  devices: [],
  onAssign: () => {},
  onConfig: () => {},
  counts: {},
});
