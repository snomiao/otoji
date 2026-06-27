import { createContext } from "react";
import type { DeviceOpt } from "./VoiceNode";

export interface GraphCtx {
  devices: DeviceOpt[];
  onAssign: (nodeId: string, device: string | null) => void;
}

export const GraphContext = createContext<GraphCtx>({ devices: [], onAssign: () => {} });
