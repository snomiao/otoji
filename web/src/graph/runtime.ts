// Single-device graph runtime (M3): instantiate node runners for a VoiceGraph
// and wire them per edges. Messages flow in-process; cross-device edges (M4)
// will later be realized over data channels.

import type { VoiceGraph, NodeType, VoiceNode } from "./model";
import { startMicVad, segmentSamples, MIC_VAD_SR, type MicVadHandle } from "../lib/mic-vad";
import { fileStore } from "./file-store";
import { sttRecognize, warmSenseVoice } from "../providers/stt/sensevoice";
import { webllmTranslate } from "../providers/translate/webllm";
import { browserTranslate } from "../providers/translate/browser-translator";
import { DEFAULT_TRANSLATE_LANG, DEFAULT_TRANSLATE_MODEL, langNameToCode } from "../providers/translate/translate-config";
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
  send(toDevice: string, frame: EdgeFrame): void;
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
  onSink?: (nodeId: string, tr: TranscriptMsg) => void;
  onAudio?: (nodeId: string, audio: SegmentMsg) => void; // raw audio collected at audio-out
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
        this.hooks.self.transport.send(owner, frame);
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

    for (const node of this.nodes.values()) await node.start?.();
    this.hooks.onStatus?.("running");
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
      let chain: Promise<void> = Promise.resolve();
      const modelId = (this.graph.nodes[id]?.config?.model as string | undefined) ?? this.hooks.modelId;
      return {
        input: (_port, msg) => {
          const seg = msg as SegmentMsg;
          chain = chain.then(async () => {
            this.hooks.onNodeBusy?.(id, true);
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
            } finally {
              this.hooks.onNodeBusy?.(id, false);
            }
          });
        },
        // Wait for in-flight recognition so a just-spoken / stop-time segment
        // isn't dropped before its result reaches the sink.
        stop: () => chain,
      };
    }

    if (type === "translate") {
      let chain: Promise<void> = Promise.resolve();
      const cfg = this.graph.nodes[id]?.config ?? {};
      const modelId = (cfg.model as string | undefined) ?? DEFAULT_TRANSLATE_MODEL;
      const targetLang = (cfg.lang as string | undefined) ?? DEFAULT_TRANSLATE_LANG;
      const provider = (cfg.provider as string | undefined) === "browser" ? browserTranslate : webllmTranslate;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          chain = chain.then(async () => {
            if (!tr.text.trim()) return; // nothing recognized — don't echo empties
            this.hooks.onNodeBusy?.(id, true);
            // Pass through the original text on any failure (no WebGPU, download
            // error, inference error) so downstream sink/recordings keep working.
            let text = tr.text;
            try {
              // Feed SenseVoice's detected source language so the provider can skip
              // its own detection (browser API) / steer the prompt (LLM).
              if (provider.isAvailable()) text = await provider.translate(tr.text, targetLang, modelId, tr.lang);
            } catch (e) {
              this.hooks.onError?.(e instanceof Error ? e : new Error(String(e)));
            } finally {
              this.hooks.onNodeBusy?.(id, false);
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
        stop: () => chain,
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
      const voiceURI = cfg.voice as string | undefined;
      const rate = typeof cfg.rate === "number" ? (cfg.rate as number) : 1;
      let chain: Promise<void> = Promise.resolve();
      let stopped = false;
      return {
        input: (_port, msg) => {
          const tr = msg as TranscriptMsg;
          const text = tr.text?.trim();
          if (!text) return;
          const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
          if (!synth) return;
          chain = chain.then(
            () =>
              new Promise<void>((resolve) => {
                if (stopped) return resolve(); // runtime stopped while queued — don't speak
                try {
                  const u = new SpeechSynthesisUtterance(text);
                  u.rate = rate;
                  const v = voiceURI ? synth.getVoices().find((x) => x.voiceURI === voiceURI) : undefined;
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
        },
      };
    }

    // sink / srt-out
    return {
      input: (_port, msg) => this.hooks.onSink?.(id, msg as TranscriptMsg),
    };
  }

  async stop(): Promise<void> {
    this.running = false;
    // Stop sources first so their final segments flush into the pipeline,
    // then drain processing nodes (STT chains emit to sinks) before clearing.
    for (const [id, node] of this.nodes) if (this.graph.nodes[id]?.type === "mic-vad") await node.stop?.();
    for (const [id, node] of this.nodes) if (this.graph.nodes[id]?.type !== "mic-vad") await node.stop?.();
    this.nodes.clear();
    this.adj.clear();
  }
}
