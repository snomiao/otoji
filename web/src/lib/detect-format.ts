// Pure formatting for object-detection results. The Vision-model node exposes
// two text outputs built from these: `labels` (readable, for TTS / text-diff)
// and `json` (structured JSONL, for piping into a CLI / sink).

export interface Detection {
  label: string;
  score: number;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

/** Readable summary: unique labels in first-seen order, e.g. "person, cup". */
export function formatLabels(dets: Detection[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dets) {
    if (!seen.has(d.label)) {
      seen.add(d.label);
      out.push(d.label);
    }
  }
  return out.join(", ");
}

/** One JSON object per detection (rounded), newline-separated. */
export function formatJsonl(dets: Detection[]): string {
  return dets
    .map((d) =>
      JSON.stringify({
        label: d.label,
        score: Math.round(d.score * 1000) / 1000,
        box: [Math.round(d.box.xmin), Math.round(d.box.ymin), Math.round(d.box.xmax), Math.round(d.box.ymax)],
      }),
    )
    .join("\n");
}
