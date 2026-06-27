// In-browser Opus encode/decode via WebCodecs — no library, no wasm.
// Used to store VAD recordings ~10x smaller than 16-bit WAV.
//
// Notes learned from a round-trip probe:
//  - The encoder emits a decoderConfig.description (OpusHead) we must keep to
//    decode later.
//  - The Opus decoder outputs at 48 kHz regardless of the input rate, so
//    decode() returns the actual output sampleRate (use it for playback).

export interface StoredOpus {
  data: Uint8Array; // concatenated packet bytes
  sizes: Uint32Array; // per-packet byte length
  description?: Uint8Array; // decoder config description (OpusHead)
  sampleRate: number; // encoder input rate (e.g. 16000)
  bitrate: number;
}

export function isOpusSupported(): boolean {
  return typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined";
}

const FRAME_US = 20000; // opus default 20ms frames; timestamps are labels only

/** Encode mono float samples [-1,1] to stored Opus packets. */
export async function encodeOpus(
  samples: Float32Array,
  sampleRate = 16000,
  bitrate = 24000,
): Promise<StoredOpus> {
  const packets: Uint8Array[] = [];
  let description: Uint8Array | undefined;

  await new Promise<void>((resolve, reject) => {
    const enc = new AudioEncoder({
      output: (chunk, meta) => {
        const b = new Uint8Array(chunk.byteLength);
        chunk.copyTo(b);
        packets.push(b);
        const d = meta?.decoderConfig?.description;
        if (d && !description) description = d instanceof Uint8Array ? d : new Uint8Array(d as ArrayBuffer);
      },
      error: reject,
    });
    enc.configure({ codec: "opus", sampleRate, numberOfChannels: 1, bitrate });
    enc.encode(
      new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: samples.length,
        numberOfChannels: 1,
        timestamp: 0,
        data: samples as unknown as BufferSource,
      }),
    );
    enc.flush().then(() => { enc.close(); resolve(); }, reject);
  });

  let total = 0;
  for (const p of packets) total += p.length;
  const data = new Uint8Array(total);
  const sizes = new Uint32Array(packets.length);
  let off = 0;
  for (let i = 0; i < packets.length; i++) {
    data.set(packets[i], off);
    off += packets[i].length;
    sizes[i] = packets[i].length;
  }
  return { data, sizes, description, sampleRate, bitrate };
}

/** Decode stored Opus back to float samples (at the decoder's output rate). */
export async function decodeOpus(s: StoredOpus): Promise<{ samples: Float32Array; sampleRate: number }> {
  const frames: { data: Float32Array; rate: number }[] = [];

  await new Promise<void>((resolve, reject) => {
    const dec = new AudioDecoder({
      output: (ad) => {
        const size = ad.allocationSize({ planeIndex: 0 });
        const buf = new Float32Array(size / 4);
        ad.copyTo(buf, { planeIndex: 0 });
        frames.push({ data: buf, rate: ad.sampleRate });
        ad.close();
      },
      error: reject,
    });
    const cfg: AudioDecoderConfig = { codec: "opus", sampleRate: s.sampleRate, numberOfChannels: 1 };
    if (s.description) cfg.description = s.description;
    dec.configure(cfg);

    let off = 0;
    for (let i = 0; i < s.sizes.length; i++) {
      const len = s.sizes[i];
      dec.decode(
        new EncodedAudioChunk({
          type: "key",
          timestamp: i * FRAME_US,
          duration: FRAME_US,
          data: s.data.subarray(off, off + len),
        }),
      );
      off += len;
    }
    dec.flush().then(() => { dec.close(); resolve(); }, reject);
  });

  const rate = frames[0]?.rate ?? 48000;
  let total = 0;
  for (const f of frames) total += f.data.length;
  const samples = new Float32Array(total);
  let p = 0;
  for (const f of frames) { samples.set(f.data, p); p += f.data.length; }
  return { samples, sampleRate: rate };
}
