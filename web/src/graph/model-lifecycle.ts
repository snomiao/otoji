// Model offload policy. Heavy nodes lazy-load their model on first use (each
// provider dynamic-imports its runtime and memoizes the engine). This frees them
// the other way: when the LAST node of a type is removed from the graph, its
// model is disposed so GPU/wasm memory is reclaimed. A re-added node lazy-loads
// it again. Disposing a type whose model was never loaded is a cheap no-op.

import type { NodeType } from "./model";
import { disposeSenseVoice } from "../providers/stt/sensevoice";
import { disposeVosk } from "../providers/stt/vosk";
import { disposePipes } from "../providers/model/transformers-pipeline";
import { disposeNeuralTts } from "../providers/tts/neural";
import { disposeWebllm } from "../providers/translate/webllm";
import { disposeBrowserTranslate } from "../providers/translate/browser-translator";
import { disposeOcr } from "../providers/vision/paddleocr";
import { disposeDetect } from "../providers/vision/detect";
import { disposeDepth } from "../providers/vision/depth";
import { disposeMediapipe } from "../providers/vision/mediapipe";

// Each heavy node type → the model(s) it loads. A translate node may use either
// the WebLLM or the browser Translator backend, so it disposes both.
const DISPOSERS: Partial<Record<NodeType, Array<() => Promise<void>>>> = {
  stt: [disposeSenseVoice],
  vosk: [disposeVosk],
  translate: [disposeWebllm, disposeBrowserTranslate],
  "browser-translate-api": [disposeBrowserTranslate],
  "tts-model": [disposeNeuralTts],
  "llm-agent": [disposePipes],
  model: [disposePipes],
  "paddle-ocr": [disposeOcr],
  "vision-model": [disposeDetect, disposeDepth, disposeMediapipe],
};

/** Node types that hold an offloadable model. */
export const HEAVY_NODE_TYPES = Object.keys(DISPOSERS) as NodeType[];

/** Offload the model(s) for one node type (no-op if nothing is loaded). */
export function offloadType(type: NodeType): void {
  for (const dispose of DISPOSERS[type] ?? []) void dispose();
}
