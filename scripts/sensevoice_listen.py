#!/usr/bin/env python3
"""SenseVoice live mic transcriber.

Streams microphone audio through a simple VAD into the sherpa-onnx
SenseVoice offline recognizer and prints one JSON line per utterance to
stdout. Designed to be spawned as a subprocess by `otoji`.

Lines emitted (one per line, UTF-8):
    {"type":"open"}
    {"type":"partial","text":"..."}      # not used yet, kept for future
    {"type":"final","seg_id":N,"text":"...","lang":"zh"}
    {"type":"error","message":"..."}
    {"type":"closed"}
"""
from __future__ import annotations
import json
import os
import queue
import sys
import time
from pathlib import Path

SAMPLE_RATE = 16_000

def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

MODEL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
)


def ensure_model(model_dir: Path) -> None:
    """Download + extract the SenseVoice model if it isn't already present."""
    model_path = model_dir / "model.int8.onnx"
    tokens_path = model_dir / "tokens.txt"
    if model_path.exists() and tokens_path.exists():
        return
    import tarfile
    import urllib.request

    parent = model_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    archive = parent / "sense-voice.tar.bz2"
    if not archive.exists():
        emit({"type": "error", "message": f"downloading SenseVoice model (~234MB) → {archive}"})
        with urllib.request.urlopen(MODEL_URL) as resp, open(archive, "wb") as f:
            total = int(resp.headers.get("Content-Length") or 0)
            read = 0
            last_pct = -1
            while True:
                buf = resp.read(1024 * 1024)
                if not buf:
                    break
                f.write(buf)
                read += len(buf)
                if total:
                    pct = read * 100 // total
                    if pct != last_pct and pct % 5 == 0:
                        emit({"type": "error", "message": f"download {pct}%"})
                        last_pct = pct
    emit({"type": "error", "message": f"extracting {archive.name}"})
    with tarfile.open(archive, "r:bz2") as tf:
        tf.extractall(parent)
    if not (model_path.exists() and tokens_path.exists()):
        raise RuntimeError(f"model still missing after extract at {model_dir}")


def main() -> int:
    model_dir = Path(os.environ.get("OTOJI_SENSEVOICE_DIR", "models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"))
    try:
        ensure_model(model_dir)
    except Exception as e:
        emit({"type": "error", "message": f"model fetch failed: {e}"})
        return 2
    model_path = model_dir / "model.int8.onnx"
    tokens_path = model_dir / "tokens.txt"

    try:
        import numpy as np
        import sherpa_onnx
        if os.environ.get("OTOJI_INPUT_SOURCE", "mic") == "mic":
            import sounddevice as sd  # noqa: F401
    except Exception as e:
        emit({"type": "error", "message": f"missing dep: {e}"})
        return 3

    recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
        model=str(model_path),
        tokens=str(tokens_path),
        num_threads=2,
        use_itn=True,
        language="auto",
    )

    # Optional: pick a specific input device by substring match (e.g. "BlackHole").
    device_query = os.environ.get("OTOJI_INPUT_DEVICE")
    if device_query:
        chosen = None
        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0 and device_query.lower() in d["name"].lower():
                chosen = i
                emit({"type": "error", "message": f"using input device [{i}] {d['name']}"})
                break
        if chosen is None:
            emit({"type": "error", "message": f"no input device matching '{device_query}'"})
            return 4
        sd.default.device = (chosen, sd.default.device[1] if isinstance(sd.default.device, (list, tuple)) else None)

    q: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(indata, frames, time_info, status):
        if status:
            emit({"type": "error", "message": str(status)})
        # mono float32 in [-1, 1]
        q.put(indata[:, 0].copy())

    # Simple energy-based VAD: collect samples while RMS > threshold,
    # flush an utterance after `silence_ms` of quiet (or `max_ms` cap).
    threshold = float(os.environ.get("OTOJI_VAD_THRESHOLD", "0.012"))
    silence_ms = int(os.environ.get("OTOJI_VAD_SILENCE_MS", "600"))
    max_ms = int(os.environ.get("OTOJI_VAD_MAX_MS", "12000"))
    min_ms = 250

    block_ms = 30
    block_size = SAMPLE_RATE * block_ms // 1000
    silence_blocks_needed = silence_ms // block_ms
    max_blocks = max_ms // block_ms
    min_blocks = min_ms // block_ms

    buf: list = []
    silence_blocks = 0
    seg_id = 0

    emit({"type": "open"})

    source = os.environ.get("OTOJI_INPUT_SOURCE", "mic")

    def flush() -> None:
        nonlocal seg_id, buf, silence_blocks
        if len(buf) < min_blocks:
            buf = []
            silence_blocks = 0
            return
        import numpy as np
        samples = np.concatenate(buf).astype("float32")
        buf = []
        silence_blocks = 0
        s = recognizer.create_stream()
        s.accept_waveform(SAMPLE_RATE, samples)
        recognizer.decode_stream(s)
        text = (s.result.text or "").strip()
        lang = getattr(s.result, "lang", "") or ""
        if text:
            emit({"type": "final", "seg_id": seg_id, "text": text, "lang": lang})
            seg_id += 1

    if source == "stdin":
        # Read raw 16k mono s16le PCM from stdin in `block_size`-sample chunks.
        import numpy as np
        try:
            stdin = sys.stdin.buffer
            chunk_bytes = block_size * 2
            while True:
                raw = stdin.read(chunk_bytes)
                if not raw:
                    flush()
                    break
                block = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
                rms = float(np.sqrt(np.mean(block * block))) if block.size else 0.0
                if rms >= threshold or buf:
                    buf.append(block)
                    silence_blocks = silence_blocks + 1 if rms < threshold else 0
                    if silence_blocks >= silence_blocks_needed or len(buf) >= max_blocks:
                        flush()
        except KeyboardInterrupt:
            pass
        except Exception as e:
            emit({"type": "error", "message": f"{type(e).__name__}: {e}"})
            return 1
        finally:
            emit({"type": "closed"})
        return 0

    try:
        import sounddevice as sd
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=block_size,
            callback=callback,
        ):
            while True:
                try:
                    block = q.get(timeout=0.5)
                except queue.Empty:
                    continue
                import numpy as np
                rms = float(np.sqrt(np.mean(block * block)))
                if rms >= threshold or buf:
                    buf.append(block)
                    if rms < threshold:
                        silence_blocks += 1
                    else:
                        silence_blocks = 0
                    if silence_blocks >= silence_blocks_needed or len(buf) >= max_blocks:
                        flush()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        emit({"type": "error", "message": f"{type(e).__name__}: {e}"})
        return 1
    finally:
        emit({"type": "closed"})
    return 0

if __name__ == "__main__":
    sys.exit(main())
