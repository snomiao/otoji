//! Cloudflare Workers AI TTS provider (`@cf/myshell-ai/melotts`).
//!
//! Runs TTS inference at the nearest Cloudflare PoP (Tokyo for JP users),
//! giving ~200-500ms TTFB vs ~500-1000ms for Google Gemini TTS.
//!
//! Output: mono PCM at the model's native rate (44.1 kHz for MeloTTS).

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use base64::Engine;
use bytes::Bytes;
use serde_json::json;

#[derive(Debug, Clone)]
pub struct CloudflareTtsConfig {
    pub account_id: String,
    pub api_token: String,
    /// Model name (e.g. `@cf/myshell-ai/melotts`).
    pub model: String,
    /// Voice language hint — MeloTTS supports `EN`, `ES`, `FR`, `ZH`, `JP`, `KR`.
    pub lang: String,
}

impl CloudflareTtsConfig {
    pub fn from_env() -> Result<Self> {
        let account_id = std::env::var("CLOUDFLARE_ACCOUNT_ID")
            .map_err(|_| OtojiError::Config("CLOUDFLARE_ACCOUNT_ID not set".into()))?;
        let api_token = std::env::var("CLOUDFLARE_API_TOKEN")
            .map_err(|_| OtojiError::Config("CLOUDFLARE_API_TOKEN not set".into()))?;
        Ok(Self {
            account_id,
            api_token,
            model: std::env::var("OTOJI_CLOUDFLARE_TTS_MODEL")
                .unwrap_or_else(|_| "@cf/myshell-ai/melotts".into()),
            lang: std::env::var("OTOJI_CLOUDFLARE_TTS_LANG").unwrap_or_else(|_| "EN".into()),
        })
    }
}

pub struct CloudflareTts {
    cfg: CloudflareTtsConfig,
    client: reqwest::Client,
}

impl CloudflareTts {
    pub fn new(cfg: CloudflareTtsConfig) -> Self {
        Self {
            cfg,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl TtsProvider for CloudflareTts {
    fn name(&self) -> &'static str {
        "cloudflare-melotts"
    }

    fn sample_rate(&self) -> u32 {
        44_100
    }

    fn is_pcm(&self) -> bool {
        // MeloTTS returns MP3-encoded audio by default. afplay handles MP3,
        // so we pass it through as a container (is_pcm=false tells the
        // consumer to not wrap in a WAV header).
        false
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        if text.trim().is_empty() {
            return Ok(());
        }
        let url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/ai/run/{}",
            self.cfg.account_id, self.cfg.model
        );
        let body = json!({
            "prompt": text,
            "lang": self.cfg.lang,
        });
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.cfg.api_token))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("cloudflare tts: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!(
                "cloudflare tts {status}: {body}"
            )));
        }

        // MeloTTS returns JSON with base64-encoded audio in `result.audio`.
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| OtojiError::Decode(format!("cloudflare tts json: {e}")))?;
        let b64 = v
            .pointer("/result/audio")
            .and_then(|a| a.as_str())
            .ok_or_else(|| OtojiError::Decode("cloudflare tts: no result.audio field".into()))?;
        let audio_bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| OtojiError::Decode(format!("cloudflare tts base64: {e}")))?;
        audio
            .send(Bytes::from(audio_bytes))
            .await
            .map_err(|_| OtojiError::Provider("cloudflare tts: audio channel closed".into()))?;
        Ok(())
    }
}
