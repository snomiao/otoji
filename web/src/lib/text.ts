// "Readable" = contains at least one letter or number in any script. Used to
// drop VAD segments that SenseVoice maps to bare punctuation ("." / "。") or
// whitespace — i.e. non-speech / noise captures with no real transcript.
export function isReadableTranscript(text: string | undefined | null): boolean {
  if (!text) return false;
  return /[\p{L}\p{N}]/u.test(text);
}
