"""Native oracle for the benchmark's generated PCM; no recording or playback."""
import argparse
import hashlib
import json

import numpy as np
import sherpa_onnx

p = argparse.ArgumentParser()
p.add_argument("--model", required=True)
p.add_argument("--pcm", required=True, help="The loopback benchmark /synthetic.f32")
p.add_argument("--output", required=True)
args = p.parse_args()
with open(args.model, "rb") as f:
    digest = hashlib.sha256(f.read()).hexdigest()
if digest != "aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2":
    raise ValueError("Use the documented public fp32 model.")
pcm = np.fromfile(args.pcm, dtype="<f4")
if len(pcm) != 48000 or not np.isfinite(pcm).all():
    raise ValueError("Expected the benchmark's 3-second generated PCM.")
engine = sherpa_onnx.SpeakerEmbeddingExtractor(
    sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=args.model, num_threads=1)
)
stream = engine.create_stream()
stream.accept_waveform(16000, pcm)
stream.input_finished()
vector = np.asarray(engine.compute(stream), dtype=np.float32)
vector /= np.linalg.norm(vector)
with open(args.output, "w") as f:
    json.dump({"modelSha256": digest, "native": vector.tolist()}, f)
