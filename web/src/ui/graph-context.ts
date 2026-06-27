import { createContext } from "react";
import type { DeviceOpt } from "./VoiceNode";

export interface GraphCtx {
  devices: DeviceOpt[];
  onAssign: (nodeId: string, device: string | null) => void;
  /** Stored-data count per node id (badge), e.g. sink transcript/recording count. */
  counts: Record<string, number>;
}

export const GraphContext = createContext<GraphCtx>({ devices: [], onAssign: () => {}, counts: {} });
