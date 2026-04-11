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
use sherpa_onnx::{OfflineRecognizer, OfflineRecognizerConfig, OfflineSenseVoiceModelConfig};
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
            // Each partial re-runs SenseVoice on the *entire* utterance buffer,
            // so cost grows O(n²) with utterance length. 300ms cadence pegged
            // a single thread at >100% CPU for ~10s utterances and pushed the
            // pipeline below realtime on M-series. 1500ms keeps the live UX
            // feeling responsive while running ~5x faster overall. Set to 0
            // to disable partial decoding entirely (recommended for headless
            // `--plain` consumers that only care about Final events).
            partial_ms: env_u32("OTOJI_PARTIAL_MS", 1500),
            vad_threshold: std::env::var("OTOJI_VAD_THRESHOLD")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.0005),
            // QA matrix (docs/07-otoji-listen-qa.md) found 750ms is the Pareto
            // optimum: 20% lower TTFB than 1000ms with identical capture and
            // accuracy. Going to 500ms hurts capture by ~5 points.
            vad_silence_ms: env_u32("OTOJI_VAD_SILENCE_MS", 750),
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
    Partial { seg_id: u64, text: String },
    Final { seg_id: u64, text: String, audio: Vec<f32> },
    Status(String),
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
                    WorkerEvt::Partial { seg_id, text } => AsrEvent::Partial { seg_id, text },
                    WorkerEvt::Final { seg_id, text, audio } => AsrEvent::Final {
                        seg_id,
                        text,
                        words: Vec::new(),
                        audio: Some(audio),
                    },
                    WorkerEvt::Status(message) => AsrEvent::Status { message },
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
    config.model_config.num_threads = env_u32("OTOJI_NUM_THREADS", 4) as i32;

    // Lazy load: don't pay the ~1GB SenseVoice model load cost until we
    // actually have audio to decode. For `otoji listen -` with a tiny
    // input that errors before any PCM arrives, this skips the load
    // entirely; for the mic, it defers it until the user starts talking.
    let first = loop {
        match in_rx.recv() {
            Ok(WorkerMsg::Eof) | Err(_) => {
                let _ = out_tx.send(WorkerEvt::Closed);
                return;
            }
            Ok(msg @ WorkerMsg::Pcm(_)) => break msg,
        }
    };

    let _ = out_tx.send(WorkerEvt::Status(format!(
        "sensevoice: loading model from {} …",
        cfg.model_dir
    )));
    let load_started = std::time::Instant::now();
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
    let _ = out_tx.send(WorkerEvt::Status(format!(
        "sensevoice: model loaded in {:.2}s",
        load_started.elapsed().as_secs_f32()
    )));
    let _ = out_tx.send(WorkerEvt::Open);

    // ── Sliding-window architecture ──
    //
    // Instead of VAD-flush-clear (which loses context and mis-cuts sentences),
    // we keep a growing audio buffer and run two decode tracks:
    //
    //   Fast track (Partial): decode only the TAIL of the buffer (~3-5s).
    //     Constant cost regardless of total buf length → ~140ms per decode
    //     → streaming word-by-word experience.
    //
    //   Slow track (Final): decode the FULL buffer continuously.
    //     SenseVoice adds sentence-ending punctuation (。！？) — when a
    //     sentence is complete and stable across 2 consecutive decodes,
    //     commit it as a Final. The buffer is NOT cleared — context is
    //     preserved for subsequent decodes.
    //
    // Energy VAD is only used as a coarse "speech started" gate so we don't
    // waste decode cycles on pure silence.

    let max_samples = (cfg.vad_max_ms as usize) * SAMPLE_RATE as usize / 1000;
    let tail_samples = SAMPLE_RATE as usize * 4; // 4s tail for fast partial
    let min_samples = SAMPLE_RATE as usize / 2; // 500ms minimum to decode

    let mut buf: Vec<f32> = Vec::new();
    let mut seg_id: u64 = 0;
    let mut committed_chars: usize = 0; // char count already emitted as Finals
    let mut last_full_text = String::new(); // previous full-buf decode result
    let mut prev_complete = String::new(); // previous completed-sentence prefix (for stability)
    let mut last_partial_text = String::new();
    let mut samples_since_decode: usize = 0;
    let mut speech_active = false; // has speech started?

    // Adaptive energy threshold (same calibration as before — just used as
    // a "speech started" gate, not for sentence cutting).
    let configured_threshold = cfg.vad_threshold;
    let calibration_samples = SAMPLE_RATE as usize * 2;
    let mut calibration_count: usize = 0;
    let mut calibration_rms: Vec<f32> = Vec::new();
    let mut threshold: f32 = configured_threshold;
    let mut calibrated = false;

    // Long silence counter: if silence exceeds vad_silence_ms, force a
    // full-buf decode + commit everything. This handles the case where the
    // speaker truly stopped talking (topic change, end of conversation).
    let silence_samples_needed = (cfg.vad_silence_ms as usize) * SAMPLE_RATE as usize / 1000;
    let mut silence_run: usize = 0;

    let decode = |audio: &[f32]| -> Option<String> {
        if audio.len() < min_samples {
            return None;
        }
        let stream = recognizer.create_stream();
        stream.accept_waveform(SAMPLE_RATE as i32, audio);
        recognizer.decode(&stream);
        let text = stream.get_result()?.text.trim().to_string();
        let has_content = text.chars().any(|c| {
            !c.is_ascii_punctuation()
                && !c.is_ascii_whitespace()
                && !matches!(c, '。' | '、' | '？' | '！' | '・')
        });
        if has_content { Some(text) } else { None }
    };

    // Find completed sentences: text ending with sentence-final punctuation.
    // Returns (committed_prefix, remainder). The committed prefix contains
    // one or more full sentences; the remainder is the incomplete tail.
    fn split_sentences(text: &str) -> (String, String) {
        // Find the last sentence-ending punctuation.
        let ends: &[char] = &['。', '！', '？', '!', '?'];
        if let Some(pos) = text.rfind(ends) {
            let byte_end = pos + text[pos..].chars().next().map(|c| c.len_utf8()).unwrap_or(0);
            (text[..byte_end].to_string(), text[byte_end..].trim().to_string())
        } else {
            (String::new(), text.to_string())
        }
    }

    let mut pending_first = Some(first);
    loop {
        let msg = match pending_first.take() {
            Some(m) => m,
            None => match in_rx.recv() {
                Ok(m) => m,
                Err(_) => break,
            },
        };
        match msg {
            WorkerMsg::Eof => {
                // Final flush: decode everything remaining and emit.
                // EOF: emit any uncommitted text.
                if buf.len() >= min_samples {
                    if let Some(text) = decode(&buf) {
                        let chars: Vec<char> = text.chars().collect();
                        let remaining: String = if committed_chars < chars.len() {
                            chars[committed_chars..].iter().collect::<String>().trim().to_string()
                        } else {
                            String::new()
                        };
                        if !remaining.is_empty() {
                            let _ = out_tx.send(WorkerEvt::Final {
                                seg_id,
                                text: remaining,
                                audio: buf.clone(),
                            });
                        }
                    }
                }
                break;
            }
            WorkerMsg::Pcm(pcm_i16) => {
                let block = i16_to_f32(&pcm_i16);

                // Calibrate noise floor from first ~2s.
                if !calibrated {
                    let block_rms_val = rms(&block);
                    if block_rms_val > 0.0 {
                        calibration_rms.push(block_rms_val);
                    }
                    calibration_count += block.len();
                    if calibration_count >= calibration_samples {
                        let noise_floor = calibration_rms.iter()
                            .copied()
                            .reduce(f32::min)
                            .unwrap_or(0.0);
                        threshold = (noise_floor * 1.5).max(configured_threshold);
                        let _ = out_tx.send(WorkerEvt::Status(format!(
                            "vad: noise_floor={noise_floor:.5}, threshold={threshold:.5}"
                        )));
                        calibration_rms = Vec::new();
                        calibrated = true;
                    }
                }

                let block_rms = rms(&block);
                let active = block_rms >= threshold;

                // Gate: only start buffering once speech is detected.
                if !speech_active && !active {
                    continue;
                }
                speech_active = true;

                buf.extend_from_slice(&block);
                samples_since_decode += block.len();

                if active {
                    silence_run = 0;
                } else {
                    silence_run += block.len();
                }

                // Trim front if buf exceeds max (keep context, discard old).
                if buf.len() > max_samples {
                    let trim = buf.len() - max_samples;
                    buf.drain(..trim);
                    // Reset committed tracking since we lost the front.
                    committed_chars = 0;
                    last_full_text.clear();
                    prev_complete.clear();
                }

                // ── Fast track: tail-only decode for streaming Partials ──
                // Triggered whenever we have enough new audio. The tail
                // decode is cheap (~140ms for 4s) so it runs frequently.
                let enough_new = samples_since_decode >= SAMPLE_RATE as usize / 5; // ~200ms of new audio
                if enough_new && buf.len() >= min_samples {
                    samples_since_decode = 0;

                    let tail_start = buf.len().saturating_sub(tail_samples);
                    let tail = &buf[tail_start..];
                    if let Some(tail_text) = decode(tail) {
                        if tail_text != last_partial_text {
                            last_partial_text = tail_text.clone();
                            let _ = out_tx.send(WorkerEvt::Partial { seg_id, text: tail_text });
                        }
                    }

                    // ── Slow track: full-buf decode for sentence detection ──
                    // Only run when buf is large enough that the tail and full
                    // decode would differ (i.e., buf > tail window). Otherwise
                    // the fast track already decoded everything.
                    if buf.len() > tail_samples + min_samples {
                        if let Some(full_text) = decode(&buf) {
                            // Extract the uncommitted portion of the decoded text.
                            // Use char offset — robust against SenseVoice revising
                            // earlier text slightly between decodes.
                            let chars: Vec<char> = full_text.chars().collect();
                            let uncommitted: String = if committed_chars < chars.len() {
                                chars[committed_chars..].iter().collect::<String>().trim().to_string()
                            } else {
                                String::new()
                            };

                            let (complete, _remainder) = split_sentences(&uncommitted);
                            // Stability: the same completed prefix must appear in
                            // two consecutive full decodes to avoid emitting while
                            // SenseVoice is still revising.
                            if !complete.is_empty() && complete == prev_complete {
                                let audio = buf.clone();
                                let _ = out_tx.send(WorkerEvt::Final {
                                    seg_id,
                                    text: complete.clone(),
                                    audio,
                                });
                                seg_id += 1;
                                committed_chars += complete.chars().count();
                                prev_complete.clear();
                            } else {
                                prev_complete = complete;
                            }
                            last_full_text = full_text;
                        }
                    }
                }

                // Force flush on long silence (speaker truly stopped).
                if silence_run >= silence_samples_needed * 4 && buf.len() >= min_samples {
                    // Long silence — speaker stopped. Commit any remaining text.
                    if let Some(text) = decode(&buf) {
                        let chars: Vec<char> = text.chars().collect();
                        let remaining: String = if committed_chars < chars.len() {
                            chars[committed_chars..].iter().collect::<String>().trim().to_string()
                        } else {
                            String::new()
                        };
                        if !remaining.is_empty() {
                            let _ = out_tx.send(WorkerEvt::Final {
                                seg_id,
                                text: remaining,
                                audio: buf.clone(),
                            });
                            seg_id += 1;
                        }
                    }
                    buf.clear();
                    committed_chars = 0;
                    last_full_text.clear();
                    prev_complete.clear();
                    last_partial_text.clear();
                    speech_active = false;
                    silence_run = 0;
                    samples_since_decode = 0;
                }
            }
        }
    }

    let _ = out_tx.send(WorkerEvt::Closed);
}
