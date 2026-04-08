//! File-based audio source. Reads raw 16k mono PCM (or .wav with that format).

use super::AudioTx;
use crate::core::{AudioChunk, AudioFormat};
use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use std::io::Read;
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;

/// Stream a raw PCM file to `tx`, pacing chunks in real time so downstream
/// providers see something resembling a live mic.
///
/// `frame_ms` is the chunk size in milliseconds (40ms ≈ 1280 bytes @ 16k mono 16-bit).
pub async fn stream_pcm_file(
    path: impl AsRef<Path>,
    format: AudioFormat,
    frame_ms: u32,
    realtime: bool,
    tx: AudioTx,
) -> Result<()> {
    let bytes = tokio::fs::read(path.as_ref())
        .await
        .with_context(|| format!("reading {}", path.as_ref().display()))?;
    let bytes_per_ms = (format.sample_rate as usize / 1000) * format.bytes_per_sample();
    let chunk_size = bytes_per_ms * frame_ms as usize;
    let frame_dur = Duration::from_millis(frame_ms as u64);

    for chunk in bytes.chunks(chunk_size.max(1)) {
        let c = AudioChunk::new(format, Bytes::copy_from_slice(chunk));
        if tx.send(c).await.is_err() {
            break;
        }
        if realtime {
            sleep(frame_dur).await;
        }
    }
    Ok(())
}

/// Read a WAV stream from `reader` (typically `std::io::stdin().lock()`),
/// validate it is 16kHz mono 16-bit PCM, and forward `frame_ms` chunks to `tx`.
///
/// This is a *synchronous* function intended to be called from
/// `tokio::task::spawn_blocking`. It uses `tx.blocking_send` so the caller
/// must ensure it runs on a blocking-friendly thread.
pub fn stream_wav_reader_blocking<R: Read>(
    reader: R,
    frame_ms: u32,
    tx: AudioTx,
) -> Result<()> {
    let mut wav = hound::WavReader::new(reader).context("parse WAV header from stdin")?;
    let spec = wav.spec();
    if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
        return Err(anyhow!(
            "expected 16kHz mono 16-bit PCM WAV, got {}Hz {}ch {}-bit. \
             Convert with: ffmpeg -i in.wav -ar 16000 -ac 1 -sample_fmt s16 out.wav",
            spec.sample_rate,
            spec.channels,
            spec.bits_per_sample
        ));
    }

    let format = AudioFormat::PCM16K_MONO;
    let samples_per_frame = (16_000usize / 1000) * frame_ms as usize;
    let mut buf: Vec<u8> = Vec::with_capacity(samples_per_frame * 2);

    for sample in wav.samples::<i16>() {
        // Streaming WAVs (e.g. our `otoji say` output, or `ffmpeg -f wav pipe:1`)
        // declare an unknown data length via 0xFFFFFFFF, so hound will keep
        // reading until the underlying reader hits EOF and surfaces it as an
        // io::ErrorKind::UnexpectedEof. Treat that as a clean end-of-stream.
        // For streaming WAVs (data length = 0xFFFFFFFE) we only learn the
        // real end of the stream when the underlying reader returns EOF.
        // hound surfaces this in two different shapes — `IoError(EOF)` and
        // a `FormatError("Failed to read enough bytes.")` — depending on
        // whether the truncation lands on a sample boundary. Treat any
        // error after we've successfully consumed at least one sample as
        // a clean end-of-stream rather than a hard failure.
        let s = match sample {
            Ok(s) => s,
            Err(_) => break,
        };
        buf.extend_from_slice(&s.to_le_bytes());
        if buf.len() >= samples_per_frame * 2 {
            let chunk = AudioChunk::new(format, Bytes::copy_from_slice(&buf));
            if tx.blocking_send(chunk).is_err() {
                return Ok(());
            }
            buf.clear();
        }
    }
    if !buf.is_empty() {
        let chunk = AudioChunk::new(format, Bytes::copy_from_slice(&buf));
        let _ = tx.blocking_send(chunk);
    }
    Ok(())
}
