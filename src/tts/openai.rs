//! OpenAI TTS provider (`/v1/audio/speech`).
//!
//! Streams native 24 kHz mono signed-16 PCM via `response_format=pcm` over
//! HTTP chunked transfer. First audio bytes typically arrive within
//! ~300-800 ms of the request.

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use bytes::Bytes;
use futures_util::StreamExt;
use serde_json::json;

const ENDPOINT: &str = "https://api.openai.com/v1/audio/speech";

#[derive(Debug, Clone)]
pub struct OpenAiTtsConfig {
    pub api_key: String,
    /// Model: `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`.
    pub model: String,
    /// Voice: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `coral`.
    pub voice: String,
}

impl OpenAiTtsConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            api_key: std::env::var("OPENAI_API_KEY")
                .map_err(|_| OtojiError::Config("OPENAI_API_KEY not set".into()))?,
            model: std::env::var("OTOJI_OPENAI_TTS_MODEL").unwrap_or_else(|_| "tts-1".into()),
            voice: std::env::var("OTOJI_OPENAI_TTS_VOICE").unwrap_or_else(|_| "alloy".into()),
        })
    }
}

pub struct OpenAiTts {
    cfg: OpenAiTtsConfig,
    client: reqwest::Client,
}

impl OpenAiTts {
    pub fn new(cfg: OpenAiTtsConfig) -> Self {
        Self {
            cfg,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl TtsProvider for OpenAiTts {
    fn name(&self) -> &'static str {
        "openai"
    }

    fn sample_rate(&self) -> u32 {
        24_000
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        let body = json!({
            "model": self.cfg.model,
            "voice": self.cfg.voice,
            "input": text,
            "response_format": "pcm",
        });
        let resp = self
            .client
            .post(ENDPOINT)
            .bearer_auth(&self.cfg.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("openai http: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!("openai tts {status}: {body}")));
        }
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| OtojiError::Transport(format!("openai stream: {e}")))?;
            if audio.send(Bytes::from(chunk)).await.is_err() {
                break;
            }
        }
        Ok(())
    }
}
