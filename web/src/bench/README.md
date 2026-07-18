# Streaming Zipformer browser benchmark

This feasibility harness measures one streaming encoder chunk plus one dummy
decoder/joiner pass per iteration. It excludes the first three iterations and
reports mean, p50, p95, and real-time factor against a 320 ms chunk cadence.

Run it in Chrome:

```sh
cd web
bun run dev
```

Open the displayed local URL, then run this in DevTools Console:

```js
await otojiBench.runZipformerBench({ backend: "wasm", chunks: 100 })
```

WebGPU can be sampled with `backend: "webgpu"`. A custom mirror or model
directory can be supplied as `baseUrl`; it must contain the chunk-16-left-128
int8 encoder, decoder, and joiner filenames used by the upstream repository.

The default filenames were checked against the Hugging Face repository listing.
Files are fetched through the browser Cache API. The first-load measurement
therefore includes download/session creation on a cold cache and session
creation on a warm cache.

Cache tensors are discovered from the encoder's ordered input/output names and
initialized from ORT `inputMetadata`. The local `parseOnnxMetadata` helper reads
only ONNX custom string properties, not graph tensor shapes, so it cannot fill
this role. Dynamic batch dimensions are initialized to one. If another export
has dynamic non-batch cache dimensions or does not expose shapes through ORT,
the harness stops with an explicit error; add that export's initial-state shapes
before benchmarking it.
