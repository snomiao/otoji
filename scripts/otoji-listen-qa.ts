#!/usr/bin/env bun
// otoji listen QA — measures otoji listen robustness across configurations.
//
// Workflow:
//   1. Generate a deterministic sequence of (offset, dur, gap) play windows
//      from a Japanese podcast wav (seed-controlled, so all matrix runs see
//      the same content).
//   2. Pre-compute per-window ground truth by running the SAME ASR provider
//      in burst mode over each isolated window. Cached on disk.
//   3. Run the live harness for one configuration: spawn `otoji listen -`,
//      pipe a continuous WAV stream that stitches the windows together with
//      silence gaps, capture every event with wall-clock timestamps.
//   4. Match each Final to the play it overlaps in time, compute per-play
//      metrics: TTFB (play_end → final), accuracy (LCS char ratio vs GT),
//      capture (≥1 final matched).
//   5. Print a per-play table and a one-line summary.
//   6. (--matrix) Repeat over multiple configurations, share GT, print a
//      comparison table at the end.
//
// Two transports:
//   --mode stdin    (default) — pipes synthesized WAV into `otoji listen -`.
//                   No mic, no speakers, runs in any sandbox.
//   --mode speaker  — uses afplay + the default mic. Requires mic permission
//                   and physical speakers; manual launch only.
//
// Usage:
//   bun scripts/otoji-listen-qa.ts                       # one run, defaults
//   bun scripts/otoji-listen-qa.ts --plays 12 --seed 42
//   bun scripts/otoji-listen-qa.ts --partial-ms 0
//   bun scripts/otoji-listen-qa.ts --matrix              # default matrix sweep
//   bun scripts/otoji-listen-qa.ts --mode speaker --plays 6

import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import {
  mkdirSync, createWriteStream, existsSync, readFileSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { Writable, Readable } from "node:stream";

// ────────────────────────────── types ──────────────────────────────

type Mode = "stdin" | "speaker";
type Provider = "sensevoice" | "iflytek";

type Play = {
  index: number;
  offset: number;
  dur: number;
  gapAfter: number;
  expectedText: string;
};

type Config = {
  name: string;
  provider: Provider;
  partialMs: number;
  vadSilenceMs?: number;
  vadMaxMs?: number;
};

type FinalEvent = {
  seg_id: number;
  text: string;
  receivedAt: number;
};

type PlayResult = {
  play: Play;
  matchedFinal?: FinalEvent;
  ttfbMs?: number;
  accuracy?: number;
};

type RunSummary = {
  config: Config;
  totalPlays: number;
  capturedPlays: number;
  captureRate: number;
  meanTtfbMs: number;
  p95TtfbMs: number;
  meanAccuracy: number;
  audioSent: number;
  wallTime: number;
  rtf: number;
  finalsCount: number;
  unmatchedFinals: number;
  results: PlayResult[];
};

// ────────────────────────────── args ──────────────────────────────

type Args = {
  mode: Mode;
  audio: string;
  plays: number;
  seed: number;
  minDur: number;
  maxDur: number;
  minGap: number;
  maxGap: number;
  provider: Provider;
  partialMs: number;
  vadSilenceMs?: number;
  vadMaxMs?: number;
  matrix: boolean;
  outDir: string;
  cacheDir: string;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    mode: "stdin",
    audio: "test-audio/yuyu-ja-3m.wav",
    plays: 10,
    seed: 1,
    minDur: 5,
    maxDur: 10,
    minGap: 2,
    maxGap: 5,
    provider: "sensevoice",
    partialMs: 1500,
    matrix: false,
    outDir: "target/otoji-listen-qa",
    cacheDir: "target/otoji-listen-qa/cache",
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--mode": a.mode = v as Mode; i++; break;
      case "--audio": a.audio = v; i++; break;
      case "--plays": a.plays = Number(v); i++; break;
      case "--seed": a.seed = Number(v); i++; break;
      case "--min-dur": a.minDur = Number(v); i++; break;
      case "--max-dur": a.maxDur = Number(v); i++; break;
      case "--min-gap": a.minGap = Number(v); i++; break;
      case "--max-gap": a.maxGap = Number(v); i++; break;
      case "--provider": a.provider = v as Provider; i++; break;
      case "--partial-ms": a.partialMs = Number(v); i++; break;
      case "--vad-silence-ms": a.vadSilenceMs = Number(v); i++; break;
      case "--vad-max-ms": a.vadMaxMs = Number(v); i++; break;
      case "--matrix": a.matrix = true; break;
      case "--out-dir": a.outDir = v; i++; break;
      case "--cache-dir": a.cacheDir = v; i++; break;
      case "-h":
      case "--help":
        console.log("Usage: bun scripts/otoji-listen-qa.ts [opts]\n  --plays N --seed N --partial-ms N --provider sensevoice|iflytek\n  --vad-silence-ms N --vad-max-ms N --matrix --mode stdin|speaker");
        process.exit(0);
    }
  }
  return a;
}

// ─────────────────────────── utilities ───────────────────────────

function ensureCmd(cmd: string) {
  const r = spawnSync("which", [cmd]);
  if (r.status !== 0) { console.error(`missing: ${cmd}`); process.exit(1); }
}

function ts(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ffprobeDuration(path: string): number {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]);
  if (r.status !== 0) { console.error("ffprobe failed:", r.stderr.toString()); process.exit(1); }
  return Number(r.stdout.toString().trim());
}

// Mulberry32 — small deterministic PRNG.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a proper WAV header with the exact data size. The streaming header
// (0xFFFFFFFE sizes) caused hound to skip/misparse chunks and drop ~50% of
// utterances. Since the QA harness pre-builds the full PCM buffer, the
// correct size is known upfront.
function wavHeader(dataBytes: number): Buffer {
  const sampleRate = 16000, channels = 1, bits = 16;
  const byteRate = sampleRate * channels * bits / 8;
  const blockAlign = channels * bits / 8;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

function extractPcmRaw(src: string, offset: number, dur: number): Buffer {
  const r = spawnSync("ffmpeg", [
    "-v", "error",
    "-ss", offset.toFixed(3),
    "-t", dur.toFixed(3),
    "-i", src,
    "-ar", "16000", "-ac", "1", "-f", "s16le", "-",
  ], { maxBuffer: 1024 * 1024 * 64 });
  if (r.status !== 0) throw new Error("ffmpeg pcm extract: " + r.stderr.toString());
  return r.stdout;
}

function extractWavFile(src: string, offset: number, dur: number, dst: string) {
  const r = spawnSync("ffmpeg", [
    "-v", "error", "-y",
    "-ss", offset.toFixed(3),
    "-t", dur.toFixed(3),
    "-i", src,
    "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
    dst,
  ]);
  if (r.status !== 0) throw new Error("ffmpeg wav extract: " + r.stderr.toString());
}

// Write PCM to a stream. In burst mode (frameMs=0), dump all at once — lets
// the recognizer process at its own speed without harness-imposed pacing.
// In paced mode, sleep frameMs between each slice for real-time delivery.
async function pacedWrite(stream: Writable, buf: Buffer, frameMs = 0): Promise<number> {
  if (frameMs <= 0) {
    // Burst: write whole buffer, respecting backpressure.
    if (!stream.writable) return 0;
    if (!stream.write(buf)) {
      await new Promise<void>((res) => stream.once("drain", () => res()));
    }
    return buf.length;
  }
  const sliceBytes = 16000 * 2 * frameMs / 1000;
  let written = 0;
  for (let i = 0; i < buf.length; i += sliceBytes) {
    const slice = buf.subarray(i, Math.min(i + sliceBytes, buf.length));
    if (!stream.writable) return written;
    if (!stream.write(slice)) {
      await new Promise<void>((res) => stream.once("drain", () => res()));
    }
    written += slice.length;
    await new Promise((r) => setTimeout(r, frameMs));
  }
  return written;
}

// Strip whitespace, ASCII punct, and JP punct so accuracy doesn't punish
// SenseVoice for spacing or trailing periods.
function normalize(text: string): string {
  return text.replace(/[\s。、？！・,.\?\!]/g, "");
}

// Longest common subsequence length — char level.
function lcsLen(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let curr = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = curr[j - 1] > prev[j] ? curr[j - 1] : prev[j];
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[b.length];
}

function accuracy(actual: string, expected: string): number {
  const a = normalize(actual);
  const e = normalize(expected);
  if (!e.length) return a.length === 0 ? 1 : 0;
  const lcs = lcsLen(a, e);
  return lcs / e.length;
}

// ─────────────────────── play sequence + GT ───────────────────────

// Non-overlapping play sequence: rejection-sample offsets so no two plays
// draw from the same source audio region. Without this, the recognizer
// correctly merges adjacent plays into one Final and TTFB explodes because
// the merged final waits on the second play's audio before flushing.
function buildPlaySequence(args: Args, totalDur: number): Omit<Play, "expectedText">[] {
  const rng = mulberry32(args.seed);
  const out: Omit<Play, "expectedText">[] = [];
  const taken: { start: number; end: number }[] = [];
  const minSeparation = 3.0; // seconds of source-audio breathing room between plays
  for (let i = 0; i < args.plays; i++) {
    const dur = args.minDur + rng() * (args.maxDur - args.minDur);
    let offset = 0;
    let attempts = 0;
    while (attempts < 200) {
      offset = rng() * Math.max(0.1, totalDur - dur);
      const start = offset - minSeparation;
      const end = offset + dur + minSeparation;
      const overlap = taken.some((t) => start < t.end && end > t.start);
      if (!overlap) break;
      attempts++;
    }
    taken.push({ start: offset, end: offset + dur });
    const gapAfter = args.minGap + rng() * (args.maxGap - args.minGap);
    out.push({ index: i, offset, dur, gapAfter });
  }
  return out;
}

function groundTruthFor(audio: string, offset: number, dur: number, cacheDir: string): string {
  const key = `${Math.round(offset * 100)}_${Math.round(dur * 100)}`;
  const cachePath = `${cacheDir}/gt_${key}.txt`;
  if (existsSync(cachePath)) return readFileSync(cachePath, "utf8");

  const wav = `${cacheDir}/gt_${key}.wav`;
  extractWavFile(audio, offset, dur, wav);
  const r = spawnSync("sh", [
    "-c",
    `cat "${wav}" | OTOJI_PARTIAL_MS=0 RUST_LOG=warn otoji listen - --plain --provider sensevoice`,
  ], { maxBuffer: 1024 * 1024 * 16 });
  if (r.status !== 0) {
    console.error("ground truth gen failed:", r.stderr.toString());
    return "";
  }
  let text = "";
  for (const line of r.stdout.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.type === "final") text += (text ? " " : "") + (ev.text ?? "");
    } catch {}
  }
  writeFileSync(cachePath, text);
  return text;
}

function precomputeGroundTruth(audio: string, plays: Omit<Play, "expectedText">[], cacheDir: string): Play[] {
  mkdirSync(cacheDir, { recursive: true });
  const out: Play[] = [];
  process.stderr.write(`pre-computing ground truth for ${plays.length} plays…\n`);
  for (const p of plays) {
    const t0 = Date.now();
    const expectedText = groundTruthFor(audio, p.offset, p.dur, cacheDir);
    const dt = Date.now() - t0;
    process.stderr.write(`  [${p.index + 1}/${plays.length}] t${p.offset.toFixed(1)}+${p.dur.toFixed(1)}s → ${expectedText.length} chars (${dt}ms)\n`);
    out.push({ ...p, expectedText });
  }
  return out;
}

// ───────────────────────── single QA run ─────────────────────────

async function runOnce(args: Args, cfg: Config, plays: Play[], runDir: string): Promise<RunSummary> {
  mkdirSync(runDir, { recursive: true });
  const liveLog = `${runDir}/live.ndjson`;
  const playsLog = `${runDir}/plays.tsv`;
  const stderrLog = `${runDir}/listen.stderr.log`;
  const summaryPath = `${runDir}/summary.json`;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    RUST_LOG: process.env.RUST_LOG ?? "warn",
    OTOJI_PARTIAL_MS: String(cfg.partialMs),
  };
  if (cfg.vadSilenceMs !== undefined) env.OTOJI_VAD_SILENCE_MS = String(cfg.vadSilenceMs);
  if (cfg.vadMaxMs !== undefined) env.OTOJI_VAD_MAX_MS = String(cfg.vadMaxMs);

  const listenArgs = args.mode === "stdin"
    ? ["listen", "-", "--plain", "--provider", cfg.provider]
    : ["listen", "--plain", "--provider", cfg.provider];

  const listenOut = createWriteStream(liveLog);
  const listenErr = createWriteStream(stderrLog);
  const listen = spawn("otoji", listenArgs, {
    stdio: [args.mode === "stdin" ? "pipe" : "ignore", "pipe", "pipe"],
    env,
  }) as ChildProcessByStdio<Writable | null, Readable, Readable>;

  const finals: FinalEvent[] = [];
  let lineBuf = "";
  listen.stdout.on("data", (chunk: Buffer) => {
    listenOut.write(chunk);
    lineBuf += chunk.toString("utf8");
    let nl: number;
    while ((nl = lineBuf.indexOf("\n")) !== -1) {
      const line = lineBuf.slice(0, nl);
      lineBuf = lineBuf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.type === "final") {
          finals.push({ seg_id: ev.seg_id, text: ev.text ?? "", receivedAt: Date.now() });
        }
      } catch {}
    }
  });
  listen.stderr.on("data", (c) => listenErr.write(c));

  await new Promise((r) => setTimeout(r, 1500));

  const playsOut = createWriteStream(playsLog);
  playsOut.write("idx\tepoch_start\tepoch_end\toffset_s\tdur_s\tgap_s\n");

  const startedAt = Date.now();
  let bytesWritten = 0;
  const playEnds: number[] = [];

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    try {
      if (args.mode === "stdin" && listen.stdin && !listen.stdin.destroyed) listen.stdin.end();
      else listen.kill("SIGINT");
    } catch {}
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  if (args.mode === "stdin" && listen.stdin) {
    // Build a proper WAV via ffmpeg concat demuxer. Previous approaches
    // (streaming header, raw PCM extraction) had subtle hound/ffmpeg issues
    // that dropped ~50% of utterances. The concat approach produces a
    // byte-identical stream to what `cat file.wav | otoji listen -` sees.
    const tmpDir = `${runDir}/tmp`;
    mkdirSync(tmpDir, { recursive: true });

    // 2.5s silence preroll for VAD calibration.
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-t", "2.5", "-i", "anullsrc=r=16000:cl=mono", "-sample_fmt", "s16", "-ar", "16000", "-ac", "1", `${tmpDir}/preroll.wav`]);
    const fileList = [`file '${tmpDir}/preroll.wav'`];

    for (const p of plays) {
      extractWavFile(args.audio, p.offset, p.dur, `${tmpDir}/play_${p.index}.wav`);
      spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-t", p.gapAfter.toFixed(3), "-i", "anullsrc=r=16000:cl=mono", "-sample_fmt", "s16", "-ar", "16000", "-ac", "1", `${tmpDir}/gap_${p.index}.wav`]);
      fileList.push(`file '${tmpDir}/play_${p.index}.wav'`);
      fileList.push(`file '${tmpDir}/gap_${p.index}.wav'`);

      const playStart = Date.now();
      playEnds.push(playStart);
      playsOut.write(`${p.index}\t${playStart}\t${playStart}\t${p.offset.toFixed(3)}\t${p.dur.toFixed(3)}\t${p.gapAfter.toFixed(3)}\n`);
    }

    const concatList = `${tmpDir}/filelist.txt`;
    writeFileSync(concatList, fileList.join("\n") + "\n");
    const wavPath = `${tmpDir}/concat.wav`;
    spawnSync("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", concatList, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", wavPath]);

    const wav = readFileSync(wavPath);
    bytesWritten = wav.length - 44; // approximate PCM size
    const audioDur = bytesWritten / 32000;
    process.stderr.write(`concat WAV: ${audioDur.toFixed(1)}s (${wav.length} bytes), writing to stdin (realtime paced)…\n`);
    // Real-time paced write: the sliding-window architecture does
    // continuous decoding and needs audio to arrive at ~1x speed.
    // Burst-dumping all audio floods the decode loop with O(n²) work.
    await pacedWrite(listen.stdin!, wav, 40);
    listen.stdin!.end();
  } else {
    for (const p of plays) {
      if (stopping) break;
      const playStart = Date.now();
      const segPath = `${runDir}/seg-${String(p.index).padStart(4, "0")}.wav`;
      extractWavFile(args.audio, p.offset, p.dur, segPath);
      await new Promise<void>((res) => {
        const ap = spawn("afplay", [segPath], { stdio: "ignore" });
        ap.on("exit", () => res());
      });
      const playEnd = Date.now();
      playEnds.push(playEnd);
      playsOut.write(`${p.index}\t${playStart}\t${playEnd}\t${p.offset.toFixed(3)}\t${p.dur.toFixed(3)}\t${p.gapAfter.toFixed(3)}\n`);
      if (stopping) break;
      await new Promise((r) => setTimeout(r, p.gapAfter * 1000));
    }
  }

  // Drain — wait for the listen process to flush its backlog and exit.
  if (!stopping) stop();
  process.stderr.write("draining…\n");
  const drainStart = Date.now();
  let lastFinalCount = finals.length;
  let lastChange = Date.now();
  while (Date.now() - drainStart < 300_000) {
    await new Promise((r) => setTimeout(r, 1000));
    if (listen.exitCode !== null) break;
    if (finals.length !== lastFinalCount) {
      lastFinalCount = finals.length;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange > 60_000) break;
  }
  playsOut.end();
  listenOut.end();
  listenErr.end();

  const wallTime = (Date.now() - startedAt) / 1000;

  // Match each play to the best-overlapping final emitted after the play
  // ended. Many-to-one allowed: when adjacent plays draw from overlapping
  // source audio, the recognizer correctly emits one merged Final and both
  // plays should credit it. Threshold 0.2 (vs 0.3) to be more permissive
  // since merged finals dilute per-play accuracy.
  const results: PlayResult[] = plays.map((p) => ({ play: p }));
  const matched = new Set<number>();
  for (let i = 0; i < plays.length; i++) {
    const playEnd = playEnds[i];
    if (playEnd === undefined) continue;
    let best: { idx: number; acc: number } | undefined;
    for (let j = 0; j < finals.length; j++) {
      const f = finals[j];
      if (f.receivedAt < playEnd - 500) continue;
      const acc = accuracy(f.text, plays[i].expectedText);
      // Threshold 0.5 — require a strong content match. Spurious LCS hits
      // on Japanese kana between unrelated text typically score 0.2-0.4.
      if (acc > 0.5 && (!best || acc > best.acc)) best = { idx: j, acc };
      const nextEnd = playEnds[i + 1];
      if (nextEnd !== undefined && f.receivedAt > nextEnd + 30_000) break;
    }
    if (best) {
      matched.add(best.idx);
      const f = finals[best.idx];
      results[i].matchedFinal = f;
      results[i].ttfbMs = f.receivedAt - playEnd;
      results[i].accuracy = best.acc;
    } else {
      results[i].accuracy = 0;
    }
  }

  const captured = results.filter((r) => r.matchedFinal).length;
  const ttfbs = results.filter((r) => r.ttfbMs !== undefined).map((r) => r.ttfbMs!);
  const accs = results.map((r) => r.accuracy ?? 0);
  const meanTtfb = ttfbs.length ? ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length : 0;
  const sortedTtfb = [...ttfbs].sort((a, b) => a - b);
  const p95Ttfb = sortedTtfb.length ? sortedTtfb[Math.min(sortedTtfb.length - 1, Math.floor(sortedTtfb.length * 0.95))] : 0;
  const meanAcc = accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : 0;
  const audioSent = bytesWritten / 32000;

  const summary: RunSummary = {
    config: cfg,
    totalPlays: plays.length,
    capturedPlays: captured,
    captureRate: captured / plays.length,
    meanTtfbMs: meanTtfb,
    p95TtfbMs: p95Ttfb,
    meanAccuracy: meanAcc,
    audioSent,
    wallTime,
    rtf: audioSent / wallTime,
    finalsCount: finals.length,
    unmatchedFinals: finals.length - matched.size,
    results,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  return summary;
}

// ───────────────────── pretty printing ─────────────────────

function fmtPct(x: number): string { return (x * 100).toFixed(1) + "%"; }
function fmtMs(x: number): string { return Math.round(x).toString().padStart(5) + "ms"; }
function fmtSec(x: number): string { return x.toFixed(1) + "s"; }

function printPerPlayTable(s: RunSummary) {
  console.log("\n  idx | offs+dur     | ttfb    | acc    | matched final → expected");
  console.log("  ----+--------------+---------+--------+----------------------------------------");
  for (const r of s.results) {
    const head = `   ${String(r.play.index).padStart(2)} | t${r.play.offset.toFixed(1)}+${r.play.dur.toFixed(1)}s`.padEnd(20);
    const ttfb = r.ttfbMs !== undefined ? fmtMs(r.ttfbMs) : "    -  ";
    const acc = r.accuracy !== undefined ? fmtPct(r.accuracy).padStart(6) : "   -  ";
    const got = (r.matchedFinal?.text ?? "(missed)").slice(0, 35);
    const exp = r.play.expectedText.slice(0, 35);
    console.log(`  ${head} | ${ttfb} | ${acc} | ${got}\n  ${" ".repeat(40)}exp: ${exp}`);
  }
}

function printSummaryLine(s: RunSummary) {
  console.log(
    `[${s.config.name}] capture=${fmtPct(s.captureRate)} acc=${fmtPct(s.meanAccuracy)} ` +
    `ttfb_mean=${fmtMs(s.meanTtfbMs)} ttfb_p95=${fmtMs(s.p95TtfbMs)} ` +
    `rtf=${s.rtf.toFixed(2)}x wall=${fmtSec(s.wallTime)} finals=${s.finalsCount} (unmatched=${s.unmatchedFinals})`,
  );
}

function printMatrixTable(rows: RunSummary[]) {
  console.log("\n=== matrix summary ===");
  console.log("config                       | capture | acc    | ttfb_mean | ttfb_p95 | rtf   | finals(unm) | wall");
  console.log("-----------------------------+---------+--------+-----------+----------+-------+-------------+--------");
  for (const s of rows) {
    const name = s.config.name.padEnd(28);
    console.log(
      `${name} | ${fmtPct(s.captureRate).padStart(7)} | ${fmtPct(s.meanAccuracy).padStart(6)} | ${fmtMs(s.meanTtfbMs).padStart(9)} | ${fmtMs(s.p95TtfbMs).padStart(8)} | ${s.rtf.toFixed(2).padStart(4)}x | ${String(s.finalsCount).padStart(5)}(${String(s.unmatchedFinals).padStart(2)}) | ${fmtSec(s.wallTime).padStart(6)}`,
    );
  }
}

// ───────────────────────── main ─────────────────────────

const DEFAULT_MATRIX: Config[] = [
  { name: "sv:default",          provider: "sensevoice", partialMs: 0 },
  { name: "sv:s=500",            provider: "sensevoice", partialMs: 0, vadSilenceMs: 500 },
  { name: "sv:s=750",            provider: "sensevoice", partialMs: 0, vadSilenceMs: 750 },
  { name: "sv:s=500,m=8000",     provider: "sensevoice", partialMs: 0, vadSilenceMs: 500, vadMaxMs: 8000 },
  { name: "sv:s=750,m=10000",    provider: "sensevoice", partialMs: 0, vadSilenceMs: 750, vadMaxMs: 10000 },
  { name: "sv:m=8000",           provider: "sensevoice", partialMs: 0, vadMaxMs: 8000 },
  { name: "sv:partial=300_old",  provider: "sensevoice", partialMs: 300 },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureCmd("otoji");
  ensureCmd("ffmpeg");
  ensureCmd("ffprobe");
  if (args.mode === "speaker") ensureCmd("afplay");

  const audioPath = resolve(args.audio);
  if (!existsSync(audioPath)) { console.error(`audio not found: ${audioPath}`); process.exit(1); }
  const totalDur = ffprobeDuration(audioPath);

  const sessionId = ts();
  const sessionDir = resolve(`${args.outDir}/${sessionId}`);
  mkdirSync(sessionDir, { recursive: true });
  console.log(`session dir: ${sessionDir}`);
  console.log(`source:      ${audioPath} (${totalDur.toFixed(1)}s)`);
  console.log(`mode:        ${args.mode}`);
  console.log(`plays:       ${args.plays} (seed=${args.seed})`);

  const seq = buildPlaySequence(args, totalDur);
  const cacheKey = `${args.audio.replace(/[^a-zA-Z0-9]/g, "_")}_seed${args.seed}_n${args.plays}_d${args.minDur}-${args.maxDur}_g${args.minGap}-${args.maxGap}`;
  const cacheDir = resolve(`${args.cacheDir}/${cacheKey}`);
  const plays = precomputeGroundTruth(audioPath, seq, cacheDir);

  const configs: Config[] = args.matrix
    ? DEFAULT_MATRIX
    : [{
        name: `sv:partial=${args.partialMs}`,
        provider: args.provider,
        partialMs: args.partialMs,
        vadSilenceMs: args.vadSilenceMs,
        vadMaxMs: args.vadMaxMs,
      }];

  const rows: RunSummary[] = [];
  for (const cfg of configs) {
    console.log(`\n──── running [${cfg.name}] ────`);
    const runDir = `${sessionDir}/${cfg.name.replace(/[^a-zA-Z0-9_=-]/g, "_")}`;
    const s = await runOnce(args, cfg, plays, runDir);
    printPerPlayTable(s);
    printSummaryLine(s);
    rows.push(s);
  }

  if (rows.length > 1) printMatrixTable(rows);

  writeFileSync(`${sessionDir}/matrix.json`, JSON.stringify(rows.map((r) => ({
    ...r, results: undefined,
  })), null, 2));
  console.log(`\nsession dir: ${sessionDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
