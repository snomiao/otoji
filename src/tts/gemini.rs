//! Gemini TTS provider (`gemini-2.5-flash-preview-tts`).
//!
//! Gemini's `generateContent` returns the *entire* synthesized audio as a
//! single base64-encoded `inlineData` blob, so it isn't natively streaming.
//! To approximate a streaming experience for the `say | listen` pipeline we
//! split the input on sentence/line boundaries and synthesize each piece
//! sequentially, emitting PCM as soon as each chunk lands. The first audio
//! frame reaches stdout in ~1s (one short sentence) instead of after the
//! whole text is done.
//!
//! Native output: 24 kHz mono signed-16 PCM.

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use base64::Engine;
use bytes::Bytes;
use serde_json::json;

const ENDPOINT: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

#[derive(Debug, Clone)]
pub struct GeminiTtsConfig {
    pub api_key: String,
    pub voice: String,
}

impl GeminiTtsConfig {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            api_key: std::env::var("GEMINI_API_KEY")
                .map_err(|_| OtojiError::Config("GEMINI_API_KEY not set".into()))?,
            voice: std::env::var("OTOJI_GEMINI_VOICE").unwrap_or_else(|_| "Kore".into()),
        })
    }
}

pub struct GeminiTts {
    cfg: GeminiTtsConfig,
    client: reqwest::Client,
}

impl GeminiTts {
    pub fn new(cfg: GeminiTtsConfig) -> Self {
        Self {
            cfg,
            client: reqwest::Client::new(),
        }
    }

    async fn synth_chunk(&self, text: &str) -> Result<Vec<u8>> {
        let body = json!({
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": self.cfg.voice}
                    }
                }
            }
        });
        let resp = self
            .client
            .post(ENDPOINT)
            .query(&[("key", &self.cfg.api_key)])
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("gemini http: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!("gemini tts {status}: {body}")));
        }
        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| OtojiError::Provider(format!("gemini json: {e}")))?;
        let b64 = v
            .pointer("/candidates/0/content/parts/0/inlineData/data")
            .and_then(|v| v.as_str())
            .ok_or_else(|| OtojiError::Provider("gemini: no inlineData in response".into()))?;
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| OtojiError::Provider(format!("gemini base64: {e}")))
    }
}

/// Split text into roughly sentence-sized chunks for the per-line streaming
/// hack. Splits on `.`, `!`, `?`, `。`, `！`, `？` and newline; keeps the
/// terminator with the chunk it ended.
fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for ch in text.chars() {
        cur.push(ch);
        if matches!(ch, '.' | '!' | '?' | '。' | '！' | '？' | '\n') {
            let trimmed = cur.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
            cur.clear();
        }
    }
    let trimmed = cur.trim();
    if !trimmed.is_empty() {
        out.push(trimmed.to_string());
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

#[async_trait]
impl TtsProvider for GeminiTts {
    fn name(&self) -> &'static str {
        "gemini"
    }

    fn sample_rate(&self) -> u32 {
        24_000
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        let chunks = split_sentences(text);
        for (i, chunk) in chunks.iter().enumerate() {
            eprintln!(
                "gemini-tts: synthesizing chunk {}/{} ({} chars)",
                i + 1,
                chunks.len(),
                chunk.chars().count()
            );
            let pcm = self.synth_chunk(chunk).await?;
            if audio.send(Bytes::from(pcm)).await.is_err() {
                break;
            }
        }
        Ok(())
    }
}
