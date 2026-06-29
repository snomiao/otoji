// Build an .srt subtitle file from a sequence of cues. When a cue carries
// absolute start/end times (CTC-derived from SenseVoice), they are used directly
// so timings track the real audio timeline (with gaps); otherwise timing falls
// back to sequential (each cue starts where the previous ended), correct for
// VAD-segmented utterances played back-to-back.

function stamp(ms: number): string {
  const v = Math.max(0, ms);
  const h = Math.floor(v / 3600000);
  const m = Math.floor((v % 3600000) / 60000);
  const s = Math.floor((v % 60000) / 1000);
  const z = Math.floor(v % 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(z, 3)}`;
}

export interface SrtCue {
  text: string;
  durationMs: number;
  /** Absolute speech window in the source timeline (CTC-derived). When both are
   *  present they override the sequential clock for this cue. */
  startMs?: number;
  endMs?: number;
}

export function buildSrt(cues: SrtCue[]): string {
  let clock = 0; // running clock for cues without absolute times
  let idx = 0;
  const out: string[] = [];
  for (const cue of cues) {
    const text = cue.text.trim();
    const dur = Math.max(300, cue.durationMs || 1000);
    // Prefer absolute CTC times; else advance the sequential clock.
    const hasAbs = cue.startMs !== undefined && cue.endMs !== undefined;
    const start = hasAbs ? cue.startMs! : clock;
    const end = hasAbs ? Math.max(cue.endMs!, start + 1) : clock + dur;
    clock = end;
    if (!text) continue;
    idx++;
    out.push(`${idx}\n${stamp(start)} --> ${stamp(end)}\n${text}\n`);
  }
  return out.join("\n");
}
