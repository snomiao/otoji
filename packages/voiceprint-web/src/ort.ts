import { VoiceprintError, type VoiceprintSession } from "./types";

/** Imported only after explicit consent and verified model download. No CDN defaults. */
export async function createWasmSession(
  model: Uint8Array,
  wasmBaseUrl: string,
): Promise<VoiceprintSession> {
  const ort = await import("onnxruntime-web/wasm");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = wasmBaseUrl;
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  if (
    session.inputNames.length !== 1 ||
    session.inputNames[0] !== "x" ||
    session.outputNames[0] !== "embedding"
  ) {
    await session.release();
    throw new VoiceprintError("artifact");
  }
  return {
    async run(data, frames) {
      const tensor = new ort.Tensor("float32", data, [1, frames, 80]);
      try {
        const result = await session.run({ x: tensor });
        try {
          const value = result.embedding;
          if (value.type !== "float32" || value.size !== 192) throw new VoiceprintError("artifact");
          return new Float32Array(value.data as Float32Array);
        } finally {
          for (const output of Object.values(result)) output.dispose();
        }
      } finally {
        tensor.dispose();
      }
    },
    release: () => session.release(),
  };
}
