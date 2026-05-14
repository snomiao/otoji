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

/// Global handle to the worker's input channel — used by the SIGUSR1/SIGUSR2
/// signal handler to inject PttStart/PttEnd commands.
pub static PTT_WORKER_TX: std::sync::Mutex<Option<smpsc::Sender<WorkerMsg>>> =
    std::sync::Mutex::new(None);

/// Signal handler sets these atomic flags; a poller thread forwards to the worker.
/// Using atomic flags instead of channels keeps the signal handler async-signal-safe.
pub static PTT_SIGNAL_PENDING_START: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
pub static PTT_SIGNAL_PENDING_END: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

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

pub fn cache_dir() -> std::path::PathBuf {
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

/// Resolve the SenseVoice model directory for a given variant name.
/// e.g. "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09"
///   → ~/.cache/otoji/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2025-09-09
pub fn model_dir_for_variant(variant: &str) -> std::path::PathBuf {
    let mut d = cache_dir();
    d.push(variant);
    d
}

/// Pick the ONNX model file inside a directory. Prefers the int8 quantized
/// version (faster on M-series); falls back to fp32. Returns the basename
/// suffix (`"model.int8.onnx"` or `"model.onnx"`), or `None` if neither is
/// present. The "full" sherpa-onnx bundles ship only `model.onnx`; the
/// "int8" bundles ship only `model.int8.onnx`; the legacy 2024-07-17 full
/// bundle ships both.
pub fn pick_model_file(dir: &std::path::Path) -> Option<&'static str> {
    if dir.join("model.int8.onnx").exists() {
        Some("model.int8.onnx")
    } else if dir.join("model.onnx").exists() {
        Some("model.onnx")
    } else {
        None
    }
}

/// True if the variant directory contains a usable model + tokens file.
pub fn variant_is_present(variant: &str) -> bool {
    let dir = model_dir_for_variant(variant);
    pick_model_file(&dir).is_some() && dir.join("tokens.txt").exists()
}

impl SenseVoiceConfig {
    pub fn from_env() -> Self {
        let default_model_dir = {
            // Priority: OTOJI_SENSEVOICE_DIR env > persisted config variant > builtin default.
            let variant = std::env::var("OTOJI_SENSEVOICE_VARIANT")
                .ok()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| {
                    let cfg = crate::config::load();
                    if cfg.sherpa_model_variant.is_empty() {
                        crate::config::DEFAULT_SHERPA_VARIANT.to_string()
                    } else {
                        cfg.sherpa_model_variant
                    }
                });
            model_dir_for_variant(&variant).to_string_lossy().into_owned()
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
            // Trailing silence (ms) that force-flushes the current buffer as
            // a Final. This is the "speaker stopped talking" cutoff —
            // independent of SenseVoice's punctuation-based commits. 3s is a
            // natural conversational pause; shorter values cut mid-sentence.
            vad_silence_ms: env_u32("OTOJI_VAD_SILENCE_MS", 3000),
            // Context window for sliding-window decode. Larger = more context
            // but slower decodes. 15s at 22x RTF = 0.68s per decode.
            vad_max_ms: env_u32("OTOJI_VAD_MAX_MS", 15_000),
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
pub enum WorkerMsg {
    Pcm(Vec<i16>),
    Eof,
    /// Begin a push-to-talk segment — accumulate audio from this point.
    PttStart,
    /// End the push-to-talk segment — transcribe and emit PttFinal.
    PttEnd,
}

/// Events from the worker thread to the async side.
enum WorkerEvt {
    Open,
    Partial { seg_id: u64, text: String },
    Final { seg_id: u64, text: String, audio: Vec<f32> },
    Status(String),
    Error(String),
    Closed,
    PttPartial { text: String },
    PttFinal { text: String },
    LanguageDetected { lang: String },
}

#[async_trait]
impl AsrProvider for SenseVoice {
    fn name(&self) -> &'static str {
        "sensevoice"
    }

    async fn run(&self, mut audio: AudioRx, events: AsrEventTx) -> Result<()> {
        let cfg = self.cfg.clone();

        // Some sherpa-onnx bundles ship `model.int8.onnx` (quantized), others
        // ship `model.onnx` (fp32). Prefer int8 when both exist.
        let dir_path = std::path::Path::new(&cfg.model_dir);
        let model_basename = pick_model_file(dir_path);
        let tokens_path = format!("{}/tokens.txt", cfg.model_dir);
        if model_basename.is_none() || !std::path::Path::new(&tokens_path).exists() {
            // Derive variant basename from the dir name so the hint matches
            // whatever was configured (default or user-selected).
            let variant = std::path::Path::new(&cfg.model_dir)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or(crate::config::DEFAULT_SHERPA_VARIANT);
            return Err(OtojiError::Provider(format!(
                "SenseVoice model not found at {dir}.\n\
                 Open the otoji tray → 設定 → SenseVoice モデル to download it (progress shown inline).\n\
                 Or run manually:\n  \
                 mkdir -p {dir} && curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{variant}.tar.bz2 \
                 | tar -xj -C $(dirname {dir})",
                dir = cfg.model_dir,
                variant = variant
            )));
        }

        let (in_tx, in_rx) = smpsc::channel::<WorkerMsg>();
        let (out_tx, out_rx) = smpsc::channel::<WorkerEvt>();

        // Expose in_tx for signal handlers (PTT start/end).
        // Store globally so the signal handler can find it.
        {
            let mut guard = PTT_WORKER_TX.lock().unwrap();
            *guard = Some(in_tx.clone());
        }

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
                    WorkerEvt::PttPartial { text } => AsrEvent::PttPartial { text },
                    WorkerEvt::PttFinal { text } => AsrEvent::PttFinal { text },
                    WorkerEvt::LanguageDetected { lang } => AsrEvent::LanguageDetected { lang },
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

thread_local! {
    /// Scratch slot written by the `decode` closure in `worker_main`, read
    /// by `flush_lang!()` to emit LanguageDetected without mutable borrow
    /// conflicts in the closure.
    static DECODED_LANG: std::cell::RefCell<Option<String>> = const { std::cell::RefCell::new(None) };
}

/// Extract the first `<|xx|>` language tag from raw SenseVoice output.
/// Returns BCP-47-ish lowercase code (e.g. "ja", "zh", "en", "ko", "yue").
fn parse_language_tag(raw: &str) -> Option<String> {
    let start = raw.find("<|")?;
    let rest = &raw[start + 2..];
    let end = rest.find("|>")?;
    let tag = &rest[..end];
    // SenseVoice tags include emotion / event tags too. Filter to likely
    // language codes — 2-4 ASCII lowercase letters.
    if (2..=4).contains(&tag.len())
        && tag.chars().all(|c| c.is_ascii_lowercase())
    {
        Some(tag.to_string())
    } else {
        None
    }
}

fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| s as f32 / 32768.0).collect()
}

// rms() removed — replaced by TEN VAD neural speech detection.

fn worker_main(
    cfg: SenseVoiceConfig,
    in_rx: smpsc::Receiver<WorkerMsg>,
    out_tx: smpsc::Sender<WorkerEvt>,
) {
    let mut config = OfflineRecognizerConfig::default();
    config.model_config.tokens = Some(format!("{}/tokens.txt", cfg.model_dir));
    let model_basename = pick_model_file(std::path::Path::new(&cfg.model_dir))
        .unwrap_or("model.int8.onnx");
    config.model_config.sense_voice = OfflineSenseVoiceModelConfig {
        model: Some(format!("{}/{}", cfg.model_dir, model_basename)),
        language: Some(cfg.language.clone()),
        use_itn: true,
    };
    config.model_config.num_threads = env_u32("OTOJI_NUM_THREADS", 4) as i32;

    // Lazy load: don't pay the ~1GB SenseVoice model load cost until we
    // actually have audio to decode. For `otoji listen -` with a tiny
    // input that errors before any PCM arrives, this skips the load
    // entirely; for the mic, it defers it until the user starts talking.
    // Track whether PTT was requested before model loaded, so we can
    // activate it as soon as the main loop starts.
    let mut ptt_pending = false;
    let first = loop {
        match in_rx.recv() {
            Ok(WorkerMsg::Eof) | Err(_) => {
                let _ = out_tx.send(WorkerEvt::Closed);
                return;
            }
            Ok(msg @ WorkerMsg::Pcm(_)) => break msg,
            Ok(WorkerMsg::PttStart) => { ptt_pending = true; }
            Ok(WorkerMsg::PttEnd) => { ptt_pending = false; }
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
    // Single continuous decode track: decode the full buffer after each batch
    // of new audio. This gives both streaming Partials AND sentence detection
    // from one decode pass — no separate fast/slow tracks.
    //
    // - Partial: emitted whenever decoded text changes (uncommitted portion).
    // - Final: emitted when SenseVoice adds sentence-ending punctuation
    //   (。！？) and the sentence is stable across 2 consecutive decodes.
    // - Context: buffer is NOT cleared on sentence commit. SenseVoice always
    //   sees the full conversation history (up to max_ms).
    // - Energy VAD: only used as a "speech started" gate so we don't waste
    //   decode cycles on pure silence.
    //
    // Cost: decode time grows with buffer. At 22x RTF with 4 threads:
    //   5s buf → 0.23s decode (4 updates/sec)
    //  15s buf → 0.68s decode (1.5 updates/sec)
    //  30s buf → 1.36s decode (0.7 updates/sec)

    let max_samples = (cfg.vad_max_ms as usize) * SAMPLE_RATE as usize / 1000;
    let min_samples = SAMPLE_RATE as usize; // 1s minimum to decode

    let mut buf: Vec<f32> = Vec::new();
    // Language tag from the most recent decode (parked in DECODED_LANG
    // thread-local by the decode closure to avoid borrow conflicts).
    let mut last_emitted_lang: Option<String> = None;
    macro_rules! flush_lang {
        () => {
            let cur = DECODED_LANG.with(|slot| slot.borrow().clone());
            if cur.is_some() && cur != last_emitted_lang {
                if let Some(ref lang) = cur {
                    let _ = out_tx.send(WorkerEvt::LanguageDetected { lang: lang.clone() });
                    last_emitted_lang = cur.clone();
                }
            }
        };
    }
    let mut seg_id: u64 = 0;
    // Sentence-level commit tracking: store hashes of committed sentence
    // bodies (normalized) so we can dedupe across SenseVoice text revisions.
    let mut committed_sentence_norms: Vec<String> = Vec::new();
    let mut prev_held_sentence_norm = String::new(); // last sentence we held back (for 2-cycle stability)
    let mut last_decoded = String::new();
    let mut last_partial_emitted = String::new();
    let min_commit_chars: usize = 8;
    let mut samples_since_commit: usize = SAMPLE_RATE as usize * 10; // start high so first commit isn't cooldown-blocked

    // PTT state: when active, audio is also accumulated in ptt_buf.
    // If PTT was requested during model loading, activate immediately.
    let mut ptt_active = ptt_pending;
    if ptt_pending {
        eprintln!("[sensevoice] PTT was pending during model load → activating now");
    }
    let mut ptt_buf: Vec<f32> = Vec::new();
    let mut ptt_samples_since_partial: usize = 0;
    let mut ptt_last_partial = String::new();

    fn normalize_sentence(s: &str) -> String {
        s.chars().filter(|c| {
            !c.is_ascii_whitespace()
                && !matches!(*c, ' ' | '\u{3000}' | '、' | '，' | '。' | '.' | '？' | '?' | '！' | '!')
        }).collect()
    }
    fn split_into_sentences(text: &str) -> Vec<String> {
        let ends: &[char] = &['。', '！', '？', '.', '!', '?'];
        let mut out = Vec::new();
        let mut start = 0;
        for (i, c) in text.char_indices() {
            if ends.contains(&c) {
                let end = i + c.len_utf8();
                out.push(text[start..end].trim().to_string());
                start = end;
            }
        }
        out
    }
    let mut samples_since_decode: usize = 0;
    let mut speech_active = false;

    // Energy-based VAD with adaptive noise floor calibration.
    // TEN VAD (neural) was tested but its ONNX Runtime contended with
    // SenseVoice's ONNX session, causing 5x slowdown. Energy VAD +
    // RNNoise denoise (in mic.rs) gives good enough noise robustness.
    let configured_threshold = cfg.vad_threshold;
    let calibration_samples = SAMPLE_RATE as usize * 2;
    let mut calibration_count: usize = 0;
    let mut calibration_rms: Vec<f32> = Vec::new();
    let mut threshold: f32 = configured_threshold;
    let mut calibrated = false;

    let silence_samples_needed = (cfg.vad_silence_ms as usize) * SAMPLE_RATE as usize / 1000;
    let mut silence_run: usize = 0;

    fn rms(samples: &[f32]) -> f32 {
        if samples.is_empty() { return 0.0; }
        let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
        (sum_sq / samples.len() as f32).sqrt()
    }

    let decode = |audio: &[f32]| -> Option<String> {
        if audio.len() < min_samples {
            return None;
        }
        let stream = recognizer.create_stream();
        stream.accept_waveform(SAMPLE_RATE as i32, audio);
        recognizer.decode(&stream);
        let raw = stream.get_result()?.text;
        // Language extraction now happens via DECODED_LANG thread-local so
        // callers can read it without mutable borrow conflicts.
        DECODED_LANG.with(|slot| { *slot.borrow_mut() = parse_language_tag(&raw); });
        let text = raw.trim().to_string();
        let has_content = text.chars().any(|c| {
            !c.is_ascii_punctuation()
                && !c.is_ascii_whitespace()
                && !matches!(c, '。' | '、' | '？' | '！' | '・')
        });
        if has_content { Some(text) } else { None }
    };

    // (split_sentences removed — replaced by split_into_sentences)

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
                // EOF: emit any uncommitted sentences.
                if buf.len() >= min_samples {
                    if let Some(text) = decode(&buf) {
                        let sentences = split_into_sentences(&text);
                        for sentence in &sentences {
                            let norm = normalize_sentence(sentence);
                            if norm.chars().count() < min_commit_chars { continue; }
                            let already = committed_sentence_norms.iter().any(|c| {
                                let (short, long) = if c.len() < norm.len() { (c, &norm) } else { (&norm, c) };
                                if short.is_empty() { return false; }
                                if long.contains(short.as_str()) { return true; }
                                let common: usize = short.chars().filter(|ch| long.contains(*ch)).count();
                                common * 100 / short.chars().count() > 70
                            });
                            if !already {
                                flush_lang!();
                                let _ = out_tx.send(WorkerEvt::Final {
                                    seg_id,
                                    text: sentence.clone(),
                                    audio: buf.clone(),
                                });
                                seg_id += 1;
                                committed_sentence_norms.push(norm);
                            }
                        }
                        // Also emit the trailing incomplete sentence if it's
                        // long enough and not already committed.
                        let last_end = {
                            let ends: &[char] = &['。', '！', '？', '.', '!', '?'];
                            text.rfind(ends)
                                .map(|p| p + text[p..].chars().next().map(|c| c.len_utf8()).unwrap_or(0))
                                .unwrap_or(0)
                        };
                        let trailing = text[last_end..].trim().to_string();
                        let trailing_norm = normalize_sentence(&trailing);
                        if trailing_norm.chars().count() >= min_commit_chars {
                            let already = committed_sentence_norms.iter().any(|c| {
                                let (short, long) = if c.len() < trailing_norm.len() { (c, &trailing_norm) } else { (&trailing_norm, c) };
                                !short.is_empty() && long.contains(short.as_str())
                            });
                            if !already {
                                flush_lang!();
                                let _ = out_tx.send(WorkerEvt::Final {
                                    seg_id,
                                    text: trailing,
                                    audio: buf.clone(),
                                });
                            }
                        }
                    }
                }
                break;
            }
            WorkerMsg::PttStart => {
                ptt_active = true;
                ptt_buf.clear();
                ptt_samples_since_partial = 0;
                ptt_last_partial.clear();
                eprintln!("[sensevoice] PTT start");
            }
            WorkerMsg::PttEnd => {
                if ptt_active {
                    ptt_active = false;
                    let ptt_ms = ptt_buf.len() * 1000 / SAMPLE_RATE as usize;
                    let ptt_rms = rms(&ptt_buf);
                    // Silent segment skip: below VAD threshold AND short ⇒
                    // don't even decode. Saves ~100ms + any downstream
                    // polish/TTS API cost. Still emits an empty ptt_final
                    // so the consumer's placeholder cleanup runs.
                    let silent = ptt_rms < (threshold * 0.7);
                    eprintln!(
                        "[sensevoice] PTT end ({ptt_ms}ms, {} samples, rms={:.4}{})",
                        ptt_buf.len(), ptt_rms,
                        if silent { ", SILENT — skipping decode" } else { "" }
                    );
                    // Use a lower threshold than normal VAD (250ms vs 1s).
                    let ptt_min = SAMPLE_RATE as usize / 4; // 250ms
                    let text = if silent || ptt_buf.len() < ptt_min {
                        String::new()
                    } else {
                        decode(&ptt_buf).unwrap_or_default()
                    };
                    flush_lang!();
                    let _ = out_tx.send(WorkerEvt::PttFinal { text });
                    ptt_buf.clear();
                    ptt_samples_since_partial = 0;
                    ptt_last_partial.clear();
                }
            }
            WorkerMsg::Pcm(pcm_i16) => {
                let block = i16_to_f32(&pcm_i16);

                // Feed PTT buffer if active.
                if ptt_active {
                    ptt_buf.extend_from_slice(&block);
                    ptt_samples_since_partial += block.len();
                    // Periodic PTT partial (every partial_ms).
                    let ptt_partial_step = (cfg.partial_ms as usize) * SAMPLE_RATE as usize / 1000;
                    let ptt_min_samples = min_samples;
                    if ptt_partial_step > 0
                        && ptt_samples_since_partial >= ptt_partial_step
                        && ptt_buf.len() >= ptt_min_samples
                    {
                        ptt_samples_since_partial = 0;
                        if let Some(text) = decode(&ptt_buf) {
                            flush_lang!();
                            if text != ptt_last_partial {
                                ptt_last_partial = text.clone();
                                let _ = out_tx.send(WorkerEvt::PttPartial { text });
                            }
                        }
                    }
                }

                // Calibrate noise floor from first ~2s.
                if !calibrated {
                    let block_rms = rms(&block);
                    if block_rms > 0.0 { calibration_rms.push(block_rms); }
                    calibration_count += block.len();
                    if calibration_count >= calibration_samples {
                        let noise_floor = calibration_rms.iter().copied().reduce(f32::min).unwrap_or(0.0);
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

                if !speech_active && !active { continue; }
                speech_active = true;

                // Noise gate: zero out non-speech blocks.
                if calibrated && !active {
                    buf.extend_from_slice(&vec![0.0f32; block.len()]);
                } else {
                    buf.extend_from_slice(&block);
                }
                samples_since_decode += block.len();
                samples_since_commit = samples_since_commit.saturating_add(block.len());

                if active {
                    silence_run = 0;
                } else {
                    silence_run += block.len();
                }

                // Trim front if buf exceeds max (keep context, discard old).
                if buf.len() > max_samples {
                    let trim = buf.len() - max_samples;
                    buf.drain(..trim);
                    last_decoded.clear();
                    last_partial_emitted.clear();
                    // Keep committed_sentence_norms — they continue to dedupe
                    // even as buf rolls forward.
                }

                // ── Single decode track ──
                // Adaptive interval: responsive at small buf (1s), efficient at
                // large buf (buf/6). Prevents O(n²) in burst mode while keeping
                // ~1s partial updates for realtime mic input.
                let decode_interval = (buf.len() / 8).max(SAMPLE_RATE as usize * 2);
                let enough_new = samples_since_decode >= decode_interval;
                if enough_new && buf.len() >= min_samples {
                    samples_since_decode = 0;

                    if let Some(text) = decode(&buf) {
                        // Sentence-level diff: split decode into sentences,
                        // find the first one not in committed_sentence_norms,
                        // emit it as Final. Partial = trailing incomplete part.
                        let sentences = split_into_sentences(&text);

                        // Find the trailing incomplete sentence (after last 。)
                        let last_end = {
                            let ends: &[char] = &['。', '！', '？', '.', '!', '?'];
                            text.rfind(ends)
                                .map(|p| p + text[p..].chars().next().map(|c| c.len_utf8()).unwrap_or(0))
                                .unwrap_or(0)
                        };
                        let trailing = text[last_end..].trim().to_string();

                        // Anti-premature commit: SenseVoice can add 。
                        // mid-utterance. Determine if the LAST sentence's
                        // 。 is real or premature:
                        //   - If text has trailing content after 。 → confirmed
                        //   - If audio is currently silent (≥300ms) → real pause
                        //   - If buf is ≥75% of max → commit before trim drops it
                        //   - Otherwise → premature, hold for next decode
                        let silent_now = silence_run >= SAMPLE_RATE as usize * 3 / 10;
                        let buf_pressure = buf.len() * 4 >= max_samples * 3;
                        // 2-cycle stability: same trailing sentence appeared
                        // last decode AND this decode → commit it.
                        let last_sent_norm = sentences.last()
                            .map(|s| normalize_sentence(s))
                            .unwrap_or_default();
                        let stable_held = !last_sent_norm.is_empty()
                            && last_sent_norm == prev_held_sentence_norm;
                        let commit_count = if !trailing.is_empty() || silent_now || buf_pressure || stable_held {
                            sentences.len()
                        } else {
                            sentences.len().saturating_sub(1)
                        };
                        prev_held_sentence_norm = if commit_count < sentences.len() {
                            last_sent_norm
                        } else {
                            String::new()
                        };

                        // Emit any new uncommitted sentences as Finals.
                        let cooldown_ok = samples_since_commit >= SAMPLE_RATE as usize * 2;
                        for sentence in sentences.iter().take(commit_count) {
                            let norm = normalize_sentence(sentence);
                            if norm.chars().count() < min_commit_chars {
                                continue;
                            }
                            let already = committed_sentence_norms.iter().any(|c| {
                                let (short, long) = if c.len() < norm.len() { (c, &norm) } else { (&norm, c) };
                                if short.len() == 0 { return false; }
                                if long.contains(short.as_str()) { return true; }
                                let common: usize = short.chars().filter(|ch| long.contains(*ch)).count();
                                common * 100 / short.chars().count() > 70
                            });
                            if !already && cooldown_ok {
                                flush_lang!();
                                let _ = out_tx.send(WorkerEvt::Final {
                                    seg_id,
                                    text: sentence.clone(),
                                    audio: buf.clone(),
                                });
                                seg_id += 1;
                                committed_sentence_norms.push(norm);
                                // Cap memory: keep last 50 committed sentences
                                if committed_sentence_norms.len() > 50 {
                                    committed_sentence_norms.remove(0);
                                }
                                samples_since_commit = 0;
                            }
                        }

                        // Emit Partial = full decoded text. This always shows
                        // what the recognizer currently hears, so the user
                        // gets streaming word-by-word feedback. Final events
                        // mark which sentences have been "committed" — the
                        // display layer can dedupe if needed.
                        let _ = trailing; // unused for now
                        if !text.is_empty() && text != last_partial_emitted {
                            last_partial_emitted = text.clone();
                            let _ = out_tx.send(WorkerEvt::Partial {
                                seg_id,
                                text: text.clone(),
                            });
                        }
                        last_decoded = text;
                    }
                }

                // Force flush on long silence (speaker truly stopped).
                if silence_run >= silence_samples_needed && buf.len() >= min_samples {
                    if let Some(text) = decode(&buf) {
                        let trim_text = text.trim().to_string();
                        let trim_norm = normalize_sentence(&trim_text);
                        let already = committed_sentence_norms.iter().any(|c| {
                            let (short, long) = if c.len() < trim_norm.len() { (c, &trim_norm) } else { (&trim_norm, c) };
                            !short.is_empty() && long.contains(short.as_str())
                        });
                        if !already && !trim_text.is_empty() {
                            flush_lang!();
                            let _ = out_tx.send(WorkerEvt::Final {
                                seg_id,
                                text: trim_text,
                                audio: buf.clone(),
                            });
                            seg_id += 1;
                        }
                    }
                    buf.clear();
                    committed_sentence_norms.clear();
                    last_decoded.clear();
                    last_partial_emitted.clear();
                    speech_active = false;
                    silence_run = 0;
                    samples_since_decode = 0;
                }
            }
        }
    }

    let _ = out_tx.send(WorkerEvt::Closed);
}
