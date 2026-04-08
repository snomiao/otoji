//! File-based audio source. Reads raw 16k mono PCM (or .wav with that format).

use super::AudioTx;
use crate::core::{AudioChunk, AudioFormat};
use anyhow::{Context, Result};
use bytes::Bytes;
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
