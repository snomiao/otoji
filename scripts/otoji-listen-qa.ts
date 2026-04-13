#!/usr/bin/env bun
// otoji listen QA — streaming-architecture quality benchmark.
//
// Pipes a full WAV through `otoji listen --plain`, captures every event with
// wall-clock timestamps, and scores the resulting Finals against a canonical
// ground-truth transcript using LCS-based coverage/precision/F1.
//
// Workflow:
//   1. Pre-flight: ensure ground truth exists (regenerate via burst-decode if
//      missing). Cached to `<audio>.sensevoice.txt`.
//   2. Spawn `otoji listen --plain`, write the WAV to stdin, collect events
//      with receivedAt timestamps.
//   3. Concat all Final texts, normalize (strip whitespace + punctuation),
//      compute LCS vs the GT.
//   4. Emit a row of metrics per (audio, config) combination.
//
// Metrics:
//   coverage = LCS(finals, GT) / |GT|         (recall — % of GT captured)
//   precision = LCS(finals, GT) / |finals|    (% of finals that match GT)
//   F1 = harmonic mean of coverage & precision
//   dup_ratio = 1 - unique_chars / total_chars     (final-to-final overlap)
//   first_partial_ms = wall ms to first Partial
//   first_final_ms = wall ms to first Final
//   rtf = audio_seconds / wall_seconds
//
// Usage:
//   bun scripts/otoji-listen-qa.ts                              # default audio + config
//   bun scripts/otoji-listen-qa.ts --audio test-audio/easy-ja.wav
//   bun scripts/otoji-listen-qa.ts --matrix                     # full sweep
//   bun scripts/otoji-listen-qa.ts --matrix --out target/qa.json

import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from "node:fs";
import { resolve, basename } from "node:path";
import type { Writable, Readable } from "node:stream";

// ─────────────── types ───────────────

type Env = Record<string, string>;

type Config = {
  name: string;
  env: Env;
};

type EventRow = {
  type: "open" | "partial" | "final" | "status" | "closed" | "error";
  seg_id?: number;
  text?: string;
  message?: string;
  receivedAt: number;
};

type Result = {
  audio: string;
  audioDur: number;
  config: string;
  gtSource: string;
  paced: boolean;
  wallMs: number;
  rtf: number;
  partialCount: number;
  finalCount: number;
  firstPartialMs: number | null;
  firstFinalMs: number | null;
  totalFinalChars: number;
  uniqueFinalChars: number;
  dupRatio: number;
  coverage: number;
  precision: number;
  f1: number;
  finals: string[];
};

// ─────────────── utilities ───────────────

function ensureCmd(cmd: string) {
  if (spawnSync("which", [cmd]).status !== 0) {
    console.error(`missing required command: ${cmd}`);
    process.exit(1);
  }
}

function ffprobeDuration(path: string): number {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]);
  return Number(r.stdout.toString().trim());
}

function normalize(text: string): string {
  return text.replace(/[\s\u3000。、，．？！\?\!\.,]/g, "");
}

function lcsLen(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let curr = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(curr[j - 1], prev[j]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[b.length];
}

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

function fmtMs(x: number | null): string {
  return x === null ? "  -  " : Math.round(x).toString().padStart(5);
}

// Build a proper WAV header (correct data size).
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

// Convert any audio file to canonical 16k mono s16 WAV bytes via ffmpeg.
function loadAsWav(path: string): Buffer {
  const r = spawnSync("ffmpeg", [
    "-v", "error", "-i", path,
    "-ar", "16000", "-ac", "1", "-f", "s16le", "-",
  ], { maxBuffer: 1024 * 1024 * 256 });
  if (r.status !== 0) throw new Error("ffmpeg conversion failed: " + r.stderr.toString());
  const pcm = r.stdout;
  return Buffer.concat([wavHeader(pcm.length), pcm]);
}

// ─────────────── ground truth ───────────────

// Ground-truth resolution order (most → least preferred):
//   1. <audio>.gt.txt       — hand-written or TTS source text (best)
//   2. <audio>.gemini.txt   — Gemini transcript (independent model)
//   3. <audio>.whisper.txt  — Whisper transcript (independent model)
//   4. <audio>.sensevoice.txt — last resort (circular: same model)
// Generate the last one via SenseVoice burst decode if nothing exists.
function findGroundTruth(audio: string): { path: string; source: string } | null {
  const base = audio.replace(/\.[^.]+$/, "");
  const candidates = [
    { suffix: ".gt.txt",         source: "manual" },
    { suffix: ".gemini.txt",     source: "gemini" },
    { suffix: ".whisper.txt",    source: "whisper" },
    { suffix: ".sensevoice.txt", source: "sensevoice" },
  ];
  for (const c of candidates) {
    const p = base + c.suffix;
    if (existsSync(p)) return { path: p, source: c.source };
  }
  return null;
}

function ensureGroundTruth(audio: string): { text: string; source: string } {
  const found = findGroundTruth(audio);
  if (found) {
    return { text: readFileSync(found.path, "utf8").trim(), source: found.source };
  }
  const gtPath = audio.replace(/\.[^.]+$/, "") + ".sensevoice.txt";
  process.stderr.write(`generating ground truth for ${audio} (no existing GT found)…\n`);
  const wav = loadAsWav(audio);
  const r = spawnSync("otoji", ["listen", "-", "--plain", "--provider", "sensevoice"], {
    input: wav,
    env: { ...process.env, OTOJI_PARTIAL_MS: "0", RUST_LOG: "warn" },
    maxBuffer: 1024 * 1024 * 64,
  });
  let gt = "";
  for (const line of r.stdout.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      if (ev.type === "final") gt += (gt ? " " : "") + (ev.text ?? "");
    } catch { /* skip */ }
  }
  writeFileSync(gtPath, gt);
  return { text: gt, source: "sensevoice (generated)" };
}

// ─────────────── single QA run ───────────────

async function runOnce(
  audio: string,
  cfg: Config,
  gt: string,
  gtSource: string,
  paced: boolean,
  runDir: string,
): Promise<Result> {
  const wav = loadAsWav(audio);
  const audioDur = wav.length / 32000;

  const env: Env = {
    ...process.env as Env,
    RUST_LOG: process.env.RUST_LOG ?? "warn",
    ...cfg.env,
  };

  mkdirSync(runDir, { recursive: true });
  const ndjsonOut = createWriteStream(`${runDir}/events.ndjson`);

  const startedAt = Date.now();
  const events: EventRow[] = [];
  const child = spawn("otoji", ["listen", "-", "--plain", "--provider", "sensevoice"], {
    stdio: ["pipe", "pipe", "pipe"],
    env,
  }) as ChildProcessByStdio<Writable, Readable, Readable>;

  let lineBuf = "";
  child.stdout.on("data", (chunk: Buffer) => {
    ndjsonOut.write(chunk);
    lineBuf += chunk.toString("utf8");
    let nl: number;
    while ((nl = lineBuf.indexOf("\n")) !== -1) {
      const line = lineBuf.slice(0, nl);
      lineBuf = lineBuf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        ev.receivedAt = Date.now();
        events.push(ev as EventRow);
      } catch { /* not json */ }
    }
  });

  if (paced) {
    // Realtime-paced write: WAV header first, then 40ms PCM chunks at 40ms
    // intervals. Simulates mic input so RTF and TTFB metrics are accurate.
    child.stdin.write(wav.subarray(0, 44)); // header
    const FRAME_MS = 40;
    const FRAME_BYTES = 16000 * 2 * FRAME_MS / 1000; // 1280 bytes
    for (let i = 44; i < wav.length; i += FRAME_BYTES) {
      const chunk = wav.subarray(i, Math.min(i + FRAME_BYTES, wav.length));
      if (!child.stdin.write(chunk)) {
        await new Promise<void>((r) => child.stdin.once("drain", () => r()));
      }
      await new Promise((r) => setTimeout(r, FRAME_MS));
    }
    child.stdin.end();
  } else {
    child.stdin.write(wav);
    child.stdin.end();
  }

  await new Promise<void>((res) => child.on("exit", () => res()));
  const wallMs = Date.now() - startedAt;
  ndjsonOut.end();

  const partials = events.filter((e) => e.type === "partial");
  const finals = events.filter((e) => e.type === "final");
  const finalTexts = finals.map((f) => f.text ?? "");
  const finalConcat = finalTexts.join(" ");
  const finalNorm = normalize(finalConcat);
  const gtNorm = normalize(gt);

  const lcs = lcsLen(finalNorm, gtNorm);
  const coverage = gtNorm.length > 0 ? lcs / gtNorm.length : 0;
  const precision = finalNorm.length > 0 ? lcs / finalNorm.length : 0;
  const f1 = coverage + precision > 0 ? (2 * coverage * precision) / (coverage + precision) : 0;

  // dup_ratio: fraction of final chars that overlap with previously committed sentences
  const seenChars = new Set<string>();
  let totalFinalChars = 0;
  let dupChars = 0;
  for (const text of finalTexts) {
    for (const c of normalize(text)) {
      totalFinalChars++;
      if (seenChars.has(c)) dupChars++;
      seenChars.add(c);
    }
  }
  // Per-sentence dup: how many sentences are mostly contained in earlier ones
  const sentenceNorms = finalTexts.map(normalize);
  let dupSentences = 0;
  for (let i = 1; i < sentenceNorms.length; i++) {
    const cur = sentenceNorms[i];
    if (!cur) continue;
    for (let j = 0; j < i; j++) {
      const prev = sentenceNorms[j];
      if (!prev) continue;
      const short = cur.length < prev.length ? cur : prev;
      const long = cur.length < prev.length ? prev : cur;
      if (short.length > 0 && long.includes(short)) {
        dupSentences++;
        break;
      }
    }
  }
  const dupRatio = sentenceNorms.length > 0 ? dupSentences / sentenceNorms.length : 0;

  return {
    audio: basename(audio),
    audioDur,
    config: cfg.name,
    gtSource,
    paced,
    wallMs,
    rtf: (audioDur * 1000) / wallMs,
    partialCount: partials.length,
    finalCount: finals.length,
    firstPartialMs: partials[0] ? partials[0].receivedAt - startedAt : null,
    firstFinalMs: finals[0] ? finals[0].receivedAt - startedAt : null,
    totalFinalChars,
    uniqueFinalChars: seenChars.size,
    dupRatio,
    coverage,
    precision,
    f1,
    finals: finalTexts,
  };
}

// ─────────────── matrix ───────────────

const DEFAULT_AUDIOS = [
  "test-audio/yuyu-ja-3m.wav",
  "test-audio/easy-ja.wav",
  "test-audio/park-ja.wav",
];

const DEFAULT_CONFIGS: Config[] = [
  { name: "default",     env: {} },
  { name: "max=15s",     env: { OTOJI_VAD_MAX_MS: "15000" } },
  { name: "max=60s",     env: { OTOJI_VAD_MAX_MS: "60000" } },
  { name: "silence=500", env: { OTOJI_VAD_SILENCE_MS: "500" } },
  { name: "silence=1500",env: { OTOJI_VAD_SILENCE_MS: "1500" } },
  { name: "threads=2",   env: { OTOJI_NUM_THREADS: "2" } },
  { name: "threads=8",   env: { OTOJI_NUM_THREADS: "8" } },
];

function printRowHeader() {
  console.log("audio           | config       | cov   | prec  | F1    | dup   | finals | partials | TTF-P | TTF-F | RTF   | wall");
  console.log("----------------+--------------+-------+-------+-------+-------+--------+----------+-------+-------+-------+------");
}

function printRow(r: Result) {
  console.log(
    [
      basename(r.audio).padEnd(15),
      r.config.padEnd(12),
      fmtPct(r.coverage).padStart(5),
      fmtPct(r.precision).padStart(5),
      fmtPct(r.f1).padStart(5),
      fmtPct(r.dupRatio).padStart(5),
      String(r.finalCount).padStart(6),
      String(r.partialCount).padStart(8),
      fmtMs(r.firstPartialMs).padStart(5),
      fmtMs(r.firstFinalMs).padStart(5),
      r.rtf.toFixed(2).padStart(4) + "x",
      (r.wallMs / 1000).toFixed(1) + "s",
    ].join(" | ")
  );
}

// ─────────────── main ───────────────

type Args = {
  audio: string | null;
  matrix: boolean;
  audios: string[];
  configs: Config[];
  outDir: string;
  outJson: string | null;
  paced: boolean;
  baseline: string;
  saveBaseline: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    audio: null,
    matrix: false,
    audios: DEFAULT_AUDIOS,
    configs: [{ name: "default", env: {} }],
    outDir: `target/otoji-listen-qa/${new Date().toISOString().replace(/[:.]/g, "-")}`,
    outJson: null,
    paced: false, // burst mode by default (faster for dev loop)
    baseline: "target/otoji-listen-qa/baseline.json",
    saveBaseline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case "--audio": a.audio = v; a.audios = [v]; i++; break;
      case "--matrix": a.matrix = true; a.configs = DEFAULT_CONFIGS; break;
      case "--out-dir": a.outDir = v; i++; break;
      case "--out": a.outJson = v; i++; break;
      case "--paced": a.paced = true; break;
      case "--burst": a.paced = false; break;
      case "--baseline": a.baseline = v; i++; break;
      case "--save-baseline": a.saveBaseline = true; break;
      case "-h": case "--help":
        console.log("Usage: bun scripts/otoji-listen-qa.ts [opts]\n" +
          "  --audio path.wav        single audio (default: matrix audios)\n" +
          "  --matrix                run all default configs\n" +
          "  --paced / --burst       realtime pacing vs instant dump (default: burst)\n" +
          "  --baseline FILE         baseline JSON path (default: ./baseline.json)\n" +
          "  --save-baseline         update baseline after this run\n" +
          "  --out-dir DIR / --out summary.json");
        process.exit(0);
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureCmd("otoji");
  ensureCmd("ffmpeg");
  ensureCmd("ffprobe");

  mkdirSync(args.outDir, { recursive: true });
  console.log(`session: ${args.outDir}`);
  console.log(`audios:  ${args.audios.length}, configs: ${args.configs.length}, mode: ${args.paced ? "paced (realtime)" : "burst"}`);
  console.log("");

  // Pre-flight: ensure GT for each audio.
  const gts = new Map<string, { text: string; source: string }>();
  for (const audio of args.audios) {
    const gt = ensureGroundTruth(resolve(audio));
    gts.set(audio, gt);
    console.log(`  GT ${basename(audio)}: ${normalize(gt.text).length} chars (source: ${gt.source})`);
  }
  console.log("");

  printRowHeader();
  const results: Result[] = [];
  for (const audio of args.audios) {
    for (const cfg of args.configs) {
      const runDir = `${args.outDir}/${basename(audio).replace(/\.[^.]+$/, "")}_${cfg.name.replace(/[^a-zA-Z0-9_=-]/g, "_")}`;
      const gt = gts.get(audio)!;
      const r = await runOnce(resolve(audio), cfg, gt.text, gt.source, args.paced, runDir);
      results.push(r);
      printRow(r);
    }
  }
  console.log("");

  const summaryPath = args.outJson ?? `${args.outDir}/summary.json`;
  const summary = results.map((r) => ({ ...r, finals: undefined }));
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`summary: ${summaryPath}`);

  // Aggregate by config.
  if (args.configs.length > 1) {
    console.log("");
    console.log("=== mean by config ===");
    console.log("config       | cov   | prec  | F1    | dup   | RTF");
    console.log("-------------+-------+-------+-------+-------+------");
    for (const cfg of args.configs) {
      const rows = results.filter((r) => r.config === cfg.name);
      const mean = (sel: (r: Result) => number) =>
        rows.reduce((a, r) => a + sel(r), 0) / rows.length;
      console.log(
        [
          cfg.name.padEnd(12),
          fmtPct(mean((r) => r.coverage)).padStart(5),
          fmtPct(mean((r) => r.precision)).padStart(5),
          fmtPct(mean((r) => r.f1)).padStart(5),
          fmtPct(mean((r) => r.dupRatio)).padStart(5),
          mean((r) => r.rtf).toFixed(2) + "x",
        ].join(" | ")
      );
    }
  }

  // ─── Regression comparison ───
  const baselineKey = (r: { audio: string; config: string; paced: boolean }) =>
    `${r.audio}|${r.config}|${r.paced ? "paced" : "burst"}`;

  if (existsSync(args.baseline) && !args.saveBaseline) {
    try {
      const baseline: Result[] = JSON.parse(readFileSync(args.baseline, "utf8"));
      const baselineMap = new Map(baseline.map((r) => [baselineKey(r), r]));
      console.log("");
      console.log("=== baseline comparison ===");
      console.log("audio/config             |  F1   (Δ)    | RTF   (Δ)");
      console.log("-------------------------+--------------+---------------");
      let regressed = 0;
      for (const r of results) {
        const b = baselineMap.get(baselineKey(r));
        const key = basename(r.audio) + "/" + r.config;
        if (!b) {
          console.log(`${key.padEnd(24)} | ${fmtPct(r.f1).padStart(5)} (new)        | ${r.rtf.toFixed(2)}x (new)`);
          continue;
        }
        const f1Delta = (r.f1 - b.f1) * 100;
        const rtfDelta = r.rtf - b.rtf;
        const f1Mark = f1Delta < -5 ? "⚠" : f1Delta > 5 ? "✓" : " ";
        const rtfMark = rtfDelta < -0.5 ? "⚠" : rtfDelta > 0.5 ? "✓" : " ";
        if (f1Delta < -5 || rtfDelta < -0.5) regressed++;
        console.log(
          `${key.padEnd(24)} | ` +
          `${fmtPct(r.f1).padStart(5)} (${f1Delta >= 0 ? "+" : ""}${f1Delta.toFixed(1)}pt)${f1Mark} | ` +
          `${r.rtf.toFixed(2)}x (${rtfDelta >= 0 ? "+" : ""}${rtfDelta.toFixed(2)})${rtfMark}`
        );
      }
      if (regressed > 0) {
        console.log(`\n⚠ ${regressed} regression(s) detected (F1 drop >5pt or RTF drop >0.5x)`);
      } else {
        console.log(`\n✓ no regressions`);
      }
    } catch (e) {
      console.warn(`baseline comparison failed: ${e}`);
    }
  }

  if (args.saveBaseline || !existsSync(args.baseline)) {
    mkdirSync(resolve(args.baseline, ".."), { recursive: true });
    writeFileSync(args.baseline, JSON.stringify(summary, null, 2));
    console.log(`\nbaseline saved: ${args.baseline}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
