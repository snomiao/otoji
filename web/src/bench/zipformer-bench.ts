/**
 * Browser console entry point:
 *   await otojiBench.runZipformerBench({ backend: "wasm", chunks: 100 })
 */

const DEFAULT_BASE_URL =
  "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/main";
const ORT_VERSION = "1.27.0";
const CACHE_NAME = "otoji-models-v1";
const WARMUP_CHUNKS = 3;

const MODEL_FILES = {
  encoder: "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
  decoder: "decoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
  joiner: "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
} as const;

export interface ZipformerBenchOptions {
  baseUrl?: string;
  chunks?: number;
  backend?: "wasm" | "webgpu";
}

export interface ZipformerBenchResult {
  p50: number;
  p95: number;
  mean: number;
  rtfAt320msChunks: number;
  firstLoadMs: number;
  backend: "wasm" | "webgpu";
}

type NamePair = { input: string; output: string };

/** Pair state tensors by their model-defined order, excluding primary values. */
export function pairCacheNames(inputNames: readonly string[], outputNames: readonly string[]): NamePair[] {
  const cacheInputs = inputNames.filter((name) => name !== "x");
  const cacheOutputs = outputNames.slice(1);
  if (cacheInputs.length !== cacheOutputs.length) {
    throw new Error(`Encoder cache count mismatch: ${cacheInputs.length} inputs, ${cacheOutputs.length} outputs`);
  }
  return cacheInputs.map((input, i) => ({ input, output: cacheOutputs[i]! }));
}

function urlFor(baseUrl: string, file: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${file}`;
}

async function fetchCached(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    // Cache API can be unavailable in private browsing contexts.
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (cache) {
    try {
      await cache.put(url, new Response(bytes));
    } catch {
      // A model can exceed the browser cache quota; the benchmark can continue.
    }
  }
  return bytes;
}

function metadataFor(session: any, name: string): any {
  const metadata = session.inputMetadata;
  if (Array.isArray(metadata)) return metadata.find((item: any) => item.name === name);
  return metadata?.[name];
}

function metadataShape(metadata: any): readonly (number | string)[] | undefined {
  return metadata?.shape ?? metadata?.dimensions ?? metadata?.dims;
}

function concreteShape(metadata: any, label: string): number[] {
  const shape = metadataShape(metadata);
  if (!shape?.length) throw new Error(`No tensor shape metadata for ${label}`);
  return shape.map((dim, i) => {
    if (typeof dim === "number" && dim >= 0) return dim;
    if (i === 0) return 1; // The exported models use a dynamic batch axis.
    throw new Error(
      `Cannot initialize dynamic dimension ${String(dim)} of ${label}; ` +
        "this harness requires static cache dimensions in ORT inputMetadata.",
    );
  });
}

function elementCount(shape: readonly number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

function tensorType(metadata: any): string {
  return String(metadata?.type ?? metadata?.tensorType ?? "float32").replace(/^tensor\(|\)$/g, "");
}

function zeroTensor(ort: any, metadata: any, label: string): any {
  const shape = concreteShape(metadata, label);
  const size = elementCount(shape);
  const type = tensorType(metadata);
  if (type === "int64") return new ort.Tensor(type, new BigInt64Array(size), shape);
  if (type === "int32") return new ort.Tensor(type, new Int32Array(size), shape);
  if (type === "bool") return new ort.Tensor(type, new Uint8Array(size), shape);
  return new ort.Tensor(type, new Float32Array(size), shape);
}

function randomFeatureTensor(ort: any, session: any, xName: string): any {
  const metadata = metadataFor(session, xName);
  const raw = metadataShape(metadata);
  const featureDim = typeof raw?.[2] === "number" && raw[2] > 0 ? raw[2] : 80;
  // chunk-16 exports consume 16 * 2 + 7 = 39 fbank frames when T is dynamic.
  const frames = typeof raw?.[1] === "number" && raw[1] > 0 ? raw[1] : 39;
  const shape = [1, frames, featureDim];
  const data = new Float32Array(elementCount(shape));
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return new ort.Tensor("float32", data, shape);
}

function dummyDecoderFeeds(ort: any, session: any): Record<string, any> {
  const feeds: Record<string, any> = {};
  for (const name of session.inputNames as string[]) feeds[name] = zeroTensor(ort, metadataFor(session, name), name);
  return feeds;
}

function fitTensor(ort: any, tensor: any, metadata: any, label: string): any {
  const shape = concreteShape(metadata, label);
  const size = elementCount(shape);
  if (tensor.data.length === size) return new ort.Tensor(tensor.type, tensor.data, shape);
  if (tensor.data.length < size) throw new Error(`${label} needs ${size} values, received ${tensor.data.length}`);
  return new ort.Tensor(tensor.type, tensor.data.slice(tensor.data.length - size), shape);
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

export async function runZipformerBench(opts: ZipformerBenchOptions = {}): Promise<ZipformerBenchResult> {
  const chunks = opts.chunks ?? 100;
  const backend = opts.backend ?? "wasm";
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  if (!Number.isInteger(chunks) || chunks <= WARMUP_CHUNKS) {
    throw new Error(`chunks must be an integer greater than ${WARMUP_CHUNKS}`);
  }

  const loadStarted = performance.now();
  const ort: any = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

  const [encoderBytes, decoderBytes, joinerBytes] = await Promise.all(
    Object.values(MODEL_FILES).map((file) => fetchCached(urlFor(baseUrl, file))),
  );
  const sessionOptions = { executionProviders: [backend], graphOptimizationLevel: "all" };
  const [encoder, decoder, joiner] = await Promise.all([
    ort.InferenceSession.create(encoderBytes, sessionOptions),
    ort.InferenceSession.create(decoderBytes, sessionOptions),
    ort.InferenceSession.create(joinerBytes, sessionOptions),
  ]);
  const firstLoadMs = performance.now() - loadStarted;

  const xName = encoder.inputNames.includes("x") ? "x" : encoder.inputNames[0];
  const encoderOutputName = encoder.outputNames[0];
  const cachePairs = pairCacheNames(encoder.inputNames, encoder.outputNames);
  const cacheFeeds: Record<string, any> = {};
  for (const { input } of cachePairs) cacheFeeds[input] = zeroTensor(ort, metadataFor(encoder, input), input);
  const decoderFeeds = dummyDecoderFeeds(ort, decoder);
  const times: number[] = [];

  try {
    for (let chunk = 0; chunk < chunks; chunk++) {
      const started = performance.now();
      const encoderResult = await encoder.run({ ...cacheFeeds, [xName]: randomFeatureTensor(ort, encoder, xName) });
      for (const { input, output } of cachePairs) cacheFeeds[input] = encoderResult[output];

      const decoderResult = await decoder.run(decoderFeeds);
      const joinerFeeds: Record<string, any> = {};
      const sources = [encoderResult[encoderOutputName], decoderResult[decoder.outputNames[0]]];
      for (let i = 0; i < joiner.inputNames.length; i++) {
        const name = joiner.inputNames[i];
        joinerFeeds[name] = fitTensor(ort, sources[i], metadataFor(joiner, name), name);
      }
      await joiner.run(joinerFeeds);
      times.push(performance.now() - started);
    }
  } finally {
    await Promise.all([encoder.release?.(), decoder.release?.(), joiner.release?.()]);
  }

  const measured = times.slice(WARMUP_CHUNKS);
  const mean = measured.reduce((sum, value) => sum + value, 0) / measured.length;
  const result: ZipformerBenchResult = {
    p50: percentile(measured, 0.5),
    p95: percentile(measured, 0.95),
    mean,
    rtfAt320msChunks: mean / 320,
    firstLoadMs,
    backend,
  };
  console.table([result]);
  return result;
}

declare global {
  interface Window {
    otojiBench?: { runZipformerBench: typeof runZipformerBench };
  }
}

if (typeof window !== "undefined") window.otojiBench = { runZipformerBench };
