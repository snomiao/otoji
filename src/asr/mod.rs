//! otoji-asr — `AsrProvider` trait + concrete providers.
//!
//! Currently bundled:
//! - `iflytek_rtasr` (long-form streaming ASR, MD5+HMAC-SHA1 signa auth)
//!
//! Roadmap (see `docs/02-rtasr-comparison.md`):
//! - `coli` (via ListenHub)
//! - `sensevoice` (FunASR self-host bridge)

use crate::audio::AudioRx;
use crate::core::{AsrEvent, Result};
use async_trait::async_trait;
use tokio::sync::mpsc;

pub mod iflytek_rtasr;
pub mod sensevoice;
pub mod sensevoice_download;

pub type AsrEventRx = mpsc::Receiver<AsrEvent>;
pub type AsrEventTx = mpsc::Sender<AsrEvent>;

/// A streaming ASR provider. Implementors consume an `AudioRx` and emit
/// `AsrEvent`s onto a channel.
#[async_trait]
pub trait AsrProvider: Send + Sync {
    /// Provider name (`"iflytek-rtasr"`, `"coli"`, `"sensevoice"`, ...).
    fn name(&self) -> &'static str;

    /// Drive a session: read PCM from `audio`, push events to `events`.
    /// Returns when the session ends or errors.
    async fn run(&self, audio: AudioRx, events: AsrEventTx) -> Result<()>;
}
