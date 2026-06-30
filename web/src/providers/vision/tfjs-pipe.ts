// Shared transformers.js loader + pipeline builder for the vision providers.
// The key job here is to keep inference OFF the main thread so heavy frames
// (YOLO, depth) never freeze the React Flow UI:
//   • WebGPU when the browser supports it — runs async on the GPU and is ~13×
//     faster than wasm for these models (measured: yolos-tiny 7.3s → 0.55s).
//   • otherwise a wasm *worker* (onnx `proxy`), so even the slow path runs in a
//     background thread and the UI stays responsive.
//
// The library is lazy-loaded from esm.sh (esm.run's +esm bundle fails a deep
// sub-import for this package) and the module is memoized process-wide.

const TFJS_URL = "https://esm.sh/@huggingface/transformers";
const importTfjs = () => new Function("u", "return import(u)")(TFJS_URL) as Promise<any>;

let tfPromise: Promise<any> | null = null;

/** Load + configure transformers.js once. */
export function loadTfjs(): Promise<any> {
  if (!tfPromise) {
    tfPromise = importTfjs()
      .then((tf) => {
        tf.env.allowLocalModels = false;
        tf.env.useBrowserCache = true;
        // Run the wasm backend in a worker thread (used only when WebGPU is
        // unavailable). Harmless when the WebGPU device is selected.
        try {
          tf.env.backends.onnx.wasm.proxy = true;
        } catch {
          /* older builds may not expose this path */
        }
        return tf;
      })
      .catch((e) => {
        tfPromise = null; // allow retry on failure
        throw e;
      });
  }
  return tfPromise;
}

let webgpuOk: boolean | null = null;
async function hasWebGpu(): Promise<boolean> {
  if (webgpuOk != null) return webgpuOk;
  try {
    webgpuOk = !!(navigator as any).gpu && !!(await (navigator as any).gpu.requestAdapter());
  } catch {
    webgpuOk = false;
  }
  return webgpuOk;
}

type ProgressCb = (p: { progress?: number; text?: string }) => void;

export interface PipeOpts {
  /**
   * Allow the WebGPU backend. Default true. Some models (e.g. Depth-Anything)
   * *build* on WebGPU but then throw at inference from inside the wasm/WebGPU
   * glue — an error that can't be caught at the call site — so those providers
   * pass `webgpu: false` to stay on the wasm worker.
   */
  webgpu?: boolean;
}

/**
 * Build a transformers.js pipeline that runs off the main thread: WebGPU when
 * available (fast, async on the GPU), else a wasm worker so even the fallback
 * never freezes the React Flow UI.
 */
export async function buildPipeline(
  task: string,
  model: string,
  onProgress?: ProgressCb,
  opts?: PipeOpts,
): Promise<any> {
  const tf = await loadTfjs();
  const progress_callback = (r: { status?: string; progress?: number }) =>
    onProgress?.({ progress: r.progress != null ? r.progress / 100 : undefined, text: r.status });
  if (opts?.webgpu !== false && (await hasWebGpu())) {
    try {
      return await tf.pipeline(task, model, { device: "webgpu", progress_callback });
    } catch {
      /* failed to build on WebGPU → wasm worker below */
    }
  }
  return tf.pipeline(task, model, { progress_callback });
}
