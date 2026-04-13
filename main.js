// @otoji/core entry — wraps the napi-rs native binding with a portable
// fallback so `npm install @otoji/core` works on every platform.
//
// High-level API:
//   transcribe(path | Buffer | Float32Array) → { text, segments }
//   listen({ onPartial, onFinal })           → ListenSession
//
// Low-level (re-exported from napi-rs):
//   transcribePcm({ modelDir, samples, language })
//   polishText({ apiKey, model, raw, prev })

"use strict";

const { readFileSync } = require("fs");
const { join } = require("path");
const { homedir } = require("os");

// ─── Native binding resolution ───

let native = null;
let _nativeLoadError = null;
try {
  native = require("./index.js");
} catch (e) {
  _nativeLoadError = e;
}

const SUPPORTED = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64-gnu",
  "win32-x64-msvc",
];

// ─── Helpers ───

function defaultModelDir() {
  const cache =
    process.env.OTOJI_CACHE_DIR ||
    process.env.OTOJI_SENSEVOICE_DIR ||
    join(homedir(), ".cache", "otoji", "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17");
  return cache;
}

/** Parse a 16-bit mono PCM WAV buffer into Float32Array samples at 16kHz. */
function parseWav(buf) {
  if (buf.length < 44) throw new Error("WAV too short");
  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") throw new Error("not a WAV file (no RIFF tag)");
  const fmt = buf.toString("ascii", 12, 16);
  if (fmt !== "fmt ") throw new Error("not a WAV file (no fmt chunk)");

  const audioFormat = buf.readUInt16LE(20);
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  if (audioFormat !== 1) throw new Error(`unsupported audio format ${audioFormat} (need PCM=1)`);

  // Find data chunk
  let offset = 12;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      offset += 8;
      break;
    }
    offset += 8 + chunkSize;
  }

  const dataBytes = buf.subarray(offset);
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(dataBytes.length / (bytesPerSample * channels));

  // Convert to mono f32
  const mono = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const pos = (i * channels + ch) * bytesPerSample;
      if (bitsPerSample === 16) {
        sum += dataBytes.readInt16LE(pos) / 32768;
      } else if (bitsPerSample === 32) {
        sum += dataBytes.readFloatLE(pos);
      } else {
        throw new Error(`unsupported bits_per_sample: ${bitsPerSample}`);
      }
    }
    mono[i] = sum / channels;
  }

  // Resample to 16kHz if needed
  if (sampleRate === 16000) return mono;
  const ratio = 16000 / sampleRate;
  const outLen = Math.floor(mono.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const t = src - i0;
    out[i] = mono[i0] * (1 - t) + mono[i1] * t;
  }
  return out;
}

const SENTENCE_ENDS = /[。！？.!?]/;

function splitSentences(text) {
  const ends = /[。！？.!?]/g;
  const sentences = [];
  let last = 0;
  let m;
  while ((m = ends.exec(text)) !== null) {
    sentences.push(text.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  return { sentences, trailing: text.slice(last).trim() };
}

function normalize(s) {
  return s.replace(/[\s\u3000。、，．？！?.!,]/g, "");
}

// ─── polishText fallback ───

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

async function polishTextFallback(opts) {
  if (!opts || !opts.apiKey) throw new TypeError("polishText: opts.apiKey is required");
  if (typeof opts.raw !== "string") throw new TypeError("polishText: opts.raw must be a string");
  if (typeof fetch !== "function") {
    throw new Error("@otoji/core JS fallback needs global `fetch` (Node 18+ / Bun / Deno)");
  }
  const model = opts.model || "claude-haiku-4-5-20251001";
  const prev = opts.prev || "(none)";
  const system =
    "You tidy ASR transcripts.\n" +
    "- Preserve meaning. Do not summarize.\n" +
    "- Add punctuation, drop fillers (uh/um/那个/えーと).\n" +
    "- Normalize numbers, dates, units.\n" +
    "- Keep code-switched text (zh/en/ja) as-is.\n" +
    `- Previous sentence: ${prev}\n` +
    "Output only the tidied sentence.";
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 512, system, messages: [{ role: "user", content: opts.raw }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.content.map((b) => b.text || "").join("").trim();
}

function transcribePcmFallback() {
  const platform = `${process.platform}-${process.arch}`;
  const reason = _nativeLoadError ? ` (${_nativeLoadError.message})` : "";
  throw new Error(
    `@otoji/core: transcribePcm requires the native binding, not available for ${platform}${reason}. ` +
    `Supported: ${SUPPORTED.join(", ")}. polishText still works via JS fallback.`
  );
}

// ─── High-level: transcribe() ───

async function transcribe(input, opts) {
  const modelDir = (opts && opts.modelDir) || defaultModelDir();
  const language = (opts && opts.language) || "auto";
  const doTranscribe = module.exports.transcribePcm;

  let samples;
  if (input instanceof Float32Array) {
    samples = input;
  } else {
    const buf = typeof input === "string" ? readFileSync(input) : Buffer.from(input);
    samples = parseWav(buf);
  }

  const text = await doTranscribe({ modelDir, samples, language });
  // Split into segments by sentence-ending punctuation.
  const { sentences } = splitSentences(text);
  return {
    text,
    segments: sentences.length > 0
      ? sentences.map((s) => ({ text: s }))
      : [{ text }],
  };
}

// ─── High-level: listen() ───

function listen(opts) {
  const modelDir = (opts && opts.modelDir) || defaultModelDir();
  const language = (opts && opts.language) || "auto";
  const onPartial = (opts && opts.onPartial) || (() => {});
  const onFinal = (opts && opts.onFinal) || (() => {});
  const onOpen = (opts && opts.onOpen) || (() => {});
  const onClosed = (opts && opts.onClosed) || (() => {});
  const doTranscribe = module.exports.transcribePcm;

  const MIN_DECODE_SAMPLES = 16000; // 1s
  const MAX_SAMPLES = 16000 * 30;   // 30s
  const DECODE_INTERVAL = 16000;    // 1s
  const MIN_COMMIT_CHARS = 8;

  let buf = new Float32Array(0);
  let samplesSinceDecode = 0;
  let segId = 0;
  let committedNorms = [];
  let lastPartial = "";
  let closed = false;
  let decoding = false;
  let pendingEnd = null;

  onOpen();

  async function maybeDecode() {
    if (decoding || closed) return;
    if (buf.length < MIN_DECODE_SAMPLES) return;
    if (samplesSinceDecode < DECODE_INTERVAL) return;

    decoding = true;
    samplesSinceDecode = 0;

    try {
      const text = await doTranscribe({ modelDir, samples: buf, language });
      if (!text || closed) { decoding = false; return; }

      // Emit Partial (full decoded text).
      if (text !== lastPartial) {
        lastPartial = text;
        onPartial(text, segId);
      }

      // Sentence detection with anti-premature hold-back.
      const { sentences, trailing } = splitSentences(text);
      const commitCount = trailing.length > 0 ? sentences.length : Math.max(0, sentences.length - 1);

      for (let i = 0; i < commitCount; i++) {
        const s = sentences[i];
        const norm = normalize(s);
        if (norm.length < MIN_COMMIT_CHARS) continue;
        const already = committedNorms.some((c) => {
          const [short, long] = c.length < norm.length ? [c, norm] : [norm, c];
          if (!short) return false;
          if (long.includes(short)) return true;
          const common = [...short].filter((ch) => long.includes(ch)).length;
          return common * 100 / short.length > 70;
        });
        if (!already) {
          onFinal(s, segId);
          segId++;
          committedNorms.push(norm);
          if (committedNorms.length > 50) committedNorms.shift();
        }
      }
    } catch (e) {
      // decode error — skip this cycle
    }
    decoding = false;

    // If end() was called while decoding, flush now.
    if (pendingEnd) {
      await flushEnd();
    }
  }

  async function flushEnd() {
    if (buf.length >= MIN_DECODE_SAMPLES) {
      try {
        const text = await doTranscribe({ modelDir, samples: buf, language });
        if (text) {
          const { sentences, trailing } = splitSentences(text);
          const all = trailing ? [...sentences, trailing] : sentences;
          for (const s of all) {
            const norm = normalize(s);
            if (norm.length < MIN_COMMIT_CHARS) continue;
            const already = committedNorms.some((c) => {
              const [short, long] = c.length < norm.length ? [c, norm] : [norm, c];
              return short.length > 0 && long.includes(short);
            });
            if (!already) {
              onFinal(s, segId);
              segId++;
              committedNorms.push(norm);
            }
          }
        }
      } catch (_) {}
    }
    closed = true;
    onClosed();
    if (pendingEnd) { pendingEnd(); pendingEnd = null; }
  }

  return {
    push(samples) {
      if (closed) throw new Error("session is closed");
      // Append samples to buf.
      const next = new Float32Array(buf.length + samples.length);
      next.set(buf);
      next.set(samples, buf.length);
      buf = next;
      samplesSinceDecode += samples.length;

      // Trim front if exceeds max.
      if (buf.length > MAX_SAMPLES) {
        buf = buf.subarray(buf.length - MAX_SAMPLES);
        committedNorms = [];
        lastPartial = "";
      }

      maybeDecode();
    },

    async end() {
      if (closed) return;
      if (decoding) {
        // Wait for current decode to finish, then flush.
        await new Promise((res) => { pendingEnd = res; });
      } else {
        await flushEnd();
      }
    },

    close() {
      closed = true;
      buf = new Float32Array(0);
      committedNorms = [];
    },
  };
}

// ─── Exports ───

module.exports.polishText =
  native && typeof native.polishText === "function"
    ? native.polishText
    : polishTextFallback;

module.exports.transcribePcm =
  native && typeof native.transcribePcm === "function"
    ? native.transcribePcm
    : transcribePcmFallback;

module.exports.isNativeAvailable = () => native !== null;
module.exports.nativeLoadError = () => _nativeLoadError;
module.exports.transcribe = transcribe;
module.exports.listen = listen;
