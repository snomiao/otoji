// Build an .srt subtitle file from a sequence of {text, durationMs} cues.
// Timing is sequential (each cue starts where the previous ended), which is
// correct for VAD-segmented utterances played back-to-back.

function stamp(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const z = Math.floor(ms % 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(z, 3)}`;
}

export interface SrtCue {
  text: string;
  durationMs: number;
}

export function buildSrt(cues: SrtCue[]): string {
  let t = 0;
  let idx = 0;
  const out: string[] = [];
  for (const cue of cues) {
    const start = t;
    const end = t + Math.max(300, cue.durationMs || 1000);
    t = end;
    const text = cue.text.trim();
    if (!text) continue;
    idx++;
    out.push(`${idx}\n${stamp(start)} --> ${stamp(end)}\n${text}\n`);
  }
  return out.join("\n");
}
