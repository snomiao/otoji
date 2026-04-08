//! otoji-tts — `TtsProvider` trait + iFlytek TTS implementation.

use async_trait::async_trait;
use bytes::Bytes;
use crate::core::Result;
use tokio::sync::mpsc;

pub mod iflytek_tts;

pub type TtsAudioRx = mpsc::Receiver<Bytes>;
pub type TtsAudioTx = mpsc::Sender<Bytes>;

#[async_trait]
pub trait TtsProvider: Send + Sync {
    fn name(&self) -> &'static str;

    /// Synthesize `text` and stream raw audio bytes (provider-defined format)
    /// onto `audio`. Returns when synthesis is complete.
    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()>;
}
