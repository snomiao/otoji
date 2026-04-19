//! Microphone capture via cpal with RNNoise denoising.
//!
//! Pipeline: cpal input → downmix mono → resample 48kHz → RNNoise denoise
//! → resample 16kHz → chunk → channel.
//!
//! RNNoise operates at 48kHz with 480-sample frames. We resample the mic
//! input to 48kHz, run RNNoise, then resample down to 16kHz for SenseVoice.

use super::AudioTx;
use crate::core::{AudioChunk, AudioFormat};
use anyhow::{anyhow, Result};
use bytes::Bytes;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat};
use nnnoiseless::DenoiseState;
use std::sync::{Arc, Mutex};

const TARGET_RATE: u32 = 16_000;
const RNNOISE_RATE: u32 = 48_000;
const RNNOISE_FRAME: usize = 480; // RNNoise fixed frame size at 48kHz

/// Peak threshold below which a 480-sample frame is considered idle and
/// bypasses RNNoise. ≈ -54 dBFS — well under any real speech, comfortably
/// above mic self-noise on typical built-in mics. Skipping RNNoise on idle
/// frames cuts otoji's resting CPU from ~76% to ~10% on Apple Silicon.
const IDLE_PEAK_THRESHOLD: f32 = 0.002;

#[inline]
fn frame_peak(frame: &[f32]) -> f32 {
    let mut p = 0.0f32;
    for &s in frame {
        let a = s.abs();
        if a > p { p = a; }
    }
    p
}

/// Internal state shared between the cpal callback and the denoise pipeline.
struct CaptureState {
    /// Buffer of 48kHz f32 mono samples waiting to be denoised.
    pre_denoise: Vec<f32>,
    /// RNNoise state. Created once, reused across frames.
    denoise: Box<DenoiseState<'static>>,
    /// Buffer of 16kHz i16 samples ready to be chunked into AudioChunks.
    post_denoise: Vec<i16>,
    /// Target chunk size in bytes (frame_ms worth of 16k mono s16).
    chunk_target: usize,
}

/// Start capturing from the default input device. The returned `Stream` must
/// be kept alive (drop = stop).
pub fn start_default(frame_ms: u32, tx: AudioTx) -> Result<cpal::Stream> {
    start(None, frame_ms, tx)
}

/// Start capturing from a named input device (substring match or index).
/// Pass `None` to use the system default.
pub fn start(device_hint: Option<&str>, frame_ms: u32, tx: AudioTx) -> Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = match device_hint {
        Some(hint) => find_device(&host, hint)?,
        None => host
            .default_input_device()
            .ok_or_else(|| anyhow!("no default input device"))?,
    };
    let config = device.default_input_config()?;
    let in_rate = config.sample_rate().0;
    let in_channels = config.channels();
    let bytes_per_ms_target =
        (TARGET_RATE as usize / 1000) * (AudioFormat::PCM16K_MONO.bytes_per_sample());
    let chunk_target = bytes_per_ms_target * frame_ms as usize;

    let state = Arc::new(Mutex::new(CaptureState {
        pre_denoise: Vec::with_capacity(RNNOISE_FRAME * 4),
        denoise: DenoiseState::new(),
        post_denoise: Vec::with_capacity(chunk_target),
        chunk_target,
    }));

    let err_fn = |e| tracing::error!("cpal stream error: {e}");

    let state_cb = state.clone();
    let tx_cb = tx.clone();
    let process_f32 = move |data: &[f32]| {
        let mono = downmix_f32_to_mono(data, in_channels);
        // Resample to 48kHz for RNNoise.
        let at48k = linear_resample(&mono, in_rate, RNNOISE_RATE);

        let mut s = state_cb.lock().unwrap();
        s.pre_denoise.extend_from_slice(&at48k);

        // Process complete 480-sample frames through RNNoise.
        while s.pre_denoise.len() >= RNNOISE_FRAME {
            let frame: Vec<f32> = s.pre_denoise.drain(..RNNOISE_FRAME).collect();
            let out = if frame_peak(&frame) < IDLE_PEAK_THRESHOLD {
                // Idle frame: emit silence without invoking RNNoise.
                // RNNoise has internal recurrent state, but on the next
                // real-speech frame the state warms up within a few frames
                // — acceptable trade for ~7× idle CPU reduction.
                vec![0.0f32; RNNOISE_FRAME]
            } else {
                let mut out = vec![0.0f32; RNNOISE_FRAME];
                s.denoise.process_frame(&mut out, &frame);
                out
            };

            // Resample 48kHz → 16kHz.
            let at16k = linear_resample(&out, RNNOISE_RATE, TARGET_RATE);
            let pcm: Vec<i16> = at16k
                .into_iter()
                .map(|v| (v.clamp(-32768.0, 32767.0)) as i16)
                .collect();
            s.post_denoise.extend(pcm);
        }

        // Emit complete chunks.
        while s.post_denoise.len() * 2 >= s.chunk_target {
            let n = s.chunk_target / 2;
            let drain: Vec<i16> = s.post_denoise.drain(..n).collect();
            let bytes = i16_slice_to_le_bytes(&drain);
            let _ = tx_cb.try_send(AudioChunk::new(
                AudioFormat::PCM16K_MONO,
                Bytes::from(bytes),
            ));
        }
    };

    let stream = match config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| process_f32(data),
            err_fn,
            None,
        )?,
        SampleFormat::I16 => {
            let process = move |data: &[i16], _: &_| {
                let floats: Vec<f32> = downmix_i16_to_mono(data, in_channels)
                    .into_iter()
                    .map(|s| s.to_float_sample())
                    .collect();
                // Resample to 48kHz for RNNoise.
                let at48k = linear_resample(&floats, in_rate, RNNOISE_RATE);

                let mut s = state.lock().unwrap();
                s.pre_denoise.extend_from_slice(&at48k);

                while s.pre_denoise.len() >= RNNOISE_FRAME {
                    let frame: Vec<f32> = s.pre_denoise.drain(..RNNOISE_FRAME).collect();
                    let out = if frame_peak(&frame) < IDLE_PEAK_THRESHOLD {
                        vec![0.0f32; RNNOISE_FRAME]
                    } else {
                        let mut out = vec![0.0f32; RNNOISE_FRAME];
                        s.denoise.process_frame(&mut out, &frame);
                        out
                    };

                    let at16k = linear_resample(&out, RNNOISE_RATE, TARGET_RATE);
                    let pcm: Vec<i16> = at16k
                        .into_iter()
                        .map(|v| (v.clamp(-32768.0, 32767.0)) as i16)
                        .collect();
                    s.post_denoise.extend(pcm);
                }

                while s.post_denoise.len() * 2 >= s.chunk_target {
                    let n = s.chunk_target / 2;
                    let drain: Vec<i16> = s.post_denoise.drain(..n).collect();
                    let bytes = i16_slice_to_le_bytes(&drain);
                    let _ = tx.try_send(AudioChunk::new(
                        AudioFormat::PCM16K_MONO,
                        Bytes::from(bytes),
                    ));
                }
            };
            device.build_input_stream(&config.into(), process, err_fn, None)?
        }
        fmt => return Err(anyhow!("unsupported sample format: {fmt:?}")),
    };
    stream.play()?;
    Ok(stream)
}

/// Find an input device by substring match on name, or by numeric index.
fn find_device(host: &cpal::Host, hint: &str) -> Result<cpal::Device> {
    use cpal::traits::HostTrait;
    let inputs: Vec<cpal::Device> = host
        .input_devices()
        .map_err(|e| anyhow!("enumerate input devices: {e}"))?
        .collect();

    // Try numeric index first.
    if let Ok(idx) = hint.parse::<usize>() {
        return inputs
            .into_iter()
            .nth(idx)
            .ok_or_else(|| anyhow!("device index {idx} out of range"));
    }

    // Substring match on device name (case-insensitive).
    let lower = hint.to_lowercase();
    // Special aliases.
    let keywords: &[&str] = match lower.as_str() {
        "default" | "mic" => &[],
        "system" | "loopback" => &["blackhole", "loopback", "soundflower", "vb-cable", "vb cable"],
        _ => &[],
    };
    if keywords.is_empty() && (lower == "default" || lower == "mic") {
        return host
            .default_input_device()
            .ok_or_else(|| anyhow!("no default input device"));
    }
    let search_terms: Vec<&str> = if keywords.is_empty() {
        vec![&lower]
    } else {
        keywords.to_vec()
    };
    for dev in &inputs {
        if let Ok(name) = dev.name() {
            let name_lower = name.to_lowercase();
            if search_terms.iter().any(|k| name_lower.contains(k)) {
                return Ok(dev.clone());
            }
        }
    }
    Err(anyhow!(
        "no input device matching \"{hint}\". Use `otoji devices` to list."
    ))
}

fn downmix_f32_to_mono(data: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    let c = channels as usize;
    data.chunks(c)
        .map(|frame| frame.iter().sum::<f32>() / c as f32)
        .collect()
}

fn downmix_i16_to_mono(data: &[i16], channels: u16) -> Vec<i16> {
    if channels <= 1 {
        return data.to_vec();
    }
    let c = channels as usize;
    data.chunks(c)
        .map(|frame| (frame.iter().map(|s| *s as i32).sum::<i32>() / c as i32) as i16)
        .collect()
}

/// Naive linear resampler. Good enough for ASR-grade speech.
fn linear_resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = to as f32 / from as f32;
    let out_len = (input.len() as f32 * ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f32 / ratio;
        let i0 = src.floor() as usize;
        let i1 = (i0 + 1).min(input.len() - 1);
        let t = src - i0 as f32;
        out.push(input[i0] * (1.0 - t) + input[i1] * t);
    }
    out
}

fn i16_slice_to_le_bytes(samples: &[i16]) -> Vec<u8> {
    let mut v = Vec::with_capacity(samples.len() * 2);
    for s in samples {
        v.extend_from_slice(&s.to_le_bytes());
    }
    v
}
