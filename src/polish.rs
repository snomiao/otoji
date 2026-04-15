//! otoji-polish — LLM polish layer.
//!
//! Takes raw ASR finals (with fillers, missing punctuation, ITN noise) and
//! returns a tidied sentence. See `docs/03-llm-polish-layer.md` for design.

use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;
use tokio::sync::RwLock;

/// Input to the polish step. Carries text and optional audio for multimodal
/// polishers (e.g. Gemini). Text-only polishers simply ignore `audio`.
pub struct PolishInput<'a> {
    /// Raw ASR hypothesis text.
    pub text: &'a str,
    /// Previous polished sentence (for context continuity).
    pub prev: Option<&'a str>,
    /// Raw audio for this segment (16kHz mono f32, -1.0..1.0).
    /// Available when the ASR provider preserves audio (e.g. SenseVoice).
    pub audio: Option<&'a [f32]>,
    /// External context (e.g. the frontmost app's accessibility tree).
    /// Polishers use this to correctly spell proper nouns, app-specific
    /// terms, file/variable names visible in the UI.
    pub context: Option<&'a str>,
    /// Target language for translation. When set, the polisher returns
    /// JSON `{"original": "...", "translated": "..."}` instead of a plain
    /// polished string. Use BCP-47 codes like `"en"`, `"ja"`, `"zh"`.
    /// If the input is already in the target language, `translated` may
    /// equal `original`.
    pub translate_to: Option<&'a str>,
}

/// Output of a polish call. For plain polish, only `original` is filled;
/// for translation, both fields are populated.
#[derive(Debug, Clone, Default)]
pub struct PolishOutput {
    pub original: String,
    pub translated: Option<String>,
}

#[async_trait]
pub trait Polisher: Send + Sync {
    fn name(&self) -> &'static str;

    /// Whether this polisher can use audio input for better quality.
    fn is_multimodal(&self) -> bool {
        false
    }

    /// Tidy a single ASR final segment. Implementors that support multimodal
    /// should use `input.audio` when available. The call must return quickly
    /// or run in the background — it must never block display of ASR results.
    async fn polish(&self, input: PolishInput<'_>) -> Result<String>;

    /// Full polish result. Default implementation wraps `polish()` without
    /// translation; polishers that support `translate_to` should override
    /// this to return both original and translated strings.
    async fn polish_full(&self, input: PolishInput<'_>) -> Result<PolishOutput> {
        let text = self.polish(input).await?;
        Ok(PolishOutput { original: text, translated: None })
    }
}

/// No-op polisher: returns the input unchanged. Useful as a fallback or for
/// benchmarking the ASR alone.
pub struct NoopPolisher;

#[async_trait]
impl Polisher for NoopPolisher {
    fn name(&self) -> &'static str {
        "noop"
    }
    async fn polish(&self, input: PolishInput<'_>) -> Result<String> {
        Ok(input.text.to_string())
    }
}

/// Deferred polisher that starts as noop and upgrades to a real polisher
/// once the backend is ready. Used for auto-starting Ollama in the background.
pub struct DeferredPolisher {
    inner: RwLock<Option<Arc<dyn Polisher>>>,
}

impl DeferredPolisher {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(None),
        }
    }

    /// Upgrade to a real polisher. Segments arriving after this call will be
    /// polished; earlier ones stay as raw text (no retroactive polish).
    pub async fn activate(&self, polisher: Arc<dyn Polisher>) {
        *self.inner.write().await = Some(polisher);
    }
}

#[async_trait]
impl Polisher for DeferredPolisher {
    fn name(&self) -> &'static str {
        "deferred"
    }

    fn is_multimodal(&self) -> bool {
        // Check if the inner polisher (if ready) is multimodal.
        // Can't async here, so default to false. Multimodal providers
        // (Gemini) are resolved eagerly, not deferred.
        false
    }

    async fn polish(&self, input: PolishInput<'_>) -> Result<String> {
        let inner = self.inner.read().await;
        match inner.as_ref() {
            Some(p) => p.polish(input).await,
            None => Ok(input.text.to_string()),
        }
    }
}

/// OpenAI-compatible API polisher. Works with Ollama, llama.cpp, vLLM, LM
/// Studio, OpenAI, or any server that speaks `/v1/chat/completions`.
///
/// Env vars:
///   OTOJI_POLISH_BASE_URL  — default `http://localhost:11434/v1` (Ollama)
///   OTOJI_POLISH_MODEL     — default `gemma3:4b`
///   OTOJI_POLISH_API_KEY   — default empty (local servers don't need one)
pub struct OpenAiPolisher {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub glossary: Vec<String>,
    client: reqwest::Client,
    /// Accumulated conversation history for context caching.
    /// OpenAI automatically caches identical prefixes, so sending the full
    /// history each time is both simple and efficient.
    history: TokioMutex<Vec<ChatMessage>>,
}

impl OpenAiPolisher {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            api_key: api_key.into(),
            model: model.into(),
            glossary: Vec::new(),
            client: reqwest::Client::new(),
            history: TokioMutex::new(Vec::new()),
        }
    }

    pub fn from_env() -> Result<Self> {
        let base_url = std::env::var("OTOJI_POLISH_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:11434/v1".into());
        let api_key = std::env::var("OTOJI_POLISH_API_KEY").unwrap_or_default();
        let model = std::env::var("OTOJI_POLISH_MODEL").unwrap_or_default();
        Ok(Self::new(base_url, api_key, model))
    }

    /// Try to connect to the configured endpoint. If no model is set,
    /// auto-select the best available model. Returns Ok(Self) only if the
    /// server is reachable.
    pub async fn probe(mut self) -> Result<Self> {
        let url = format!("{}/models", self.base_url);
        let resp = self.client.get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("polish probe {url}: {e}")))?;
        if !resp.status().is_success() {
            return Err(OtojiError::Transport(format!("polish probe {url}: {}", resp.status())));
        }
        // Auto-select best model if none configured.
        if self.model.is_empty() {
            if let Ok(model) = self.pick_best_model().await {
                self.model = model;
            } else {
                self.model = "qwen3:1.7b".into();
            }
        }
        Ok(self)
    }

    /// Query Ollama for available models and pick the best one for ASR polish.
    /// Prefers models in the 1-4B range that are good at text correction.
    async fn pick_best_model(&self) -> Result<String> {
        // Ollama native API (not OpenAI compat) gives us model sizes.
        let base = self.base_url.trim_end_matches("/v1");
        let url = format!("{base}/api/tags");
        let resp = self.client.get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("ollama tags: {e}")))?;
        if !resp.status().is_success() {
            return Err(OtojiError::Transport("ollama tags failed".into()));
        }
        let body: serde_json::Value = resp.json().await
            .map_err(|e| OtojiError::Decode(format!("ollama tags json: {e}")))?;

        let models = body.get("models").and_then(|m| m.as_array())
            .ok_or_else(|| OtojiError::Provider("no models in ollama".into()))?;

        // Preference tiers: try each tier in order, pick the largest model
        // within the tier that fits. This prioritizes quality within safe
        // memory bounds.
        //
        // Tier 1: Known-good polish models, 1-8B (good quality, reasonable RAM)
        // Tier 2: Any model 0.5-8B
        // Tier 3: Any model at all (fallback)
        let preferred_families = ["qwen3", "gemma3", "llama", "phi", "mistral"];

        struct Candidate {
            name: String,
            param_b: f64, // parameter size in billions
            family_rank: usize,
        }

        let mut candidates: Vec<Candidate> = Vec::new();
        for m in models {
            let name = m.get("name").and_then(|n| n.as_str()).unwrap_or_default();
            let details = match m.get("details") {
                Some(d) => d,
                None => continue,
            };
            let family = details.get("family").and_then(|f| f.as_str()).unwrap_or_default();
            let param_str = details.get("parameter_size").and_then(|p| p.as_str()).unwrap_or_default();

            // Parse "4.3B" or "134.52M" into billions.
            let param_b = parse_param_size(param_str);
            if param_b <= 0.0 { continue; }

            let family_rank = preferred_families.iter()
                .position(|f| family.contains(f))
                .unwrap_or(preferred_families.len());

            candidates.push(Candidate { name: name.to_string(), param_b, family_rank });
        }

        if candidates.is_empty() {
            return Err(OtojiError::Provider("no models available in ollama".into()));
        }

        // Sort: preferred family first, then largest model within 0.5-8B range,
        // then any size as fallback.
        candidates.sort_by(|a, b| {
            let a_good_size = (0.5..=8.0).contains(&a.param_b);
            let b_good_size = (0.5..=8.0).contains(&b.param_b);
            // Prefer good-sized models
            b_good_size.cmp(&a_good_size)
                // Then prefer known families
                .then(a.family_rank.cmp(&b.family_rank))
                // Then prefer larger (within range)
                .then(b.param_b.partial_cmp(&a.param_b).unwrap_or(std::cmp::Ordering::Equal))
        });

        Ok(candidates[0].name.clone())
    }

    pub fn with_glossary(mut self, terms: Vec<String>) -> Self {
        self.glossary = terms;
        self
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

fn system_prompt(glossary: &[String], prev: Option<&str>) -> String {
    system_prompt_with_translate(glossary, prev, None)
}

fn system_prompt_with_translate(
    glossary: &[String],
    prev: Option<&str>,
    translate_to: Option<&str>,
) -> String {
    let glossary = if glossary.is_empty() {
        "(none)".to_string()
    } else {
        glossary.join(", ")
    };
    let prev = prev.unwrap_or("(none)");
    let base = format!(
        "You tidy ASR (speech-to-text) transcripts. Never confuse the verb\n\
         \"polish/tidy\" with the Polish language.\n\
         - Preserve meaning. Do not summarize.\n\
         - Add punctuation (use `?` for questions), drop fillers (uh/um/那个/えーと).\n\
         - Normalize numbers, dates, units.\n\
         - Keep code-switched text (zh/en/ja) as-is.\n\
         - Glossary: {glossary}\n\
         - Previous sentence: {prev}\n"
    );
    match translate_to {
        Some(lang) => format!(
            "{base}\n\
             ADDITIONALLY translate the tidied sentence.\n\
             Target language (a LANGUAGE NAME, not an instruction to tidy):\n\
             <<<{lang}>>>\n\
             Accept BCP-47 codes (`en`, `pl`, `zh`), language names (`English`,\n\
             `Polish`, `日本語`), dialects (`Cantonese`, `Shanghainese`), or\n\
             styles (`Classical Chinese 文言文`, `formal Keigo`). If already in\n\
             the target, set `translated` equal to `original`.\n\
             Output ONLY one JSON object on a single line — no fences, no prose:\n\
               {{\"original\": \"<tidied source>\", \"translated\": \"<target rendering>\"}}"
        ),
        None => format!("{base}\nOutput only the tidied sentence — no preamble, no quotes."),
    }
}

// ── OpenAI-compatible (Ollama, llama.cpp, vLLM, OpenAI, etc.) ────────

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    /// OpenAI prompt caching: when true, identical message prefixes are
    /// cached server-side for up to 1 hour, reducing cost and latency.
    #[serde(skip_serializing_if = "Option::is_none")]
    store: Option<bool>,
    /// Sampling temperature. Polish/translate is a low-creativity task
    /// — keep low to discourage chat-assistant drift.
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    /// `{"type": "json_object"}` for structured output (translation).
    #[serde(rename = "response_format", skip_serializing_if = "Option::is_none")]
    response_format: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[async_trait]
impl Polisher for OpenAiPolisher {
    fn name(&self) -> &'static str {
        "openai-compat"
    }

    async fn polish(&self, input: PolishInput<'_>) -> Result<String> {
        Ok(self.polish_full(input).await?.original)
    }

    async fn polish_full(&self, input: PolishInput<'_>) -> Result<PolishOutput> {
        let system = system_prompt_with_translate(&self.glossary, input.prev, input.translate_to);

        // Build messages: system + accumulated history + new user message.
        // OpenAI automatically caches identical prefixes (prompt caching),
        // so sending the full history each time is efficient.
        // When translating, skip history — the instruction set differs.
        let mut messages = vec![
            ChatMessage { role: "system".into(), content: system },
        ];
        if input.translate_to.is_none() {
            let history = self.history.lock().await;
            messages.extend(history.iter().cloned());
        }
        // Wrap input in clear delimiters so the model never mistakes it for
        // chat addressed to itself.
        let user_msg = ChatMessage {
            role: "user".into(),
            content: format!("<<<{}>>>", input.text),
        };
        messages.push(user_msg.clone());

        let is_openai = self.base_url.contains("openai.com");
        let response_format = if input.translate_to.is_some() {
            Some(serde_json::json!({"type": "json_object"}))
        } else {
            None
        };
        let body = ChatRequest {
            model: &self.model,
            messages,
            max_tokens: Some(512),
            store: if is_openai { Some(true) } else { None },
            temperature: Some(0.1),
            response_format,
        };
        let url = format!("{}/chat/completions", self.base_url);
        let mut req = self.client.post(&url)
            .header("content-type", "application/json");
        if !self.api_key.is_empty() {
            req = req.header("authorization", format!("Bearer {}", self.api_key));
        }
        let resp = req
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("polish: {e}")))?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!("polish {status}: {text}")));
        }
        let parsed: ChatResponse = resp
            .json()
            .await
            .map_err(|e| OtojiError::Decode(format!("polish decode: {e}")))?;
        let raw = parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .unwrap_or_else(|| input.text.to_string());
        let raw = strip_special_tokens(&raw);

        // Detect chat-assistant drift on plain polish (translation is JSON-
        // schema-constrained so it's safe).
        if input.translate_to.is_none() && looks_like_chat_drift(input.text, &raw) {
            eprintln!(
                "[polish] openai-compat drift detected, falling back to raw: {:?} → {:?}",
                input.text, raw
            );
            return Ok(PolishOutput { original: input.text.to_string(), translated: None });
        }

        // Parse translation JSON or treat as plain polish.
        let (original, translated) = if input.translate_to.is_some() {
            parse_translate_json(&raw).unwrap_or_else(|| (raw.clone(), Some(raw.clone())))
        } else {
            (raw, None)
        };

        // Append to history only for non-translation calls (different prompt).
        if input.translate_to.is_none() {
            let mut history = self.history.lock().await;
            history.push(user_msg);
            history.push(ChatMessage {
                role: "assistant".into(),
                content: original.clone(),
            });
            if history.len() > 100 {
                let excess = history.len() - 100;
                history.drain(..excess);
            }
        }

        Ok(PolishOutput { original, translated })
    }
}

/// Strip common LLM special tokens from polish output.
fn strip_special_tokens(s: &str) -> String {
    s.replace("<|im_end|>", "")
        .replace("<|im_start|>", "")
        .replace("<|endoftext|>", "")
        .replace("<|end|>", "")
        .trim()
        .to_string()
}

// ── Anthropic Messages API ───────────────────────────────────────────

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

    async fn polish(&self, input: PolishInput<'_>) -> Result<String> {
        let system = system_prompt(&self.glossary, input.prev);
        let body = AnthropicRequest {
            model: &self.model,
            max_tokens: 512,
            system,
            messages: vec![AnthropicMessage {
                role: "user",
                content: input.text.to_string(),
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

// ── Gemini Multimodal Polish (audio + text, with context caching) ────

const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Multimodal polisher using Gemini. Sends both audio and ASR text so Gemini
/// can hear pronunciation to resolve ambiguities. Uses the `cachedContents`
/// API to avoid re-sending the full conversation history on every segment.
///
/// Env vars:
///   GEMINI_API_KEY        — required
///   OTOJI_GEMINI_MODEL    — default `gemini-2.5-flash-lite` (fastest
///                            callable model for polish; ~760ms median TTFB
///                            when `thinkingBudget=0` is set in the request,
///                            vs ~1600ms with thinking enabled. Polish only
///                            needs punctuation/spelling fixes, not deep
///                            reasoning.)
pub struct GeminiPolisher {
    api_key: String,
    model: String,
    glossary: Vec<String>,
    client: reqwest::Client,
    /// Server-side cache name (`cachedContents/xxx`). Updated after each segment.
    cache_name: TokioMutex<Option<String>>,
    /// Accumulated conversation turns for cache rebuilds.
    history: TokioMutex<Vec<GeminiTurn>>,
}

#[derive(Clone)]
struct GeminiTurn {
    role: String,
    parts: Vec<serde_json::Value>,
}

impl GeminiPolisher {
    pub fn new(api_key: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_key: api_key.into(),
            model: model.into(),
            glossary: Vec::new(),
            client: reqwest::Client::new(),
            cache_name: TokioMutex::new(None),
            history: TokioMutex::new(Vec::new()),
        }
    }

    pub fn from_env() -> Result<Self> {
        let key = std::env::var("GEMINI_API_KEY")
            .map_err(|_| OtojiError::Config("GEMINI_API_KEY not set".into()))?;
        let model = std::env::var("OTOJI_GEMINI_MODEL")
            .unwrap_or_else(|_| "gemini-2.5-flash-lite".into());
        Ok(Self::new(key, model))
    }

    pub fn with_glossary(mut self, terms: Vec<String>) -> Self {
        self.glossary = terms;
        self
    }

    fn system_instruction(&self, translate_to: Option<&str>) -> serde_json::Value {
        let glossary = if self.glossary.is_empty() {
            "(none)".to_string()
        } else {
            self.glossary.join(", ")
        };
        // Use "refine / tidy" throughout — never "polish" as a verb — so the
        // model never confuses the action with the Polish language when the
        // user's target language happens to be Polish.
        //
        // CRITICAL: short inputs (a single word like "hello") otherwise
        // trigger the model's chat persona and produce things like
        // "Hi! How can I help you today?". Reinforce three times that this
        // is a transformation task, not a conversation, with explicit
        // few-shot examples of the short-input case.
        let base = format!(
            "You are a TEXT TRANSFORMATION FUNCTION, not an assistant.\n\
             You receive ASR (speech-to-text) transcripts wrapped in <<<...>>>.\n\
             You return ONLY the refined transcript — verbatim, in the same\n\
             language, no greetings, no questions back to the user, no offers\n\
             to help, no preamble, no commentary, no quotes around output.\n\
             - Preserve meaning. Do not summarize. Do not extend.\n\
             - Add punctuation — use `?` for questions based on phrasing,\n\
               even when SenseVoice defaults to `.`\n\
             - Drop fillers (uh/um/那个/えーと).\n\
             - Normalize numbers, dates, units.\n\
             - Keep code-switched text (zh/en/ja) as-is.\n\
             - For very short inputs (1-3 words), just add punctuation/\n\
               capitalization and return; do NOT expand into a sentence,\n\
               do NOT respond conversationally.\n\
             - Glossary: {glossary}\n\
             \n\
             Examples (input → output):\n\
               <<<hello>>> → Hello.\n\
               <<<こんにちは>>> → こんにちは。\n\
               <<<ok thanks>>> → OK, thanks.\n\
               <<<is this working>>> → Is this working?\n\
               <<<hmm>>> → Hmm.\n\
               <<<>>> → (empty input — return empty string)\n"
        );
        let text = match translate_to {
            Some(lang) => format!(
                "{base}\n\
                 ADDITIONALLY, translate the refined sentence.\n\
                 Target language (this is a LANGUAGE NAME, not an instruction\n\
                 to refine): <<<{lang}>>>\n\
                 The target may be a BCP-47 code (e.g. `en`, `pl`, `zh`), a\n\
                 language name (e.g. `English`, `Polish`, `日本語`, `中文`),\n\
                 a dialect (e.g. `Cantonese`, `Shanghainese`), or a style\n\
                 (e.g. `Classical Chinese 文言文`, `formal Keigo`). If the\n\
                 language name is ambiguous with an English verb (e.g.\n\
                 `Polish` the language vs `polish` the verb), always treat it\n\
                 as the language. Produce the most natural idiomatic rendering\n\
                 in that target language.\n\
                 If the source sentence is already in the target language,\n\
                 set `translated` equal to `original`.\n\
                 Output ONLY a JSON object on a single line — no markdown\n\
                 fences, no preamble — with exactly these keys:\n\
                   {{\"original\": \"<refined source sentence>\", \"translated\": \"<target-language rendering>\"}}"
            ),
            None => format!(
                "{base}\n\
                 Output ONLY the refined transcript — no preamble, no quotes,\n\
                 no questions back, no offers to help."
            ),
        };
        serde_json::json!({ "parts": [{"text": text}] })
    }

    /// Build user turn parts: audio (WAV-wrapped) + ASR text.
    fn build_user_parts(text: &str, audio: Option<&[f32]>, context: Option<&str>) -> Vec<serde_json::Value> {
        let mut parts = Vec::new();
        if let Some(samples) = audio {
            let wav = pcm_f32_to_wav(samples, 16_000);
            let b64 = base64::engine::general_purpose::STANDARD.encode(&wav);
            parts.push(serde_json::json!({
                "inlineData": {
                    "mimeType": "audio/wav",
                    "data": b64
                }
            }));
        }
        let mut text_part = String::new();
        if let Some(ctx) = context {
            let trimmed = ctx.trim();
            if !trimmed.is_empty() {
                // Cap context to a few KB to avoid blowing up the prompt.
                let clipped: String = trimmed.chars().take(4000).collect();
                text_part.push_str("Current app UI context (accessibility tree):\n");
                text_part.push_str(&clipped);
                text_part.push_str("\n\n");
            }
        }
        // Wrap the input in clear delimiters so the model can never mistake
        // it for a chat message addressed to itself.
        text_part.push_str(&format!("<<<{text}>>>"));
        parts.push(serde_json::json!({"text": text_part}));
        parts
    }

    /// Create or update the server-side cache with the full history.
    async fn update_cache(&self, history: &[GeminiTurn]) -> Result<Option<String>> {
        // Caching requires a minimum token count. For very short histories,
        // just skip caching and send everything inline.
        if history.len() < 4 {
            return Ok(None);
        }

        let contents: Vec<serde_json::Value> = history
            .iter()
            .map(|t| {
                serde_json::json!({
                    "role": t.role,
                    "parts": t.parts,
                })
            })
            .collect();

        let body = serde_json::json!({
            "model": format!("models/{}", self.model),
            "contents": contents,
            // Cache holds the non-translation baseline instruction.
            "systemInstruction": self.system_instruction(None),
            "ttl": "300s"
        });

        // Delete old cache if exists.
        {
            let old = self.cache_name.lock().await;
            if let Some(name) = old.as_ref() {
                let _ = self
                    .client
                    .delete(format!("{GEMINI_BASE}/{name}"))
                    .query(&[("key", &self.api_key)])
                    .send()
                    .await;
            }
        }

        let resp = self
            .client
            .post(format!("{GEMINI_BASE}/cachedContents"))
            .query(&[("key", &self.api_key)])
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("gemini cache create: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            tracing::warn!("gemini cache create failed ({status}): {body}");
            return Ok(None);
        }

        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| OtojiError::Decode(format!("gemini cache resp: {e}")))?;
        Ok(v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
    }
}

#[async_trait]
impl Polisher for GeminiPolisher {
    fn name(&self) -> &'static str {
        "gemini-multimodal"
    }

    fn is_multimodal(&self) -> bool {
        true
    }

    async fn polish(&self, input: PolishInput<'_>) -> Result<String> {
        Ok(self.polish_full(input).await?.original)
    }

    async fn polish_full(&self, input: PolishInput<'_>) -> Result<PolishOutput> {
        let user_parts = Self::build_user_parts(input.text, input.audio, input.context);
        let translate_to = input.translate_to;

        // Translation requires the system instruction inline (cache stores the
        // baseline instruction only). Skip cache when translating.
        let cache = if translate_to.is_some() {
            None
        } else {
            self.cache_name.lock().await.clone()
        };

        // Disable Gemini 2.5's "thinking" tokens — polish is a low-reasoning
        // task and thinking adds ~500-800ms for no quality gain. Harmless
        // on older models that ignore unknown generationConfig keys.
        //
        // For translation, also force structured-output via responseSchema so
        // the model cannot drift into chat-assistant prose for short inputs.
        let gen_config = if translate_to.is_some() {
            serde_json::json!({
                "thinkingConfig": {"thinkingBudget": 0},
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "original":   {"type": "STRING"},
                        "translated": {"type": "STRING"}
                    },
                    "required": ["original", "translated"]
                }
            })
        } else {
            serde_json::json!({
                "thinkingConfig": {"thinkingBudget": 0},
                "temperature": 0.1
            })
        };

        let (body, endpoint) = if let Some(ref cache_name) = cache {
            let body = serde_json::json!({
                "cachedContent": cache_name,
                "contents": [{
                    "role": "user",
                    "parts": user_parts
                }],
                "generationConfig": gen_config,
            });
            let endpoint = format!(
                "{GEMINI_BASE}/models/{}:generateContent",
                self.model
            );
            (body, endpoint)
        } else {
            let history = self.history.lock().await;
            let mut contents: Vec<serde_json::Value> = history
                .iter()
                .map(|t| serde_json::json!({"role": t.role, "parts": t.parts}))
                .collect();
            contents.push(serde_json::json!({"role": "user", "parts": user_parts}));

            let body = serde_json::json!({
                "systemInstruction": self.system_instruction(translate_to),
                "contents": contents,
                "generationConfig": gen_config,
            });
            let endpoint = format!(
                "{GEMINI_BASE}/models/{}:generateContent",
                self.model
            );
            (body, endpoint)
        };

        let resp = self
            .client
            .post(&endpoint)
            .query(&[("key", &self.api_key)])
            .json(&body)
            .send()
            .await
            .map_err(|e| OtojiError::Transport(format!("gemini polish: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(OtojiError::Provider(format!("gemini polish {status}: {text}")));
        }

        let v: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| OtojiError::Decode(format!("gemini json: {e}")))?;

        let raw_output = v
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|t| t.as_str())
            .unwrap_or(input.text)
            .trim()
            .to_string();

        // Detect assistant-persona drift — short inputs sometimes coax the
        // model into a "How can I help?" style reply. If we see signature
        // phrases AND the output is much longer than the input, fall back
        // to the raw text. (Never applies to translation since JSON
        // schema constrains the output structure.)
        if translate_to.is_none() && looks_like_chat_drift(input.text, &raw_output) {
            eprintln!(
                "[polish] gemini drift detected, falling back to raw: {:?} → {:?}",
                input.text, raw_output
            );
            return Ok(PolishOutput { original: input.text.to_string(), translated: None });
        }

        // Parse translation output (JSON) or plain polish.
        let (original, translated) = if translate_to.is_some() {
            parse_translate_json(&raw_output).unwrap_or_else(|| {
                // Fallback if the model didn't honor the JSON format.
                (raw_output.clone(), Some(raw_output.clone()))
            })
        } else {
            (raw_output, None)
        };

        // Append this exchange to history (text-only — audio is too large
        // to accumulate). Do NOT record translation exchanges in history
        // since they have a different instruction set and would confuse
        // subsequent cached (non-translation) calls.
        if translate_to.is_none() {
            let mut history = self.history.lock().await;
            history.push(GeminiTurn {
                role: "user".into(),
                parts: vec![serde_json::json!({"text": format!("ASR hypothesis: {}", input.text)})],
            });
            history.push(GeminiTurn {
                role: "model".into(),
                parts: vec![serde_json::json!({"text": &original})],
            });
            let history_snapshot = history.clone();
            drop(history);
            if let Ok(Some(name)) = self.update_cache(&history_snapshot).await {
                *self.cache_name.lock().await = Some(name);
            }
        }

        Ok(PolishOutput { original, translated })
    }
}

/// Heuristic: did the model drop into chat-assistant mode instead of just
/// refining the input? Triggered by short inputs like "hello" producing
/// "Hi! How can I help you today?" outputs.
///
/// We treat the output as drift when it is *substantially longer* than the
/// input AND contains a giveaway phrase. Keep the list tight to avoid
/// false-positives on legitimate transcripts that happen to ask questions.
fn looks_like_chat_drift(input: &str, output: &str) -> bool {
    let in_chars = input.chars().count();
    let out_chars = output.chars().count();
    // Allow some growth (punctuation, capitalization). Drift is usually >2x.
    if in_chars >= 25 || out_chars < in_chars * 2 + 10 {
        return false;
    }
    let lower = output.to_lowercase();
    const TELLS: &[&str] = &[
        "how can i help",
        "how may i help",
        "i'd be happy to",
        "i would be happy",
        "i'm happy to help",
        "feel free to ask",
        "what would you like",
        "is there anything",
        "let me know if",
        "as an ai",
        "i am an ai",
        // Japanese variants
        "お手伝い",
        "何かお手伝い",
        "どのようにお手伝い",
        // Chinese variants
        "我能帮",
        "我可以帮",
        "有什么可以",
    ];
    TELLS.iter().any(|t| lower.contains(t))
}

/// Parse `{"original": "...", "translated": "..."}` from raw Gemini output.
/// Tolerates surrounding whitespace, ``` fences, or stray prose.
fn parse_translate_json(s: &str) -> Option<(String, Option<String>)> {
    // Strip possible ```json ... ``` fences.
    let trimmed = s.trim();
    let body = if let Some(stripped) = trimmed.strip_prefix("```json") {
        stripped.trim_end_matches("```").trim()
    } else if let Some(stripped) = trimmed.strip_prefix("```") {
        stripped.trim_end_matches("```").trim()
    } else {
        trimmed
    };
    // Find the first { and last } in case of leading/trailing prose.
    let start = body.find('{')?;
    let end = body.rfind('}')?;
    if end <= start { return None; }
    let json = &body[start..=end];
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let original = v.get("original")?.as_str()?.trim().to_string();
    let translated = v.get("translated").and_then(|t| t.as_str()).map(|t| t.trim().to_string());
    Some((original, translated))
}

/// Parse Ollama parameter_size strings like "4.3B", "1.7B", "134.52M" into billions.
fn parse_param_size(s: &str) -> f64 {
    let s = s.trim();
    if s.is_empty() { return 0.0; }
    let (num, suffix) = s.split_at(s.len() - 1);
    let val: f64 = match num.parse() {
        Ok(v) => v,
        Err(_) => return 0.0,
    };
    match suffix {
        "B" | "b" => val,
        "M" | "m" => val / 1000.0,
        "K" | "k" => val / 1_000_000.0,
        _ => 0.0,
    }
}

/// Wrap f32 PCM samples (-1.0..1.0) into a minimal WAV container (16-bit, mono).
fn pcm_f32_to_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_samples = samples.len();
    let data_size = num_samples * 2; // 16-bit = 2 bytes per sample
    let file_size = 36 + data_size;
    let channels: u16 = 1;
    let bits: u16 = 16;
    let byte_rate = sample_rate * channels as u32 * bits as u32 / 8;
    let block_align = channels * bits / 8;

    let mut buf = Vec::with_capacity(44 + data_size);
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&(file_size as u32).to_le_bytes());
    buf.extend_from_slice(b"WAVE");
    buf.extend_from_slice(b"fmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes()); // PCM
    buf.extend_from_slice(&channels.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&byte_rate.to_le_bytes());
    buf.extend_from_slice(&block_align.to_le_bytes());
    buf.extend_from_slice(&bits.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&(data_size as u32).to_le_bytes());
    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let i = (clamped * 32767.0) as i16;
        buf.extend_from_slice(&i.to_le_bytes());
    }
    buf
}
