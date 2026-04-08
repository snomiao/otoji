//! SenseVoice provider — pure-Rust, backed by the official `sherpa-onnx` crate.
//!
//! SenseVoice is an *offline* recognizer (no native streaming), so we fake a
//! streaming feel by:
//!   1. Running an RMS-based VAD over the live PCM stream.
//!   2. Re-decoding the in-progress utterance buffer every `partial_ms` and
//!      emitting `AsrEvent::Partial`.
//!   3. Emitting `AsrEvent::Final` once the VAD detects end-of-utterance.
//!
//! `OfflineRecognizer`/`OfflineStream` are `!Send`, so all sherpa-onnx calls
//! happen on a dedicated OS thread owned by `run()`. The async side just
//! forwards PCM chunks in and pulls events out via channels.

use super::{AsrEventTx, AsrProvider};
use crate::audio::AudioRx;
use crate::core::{AsrEvent, OtojiError, Result};
use async_trait::async_trait;
use sherpa_onnx::{
    OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig,
};
use std::sync::mpsc as smpsc;

const SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Clone)]
pub struct SenseVoiceConfig {
    /// Directory containing `model.int8.onnx` and `tokens.txt`.
    pub model_dir: String,
    /// Language hint passed to SenseVoice (`"auto"`, `"zh"`, `"en"`, ...).
    pub language: String,
    /// Re-decode interval for partial hypotheses, in milliseconds.
    pub partial_ms: u32,
    /// RMS threshold for the energy VAD (linear, ~0..1).
    pub vad_threshold: f32,
    /// Trailing silence (ms) that closes an utterance.
    pub vad_silence_ms: u32,
    /// Max utterance length (ms) before forced flush.
    pub vad_max_ms: u32,
}

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

impl SenseVoiceConfig {
    pub fn from_env() -> Self {
        let default_model_dir = {
            let mut d = cache_dir();
            d.push("sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17");
            d.to_string_lossy().into_owned()
        };
        Self {
            model_dir: std::env::var("OTOJI_SENSEVOICE_DIR").unwrap_or(default_model_dir),
            language: std::env::var("OTOJI_SENSEVOICE_LANG").unwrap_or_else(|_| "auto".into()),
            partial_ms: env_u32("OTOJI_PARTIAL_MS", 300),
            vad_threshold: std::env::var("OTOJI_VAD_THRESHOLD")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.012),
            vad_silence_ms: env_u32("OTOJI_VAD_SILENCE_MS", 600),
            vad_max_ms: env_u32("OTOJI_VAD_MAX_MS", 12_000),
        }
    }
}

fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

pub struct SenseVoice {
    cfg: SenseVoiceConfig,
}

impl SenseVoice {
    pub fn new(cfg: SenseVoiceConfig) -> Self {
        Self { cfg }
    }
}

/// Messages from the async side to the worker thread.
enum WorkerMsg {
    Pcm(Vec<i16>),
    Eof,
}

/// Events from the worker thread to the async side.
enum WorkerEvt {
    Open,
    Status(String),
    Partial { seg_id: u64, text: String },
    Final { seg_id: u64, text: String },
    Error(String),
    Closed,
}

#[async_trait]
impl AsrProvider for SenseVoice {
    fn name(&self) -> &'static str {
        "sensevoice"
    }

    async fn run(&self, mut audio: AudioRx, events: AsrEventTx) -> Result<()> {
        let cfg = self.cfg.clone();

        let model_path = format!("{}/model.int8.onnx", cfg.model_dir);
        let tokens_path = format!("{}/tokens.txt", cfg.model_dir);
        if !std::path::Path::new(&model_path).exists()
            || !std::path::Path::new(&tokens_path).exists()
        {
            return Err(OtojiError::Provider(format!(
                "SenseVoice model not found at {dir}.\n\
                 Download it once with:\n  \
                 mkdir -p {dir} && curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2 \
                 | tar -xj -C $(dirname {dir})",
                dir = cfg.model_dir
            )));
        }

        let (in_tx, in_rx) = smpsc::channel::<WorkerMsg>();
        let (out_tx, out_rx) = smpsc::channel::<WorkerEvt>();

        // Worker thread owns the !Send recognizer.
        let cfg_thread = cfg.clone();
        let worker = std::thread::Builder::new()
            .name("sensevoice-worker".into())
            .spawn(move || worker_main(cfg_thread, in_rx, out_tx))
            .map_err(|e| OtojiError::Provider(format!("spawn worker: {e}")))?;

        // Bridge AudioRx (tokio mpsc) -> in_tx (std mpsc).
        let in_tx_audio = in_tx.clone();
        let pump = tokio::spawn(async move {
            while let Some(chunk) = audio.recv().await {
                let pcm = bytes_to_i16(&chunk.pcm);
                if in_tx_audio.send(WorkerMsg::Pcm(pcm)).is_err() {
                    break;
                }
            }
            let _ = in_tx_audio.send(WorkerMsg::Eof);
        });

        // Bridge out_rx (std mpsc) -> events (tokio mpsc). Use spawn_blocking
        // because std mpsc::Receiver::recv blocks the thread.
        let events_for_drain = events.clone();
        let drain = tokio::task::spawn_blocking(move || {
            while let Ok(evt) = out_rx.recv() {
                let asr = match evt {
                    WorkerEvt::Open => AsrEvent::Open,
                    WorkerEvt::Status(message) => AsrEvent::Status { message },
                    WorkerEvt::Partial { seg_id, text } => AsrEvent::Partial { seg_id, text },
                    WorkerEvt::Final { seg_id, text } => AsrEvent::Final {
                        seg_id,
                        text,
                        words: Vec::new(),
                    },
                    WorkerEvt::Error(message) => AsrEvent::Error { message },
                    WorkerEvt::Closed => break,
                };
                if events_for_drain.blocking_send(asr).is_err() {
                    break;
                }
            }
        });

        let _ = pump.await;
        let _ = drain.await;
        let _ = worker.join();
        let _ = events.send(AsrEvent::Closed).await;
        Ok(())
    }
}

fn bytes_to_i16(b: &[u8]) -> Vec<i16> {
    let mut out = Vec::with_capacity(b.len() / 2);
    for chunk in b.chunks_exact(2) {
        out.push(i16::from_le_bytes([chunk[0], chunk[1]]));
    }
    out
}

fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| s as f32 / 32768.0).collect()
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

fn worker_main(
    cfg: SenseVoiceConfig,
    in_rx: smpsc::Receiver<WorkerMsg>,
    out_tx: smpsc::Sender<WorkerEvt>,
) {
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.tokens = Some(format!("{}/tokens.txt", cfg.model_dir));
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(format!("{}/model.int8.onnx", cfg.model_dir)),
        language: Some(cfg.language.clone()),
        use_itn: true,
    };
    config.model_config.num_threads = 2;

    let recognizer = match OfflineRecognizer::create(&config) {
        Some(r) => r,
        None => {
            let _ = out_tx.send(WorkerEvt::Error(
                "OfflineRecognizer::create returned None — check model paths/format".into(),
            ));
            let _ = out_tx.send(WorkerEvt::Closed);
            return;
        }
    };
    let _ = out_tx.send(WorkerEvt::Open);

    // VAD parameters in *samples* (matches the cpal mic crate's 16k mono PCM).
    let silence_samples_needed = (cfg.vad_silence_ms as usize) * SAMPLE_RATE as usize / 1000;
    let max_samples = (cfg.vad_max_ms as usize) * SAMPLE_RATE as usize / 1000;
    let min_samples = SAMPLE_RATE as usize / 4; // 250ms
    let partial_samples_step = (cfg.partial_ms as usize) * SAMPLE_RATE as usize / 1000;
    let partial_min_samples = (240 * SAMPLE_RATE as usize) / 1000;

    let mut buf: Vec<f32> = Vec::with_capacity(max_samples);
    let mut silence_run: usize = 0;
    let mut samples_since_partial: usize = 0;
    let mut seg_id: u64 = 0;
    let mut last_partial = String::new();

    let decode = |buf: &[f32]| -> Option<String> {
        let stream = recognizer.create_stream();
        stream.accept_waveform(SAMPLE_RATE as i32, buf);
        recognizer.decode(&stream);
        let text = stream.get_result()?.text.trim().to_string();
        if text.is_empty() { None } else { Some(text) }
    };

    let flush_block = |buf: &mut Vec<f32>,
                       silence_run: &mut usize,
                       samples_since_partial: &mut usize,
                       last_partial: &mut String,
                       seg_id: &mut u64,
                       out_tx: &smpsc::Sender<WorkerEvt>| {
        if buf.len() < min_samples {
            buf.clear();
            *silence_run = 0;
            *samples_since_partial = 0;
            last_partial.clear();
            return;
        }
        if let Some(text) = decode(buf) {
            let _ = out_tx.send(WorkerEvt::Final { seg_id: *seg_id, text });
            *seg_id += 1;
        }
        buf.clear();
        *silence_run = 0;
        *samples_since_partial = 0;
        last_partial.clear();
    };

    let threshold = cfg.vad_threshold;

    while let Ok(msg) = in_rx.recv() {
        match msg {
            WorkerMsg::Eof => {
                flush_block(
                    &mut buf,
                    &mut silence_run,
                    &mut samples_since_partial,
                    &mut last_partial,
                    &mut seg_id,
                    &out_tx,
                );
                break;
            }
            WorkerMsg::Pcm(pcm_i16) => {
                let block = i16_to_f32(&pcm_i16);
                let block_rms = rms(&block);
                let active = block_rms >= threshold;
                if active || !buf.is_empty() {
                    buf.extend_from_slice(&block);
                    samples_since_partial += block.len();
                    if active {
                        silence_run = 0;
                    } else {
                        silence_run += block.len();
                    }
                    if silence_run >= silence_samples_needed || buf.len() >= max_samples {
                        flush_block(
                            &mut buf,
                            &mut silence_run,
                            &mut samples_since_partial,
                            &mut last_partial,
                            &mut seg_id,
                            &out_tx,
                        );
                    } else if samples_since_partial >= partial_samples_step
                        && buf.len() >= partial_min_samples
                    {
                        samples_since_partial = 0;
                        if let Some(text) = decode(&buf) {
                            if text != last_partial {
                                last_partial = text.clone();
                                let _ = out_tx.send(WorkerEvt::Partial { seg_id, text });
                            }
                        }
                    }
                }
            }
        }
    }

    let _ = out_tx.send(WorkerEvt::Closed);
}
