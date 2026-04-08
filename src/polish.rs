//! otoji-polish — LLM polish layer.
//!
//! Takes raw ASR finals (with fillers, missing punctuation, ITN noise) and
//! returns a tidied sentence. See `docs/03-llm-polish-layer.md` for design.

use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[async_trait]
pub trait Polisher: Send + Sync {
    fn name(&self) -> &'static str;

    /// Tidy a single ASR final segment. `prev` is optional 1-sentence context
    /// to keep tense / topic consistent across segments.
    async fn polish(&self, raw: &str, prev: Option<&str>) -> Result<String>;
}

/// No-op polisher: returns the input unchanged. Useful as a fallback or for
/// benchmarking the ASR alone.
pub struct NoopPolisher;

#[async_trait]
impl Polisher for NoopPolisher {
    fn name(&self) -> &'static str {
        "noop"
    }
    async fn polish(&self, raw: &str, _prev: Option<&str>) -> Result<String> {
        Ok(raw.to_string())
    }
}

/// Anthropic Messages API polisher. Defaults to Claude Haiku 4.5 for low latency.
pub struct AnthropicPolisher {
    pub api_key: String,
    pub model: String,
    pub glossary: Vec<String>,
    client: reqwest::Client,
}

impl AnthropicPolisher {
    pub fn new(api_key: String, model: impl Into<String>) -> Self {
        Self {
            api_key,
            model: model.into(),
            glossary: Vec::new(),
            client: reqwest::Client::new(),
        }
    }

    pub fn from_env() -> Result<Self> {
        let key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| OtojiError::Config("ANTHROPIC_API_KEY not set".into()))?;
        let model = std::env::var("OTOJI_POLISH_MODEL")
            .unwrap_or_else(|_| "claude-haiku-4-5-20251001".into());
        Ok(Self::new(key, model))
    }

    pub fn with_glossary(mut self, terms: Vec<String>) -> Self {
        self.glossary = terms;
        self
    }
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: String,
    messages: Vec<AnthropicMessage<'a>>,
}

#[derive(Serialize)]
struct AnthropicMessage<'a> {
    role: &'a str,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(rename = "type")]
    _ty: String,
    #[serde(default)]
    text: String,
}

#[async_trait]
impl Polisher for AnthropicPolisher {
    fn name(&self) -> &'static str {
        "anthropic"
    }

    async fn polish(&self, raw: &str, prev: Option<&str>) -> Result<String> {
        let glossary = if self.glossary.is_empty() {
            "(none)".to_string()
        } else {
            self.glossary.join(", ")
        };
        let prev = prev.unwrap_or("(none)");
        let system = format!(
            "You tidy ASR transcripts.\n\
             - Preserve meaning. Do not summarize.\n\
             - Add punctuation, drop fillers (uh/um/那个/えーと).\n\
             - Normalize numbers, dates, units.\n\
             - Keep code-switched text (zh/en/ja) as-is.\n\
             - Glossary: {glossary}\n\
             - Previous sentence: {prev}\n\
             Output only the tidied sentence."
        );
        let body = AnthropicRequest {
            model: &self.model,
            max_tokens: 512,
            system,
            messages: vec![AnthropicMessage {
                role: "user",
                content: raw.to_string(),
            }],
        };
        let resp = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("anthropic: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!("anthropic {status}: {body}")));
        }
        let parsed: AnthropicResponse = resp
            .json()
            .await
            .map_err(|e| OtojiError::Decode(format!("anthropic decode: {e}")))?;
        Ok(parsed
            .content
            .into_iter()
            .map(|b| b.text)
            .collect::<Vec<_>>()
            .join("")
            .trim()
            .to_string())
    }
}
