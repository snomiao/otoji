import {
  createVoiceprintWorkerClient,
  createVoiceprintExtractor,
  type ExtractorOptions,
  type DeviceEmbedding,
} from "../dist/index";

export async function consumer(
  worker: Worker,
  options: ExtractorOptions,
  samples: Float32Array,
): Promise<DeviceEmbedding> {
  const client = createVoiceprintWorkerClient(worker);
  await client.warm(options, true);
  const value = await client.extract(samples);
  const trust: "device" = value.trust;
  void trust;
  // @ts-expect-error Browser output cannot be used as a signed identity proof.
  value.speakerProof;
  client.dispose();
  return value;
}

export async function direct(options: ExtractorOptions, samples: Float32Array) {
  const extractor = createVoiceprintExtractor(options);
  await extractor.warm(true);
  try {
    return await extractor.extract(samples);
  } finally {
    await extractor.dispose();
  }
}
