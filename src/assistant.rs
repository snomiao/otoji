//! Native local voice assistant loop — the whole thing in one Rust process,
//! no browser / room / relay:
//!
//!   wake word (sherpa KWS) → capture the command utterance (energy endpoint)
//!   → SenseVoice ASR → LLM reply (OpenAI-compatible; Ollama by default)
//!   → speak the reply (macOS `say`, local).
//!
//! Cheap enough to leave running all day: only the tiny KWS runs continuously;
//! ASR/LLM/TTS fire once per wake.

use anyhow::{Context, Result};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

use crate::asr::AsrProvider;
use crate::audio::{self, mic};
use crate::core::{AsrEvent, AudioChunk, AudioFormat};
use crate::kws;

pub struct AssistantOptions {
    pub device: Option<String>,
    pub frame_ms: u32,
    pub model_dir: String,
    pub keywords_file: String,
    pub keyword_line: Option<String>,
    pub threshold: f32,
    /// Max seconds to record a command after a wake.
    pub max_command_s: f32,
    /// Trailing silence (ms) that ends the command capture.
    pub silence_ms: u64,
    /// Speak replies aloud (macOS `say`). If false, replies are printed only.
    pub speak: bool,
    /// Read this WAV instead of the mic (single-shot, for testing).
    pub wav: Option<std::path::PathBuf>,
}

const SR: usize = 16_000;

/// A simple energy endpoint over 16 kHz mono f32: once speech has started,
/// end the utterance after `silence_ms` of trailing quiet.
struct Endpoint {
    started: bool,
    quiet_samples: usize,
    quiet_limit: usize,
    threshold: f32,
}
impl Endpoint {
    fn new(silence_ms: u64) -> Self {
        Self {
            started: false,
            quiet_samples: 0,
            quiet_limit: (silence_ms as usize * SR) / 1000,
            threshold: 0.012,
        }
    }
    /// Feed a frame; returns true when the utterance is complete.
    fn push(&mut self, frame: &[f32]) -> bool {
        let mut sum = 0f32;
        for &s in frame {
            sum += s * s;
        }
        let rms = (sum / frame.len().max(1) as f32).sqrt();
        if rms > self.threshold {
            self.started = true;
            self.quiet_samples = 0;
        } else if self.started {
            self.quiet_samples += frame.len();
        }
        self.started && self.quiet_samples >= self.quiet_limit
    }
}

/// One-shot SenseVoice transcription of a 16 kHz mono f32 buffer.
async fn transcribe(samples: &[f32]) -> Result<String> {
    use crate::asr::sensevoice::{SenseVoice, SenseVoiceConfig};
    let (audio_tx, audio_rx) = audio::channel(256);
    // Feed in ~100 ms chunks (like the file-transcribe path) — the provider's
    // internal VAD/segmenter expects streaming input, not one giant chunk.
    for frame in samples.chunks(1600) {
        let mut pcm = Vec::with_capacity(frame.len() * 2);
        for &s in frame {
            let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
            pcm.extend_from_slice(&v.to_le_bytes());
        }
        if audio_tx
            .send(AudioChunk::new(AudioFormat::PCM16K_MONO, pcm))
            .await
            .is_err()
        {
            break;
        }
    }
    drop(audio_tx); // close → provider flushes and emits Final

    let provider = Arc::new(SenseVoice::new(SenseVoiceConfig::from_env()));
    let (event_tx, mut event_rx) = mpsc::channel(64);
    let p = provider.clone();
    tokio::spawn(async move {
        let _ = p.run(audio_rx, event_tx).await;
    });

    let mut text = String::new();
    while let Some(ev) = event_rx.recv().await {
        match ev {
            AsrEvent::Final { text: t, .. } => {
                if !text.is_empty() {
                    text.push(' ');
                }
                text.push_str(t.trim());
            }
            AsrEvent::Closed => break,
            _ => {}
        }
    }
    Ok(text.trim().to_string())
}

/// Ask an OpenAI-compatible chat endpoint (Ollama by default) for a spoken
/// reply. Falls back to a canned echo when no endpoint is reachable, so the
/// loop always responds.
async fn reply(command: &str) -> String {
    let base = std::env::var("OTOJI_ASSISTANT_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:11434/v1".to_string());
    let model =
        std::env::var("OTOJI_ASSISTANT_MODEL").unwrap_or_else(|_| "qwen2.5".to_string());
    let key = std::env::var("OTOJI_ASSISTANT_API_KEY").unwrap_or_default();
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "You are 小克, a friendly on-device voice assistant. Reply to the user's spoken request in one or two short spoken sentences, in the same language as the request. No markdown, no lists."},
            {"role": "user", "content": command}
        ],
        "stream": false,
        "temperature": 0.4
    });
    let attempt = async {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
        let mut req = client.post(format!("{}/chat/completions", base.trim_end_matches('/')));
        if !key.is_empty() {
            req = req.bearer_auth(&key);
        }
        let resp = req.json(&body).send().await?.error_for_status()?;
        let v: serde_json::Value = resp.json().await?;
        let txt = v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        anyhow::Ok(txt)
    };
    match attempt.await {
        Ok(t) if !t.is_empty() => t,
        _ => {
            eprintln!("[assistant] no LLM reachable at {base} — echoing");
            format!("你说的是：{command}")
        }
    }
}

/// Speak text locally. macOS `say` handles Chinese; elsewhere we just print.
fn speak(text: &str, enabled: bool) {
    if !enabled {
        return;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("say").arg(text).status();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
    }
}

/// Run one full wake→ASR→reply→speak turn on a captured command buffer.
async fn handle_command(samples: Vec<f32>, speak_enabled: bool) {
    let dur = samples.len() as f32 / SR as f32;
    eprintln!("[assistant] captured {dur:.1}s — transcribing…");
    let text = match transcribe(&samples).await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[assistant] asr error: {e}");
            return;
        }
    };
    if text.is_empty() {
        eprintln!("[assistant] (no speech recognized)");
        return;
    }
    println!("{}", serde_json::json!({ "type": "command", "text": text }));
    let answer = reply(&text).await;
    println!("{}", serde_json::json!({ "type": "reply", "text": answer }));
    use std::io::Write;
    let _ = std::io::stdout().flush();
    speak(&answer, speak_enabled);
}

pub async fn run(opts: AssistantOptions) -> Result<()> {
    let (model_dir, keywords_file) = kws::resolve_model_and_keywords(
        &opts.model_dir,
        &opts.keywords_file,
        opts.keyword_line.as_deref(),
    )
    .await?;
    let (spotter, stream) = kws::build_spotter(&model_dir, &keywords_file, opts.threshold)?;
    eprintln!(
        "[assistant] ready — say the wake word, then your request. model={} keywords={}",
        model_dir.display(),
        keywords_file
    );

    let max_command = (opts.max_command_s * SR as f32) as usize;

    // Shared capture state: None = listening for wake; Some(buf,endpoint) = recording.
    let mut capture: Option<(Vec<f32>, Endpoint)> = None;

    // Process a block of samples: run KWS while idle; accumulate + endpoint while capturing.
    // Returns a completed command buffer when the utterance ends.
    let mut feed = |samples: &[f32], capture: &mut Option<(Vec<f32>, Endpoint)>| -> Option<Vec<f32>> {
        if let Some((buf, ep)) = capture.as_mut() {
            buf.extend_from_slice(samples);
            let done = ep.push(samples) || buf.len() >= max_command;
            if done {
                let out = std::mem::take(buf);
                *capture = None;
                return Some(out);
            }
            return None;
        }
        // idle: feed the wake spotter
        stream.accept_waveform(SR as i32, samples);
        while spotter.is_ready(&stream) {
            spotter.decode(&stream);
        }
        if let Some(r) = spotter.get_result(&stream) {
            if !r.keyword.is_empty() {
                eprintln!("[assistant] wake · {}", r.keyword);
                spotter.reset(&stream);
                *capture = Some((Vec::new(), Endpoint::new(opts.silence_ms)));
            }
        }
        None
    };

    if let Some(wav) = opts.wav.clone() {
        let samples = kws::read_wav_16k_mono(&wav)?;
        for hop in samples.chunks(1600) {
            if let Some(cmd) = feed(hop, &mut capture) {
                handle_command(cmd, opts.speak).await;
                return Ok(());
            }
        }
        // wav ended mid-capture → still process what we have
        if let Some((buf, _)) = capture.take() {
            if !buf.is_empty() {
                handle_command(buf, opts.speak).await;
            }
        } else {
            eprintln!("[assistant] wake word not detected in {}", wav.display());
        }
        return Ok(());
    }

    // live mic loop
    let (audio_tx, mut audio_rx) = audio::channel(64);
    let _mic = mic::start(opts.device.as_deref(), opts.frame_ms, audio_tx).context("mic")?;
    while let Some(chunk) = audio_rx.recv().await {
        let samples = kws::pcm16_to_f32(&chunk.pcm);
        if samples.is_empty() {
            continue;
        }
        if let Some(cmd) = feed(&samples, &mut capture) {
            handle_command(cmd, opts.speak).await;
        }
    }
    Ok(())
}
