import { describe, it, expect } from "vitest";
import { parseOnnxMetadata, parseFloatList } from "../lib/onnx-meta";
import { computeFbank, SENSEVOICE_FBANK } from "../lib/fbank";
import { backoffDelay, PHI } from "../lib/backoff";
import { applyLFR, applyCMVN, ctcGreedy, detokenize, detectLang, detectEmotion, detectEvent, parseTokens } from "../providers/stt/sensevoice";

// Build a tiny protobuf ModelProto with two metadata_props entries plus a fake
// large field 7 (graph) in between, to prove the scanner skips it.
function encodeVarint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
function strField(field: number, s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s));
  return [(field << 3) | 2, ...encodeVarint(bytes.length), ...bytes];
}
function metaEntry(key: string, value: string): number[] {
  const body = [...strField(1, key), ...strField(2, value)];
  return [(14 << 3) | 2, ...encodeVarint(body.length), ...body];
}

describe("onnx metadata parser", () => {
  it("extracts metadata_props and skips other fields", () => {
    const graphBody = new Array(5000).fill(0x01);
    const bytes = [
      (1 << 3) | 0, ...encodeVarint(7), // ir_version (varint)
      ...metaEntry("lfr_window_size", "7"),
      (7 << 3) | 2, ...encodeVarint(graphBody.length), ...graphBody, // fake graph
      ...metaEntry("neg_mean", "1.5 -2.0 3.25"),
    ];
    const meta = parseOnnxMetadata(new Uint8Array(bytes));
    expect(meta["lfr_window_size"]).toBe("7");
    expect(meta["neg_mean"]).toBe("1.5 -2.0 3.25");
    expect(Array.from(parseFloatList(meta["neg_mean"]))).toEqual([1.5, -2.0, 3.25]);
  });
});

describe("fbank", () => {
  it("produces [numFrames, 80] with snip_edges framing", () => {
    const samples = new Float32Array(16000); // 1 s
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.3;
    const { feats, numFrames, numBins } = computeFbank(samples, SENSEVOICE_FBANK);
    expect(numBins).toBe(80);
    // (16000 - 400)/160 + 1 = 98 frames
    expect(numFrames).toBe(98);
    expect(feats.length).toBe(98 * 80);
    expect(Number.isFinite(feats[0])).toBe(true);
  });
});

describe("LFR + CMVN", () => {
  it("stacks frames and applies cmvn", () => {
    const numBins = 2;
    const numFrames = 9;
    const feats = new Float32Array(numFrames * numBins);
    for (let i = 0; i < feats.length; i++) feats[i] = i;
    const lfr = applyLFR(feats, numFrames, numBins, 7, 6); // (9-7)/6+1 = 1 frame
    expect(lfr.frames).toBe(1);
    expect(lfr.dim).toBe(14);
    expect(Array.from(lfr.data.slice(0, 4))).toEqual([0, 1, 2, 3]);

    const neg = new Float32Array(14).fill(1);
    const inv = new Float32Array(14).fill(2);
    applyCMVN(lfr.data, lfr.dim, neg, inv);
    expect(lfr.data[0]).toBe((0 + 1) * 2);
    expect(lfr.data[1]).toBe((1 + 1) * 2);
  });
});

describe("CTC greedy + detokenize", () => {
  it("collapses repeats, drops blank, skips 4 specials", () => {
    const vocab = 5;
    // frames argmax: 0(blank) 1 1 2 0 3 4 4 -> collapse/blank -> [1,2,3,4]
    const seq = [0, 1, 1, 2, 0, 3, 4, 4];
    const logits = new Float32Array(seq.length * vocab);
    seq.forEach((y, t) => (logits[t * vocab + y] = 10));
    const { tokens, frames } = ctcGreedy(logits, seq.length, vocab, 0);
    expect(tokens).toEqual([1, 2, 3, 4]);
    // frame index each token was emitted at (1@t1, 2@t3, 3@t5, 4@t6)
    expect(frames).toEqual([1, 3, 5, 6]);

    const table = ["<blk>", "<|zh|>", "<|NEUTRAL|>", "<|Speech|>", "<|woitn|>", "▁hi", "▁world"];
    // 4 specials skipped -> from index 4 onward of the token list; ▁ -> space
    expect(detokenize([1, 2, 3, 4, 5, 6], table)).toBe("hi world");
  });

  it("detectLang reads the leading <lang> special, ignoring non-language tags", () => {
    const table = ["<blk>", "<|zh|>", "<|en|>", "<|NEUTRAL|>"];
    expect(detectLang([1, 0, 0, 0], table)).toBe("zh");
    expect(detectLang([2, 0, 0, 0], table)).toBe("en");
    expect(detectLang([3, 0, 0, 0], table)).toBeUndefined(); // emotion tag, not a lang
  });

  it("detectEmotion/detectEvent read the 2nd/3rd specials, validating the tag set", () => {
    // table ids: 1=<|en|> 2=<|HAPPY|> 3=<|Applause|> 4=<|woitn|> 5=<|BOGUS|>
    const table = ["<blk>", "<|en|>", "<|HAPPY|>", "<|Applause|>", "<|woitn|>", "<|BOGUS|>"];
    expect(detectEmotion([1, 2, 3, 4], table)).toBe("HAPPY"); // token[1]
    expect(detectEvent([1, 2, 3, 4], table)).toBe("Applause"); // token[2]
    expect(detectEmotion([1, 5, 3, 4], table)).toBeUndefined(); // not a known emotion
  });
});

describe("token table parse", () => {
  it("parses <sym> <id> lines", () => {
    const table = parseTokens("<blk> 0\n▁the 5\nhello 6\n");
    expect(table[0]).toBe("<blk>");
    expect(table[5]).toBe("▁the");
    expect(table[6]).toBe("hello");
  });
});

describe("phi backoff", () => {
  it("first attempt is immediate, then grows by phi, capped", () => {
    expect(backoffDelay(0)).toBe(0);
    expect(backoffDelay(1, { baseMs: 1000 })).toBeCloseTo(1000);
    expect(backoffDelay(2, { baseMs: 1000 })).toBeCloseTo(1000 * PHI);
    expect(backoffDelay(3, { baseMs: 1000 })).toBeCloseTo(1000 * PHI * PHI);
    expect(backoffDelay(100, { baseMs: 1000, maxMs: 60000 })).toBe(60000);
  });
});
