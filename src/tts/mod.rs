//! otoji-tts — `TtsProvider` trait + iFlytek TTS implementation.

use crate::core::Result;
use async_trait::async_trait;
use bytes::Bytes;
use tokio::sync::mpsc;

pub mod gemini;
pub mod iflytek_tts;

pub type TtsAudioRx = mpsc::Receiver<Bytes>;
pub type TtsAudioTx = mpsc::Sender<Bytes>;

#[async_trait]
pub trait TtsProvider: Send + Sync {
    fn name(&self) -> &'static str;

    /// Native sample rate of the PCM stream this provider emits. Mono i16 LE
    /// is the contract for everything except `iflytek_tts` (legacy MP3, kept
    /// for backwards compatibility — see `is_pcm`).
    fn sample_rate(&self) -> u32 {
        16_000
    }

    /// True when `synthesize` emits raw mono i16 LE PCM at `sample_rate()`.
    /// False for legacy providers that emit a container format like MP3.
    fn is_pcm(&self) -> bool {
        true
    }

    /// Synthesize `text` and stream audio bytes onto `audio`. Returns when
    /// synthesis is complete.
    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()>;
}
