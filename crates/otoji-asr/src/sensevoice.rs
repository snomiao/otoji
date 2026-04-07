//! SenseVoice provider — wraps a Python helper that drives sherpa-onnx's
//! `OfflineRecognizer.from_sense_voice` against a live mic.
//!
//! Why subprocess: sherpa-onnx ships its inference engine as a Python wheel
//! with prebuilt binaries; rewriting the binding in Rust would be a yak shave.
//! The Python side speaks one JSON object per line, mirroring `AsrEvent`.

use crate::{AsrEventTx, AsrProvider};
use async_trait::async_trait;
use otoji_audio::AudioRx;
use otoji_core::{AsrEvent, OtojiError, Result, Word};
use serde::Deserialize;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

/// Bundled Python helper, materialized to `~/.cache/otoji/sensevoice_listen.py`
/// on first use so the binary works from any cwd.
const HELPER_SOURCE: &str = include_str!("../../../scripts/sensevoice_listen.py");

fn cache_dir() -> std::path::PathBuf {
    std::env::var_os("OTOJI_CACHE_DIR")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|h| {
                let mut p = std::path::PathBuf::from(h);
                p.push(".cache");
                p.push("otoji");
                p
            })
        })
        .unwrap_or_else(|| std::path::PathBuf::from(".otoji-cache"))
}

fn ensure_helper_script() -> Result<String> {
    let dir = cache_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| OtojiError::Provider(format!("create cache dir: {e}")))?;
    let path = dir.join("sensevoice_listen.py");
    let needs_write = match std::fs::read_to_string(&path) {
        Ok(existing) => existing != HELPER_SOURCE,
        Err(_) => true,
    };
    if needs_write {
        std::fs::write(&path, HELPER_SOURCE)
            .map_err(|e| OtojiError::Provider(format!("write helper: {e}")))?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Debug, Clone)]
pub struct SenseVoiceConfig {
    /// Path to the Python helper script.
    pub script: String,
    /// Path to the SenseVoice ONNX model directory.
    pub model_dir: String,
    /// Python interpreter to spawn (e.g. "python3" or a `uv run` wrapper).
    pub python: Vec<String>,
    /// If true, pipe `AudioRx` PCM bytes into the helper's stdin instead of
    /// letting the helper open its own mic.
    pub feed_stdin: bool,
}

impl SenseVoiceConfig {
    pub fn from_env() -> Self {
        let default_model_dir = {
            let mut d = cache_dir();
            d.push("sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17");
            d.to_string_lossy().into_owned()
        };
        let default_script = ensure_helper_script().unwrap_or_else(|e| {
            tracing::warn!("falling back to repo-relative helper path: {e}");
            "scripts/sensevoice_listen.py".into()
        });
        // Default: use `uv run` so the helper gets a venv with sherpa-onnx,
        // sounddevice and numpy installed on demand. Override with
        // OTOJI_SENSEVOICE_PYTHON if you have your own environment.
        let python = std::env::var("OTOJI_SENSEVOICE_PYTHON")
            .map(|s| s.split_whitespace().map(String::from).collect::<Vec<_>>())
            .unwrap_or_else(|_| {
                vec![
                    "uv".into(),
                    "run".into(),
                    "--with".into(),
                    "sherpa-onnx".into(),
                    "--with".into(),
                    "sounddevice".into(),
                    "--with".into(),
                    "numpy".into(),
                    "python".into(),
                ]
            });
        Self {
            script: std::env::var("OTOJI_SENSEVOICE_SCRIPT").unwrap_or(default_script),
            model_dir: std::env::var("OTOJI_SENSEVOICE_DIR").unwrap_or(default_model_dir),
            python,
            feed_stdin: false,
        }
    }
}

pub struct SenseVoice {
    cfg: SenseVoiceConfig,
}

impl SenseVoice {
    pub fn new(cfg: SenseVoiceConfig) -> Self {
        Self { cfg }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum HelperLine {
    Open,
    Partial { seg_id: Option<u64>, text: String },
    Final { seg_id: u64, text: String, #[serde(default)] lang: String },
    Error { message: String },
    Closed,
}

#[async_trait]
impl AsrProvider for SenseVoice {
    fn name(&self) -> &'static str {
        "sensevoice"
    }

    /// We ignore the incoming `AudioRx` because the Python helper opens its
    /// own mic stream via sounddevice (so the format/device matches what
    /// sherpa-onnx expects). The audio channel is drained to keep upstream
    /// happy and to allow the consumer to stop us by dropping the sender.
    async fn run(&self, mut audio: AudioRx, events: AsrEventTx) -> Result<()> {
        let (cmd, args) = self.cfg.python.split_first().ok_or_else(|| {
            OtojiError::Config("OTOJI_SENSEVOICE_PYTHON resolved to empty command".into())
        })?;
        let mut command = Command::new(cmd);
        command
            .args(args)
            .arg(&self.cfg.script)
            .env("OTOJI_SENSEVOICE_DIR", &self.cfg.model_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        if self.cfg.feed_stdin {
            command.env("OTOJI_INPUT_SOURCE", "stdin").stdin(Stdio::piped());
        }
        let mut child = command
            .spawn()
            .map_err(|e| OtojiError::Provider(format!("spawn sensevoice helper: {e}")))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| OtojiError::Provider("helper stdout missing".into()))?;
        let mut lines = BufReader::new(stdout).lines();

        // If feeding stdin: forward AudioRx PCM into helper. Otherwise drain.
        let drain = if self.cfg.feed_stdin {
            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| OtojiError::Provider("helper stdin missing".into()))?;
            tokio::spawn(async move {
                while let Some(chunk) = audio.recv().await {
                    if stdin.write_all(&chunk.pcm).await.is_err() {
                        break;
                    }
                }
                let _ = stdin.shutdown().await;
            })
        } else {
            tokio::spawn(async move { while audio.recv().await.is_some() {} })
        };

        loop {
            tokio::select! {
                line = lines.next_line() => {
                    match line {
                        Ok(Some(line)) => {
                            match serde_json::from_str::<HelperLine>(&line) {
                                Ok(HelperLine::Open) => {
                                    let _ = events.send(AsrEvent::Open).await;
                                }
                                Ok(HelperLine::Partial { seg_id, text }) => {
                                    let _ = events.send(AsrEvent::Partial { seg_id: seg_id.unwrap_or(0), text }).await;
                                }
                                Ok(HelperLine::Final { seg_id, text, lang: _ }) => {
                                    let _ = events.send(AsrEvent::Final { seg_id, text, words: Vec::<Word>::new() }).await;
                                }
                                Ok(HelperLine::Error { message }) => {
                                    let _ = events.send(AsrEvent::Error { message }).await;
                                }
                                Ok(HelperLine::Closed) => break,
                                Err(e) => tracing::warn!("sensevoice helper line decode: {e}; raw={line}"),
                            }
                        }
                        Ok(None) => break,
                        Err(e) => return Err(OtojiError::Provider(format!("helper read: {e}"))),
                    }
                }
                status = child.wait() => {
                    match status {
                        Ok(s) if !s.success() => {
                            let _ = events.send(AsrEvent::Error { message: format!("helper exited: {s}") }).await;
                        }
                        _ => {}
                    }
                    break;
                }
            }
        }

        let _ = child.kill().await;
        drain.abort();
        let _ = events.send(AsrEvent::Closed).await;
        Ok(())
    }
}
