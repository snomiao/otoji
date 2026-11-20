/** Deterministic tones/noise only; never reads a microphone or saved recording. */
export function syntheticPcm(): Float32Array {
  let seed = 123456;
  return Float32Array.from({ length: 48000 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (
      0.13 * Math.sin((i * 2 * Math.PI * 173) / 16000) +
      0.07 * Math.sin((i * 2 * Math.PI * 531) / 16000) +
      (seed / 4294967296 - 0.5) * 0.03
    );
  });
}
