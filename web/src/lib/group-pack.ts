export interface GroupPackNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PackedPositions = Record<string, { x: number; y: number }>;

/** Pack selected node rectangles into one vertical, edge-touching stack. */
export function packSelectionFlush(
  nodes: readonly GroupPackNode[],
  selectedIds: readonly string[],
  gridStep: number,
): PackedPositions {
  const selected = new Set(selectedIds);
  const ordered = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => selected.has(node.id))
    .sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x || a.index - b.index);
  if (!ordered.length) return {};

  const step = Number.isFinite(gridStep) && gridStep > 0 ? gridStep : 1;
  const snap = (value: number) => Math.round(value / step) * step;
  const x = snap(ordered[0]!.node.x);
  let y = snap(ordered[0]!.node.y);
  const packed: PackedPositions = {};
  for (const { node } of ordered) {
    packed[node.id] = { x, y };
    y += node.height;
  }
  return packed;
}
