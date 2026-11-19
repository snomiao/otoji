import type { MeetingLine } from "./types";

function units(text: string): { key: string; end: number }[] {
  const out: { key: string; end: number }[] = [];
  // Keep CJK characters separate; Latin word boundaries prevent matching a syllable.
  const pattern =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}])+/gu;
  for (const match of text.matchAll(pattern))
    out.push({
      key: match[0].normalize("NFKC").toLowerCase(),
      end: match.index! + match[0].length,
    });
  return out;
}

/** Exact normalized suffix/prefix only, and only within overlapping audio.
 * A failed match preserves text rather than guessing which words were repeated. */
export function trimTranscriptOverlap(
  previous: MeetingLine | null,
  incoming: MeetingLine,
): MeetingLine | null {
  if (
    !previous ||
    previous.track !== incoming.track ||
    previous.endMs <= incoming.startMs ||
    previous.startMs >= incoming.endMs
  )
    return { ...incoming };
  const left = units(previous.text).slice(-128),
    right = units(incoming.text);
  for (let n = Math.min(left.length, right.length, 128); n >= 1; n--) {
    if (n === 1 && right.length > 1) continue;
    if (!left.slice(-n).every((unit, i) => unit.key === right[i].key)) continue;
    const text = incoming.text
      .slice(right[n - 1].end)
      .replace(/^[\s\p{P}]+/u, "")
      .trim();
    if (!text) return null;
    const startMs = Math.max(previous.endMs, incoming.startMs);
    return startMs < incoming.endMs ? { ...incoming, text, startMs } : { ...incoming };
  }
  return { ...incoming };
}

export function joinAsrText(parts: readonly string[]): string {
  return parts
    .join(" ")
    .replace(
      /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,
      "$1",
    )
    .trim();
}
