import { useCallback, useSyncExternalStore } from "react";
import type { LiveStore } from "../graph/live-store";

/** Subscribe a node component to its low-rate live state (recent texts + busy). */
export function useNodeLive(live: LiveStore, nodeId: string) {
  const subscribe = useCallback((cb: () => void) => live.subscribe(nodeId, cb), [live, nodeId]);
  const texts = useSyncExternalStore(subscribe, () => live.getTexts(nodeId));
  const busy = useSyncExternalStore(subscribe, () => live.getBusy(nodeId));
  return { texts, busy };
}
