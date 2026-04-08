//! ElevenLabs TTS provider (`/v1/text-to-speech/{voice_id}/stream`).
//!
//! Requests `output_format=pcm_16000` so the response is raw mono signed-16
//! PCM at 16 kHz, delivered via HTTP chunked transfer. First audio bytes
//! typically arrive within ~150-400 ms.

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use serde_json::json;

#[derive(Debug, Clone)]
pub struct ElevenLabsTtsConfig {
    pub api_key: String,
    pub voice_id: String,
    pub model_id: String,
}

impl ElevenLabsTtsConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            api_key: std::env::var("ELEVENLABS_API_KEY")
                .map_err(|_| OtojiError::Config("ELEVENLABS_API_KEY not set".into()))?,
            // Default to "Rachel", a stock voice everyone has access to.
            voice_id: std::env::var("OTOJI_ELEVENLABS_VOICE")
                .unwrap_or_else(|_| "21m00Tcm4TlvDq8ikWAM".into()),
            model_id: std::env::var("OTOJI_ELEVENLABS_MODEL")
                .unwrap_or_else(|_| "eleven_turbo_v2_5".into()),
        })
    }
}

pub struct ElevenLabsTts {
    cfg: ElevenLabsTtsConfig,
    client: reqwest::Client,
}

impl ElevenLabsTts {
    pub fn new(cfg: ElevenLabsTtsConfig) -> Self {
        Self {
            cfg,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl TtsProvider for ElevenLabsTts {
    fn name(&self) -> &'static str {
        "elevenlabs"
    }

    fn sample_rate(&self) -> u32 {
        16_000
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        let url = format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}/stream?output_format=pcm_16000",
            self.cfg.voice_id
        );
        let body = json!({
            "text": text,
            "model_id": self.cfg.model_id,
        });
        let resp = self
            .client
            .post(&url)
            .header("xi-api-key", &self.cfg.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("elevenlabs http: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!(
                "elevenlabs tts {status}: {body}"
            )));
        }
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk =
                chunk.map_err(|e| OtojiError::Transport(format!("elevenlabs stream: {e}")))?;
            if audio.send(Bytes::from(chunk)).await.is_err() {
                break;
            }
        }
        Ok(())
    }
}
