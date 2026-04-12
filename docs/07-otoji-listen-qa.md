# otoji listen QA

End-to-end QA workflow for `otoji listen`. Evaluates a configuration matrix
against a deterministic play sequence and reports per-play accuracy, TTFB,
capture rate, and RTF.

## Goals

- Detect regressions in the live ASR pipeline (recognizer + VAD + polish chain).
- Compare configurations side-by-side: provider, partial-decode cadence, VAD
  silence threshold, polish backend.
- Surface latency in a way that maps directly to user-perceived feel.

## Workflow

1. **Build a deterministic play sequence.** Mulberry32 PRNG seeded by
   `--seed`. Each play is a `(offset, duration, gap-after)` tuple from a
   3-minute Japanese podcast (`test-audio/yuyu-ja-3m.wav` by default). Same
   seed → same plays across runs and configs.
2. **Pre-compute ground truth.** For each play window, ffmpeg-extracts the
   isolated WAV and runs `cat win.wav | OTOJI_PARTIAL_MS=0 otoji listen -
   --plain --provider sensevoice` to get the canonical transcript. Cached
   to `target/otoji-listen-qa/cache/<sequence-key>/`.
3. **Run the live harness for one config.** Spawns `otoji listen -` with
   the config's env vars, then for each play:
   - Streams the play's PCM into stdin paced at real time.
   - Streams `gap_after` seconds of zero-PCM as inter-play silence.
   - Records `play_end` wall-clock time.
4. **Drain.** Closes stdin and waits for the listen process to exit (max
   300s, or 60s of quiescence after the last final).
5. **Match plays to finals.** Greedy by accuracy: for each play in order,
   pick the unused Final whose `received_at >= play_end - 500ms` and whose
   LCS character ratio against the expected text is highest (and ≥ 30%).
6. **Score.** Per-play: TTFB (`received_at - play_end`), accuracy (LCS
   chars / expected chars after stripping punctuation/whitespace). Per-run:
   capture rate, mean & p95 TTFB, mean accuracy, RTF, total finals,
   unmatched finals.
7. **(--matrix)** Repeat 3-6 over the default matrix and print a comparison
   table.

The harness has two transports:

- `--mode stdin` *(default)* — synthesizes a continuous WAV and pipes it
  into `otoji listen -`. No mic, no speakers, runs in any sandbox. Audio
  pacing matches wall clock so VAD silence accumulation behaves like the
  mic path.
- `--mode speaker` — extracts each play to a temp wav and plays it via
  `afplay` while `otoji listen` captures from the default microphone. Tests
  the full acoustic loop. Requires mic permission, real speakers, and a
  Mic Mode of *Standard* in macOS Control Center.

## Metric definitions

| Metric | Meaning |
|---|---|
| **capture rate** | (# plays matched to a final) / (# plays). 1.0 = every played window produced an attributable final. |
| **accuracy** | Per-play LCS char ratio between the matched final's text and the per-window ground truth (whitespace and punctuation stripped). 1.0 = full match. |
| **TTFB** | Wall-clock ms between `play_end` and the matched final's `received_at`. Lower is better. |
| **TTFB p95** | 95th percentile TTFB across all matched plays. |
| **RTF** | (audio seconds streamed) / (wall seconds elapsed). Recognizer-side throughput. |
| **finals (unmatched)** | Total finals emitted by `otoji listen` and how many failed to match any play (noise / merged across plays / hallucination). |

## Run

```sh
# Single config (uses current default partial_ms / vad).
bun scripts/otoji-listen-qa.ts

# Reproducible single run with explicit knobs.
bun scripts/otoji-listen-qa.ts --plays 8 --seed 42 --partial-ms 0 --vad-silence-ms 500

# Full matrix sweep — same plays, all configs.
bun scripts/otoji-listen-qa.ts --plays 6 --seed 7 --matrix

# Multi-seed matrix — runs the matrix over several seeds and averages.
scripts/otoji-listen-qa-multi.sh --plays 6 --seeds "1 3 7"

# Acoustic loop (manual launch only — needs mic permission + speakers).
bun scripts/otoji-listen-qa.ts --mode speaker --plays 6
```

Each run drops a session directory under `target/otoji-listen-qa/<ts>/`
containing per-config `summary.json`, `live.ndjson`, `plays.tsv`, and a
matrix `matrix.json`.

## Matrix knobs

| Env | Default | Notes |
|---|---|---|
| `OTOJI_PARTIAL_MS` | 1500 | 0 disables partials entirely. ≤300 used to peg the worker (see `06-model-benchmark.md`). |
| `OTOJI_VAD_SILENCE_MS` | 1000 | Trailing silence (ms) that closes a VAD utterance. Lower = lower TTFB but more cuts mid-sentence. |
| `OTOJI_VAD_MAX_MS` | 12000 | Hard ceiling on a VAD utterance. Lower = more aggressive flushing. |
| `OTOJI_VAD_THRESHOLD` | 0.001 | RMS threshold for the energy VAD. Auto-calibrated from the first 2s. |

## Latest multi-seed matrix (2026-04-12, M-series, --plays 8, seeds 1/3/7/11/13)

5 seeds × 7 configs averaged = 35 runs, 40 plays per config. Match
threshold 0.5. Non-overlapping play sequence with 2.5s VAD-calibration
preroll. All fixes applied (partial_ms default, VAD threshold 1.5×, base
0.0005, pending_audio removed, num_threads=4, ffmpeg-concat WAV pipeline).

| config | capture | acc | ttfb_mean | ttfb_p95 | rtf |
|---|---|---|---|---|---|
| **sv:default** (s=750, m=12000) | **100%** | **98.0%** | **2132ms** | **3430ms** | 21.8x |
| sv:s=500 | 100% | 98.1% | 1954ms | 3119ms | 21.7x |
| sv:s=750 | 100% | 98.0% | 1981ms | 3155ms | 21.9x |
| sv:s=500,m=8000 | 100% | 94.2% | 1876ms | 2991ms | 23.2x |
| sv:s=750,m=10000 | 100% | 98.0% | 1996ms | 3189ms | 22.0x |
| sv:m=8000 | 100% | 94.0% | 1886ms | 3046ms | 22.0x |
| sv:partial=300_old | 85.0% | 83.2% | 23311ms | 47279ms | 1.9x |

### Improvement over original defaults

| metric | original | after all fixes | delta |
|---|---|---|---|
| capture | ~27% (3/11 plays) | **100%** | **+73pt** |
| accuracy | ~25% | **98.0%** | **+73pt** |
| TTFB mean | 5-7s | **2.1s** | **-70%** |
| RTF | 0.55x (below realtime) | **21.8x** | **40× faster** |

### Fixes applied (in discovery order)

1. **`partial_ms` 300→1500.** Each partial re-decoded the full utterance
   buffer, O(n²). 300ms cadence pegged CPU at 0.55× RTF. 1500ms gives
   ~5× speedup; 0 disables entirely.
2. **`pending_audio` removed.** Short (<4 char) decoded fragments held
   audio and prepended it to the next utterance, causing cross-play
   contamination. Removing it entirely (emit every non-empty decode)
   eliminated the merge bug.
3. **VAD threshold 3×→1.5×, base 0.001→0.0005.** The calibration
   multiplier was too aggressive — quiet speech blocks were classified as
   silence when the first 2s had loud content.
4. **`num_threads` 2→4.** SenseVoice ONNX scales well to 4 threads on
   M-series: RTF went from 11.3× to 15.7× (burst mode: 21.8×).
5. **QA harness: ffmpeg-concat WAV instead of raw PCM streaming.** The
   `-f s16le` raw extraction produced subtly different PCM from WAV
   extraction (different seeking alignment). This caused hound to
   misparse ~50% of segments. Using ffmpeg's concat demuxer with proper
   WAV containers matches `cat file.wav | otoji listen -` exactly.
6. **QA harness: 2.5s silence preroll.** Gives the VAD adaptive
   calibration a clean noise floor (pure zeros) instead of the first
   play's speech content.

### Findings from the matrix

1. **All configs hit 100% capture and ~98% accuracy** — the pipeline is
   now robust. The only exception is `partial=300_old` at 85%/83% which
   confirms the old partial cadence was the primary bottleneck.
2. **`vad_max_ms=8000` drops accuracy ~4pt** without improving TTFB.
   Stick with the 12s default.
3. **`vad_silence_ms` has marginal impact** when the pipeline is healthy.
   500ms, 750ms, 1000ms all hit 100% capture and 98% accuracy. The
   default 750ms is the right balance.
4. **RTF is comfortably >20× realtime** across all configs, so the
   recognizer never falls behind live mic input even with partial decoding
   enabled.

## Noise robustness (Gemini TTS multilang, pink noise)

```sh
# Generate noisy variant:
ffmpeg -i clean.wav -f lavfi -t DUR -i "anoisesrc=d=DUR:c=pink:r=16000:a=VOL" \
  -filter_complex "amix=inputs=2:duration=first" -ar 16000 -ac 1 out.wav
# VOL = 10^(-SNR/20): SNR30→0.0316, SNR20→0.1, SNR10→0.316, SNR5→0.562
```

| SNR | condition | coverage | precision | F1 |
|---|---|---|---|---|
| clean | — | 71.0% | 99.4% | 82.8% |
| 30dB | quiet room | 47.1% | 51.5% | 49.2% |
| 20dB | office | 24.9% | 61.8% | 35.5% |
| 10dB | cafe | 35.7% | 97.5% | 52.3% |
| 5dB | street | 45.7% | 95.3% | 61.8% |

Key: moderate noise (20–30dB) is the worst regime — SenseVoice hallucinates
plausible-sounding garbage. Very high noise silences the model (lower
coverage but high precision).

## Known gaps

- **Speaker mode unverified.** Acoustic-loop runs need a Terminal session
  with mic permission; this has not been exercised end-to-end yet.
- **No iflytek runs in matrix.** Adding iflytek requires `IFLYTEK_APP_ID` /
  `IFLYTEK_API_KEY` and is gated on cloud credentials.
- **No polish backend coverage.** Matrix only tests the raw recognizer; the
  polish chain (Gemini / OpenAI / Anthropic / Ollama) is not exercised.
