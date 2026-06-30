// Single-device graph runtime (M3): instantiate node runners for a VoiceGraph
// and wire them per edges. Messages flow in-process; cross-device edges (M4)
// will later be realized over data channels.

import type { VoiceGraph, NodeType, VoiceNode } from "./model";
import { startMicVad, startMicRaw, segmentSamples, MIC_VAD_SR, type MicVadHandle } from "../lib/mic-vad";
import { fileStore } from "./file-store";
import { sttRecognize, warmSenseVoice } from "../providers/stt/sensevoice";
import { webllmTranslate } from "../providers/translate/webllm";
import { browserTranslate } from "../providers/translate/browser-translator";
import { DEFAULT_TRANSLATE_LANG, DEFAULT_TRANSLATE_MODEL, langNameToCode } from "../providers/translate/translate-config";
import { neuralTts } from "../providers/tts/neural";
import { DEFAULT_NEURAL_TTS_MODEL, AUTO_TTS_MODEL, AUTO_TTS_VOICE, langToTtsModel, voiceMatchesLang } from "../providers/tts/tts-config";
import { runAsr, runText, runTts, warmPipe, type ModelTask } from "../providers/model/transformers-pipeline";
import { createVoskStream, warmVosk, DEFAULT_VOSK_MODEL, type VoskStream } from "../providers/stt/vosk";
import type { SttLevel } from "../providers/types";
import { buildSegmentFrame, buildTranscriptFrame, frameToMessage, type EdgeFrame } from "./frames";

export interface SegmentMsg {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  offsetMs?: number; // start of this segment in the source timeline (file/mic)
}
export interface TranscriptMsg {
  text: string;
  audio: SegmentMsg;
  lang?: string; // SenseVoice-detected source language (BCP-47-ish)
  emotion?: string; // SenseVoice SER tag (e.g. "HAPPY")
  event?: string; // SenseVoice AED tag (e.g. "Applause"/"BGM")
  tStartMs?: number; // absolute speech start in the source timeline (CTC-derived)
  tEndMs?: number; // absolute speech end
}

/** Cross-device transport (implemented over the WebRTC PeerMesh). */
export interface Transport {
  /** Returns true if the frame was actually sent (false = dropped: no route/closed). */
  send(toDevice: string, frame: EdgeFrame): boolean;
  setReceiver(cb: (frame: EdgeFrame) => void): void;
}

export interface RuntimeSelf {
  myId: string;
  deviceIds: string[];
  transport: Transport;
}

export interface RuntimeHooks {
  modelId?: string;
  /** Distributed mode: which device we are + transport. Omit for single-device. */
  self?: RuntimeSelf;
  onLevel?: (nodeId: string, level: SttLevel) => void;
  onSegment?: (nodeId: string) => void; // a mic node produced a VAD segment
  onRecognized?: (nodeId: string, text: string) => void; // an STT node finished (text may be empty)
  onNodeBusy?: (nodeId: string, busy: boolean) => void; // node started/finished processing
  onQueue?: (nodeId: string, processing: string | null, queued: string[]) => void; // work queue state
  onSink?: (nodeId: string, tr: TranscriptMsg) => void;
  onAudio?: (nodeId: string, audio: SegmentMsg) => void; // raw audio collected at audio-out
  onPipeOut?: (nodeId: string, text: string) => void; // pipe node input -> external CLI stdout
  onEdgeBytes?: (edgeId: string, bytes: number) => void; // payload bytes sent over a cross-device edge
  onStatus?: (s: string) => void;
  onError?: (e: Error) => void;
}

/**
 * The device that runs a node: its explicit assignment, or — for unassigned
 * nodes — a single deterministic owner (smallest device id) so exactly one
 * device executes it. With no devices known, returns null.
 */
export function nodeOwner(node: VoiceNode, onlineDeviceIds: string[]): string | null {
  // Device ids are STABLE (persisted), so an explicit assignment is honored even
  // when that device is offline — the node stays owned by it (shown offline, not
  // run) and is reclaimed when the device rejoins.
  if (node.device) return node.device;
  if (onlineDeviceIds.length === 0) return null;
  // Unassigned: a single deterministic owner among online devices.
  return [...onlineDeviceIds].sort()[0];
}

interface RuntimeNode {
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  input?(port: string, msg: unknown): void;
}

/** Short label for a queue item (a text snippet). */
function snippet(t: string): string {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > 22 ? s.slice(0, 22) + "…" : s || "…";
}

/** Map "sourceNode:sourceHandle" -> list of {node, port} targets. */
export function buildAdjacency(graph: VoiceGraph): Map<string, { node: string; port: string }[]> {
  const adj = new Map<string, { node: string; port: string }[]>();
  for (const e of graph.edges) {
    const k = `${e.source}:${e.sourceHandle}`;
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k)!.push({ node: e.target, port: e.targetHandle });
  }
  return adj;
}

export class GraphRuntime {
  private nodes = new Map<string, RuntimeNode>();
  private adj = new Map<string, { node: string; port: string }[]>();
  private running = false;

  constructor(
    private graph: VoiceGraph,
    private hooks: RuntimeHooks = {},
  ) {}

  private isLocal(nodeId: string): boolean {
    const node = this.graph.nodes[nodeId];
    if (!node) return false;
    const self = this.hooks.self;
    if (!self) return true; // single-device: every node runs here
    return nodeOwner(node, self.deviceIds) === self.myId;
  }

  private emit(nodeId: string, port: string, msg: unknown): void {
    for (const t of this.adj.get(`${nodeId}:${port}`) ?? []) {
      if (this.isLocal(t.node)) {
        this.nodes.get(t.node)?.input?.(t.port, msg);
      } else if (this.hooks.self) {
        const owner = nodeOwner(this.graph.nodes[t.node], this.hooks.self.deviceIds);
        if (!owner) continue;
        const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg>;
        const frame =
          m.text !== undefined
            ? buildTranscriptFrame(t.node, t.port, m as TranscriptMsg)
            : buildSegmentFrame(t.node, t.port, m as SegmentMsg);
        const ok = this.hooks.self.transport.send(owner, frame);
        // Per-edge throughput: count payload bytes only for frames actually sent.
        if (ok) {
          const bytes = (frame.samplesB64?.length ?? 0) + (frame.text?.length ?? 0) + 80;
          this.hooks.onEdgeBytes?.(`${nodeId}:${port}->${t.node}:${t.port}`, bytes);
        }
      }
    }
  }

  private onFrame(frame: EdgeFrame): void {
    if (!this.isLocal(frame.target)) return;
    this.nodes.get(frame.target)?.input?.(frame.port, frameToMessage(frame));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.adj = buildAdjacency(this.graph);

    // Instantiate only the nodes this device owns.
    for (const n of Object.values(this.graph.nodes)) {
      if (this.isLocal(n.id)) this.nodes.set(n.id, this.build(n.id, n.type));
    }
    this.hooks.self?.transport.setReceiver((f) => this.onFrame(f));

    const sttModels = new Set<string | undefined>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "stt" && this.isLocal(n.id)) sttModels.add((n.config?.model as string | undefined) ?? this.hooks.modelId);
    }
    if (sttModels.size) {
      this.hooks.onStatus?.("loading model…");
      try {
        await Promise.all([...sttModels].map((m) => warmSenseVoice(m)));
      } catch (e) {
        // Required model failed to load — abort instead of capturing audio that
        // every STT segment would then fail on.
        this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
        this.hooks.onStatus?.("model load failed");
        this.running = false;
        this.nodes.clear();
        this.adj.clear();
        return;
      }
    }

    // Preload Vosk streaming models — non-fatal (a failure only disables that node).
    const voskModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "vosk" && this.isLocal(n.id)) voskModels.add((n.config?.model as string | undefined) ?? DEFAULT_VOSK_MODEL);
    }
    if (voskModels.size) {
      this.hooks.onStatus?.("loading streaming STT model…");
      await Promise.all([...voskModels].map((u) => warmVosk(u).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))))));
    }

    // Preload translate (in-browser LLM) models — only for nodes using the LLM
    // backend; the browser Translator API downloads packs lazily. Non-fatal: a
    // failure here only disables translate (passthrough), never aborts STT/sink.
    const translateModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "translate" && this.isLocal(n.id) && (n.config?.provider ?? "llm") === "llm")
        translateModels.add((n.config?.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL);
    }
    if (translateModels.size) {
      this.hooks.onStatus?.("loading translate model…");
      await Promise.all(
        [...translateModels].map((m) =>
          webllmTranslate
            .warm(m, (p) => {
              if (p.progress !== undefined) this.hooks.onStatus?.(`translate model ${Math.round(p.progress * 100)}%`);
              else if (p.text) this.hooks.onStatus?.(p.text);
            })
            .catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Browser Translator API nodes: pre-download detector + likely packs now,
    // while we still have user activation from the Join click (Chrome needs it
    // to start a pack download, which would otherwise fail on first transcript).
    const browserTargets = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "translate" && this.isLocal(n.id) && n.config?.provider === "browser")
        browserTargets.add((n.config?.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG);
    }
    if (browserTargets.size) {
      this.hooks.onStatus?.("preparing browser translator…");
      await Promise.all(
        [...browserTargets].map((t) =>
          browserTranslate.warm(t).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Neural TTS (on-device ONNX) models — preload weights now. Non-fatal: a
    // failure only disables that node, never aborts the rest of the graph.
    const ttsModels = new Set<string>();
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "tts-model" && this.isLocal(n.id)) {
        // Auto-mode nodes resolve their model per-utterance from the transcript's
        // language, so they can't be preloaded here — they load lazily on first use.
        const m = n.config?.model as string | undefined;
        if (m && m !== AUTO_TTS_MODEL) ttsModels.add(m);
      }
    }
    if (ttsModels.size) {
      this.hooks.onStatus?.("loading TTS model…");
      await Promise.all(
        [...ttsModels].map((m) =>
          neuralTts
            .warm(m, (p) => {
              if (p.progress !== undefined) this.hooks.onStatus?.(`TTS model ${Math.round(p.progress * 100)}%`);
              else if (p.text) this.hooks.onStatus?.(p.text);
            })
            .catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    // Generic "Custom model" nodes — preload their transformers.js pipelines.
    const customModels: { task: ModelTask; model: string; dtype?: string }[] = [];
    for (const n of Object.values(this.graph.nodes)) {
      if (n.type === "model" && this.isLocal(n.id)) {
        const m = (n.config?.model as string | undefined)?.trim();
        if (m) customModels.push({ task: (n.config?.task as ModelTask | undefined) ?? "asr", model: m, dtype: n.config?.dtype as string | undefined });
      }
    }
    if (customModels.length) {
      this.hooks.onStatus?.("loading custom model…");
      await Promise.all(
        customModels.map((c) =>
          warmPipe(c.task, c.model, c.dtype, (p) => {
            if (p.progress !== undefined) this.hooks.onStatus?.(`model ${Math.round(p.progress * 100)}%`);
            else if (p.text) this.hooks.onStatus?.(p.text);
          }).catch((e) => this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)))),
        ),
      );
    }

    for (const node of this.nodes.values()) await node.start?.();
    this.hooks.onStatus?.("running");
  }

  /**
   * Serialized work queue for an async node: tracks the item being processed and
   * those waiting, reporting both to the UI (onQueue) and the busy dot (onNodeBusy).
   */
  private makeQueue(id: string) {
    let chain: Promise<void> = Promise.resolve();
    const queued: string[] = [];
    let processing: string | null = null;
    const emit = () => {
      this.hooks.onQueue?.(id, processing, [...queued]);
      this.hooks.onNodeBusy?.(id, processing !== null);
    };
    return {
      run: (label: string, fn: () => Promise<void>) => {
        queued.push(label);
        emit();
        chain = chain.then(async () => {
          processing = queued.shift() ?? label;
          emit();
          try {
            await fn();
          } finally {
            processing = null;
            emit();
          }
        });
        return chain;
      },
      drain: () => chain,
    };
  }

  private build(id: string, type: NodeType): RuntimeNode {
    if (type === "mic-vad") {
      let handle: MicVadHandle | null = null;
      const inputDeviceId = this.graph.nodes[id]?.config?.inputDeviceId as string | undefined;
      return {
        start: async () => {
          handle = await startMicVad({
            deviceId: inputDeviceId,
            onLevel: (l) => this.hooks.onLevel?.(id, l),
            onSegment: (samples, durationMs, offsetMs) => {
              this.hooks.onSegment?.(id);
              this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs, offsetMs } as SegmentMsg);
            },
          });
        },
        stop: async () => {
          await handle?.stop();
        },
      };
    }

    if (type === "web-speech") {
      // Browser-native streaming ASR (Web Speech API). Opens its own mic on this
      // device, emits interim results to the live preview and final ones downstream.
      const SR = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
      const lang = (this.graph.nodes[id]?.config?.lang as string | undefined) || (typeof navigator !== "undefined" ? navigator.language : "en-US");
      let rec: any = null;
      let stopped = false;
      return {
        start: async () => {
          if (!SR) {
            this.hooks.onError?.(new Error("Web Speech API not available in this browser."));
            return;
          }
          rec = new SR();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = lang;
          rec.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i];
              const text = (r[0]?.transcript ?? "").trim();
              if (!text) continue;
              this.hooks.onRecognized?.(id, text); // live (interim + final) in preview
              if (r.isFinal)
                // Carry the recognition language so downstream auto-TTS / tts-model match it.
                this.emit(id, "out", { text, lang, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } } as TranscriptMsg);
            }
          };
          rec.onend = () => { if (!stopped) { try { rec.start(); } catch { /* already started */ } } }; // keep alive
          try { rec.start(); } catch (e) { this.hooks.onError?.(e instanceof Error ? e : new Error(String(e))); }
        },
        stop: () => { stopped = true; try { rec?.stop(); } catch { /* ignore */ } },
      };
    }

    if (type === "vosk") {
      // Streaming ASR: feed each incoming audio frame to a persistent Vosk
      // recognizer; partials → live preview, finals → downstream transcript.
      const url = (this.graph.nodes[id]?.config?.model as string | undefined) ?? DEFAULT_VOSK_MODEL;
      let stream: VoskStream | null = null;
      return {
        start: async () => {
          try {
            stream = await createVoskStream(
              url,
              (partial) => this.hooks.onRecognized?.(id, partial),
              (text) => {
                this.hooks.onRecognized?.(id, text);
                this.emit(id, "out", { text, audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 } } as TranscriptMsg);
              },
            );
          } catch (e) {
            // Non-fatal: a failed model load only disables this node, not the graph.
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
        input: (_port, msg) => stream?.accept((msg as SegmentMsg).samples),
        stop: async () => { stream?.free(); stream = null; },
      };
    }

    if (type === "mic-raw") {
      let handle: MicVadHandle | null = null;
      const inputDeviceId = this.graph.nodes[id]?.config?.inputDeviceId as string | undefined;
      return {
        start: async () => {
          handle = await startMicRaw({
            deviceId: inputDeviceId,
            onLevel: (l) => this.hooks.onLevel?.(id, l),
            onFrame: (samples, offsetMs) => {
              this.emit(id, "out", { samples, sampleRate: MIC_VAD_SR, durationMs: (samples.length / MIC_VAD_SR) * 1000, offsetMs } as SegmentMsg);
            },
          });
        },
        stop: async () => { await handle?.stop(); },
      };
    }

    if (type === "file-audio") {
      return {
        start: async () => {
          const entry = fileStore.get(id);
          if (!entry?.file) return;
          try {
            const buf = await entry.file.arrayBuffer();
            const OAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
            const decoded = await new OAC(1, 1, MIC_VAD_SR).decodeAudioData(buf); // resampled to 16k
            const len = decoded.length;
            const mono = new Float32Array(len);
            for (let c = 0; c < decoded.numberOfChannels; c++) {
              const d = decoded.getChannelData(c);
              for (let i = 0; i < len; i++) mono[i] += d[i] / decoded.numberOfChannels;
            }
            segmentSamples(mono, (s, durationMs, offsetMs) => {
              this.hooks.onSegment?.(id);
              this.emit(id, "out", { samples: s, sampleRate: MIC_VAD_SR, durationMs, offsetMs } as SegmentMsg);
            });
          } catch (e) {
            this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
          }
        },
      };
    }

    if (type === "file-text") {
      return {
        start: async () => {
          const entry = fileStore.get(id);
          const text = entry?.text ?? (entry?.file ? await entry.file.text() : "");
          if (!text) return;
          for (const para of text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
            this.hooks.onRecognized?.(id, para);
            this.emit(id, "out", {
              text: para,
              audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 },
            } as TranscriptMsg);
          }
        },
      };
    }

    if (type === "stt") {
      const q = this.makeQueue(id);
      const modelId = (this.graph.nodes[id]?.config?.model as string | undefined) ?? this.hooks.modelId;
      return {
        input: (_port, msg) => {
          const seg = msg as SegmentMsg;
          q.run(`🔊 ${Math.round(seg.durationMs / 100) / 10}s`, async () => {
            try {
              const res = await sttRecognize(seg.samples, modelId);
              this.hooks.onRecognized?.(id, res.text);
              // Promote CTC speech extent to absolute timeline using the segment
              // offset (file/mic). Without an offset, leave times undefined so the
              // SRT builder falls back to sequential timing.
              const base = seg.offsetMs;
              const tStartMs = base !== undefined && res.startMs !== undefined ? base + res.startMs : undefined;
              const tEndMs = base !== undefined && res.endMs !== undefined ? base + res.endMs : undefined;
              this.emit(id, "out", {
                text: res.text,
                audio: seg,
                lang: res.lang,
                emotion: res.emotion,
                event: res.event,
                tStartMs,
                tEndMs,
              } as TranscriptMsg);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        // Wait for in-flight recognition so a just-spoken / stop-time segment
        // isn't dropped before its result reaches the sink.
        stop: () => q.drain(),
      };
    }

    if (type === "translate") {
      const q = this.makeQueue(id);
      const cfg = this.graph.nodes[id]?.config ?? {};
      const modelId = (cfg.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL;
      const targetLang = (cfg.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG;
      const provider = (cfg.provider as string | undefined) === "browser" ? browserTranslate : webllmTranslate;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          if (!tr.text.trim()) return; // nothing recognized — don't echo empties
          q.run(snippet(tr.text), async () => {
            // Pass through the original text on any failure (no WebGPU, download
            // error, inference error) so downstream sink/recordings keep working.
            let text = tr.text;
            try {
              // Feed SenseVoice's detected source language so the provider can skip
              // its own detection (browser API) / steer the prompt (LLM).
              if (provider.isAvailable()) text = await provider.translate(tr.text, targetLang, modelId, tr.lang);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
            this.hooks.onRecognized?.(id, text);
            // The text is now in the target language, so `lang` becomes the target
            // code — keeps the sink badge accurate AND lets a chained translate node
            // use the correct source. Carry CTC timing through for the cue's SRT.
            this.emit(id, "out", {
              text,
              audio: tr.audio,
              lang: langNameToCode(targetLang) ?? undefined,
              emotion: tr.emotion, // emotion/event describe the source audio — unchanged
              event: tr.event,
              tStartMs: tr.tStartMs,
              tEndMs: tr.tEndMs,
            } as TranscriptMsg);
          });
        },
        // Drain in-flight translations so a final utterance reaches the sink.
        stop: () => q.drain(),
      };
    }

    if (type === "audio-out") {
      // Collect audio from either input: a raw segment, or a transcript's .audio.
      return {
        input: (_port, msg) => {
          const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg>;
          const audio: SegmentMsg | null = m.audio
            ? m.audio
            : m.samples
              ? { samples: m.samples, sampleRate: m.sampleRate ?? MIC_VAD_SR, durationMs: m.durationMs ?? 0 }
              : null;
          if (audio && audio.samples.length) this.hooks.onAudio?.(id, audio);
        },
      };
    }

    if (type === "speaker") {
      // Play audio (from a raw segment or a transcript's .audio) out a chosen
      // hardware OUTPUT device. Lazily build one AudioContext for this node and
      // serialize playback so segments don't overlap.
      const sinkId = this.graph.nodes[id]?.config?.sinkId as string | undefined;
      let ctx: AudioContext | null = null;
      let chain: Promise<void> = Promise.resolve();
      return {
        input: (_port, msg) => {
          const m = msg as Partial<TranscriptMsg> & Partial<SegmentMsg>;
          const audio: SegmentMsg | null = m.audio
            ? m.audio
            : m.samples
              ? { samples: m.samples, sampleRate: m.sampleRate ?? MIC_VAD_SR, durationMs: m.durationMs ?? 0 }
              : null;
          if (!audio || !audio.samples.length) return;
          chain = chain.then(async () => {
            try {
              if (!ctx) {
                const AudioCtor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
                ctx = new AudioCtor();
                // setSinkId routes output to a non-default device (Chrome 110+);
                // not in all browsers/headless, so guard it.
                if (sinkId && typeof (ctx as any).setSinkId === "function") {
                  await (ctx as any).setSinkId(sinkId).catch(() => {});
                }
              }
              if (ctx.state === "suspended") await ctx.resume().catch(() => {}); // autoplay policy
              const buf = ctx.createBuffer(1, audio.samples.length, audio.sampleRate);
              buf.copyToChannel(audio.samples as Float32Array<ArrayBuffer>, 0);
              const source = ctx.createBufferSource();
              source.buffer = buf;
              source.connect(ctx.destination);
              // Resolve when this segment finishes so the next one waits for it.
              await new Promise<void>((resolve) => {
                source.onended = () => resolve();
                source.start();
              });
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        stop: async () => {
          await ctx?.close().catch(() => {});
        },
      };
    }

    if (type === "tts") {
      // Speak each transcript via the browser's on-device SpeechSynthesis, on the
      // device that runs this node. Serialize so utterances don't overlap.
      const cfg = this.graph.nodes[id]?.config ?? {};
      const configuredVoice = (cfg.voice as string | undefined) ?? AUTO_TTS_VOICE;
      const rate = typeof cfg.rate === "number" ? (cfg.rate as number) : 1;
      const q = this.makeQueue(id);
      let stopped = false;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const text = tr.text?.trim();
          if (!text) return;
          const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
          if (!synth) return;
          q.run(snippet(text), () =>
              new Promise<void>((resolve) => {
                if (stopped) return resolve(); // runtime stopped while queued — don't speak
                try {
                  const u = new SpeechSynthesisUtterance(text);
                  u.rate = rate;
                  // Resolve the voice: explicit pick, or — in auto mode — an OS
                  // voice whose language matches the transcript (covers zh/ja/ko,
                  // which no in-browser neural model does).
                  const all = synth.getVoices();
                  let v: SpeechSynthesisVoice | undefined;
                  if (configuredVoice !== AUTO_TTS_VOICE) {
                    v = all.find((x) => x.voiceURI === configuredVoice);
                  } else if (tr.lang) {
                    v = all.find((x) => voiceMatchesLang(x.lang, tr.lang!));
                    u.lang = tr.lang; // also hint the engine, even if no voice object matched
                  }
                  if (v) {
                    u.voice = v;
                    u.lang = v.lang;
                  }
                  u.onend = () => resolve();
                  u.onerror = () => resolve();
                  synth.speak(u);
                } catch (e) {
                  this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
                  resolve();
                }
              }),
          );
        },
        stop: () => {
          stopped = true; // queued continuations check this and skip speaking
          try {
            window.speechSynthesis?.cancel();
          } catch {
            /* ignore */
          }
          return q.drain();
        },
      };
    }

    if (type === "tts-model") {
      // Synthesize each transcript to PCM with an on-device ONNX model and emit it
      // as a segment, so it can feed a (device-targetable) speaker / audio-out.
      const configured = (this.graph.nodes[id]?.config?.model as string | undefined) ?? AUTO_TTS_MODEL;
      const q = this.makeQueue(id);
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const text = tr.text?.trim();
          if (!text) return;
          // Resolve the voice: an explicit pick, or — in auto mode — the MMS model
          // matching the transcript's (detected/translated) language.
          let modelId: string;
          if (configured !== AUTO_TTS_MODEL) {
            modelId = configured;
          } else if (tr.lang) {
            const m = langToTtsModel(tr.lang);
            if (!m) {
              this.hooks.onError?.(new Error(`no on-device TTS voice for "${tr.lang}"`));
              return;
            }
            modelId = m;
          } else {
            modelId = DEFAULT_NEURAL_TTS_MODEL;
          }
          q.run(snippet(text), async () => {
            try {
              const { samples, sampleRate } = await neuralTts.synthesize(text, modelId);
              if (samples.length) {
                const durationMs = (samples.length / sampleRate) * 1000;
                this.emit(id, "out", { samples, sampleRate, durationMs } as SegmentMsg);
              }
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        // Drain in-flight synthesis so a final utterance still reaches the speaker.
        stop: () => q.drain(),
      };
    }

    if (type === "model") {
      // Generic transformers.js node — the configured task decides the I/O shape.
      const cfg = this.graph.nodes[id]?.config ?? {};
      const task = ((cfg.task as ModelTask | undefined) ?? "asr") as ModelTask;
      const model = (cfg.model as string | undefined)?.trim();
      const dtype = cfg.dtype as string | undefined;
      const q = this.makeQueue(id);
      return {
        input: (_port, msg) => {
          if (!model) return;
          const label = task === "asr" ? "🔊 audio" : snippet((msg as TranscriptMsg).text ?? "");
          q.run(label, async () => {
            try {
              if (task === "asr") {
                const seg = msg as SegmentMsg;
                const text = await runAsr(model, seg.samples, dtype);
                this.hooks.onRecognized?.(id, text);
                this.emit(id, "out_txt", { text, audio: seg } as TranscriptMsg);
              } else if (task === "tts") {
                const tr = msg as TranscriptMsg;
                if (!tr.text?.trim()) return;
                const { samples, sampleRate } = await runTts(model, tr.text, dtype);
                if (samples.length)
                  this.emit(id, "out_seg", { samples, sampleRate, durationMs: (samples.length / sampleRate) * 1000 } as SegmentMsg);
              } else {
                const tr = msg as TranscriptMsg;
                if (!tr.text?.trim()) return;
                const text = await runText(task, model, tr.text, dtype);
                this.hooks.onRecognized?.(id, text);
                // Carry audio/timing through so a downstream sink/SRT still works.
                this.emit(id, "out_txt", { text, audio: tr.audio, lang: tr.lang, tStartMs: tr.tStartMs, tEndMs: tr.tEndMs } as TranscriptMsg);
              }
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            }
          });
        },
        stop: () => q.drain(),
      };
    }

    if (type === "pipe") {
      // Bridge to an external `otoji node` CLI over the signaling relay: input text
      // is sent out to the CLI's stdout; CLI stdin is injected via pipeIn() below.
      return {
        input: (_port, msg) => {
          const t = (msg as TranscriptMsg).text?.trim();
          if (t) this.hooks.onPipeOut?.(id, t);
        },
      };
    }

    // sink / srt-out
    return {
      input: (_port, msg) => this.hooks.onSink?.(id, msg as TranscriptMsg),
    };
  }

  /** Inject text from an external CLI into a local pipe node's output. */
  pipeIn(nodeId: string, text: string): void {
    if (this.graph.nodes[nodeId]?.type !== "pipe" || !this.isLocal(nodeId)) return;
    this.emit(nodeId, "out", {
      text,
      audio: { samples: new Float32Array(0), sampleRate: MIC_VAD_SR, durationMs: 0 },
    } as TranscriptMsg);
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop continuous sources first so their final emissions flush into the
    // pipeline, then drain processing nodes (STT/translate/tts chains) before clearing.
    const SOURCES = new Set<NodeType>(["mic-vad", "mic-raw", "web-speech"]);
    for (const [id, node] of this.nodes) if (SOURCES.has(this.graph.nodes[id]?.type)) await node.stop?.();
    for (const [id, node] of this.nodes) if (!SOURCES.has(this.graph.nodes[id]?.type)) await node.stop?.();
    this.nodes.clear();
    this.adj.clear();
  }
}
