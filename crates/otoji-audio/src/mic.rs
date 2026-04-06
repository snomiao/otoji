//! Microphone capture via cpal. Resamples to 16k mono i16 PCM with a simple
//! linear strategy and pushes ~`frame_ms` chunks to the channel.

use crate::AudioTx;
use anyhow::{anyhow, Result};
use bytes::Bytes;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat};
use otoji_core::{AudioChunk, AudioFormat};
use std::sync::{Arc, Mutex};

const TARGET_RATE: u32 = 16_000;

/// Start capturing from the default input device. The returned `Stream` must
/// be kept alive (drop = stop).
pub fn start_default(frame_ms: u32, tx: AudioTx) -> Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow!("no default input device"))?;
    let config = device.default_input_config()?;
    let in_rate = config.sample_rate().0;
    let in_channels = config.channels();
    let bytes_per_ms_target =
        (TARGET_RATE as usize / 1000) * (AudioFormat::PCM16K_MONO.bytes_per_sample());
    let chunk_target = bytes_per_ms_target * frame_ms as usize;

    let buf: Arc<Mutex<Vec<i16>>> = Arc::new(Mutex::new(Vec::with_capacity(chunk_target)));
    let buf_cb = buf.clone();
    let tx_cb = tx.clone();

    let err_fn = |e| tracing::error!("cpal stream error: {e}");

    let stream = match config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| {
                let mono = downmix_f32_to_mono(data, in_channels);
                let resampled = linear_resample(&mono, in_rate, TARGET_RATE);
                let mut pcm: Vec<i16> = resampled
                    .into_iter()
                    .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .collect();
                let mut g = buf_cb.lock().unwrap();
                g.append(&mut pcm);
                while g.len() * 2 >= chunk_target {
                    let drain: Vec<i16> = g.drain(..(chunk_target / 2)).collect();
                    let bytes = i16_slice_to_le_bytes(&drain);
                    let _ = tx_cb.try_send(AudioChunk::new(
                        AudioFormat::PCM16K_MONO,
                        Bytes::from(bytes),
                    ));
                }
            },
            err_fn,
            None,
        )?,
        SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| {
                let mono_f: Vec<f32> = downmix_i16_to_mono(data, in_channels)
                    .into_iter()
                    .map(|s| s.to_float_sample())
                    .collect();
                let resampled = linear_resample(&mono_f, in_rate, TARGET_RATE);
                let mut pcm: Vec<i16> = resampled
                    .into_iter()
                    .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .collect();
                let mut g = buf_cb.lock().unwrap();
                g.append(&mut pcm);
                while g.len() * 2 >= chunk_target {
                    let drain: Vec<i16> = g.drain(..(chunk_target / 2)).collect();
                    let bytes = i16_slice_to_le_bytes(&drain);
                    let _ = tx_cb.try_send(AudioChunk::new(
                        AudioFormat::PCM16K_MONO,
                        Bytes::from(bytes),
                    ));
                }
            },
            err_fn,
            None,
        )?,
        fmt => return Err(anyhow!("unsupported sample format: {fmt:?}")),
    };
    stream.play()?;
    Ok(stream)
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
