//! `otoji` CLI — react-ink-style live transcript TUI built on ratatui.
//!
//! Usage:
//!   otoji listen                       # capture mic, show live transcript
//!   otoji file path/to/16k.pcm         # replay a PCM file in real time
//!   otoji speak "你好世界"              # TTS via iflytek
//!
//! Auth: set IFLYTEK_APP_ID / IFLYTEK_API_KEY (and TTS_* for `speak`).
//! Polish: set ANTHROPIC_API_KEY to enable LLM tidy-up of finals.

mod tui;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use otoji::asr::{
    iflytek_rtasr::{IflytekRtasr, IflytekRtasrConfig},
    sensevoice::{SenseVoice, SenseVoiceConfig},
    AsrProvider,
};
use otoji::audio::{self, file::{stream_pcm_file, stream_wav_reader_blocking}, mic};
use std::io::IsTerminal;
use otoji::core::AudioFormat;
use otoji::polish::{
    AnthropicPolisher, DeferredPolisher, GeminiPolisher, NoopPolisher, OpenAiPolisher, Polisher,
};
use otoji::tts::{
    elevenlabs::{ElevenLabsTts, ElevenLabsTtsConfig},
    gemini::{GeminiTts, GeminiTtsConfig},
    iflytek_tts::{IflytekTts, IflytekTtsConfig},
    openai::{OpenAiTts, OpenAiTtsConfig},
    piper::{PiperTts, PiperTtsConfig},
    TtsProvider,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Parser)]
#[command(
    name = "otoji",
    about = "音字 — realtime speech ⇄ text",
    version = env!("OTOJI_LONG_VERSION"),
)]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum AsrKind {
    /// iFlytek RTASR (cloud, requires IFLYTEK_APP_ID / IFLYTEK_API_KEY).
    Iflytek,
    /// SenseVoice via sherpa-onnx (local, no API keys).
    Sensevoice,
}

#[derive(Subcommand)]
enum Cmd {
    /// Capture from an input device and stream to an ASR provider.
    #[command(alias = "l")]
    Listen {
        /// Input device — substring of the device name or numeric index.
        /// Omit to use the system default. Use `otoji devices` to list.
        device: Option<String>,
        /// Which ASR provider to use.
        #[arg(long, value_enum, default_value_t = AsrKind::Sensevoice)]
        provider: AsrKind,
        /// Frame size in milliseconds.
        #[arg(long, default_value_t = 40)]
        frame_ms: u32,
        /// Skip the ratatui TUI and emit AsrEvents as JSON lines on stdout.
        /// Useful for piping into scripts and for headless testing.
        #[arg(long)]
        plain: bool,
    },
    /// List available audio input devices.
    Devices,
    /// Replay a 16kHz mono PCM file as if it were live mic input.
    File {
        path: PathBuf,
        #[arg(long, value_enum, default_value_t = AsrKind::Sensevoice)]
        provider: AsrKind,
        #[arg(long, default_value_t = 40)]
        frame_ms: u32,
        /// Disable real-time pacing (send as fast as possible).
        #[arg(long)]
        burst: bool,
    },
    /// Synthesize text via iFlytek TTS and write the audio to `out`.
    Speak {
        text: String,
        #[arg(long, default_value = "out.mp3")]
        out: PathBuf,
    },
    /// Synthesize text and stream a 16 kHz mono WAV to stdout.
    /// Pipe-friendly: `echo "hi" | otoji say - | otoji listen -`.
    Say {
        /// Literal text, or `-` to read from stdin.
        text: String,
        /// TTS provider. `auto` picks the best available: piper if a model
        /// is on disk, otherwise the first env-key match (openai → 11labs
        /// → gemini).
        #[arg(long, value_enum, default_value_t = TtsKind::Auto)]
        provider: TtsKind,
    },
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum TtsKind {
    /// Pick automatically: piper > openai > elevenlabs > gemini.
    Auto,
    /// Local Piper VITS via sherpa-onnx (default when model present).
    Piper,
    /// OpenAI TTS — needs OPENAI_API_KEY. Streams native 24kHz PCM.
    Openai,
    /// ElevenLabs TTS — needs ELEVENLABS_API_KEY. Streams native 16kHz PCM.
    Elevenlabs,
    /// Google Gemini TTS — per-sentence streaming hack. Needs GEMINI_API_KEY.
    Gemini,
    /// iFlytek TTS in PCM mode (`aue=raw`). Needs IFLYTEK_* env vars.
    Iflytek,
}

fn resolve_tts(kind: TtsKind) -> Result<Arc<dyn TtsProvider>> {
    let try_piper = || -> Option<Arc<dyn TtsProvider>> {
        let cfg = PiperTtsConfig::from_env();
        if !std::path::Path::new(&cfg.model_dir).is_dir() {
            return None;
        }
        match PiperTts::create(cfg) {
            Ok(p) => Some(Arc::new(p)),
            Err(e) => {
                eprintln!("piper init failed, falling back: {e}");
                None
            }
        }
    };
    let try_openai = || -> Option<Arc<dyn TtsProvider>> {
        OpenAiTtsConfig::from_env()
            .ok()
            .map(|c| Arc::new(OpenAiTts::new(c)) as Arc<dyn TtsProvider>)
    };
    let try_eleven = || -> Option<Arc<dyn TtsProvider>> {
        ElevenLabsTtsConfig::from_env()
            .ok()
            .map(|c| Arc::new(ElevenLabsTts::new(c)) as Arc<dyn TtsProvider>)
    };
    let try_gemini = || -> Option<Arc<dyn TtsProvider>> {
        GeminiTtsConfig::from_env()
            .ok()
            .map(|c| Arc::new(GeminiTts::new(c)) as Arc<dyn TtsProvider>)
    };

    match kind {
        TtsKind::Auto => try_piper()
            .or_else(try_openai)
            .or_else(try_eleven)
            .or_else(try_gemini)
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "no TTS provider available. Either install a Piper model:\n  \
                     mkdir -p ~/.cache/otoji && curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low.tar.bz2 \
                     | tar -xj -C ~/.cache/otoji\n\
                     or set one of OPENAI_API_KEY / ELEVENLABS_API_KEY / GEMINI_API_KEY"
                )
            }),
        TtsKind::Piper => {
            let cfg = PiperTtsConfig::from_env();
            Ok(Arc::new(PiperTts::create(cfg).context("piper init")?))
        }
        TtsKind::Openai => {
            let cfg = OpenAiTtsConfig::from_env().context("openai config")?;
            Ok(Arc::new(OpenAiTts::new(cfg)))
        }
        TtsKind::Elevenlabs => {
            let cfg = ElevenLabsTtsConfig::from_env().context("elevenlabs config")?;
            Ok(Arc::new(ElevenLabsTts::new(cfg)))
        }
        TtsKind::Gemini => {
            let cfg = GeminiTtsConfig::from_env().context("gemini config")?;
            Ok(Arc::new(GeminiTts::new(cfg)))
        }
        TtsKind::Iflytek => {
            let mut cfg = IflytekTtsConfig::from_env().context("iflytek config")?;
            // `say` requires raw PCM. Force aue=raw regardless of env.
            cfg.aue = "raw".into();
            Ok(Arc::new(IflytekTts::new(cfg)))
        }
    }
}

/// Auto-rebuild and re-exec when source files are newer than the binary.
/// Works for both `cargo install` and `target/debug` builds — as long as
/// the source tree (CARGO_MANIFEST_DIR at compile time) still exists on disk.
fn maybe_rebuild_and_reexec() {
    // Prevent infinite re-exec loops.
    if std::env::var_os("OTOJI_REBUILDING").is_some() {
        return;
    }

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let manifest_path = std::path::Path::new(manifest_dir);
    if !manifest_path.join("Cargo.toml").exists() {
        return; // source tree gone, skip
    }

    let exe = match std::env::current_exe().and_then(|p| p.canonicalize()) {
        Ok(p) => p,
        Err(_) => return,
    };

    let exe_mtime = match exe.metadata().and_then(|m| m.modified()) {
        Ok(t) => t,
        Err(_) => return,
    };

    // Walk src/ for any file newer than the binary.
    let src_dir = manifest_path.join("src");
    if !walkdir(&src_dir, &exe_mtime) {
        return;
    }

    // Determine build mode: if binary is under target/, use cargo build;
    // otherwise (e.g. ~/.cargo/bin), use cargo install --path.
    let target_dir = manifest_path.join("target");
    let is_dev = exe.starts_with(&target_dir);

    eprint!("otoji: source changed, rebuilding… ");
    let output = if is_dev {
        std::process::Command::new("cargo")
            .arg("build")
            .current_dir(manifest_dir)
            .env("OTOJI_REBUILDING", "1")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
    } else {
        std::process::Command::new("cargo")
            .args(["install", "--path", manifest_dir])
            .env("OTOJI_REBUILDING", "1")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output()
    };
    match output {
        Ok(o) if o.status.success() => {
            eprintln!("ok");
            let new_exe = std::env::current_exe()
                .and_then(|p| p.canonicalize())
                .unwrap_or(exe);
            let args: Vec<String> = std::env::args().collect();
            let err = exec::execvp(&new_exe, &args);
            eprintln!("otoji: re-exec failed: {err}");
        }
        Ok(o) => {
            eprintln!("failed (exit {})", o.status);
            // Show cargo errors so the user knows what to fix.
            let msg = String::from_utf8_lossy(&o.stderr);
            for line in msg.lines().filter(|l| l.starts_with("error")) {
                eprintln!("  {line}");
            }
        }
        Err(e) => eprintln!("failed ({e})"),
    }
}

fn walkdir(dir: &std::path::Path, threshold: &std::time::SystemTime) -> bool {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if walkdir(&path, threshold) {
                return true;
            }
        } else if let Ok(meta) = path.metadata() {
            if let Ok(mtime) = meta.modified() {
                if mtime > *threshold {
                    return true;
                }
            }
        }
    }
    false
}

#[tokio::main]
async fn main() -> Result<()> {
    maybe_rebuild_and_reexec();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .init();
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Listen {
            device,
            provider,
            frame_ms,
            plain,
        } => run_listen(provider, device, frame_ms, plain || !std::io::stdout().is_terminal()).await,
        Cmd::File {
            path,
            provider,
            frame_ms,
            burst,
        } => run_file(provider, path, frame_ms, !burst).await,
        Cmd::Speak { text, out } => run_speak(text, out).await,
        Cmd::Say { text, provider } => run_say(provider, text).await,
        Cmd::Devices => run_devices().await,
    }
}

/// Probe the default input for ~500ms and return true if any non-zero
/// sample arrives. Used to detect the macOS "no mic permission for this
/// process tree" case before we even render the TUI.
async fn mic_has_audio() -> bool {
    let (tx, mut rx) = audio::channel(16);
    let stream = match mic::start_default(20, tx) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(700);
    let mut nonzero = false;
    while tokio::time::Instant::now() < deadline {
        if let Ok(Some(chunk)) =
            tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await
        {
            if chunk.pcm.iter().any(|&b| b != 0) {
                nonzero = true;
                break;
            }
        }
    }
    drop(stream);
    nonzero
}

/// If we're stuck in a non-GUI process tree on macOS (e.g. spawned under
/// PM2 or a daemonised parent), the kernel hands us all-zero audio. Detect
/// that, then re-exec ourselves inside Terminal.app via osascript so the
/// child inherits Terminal.app's microphone TCC grant.
#[cfg(target_os = "macos")]
async fn ensure_mic_permission_or_relaunch() -> Result<bool> {
    if std::env::var_os("OTOJI_RELAUNCHED").is_some() {
        return Ok(true);
    }
    if mic_has_audio().await {
        return Ok(true);
    }
    eprintln!(
        "otoji: this process tree has no microphone permission \
         (mic returns silence). relaunching inside Terminal.app …"
    );
    // Build the original argv so Terminal.app re-runs the same command.
    let argv: Vec<String> = std::env::args().collect();
    let quoted = argv
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "'\\''")))
        .collect::<Vec<_>>()
        .join(" ");
    let script = format!("export OTOJI_RELAUNCHED=1; exec {quoted}");
    let osa = format!(
        "tell application \"Terminal\"\n  activate\n  do script \"{}\"\nend tell",
        script.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&osa)
        .status()
        .map_err(|e| anyhow::anyhow!("osascript: {e}"))?;
    if !status.success() {
        anyhow::bail!("failed to relaunch in Terminal.app: {status}");
    }
    eprintln!("otoji: launched in Terminal.app — see that window for the live transcript.");
    Ok(false)
}

#[cfg(not(target_os = "macos"))]
async fn ensure_mic_permission_or_relaunch() -> Result<bool> {
    Ok(true)
}

async fn run_listen(
    kind: AsrKind,
    device: Option<String>,
    frame_ms: u32,
    plain: bool,
) -> Result<()> {
    if device.as_deref() == Some("-") {
        return run_listen_stdin(kind, frame_ms, plain).await;
    }
    if matches!(kind, AsrKind::Sensevoice | AsrKind::Iflytek)
        && !ensure_mic_permission_or_relaunch().await?
    {
        return Ok(());
    }
    match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            let provider = IflytekRtasr::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = mic::start_default(frame_ms, audio_tx).context("mic")?;
            if device.is_some() {
                eprintln!(
                    "warning: --provider iflytek currently always uses the system default device"
                );
            }
            drive(provider, audio_rx).await
        }
        AsrKind::Sensevoice => {
            // Pure-Rust SenseVoice via the sherpa-onnx crate. PCM is captured
            // by cpal in this process and forwarded directly to the worker
            // thread that owns the recognizer.
            let cfg = SenseVoiceConfig::from_env();
            let provider = SenseVoice::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = mic::start_default(frame_ms, audio_tx).context("mic")?;
            if device.is_some() {
                eprintln!(
                    "warning: device selection is not yet wired through cpal; using system default"
                );
            }
            if plain {
                drive_plain(provider, audio_rx).await
            } else {
                drive(provider, audio_rx).await
            }
        }
    }
}

async fn run_listen_stdin(kind: AsrKind, frame_ms: u32, plain_flag: bool) -> Result<()> {
    if std::io::stdin().is_terminal() {
        anyhow::bail!(
            "`otoji listen -` expects WAV data on stdin, but stdin is a terminal. \
             Try:  cat sample.wav | otoji listen -"
        );
    }
    // Force plain whenever stdout is not a TTY (piping/redirecting), since the
    // ratatui TUI would fight stdout. Honor the explicit --plain flag too.
    let plain = plain_flag || !std::io::stdout().is_terminal();

    let (audio_tx, audio_rx) = audio::channel(64);
    let tx_for_blocking = audio_tx.clone();
    drop(audio_tx);
    let reader_handle = tokio::task::spawn_blocking(move || {
        let stdin = std::io::stdin();
        let lock = stdin.lock();
        stream_wav_reader_blocking(lock, frame_ms, tx_for_blocking)
    });

    let result = match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            let provider = IflytekRtasr::new(cfg);
            if plain {
                drive_plain(provider, audio_rx).await
            } else {
                drive(provider, audio_rx).await
            }
        }
        AsrKind::Sensevoice => {
            let cfg = SenseVoiceConfig::from_env();
            let provider = SenseVoice::new(cfg);
            if plain {
                drive_plain(provider, audio_rx).await
            } else {
                drive(provider, audio_rx).await
            }
        }
    };
    match reader_handle.await {
        Ok(Ok(())) => {}
        Ok(Err(e)) => eprintln!("stdin reader: {e:#}"),
        Err(e) => eprintln!("stdin reader join: {e}"),
    }
    result
}

async fn drive_plain<P: AsrProvider + 'static>(
    provider: P,
    audio_rx: audio::AudioRx,
) -> Result<()> {
    let (event_tx, mut event_rx) = mpsc::channel(128);
    let provider = Arc::new(provider);
    let p2 = provider.clone();
    tokio::spawn(async move {
        if let Err(e) = p2.run(audio_rx, event_tx).await {
            tracing::error!("asr: {e}");
        }
    });
    while let Some(ev) = event_rx.recv().await {
        if let Ok(line) = serde_json::to_string(&ev) {
            println!("{line}");
        }
        if matches!(ev, otoji::core::AsrEvent::Closed) {
            break;
        }
    }
    Ok(())
}

async fn run_devices() -> Result<()> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();
    let loopback_keywords = [
        "blackhole",
        "loopback",
        "soundflower",
        "vb-cable",
        "vb cable",
    ];

    let inputs: Vec<cpal::Device> = host
        .input_devices()
        .context("enumerate input devices")?
        .collect();

    println!("aliases:");
    println!("  default / mic       → {default_name}");
    let loopback = inputs.iter().find_map(|d| {
        let n = d.name().ok()?;
        let lower = n.to_lowercase();
        loopback_keywords
            .iter()
            .any(|k| lower.contains(k))
            .then_some(n)
    });
    match loopback {
        Some(n) => println!("  system / loopback   → {n}"),
        None => println!(
            "  system / loopback   → (none — install BlackHole: brew install --cask blackhole-2ch)"
        ),
    }

    println!("\ninput devices:");
    for (i, d) in inputs.iter().enumerate() {
        let name = d.name().unwrap_or_else(|_| "<unknown>".into());
        let cfg = d.default_input_config().ok();
        let mark = if name == default_name { "*" } else { " " };
        match cfg {
            Some(c) => println!(
                "{mark} [{i:>2}] {name} ({}ch @ {}Hz)",
                c.channels(),
                c.sample_rate().0
            ),
            None => println!("{mark} [{i:>2}] {name}"),
        }
    }
    Ok(())
}

async fn run_file(kind: AsrKind, path: PathBuf, frame_ms: u32, realtime: bool) -> Result<()> {
    let (audio_tx, audio_rx) = audio::channel(64);
    let p = path.clone();
    tokio::spawn(async move {
        if let Err(e) =
            stream_pcm_file(p, AudioFormat::PCM16K_MONO, frame_ms, realtime, audio_tx).await
        {
            tracing::error!("file source: {e}");
        }
    });
    match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            drive(IflytekRtasr::new(cfg), audio_rx).await
        }
        AsrKind::Sensevoice => {
            let cfg = SenseVoiceConfig::from_env();
            drive(SenseVoice::new(cfg), audio_rx).await
        }
    }
}

async fn drive<P: AsrProvider + 'static>(provider: P, audio_rx: audio::AudioRx) -> Result<()> {
    let (event_tx, event_rx) = mpsc::channel(128);
    // Polish resolution: Gemini multimodal (if key) → OpenAI GPT-4o (if key)
    // → Ollama probe → auto-start Ollama/MLX in background.
    let polisher: Arc<dyn Polisher> = {
        // 1. Gemini multimodal — best quality (audio+text), cloud opt-in.
        if let Ok(p) = GeminiPolisher::from_env() {
            eprintln!("polish: using gemini-multimodal (audio+text)");
            Arc::new(p)
        }
        // 2. OpenAI GPT-4o — fastest cloud, best accuracy, with conversation caching.
        else if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            let model = std::env::var("OTOJI_POLISH_MODEL")
                .unwrap_or_else(|_| "gpt-4o".into());
            eprintln!("polish: using openai {model} (with history caching)");
            Arc::new(OpenAiPolisher::new("https://api.openai.com/v1", key, model))
        }
        // 3. Ollama / local OpenAI-compat — already running?
        else if let Ok(p) = OpenAiPolisher::from_env() {
            let base_url = p.base_url.clone();
            let model = p.model.clone();
            if let Ok(p) = p.probe().await {
                eprintln!("polish: using {} (model={})", p.base_url, p.model);
                ensure_ollama_model(&p.base_url, &p.model).await;
                Arc::new(p)
            }
            // 3. Anthropic — cloud fallback if key is set.
            else if let Ok(p) = AnthropicPolisher::from_env() {
                eprintln!("polish: using anthropic (model={})", p.model);
                Arc::new(p)
            }
            // 4. Auto-start local LLM in background. Try Ollama first, then MLX.
            else if which_ollama() || which_mlx() {
                let deferred = Arc::new(DeferredPolisher::new());
                let d2 = deferred.clone();
                let has_ollama = which_ollama();
                let has_mlx = which_mlx();
                let status_tx = event_tx.clone();
                tokio::spawn(async move {
                    // Try Ollama first.
                    if has_ollama {
                        let _ = status_tx
                            .send(otoji::core::AsrEvent::Status {
                                message: "polish: starting ollama…".into(),
                            })
                            .await;
                        if let Ok(()) = start_ollama(&base_url, &model, &status_tx).await {
                            let p = OpenAiPolisher::new(&base_url, "", &model);
                            if let Ok(p) = p.probe().await {
                                // Verify the model actually loads by doing a test call.
                                let test = otoji::polish::PolishInput {
                                    text: "test",
                                    prev: None,
                                    audio: None,
                                };
                                if p.polish(test).await.is_ok() {
                                    let _ = status_tx
                                        .send(otoji::core::AsrEvent::Status {
                                            message: format!("polish: ollama ready (model={})", p.model),
                                        })
                                        .await;
                                    d2.activate(Arc::new(p)).await;
                                    return;
                                }
                            }
                        }
                        let _ = status_tx
                            .send(otoji::core::AsrEvent::Status {
                                message: "polish: ollama failed, trying mlx…".into(),
                            })
                            .await;
                    }

                    // Fallback to MLX.
                    if has_mlx {
                        if let Ok((mlx_url, mlx_model)) = start_mlx(&status_tx).await {
                            let p = OpenAiPolisher::new(&mlx_url, "", &mlx_model);
                            d2.activate(Arc::new(p)).await;
                            let _ = status_tx
                                .send(otoji::core::AsrEvent::Status {
                                    message: format!("polish: mlx ready (model={mlx_model})"),
                                })
                                .await;
                            return;
                        }
                    }

                    let _ = status_tx
                        .send(otoji::core::AsrEvent::Status {
                            message: "polish: no local LLM available".into(),
                        })
                        .await;
                });
                deferred
            } else {
                eprintln!("polish: no provider (install ollama or mlx_lm, or set GEMINI_API_KEY / ANTHROPIC_API_KEY)");
                Arc::new(NoopPolisher)
            }
        } else {
            Arc::new(NoopPolisher)
        }
    };

    // Shared live settings: gain/vad toggleable from TUI at runtime.
    let live = Arc::new(tui::LiveSettings::new());

    // Tap the audio stream so the TUI can show a live RMS meter.
    // Also applies software gain from LiveSettings.
    let (tap_tx, tap_rx) = audio::channel(64);
    let meter_tx = event_tx.clone();
    let live_audio = live.clone();
    tokio::spawn(async move {
        let mut audio_rx = audio_rx;
        let mut sum_sq: f64 = 0.0;
        let mut samples: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let started = std::time::Instant::now();
        let mut warned_silent = false;
        let mut peak_rms: f64 = 0.0;
        while let Some(mut chunk) = audio_rx.recv().await {
            // Apply software gain.
            let gain = live_audio.gain() as f64;
            if (gain - 1.0).abs() > 0.01 {
                let mut amplified = Vec::with_capacity(chunk.pcm.len());
                for pair in chunk.pcm.chunks_exact(2) {
                    let s = i16::from_le_bytes([pair[0], pair[1]]) as f64 * gain;
                    let clamped = s.clamp(i16::MIN as f64, i16::MAX as f64) as i16;
                    amplified.extend_from_slice(&clamped.to_le_bytes());
                }
                chunk = otoji::core::AudioChunk::new(chunk.format, bytes::Bytes::from(amplified));
            }

            for pair in chunk.pcm.chunks_exact(2) {
                let s = i16::from_le_bytes([pair[0], pair[1]]) as f64 / 32768.0;
                sum_sq += s * s;
                samples += 1;
            }
            if tap_tx.send(chunk).await.is_err() {
                break;
            }
            if last_emit.elapsed() >= std::time::Duration::from_millis(500) {
                let rms = if samples > 0 {
                    (sum_sq / samples as f64).sqrt()
                } else {
                    0.0
                };
                if rms > peak_rms {
                    peak_rms = rms;
                }
                let bars = (rms * 200.0).clamp(0.0, 30.0) as usize;
                let meter: String = "#".repeat(bars);
                let mut msg = format!("mic [{meter:<30}] rms={rms:.4}");
                if started.elapsed() >= std::time::Duration::from_secs(3) && peak_rms < 1e-5 {
                    msg.push_str(
                        "  ⚠ all-zero mic — grant Microphone permission to your terminal app, then restart it. \
                         Open the pane:  open \"x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone\""
                    );
                    warned_silent = true;
                }
                let _ = warned_silent;
                let _ = meter_tx
                    .send(otoji::core::AsrEvent::Status { message: msg })
                    .await;
                sum_sq = 0.0;
                samples = 0;
                last_emit = std::time::Instant::now();
            }
        }
    });

    let provider = Arc::new(provider);
    let p2 = provider.clone();
    tokio::spawn(async move {
        if let Err(e) = p2.run(tap_rx, event_tx).await {
            tracing::error!("asr: {e}");
        }
    });
    tui::run(event_rx, polisher, live).await
}

/// Build the streaming-friendly 44-byte WAV header. Both the RIFF size and
/// the data size are set to `0xFFFFFFFF`, signalling "unknown / read until
/// EOF" — this is the same trick `ffmpeg -f wav pipe:1` uses, and the
/// stdin reader on the listen side gracefully treats EOF as end-of-stream.
fn streaming_wav_header(sample_rate: u32) -> [u8; 44] {
    let channels: u16 = 1;
    let bits: u16 = 16;
    let byte_rate: u32 = sample_rate * channels as u32 * bits as u32 / 8;
    let block_align: u16 = channels * bits / 8;
    let mut h = [0u8; 44];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&0xFFFFFFFEu32.to_le_bytes());
    h[8..12].copy_from_slice(b"WAVE");
    h[12..16].copy_from_slice(b"fmt ");
    h[16..20].copy_from_slice(&16u32.to_le_bytes());
    h[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM format = 1
    h[22..24].copy_from_slice(&channels.to_le_bytes());
    h[24..28].copy_from_slice(&sample_rate.to_le_bytes());
    h[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    h[32..34].copy_from_slice(&block_align.to_le_bytes());
    h[34..36].copy_from_slice(&bits.to_le_bytes());
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&0xFFFFFFFEu32.to_le_bytes());
    h
}

/// Cheap linear-interpolation resampler from `from_rate` to `to_rate` for
/// mono i16 PCM. Quality is fine for ASR (SenseVoice doesn't care about
/// the slight aliasing) and avoids pulling in `rubato`.
fn resample_linear(samples: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if from_rate == to_rate || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let i0 = src.floor() as usize;
        let frac = src - i0 as f64;
        let s0 = samples[i0] as f64;
        let s1 = samples.get(i0 + 1).copied().unwrap_or(samples[i0]) as f64;
        out.push((s0 + (s1 - s0) * frac).round() as i16);
    }
    out
}

async fn run_say(kind: TtsKind, text_arg: String) -> Result<()> {
    use std::io::Write;
    use tokio::io::AsyncReadExt;

    // Resolve text: `-` means read from stdin.
    let text = if text_arg == "-" {
        let mut buf = String::new();
        tokio::io::stdin()
            .read_to_string(&mut buf)
            .await
            .context("read stdin")?;
        buf
    } else {
        text_arg
    };
    let text = text.trim().to_string();
    if text.is_empty() {
        anyhow::bail!("say: empty text");
    }

    // Provider setup. `provider.sample_rate()` is the native rate of its PCM
    // output; we always emit 16 kHz to stdout so the listen pipeline doesn't
    // need to know about the provider's quirks.
    let provider = resolve_tts(kind)?;
    if !provider.is_pcm() {
        anyhow::bail!(
            "provider `{}` does not emit PCM, cannot be used with `otoji say`. \
             Use `otoji speak` for the legacy MP3 path.",
            provider.name()
        );
    }
    eprintln!("say: using provider `{}`", provider.name());
    let src_rate = provider.sample_rate();
    const OUT_RATE: u32 = 16_000;

    // Write the streaming WAV header up front so the consumer can start
    // parsing immediately.
    let mut stdout = std::io::stdout().lock();
    stdout
        .write_all(&streaming_wav_header(OUT_RATE))
        .context("write wav header")?;
    stdout.flush().ok();

    let (tx, mut rx) = mpsc::channel::<bytes::Bytes>(8);
    let provider2 = provider.clone();
    let text2 = text.clone();
    let synth_task = tokio::spawn(async move { provider2.synthesize(&text2, tx).await });

    while let Some(chunk) = rx.recv().await {
        // chunk is raw mono i16 LE at `src_rate`.
        let samples: Vec<i16> = chunk
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        let resampled = resample_linear(&samples, src_rate, OUT_RATE);
        let mut bytes = Vec::with_capacity(resampled.len() * 2);
        for s in resampled {
            bytes.extend_from_slice(&s.to_le_bytes());
        }
        stdout.write_all(&bytes).context("write pcm")?;
        stdout.flush().ok();
    }
    synth_task.await.context("synth join")??;
    Ok(())
}

async fn run_speak(text: String, out: PathBuf) -> Result<()> {
    let cfg = IflytekTtsConfig::from_env().context("TTS config")?;
    let tts = IflytekTts::new(cfg);
    let (tx, mut rx) = mpsc::channel(64);
    let task = tokio::spawn(async move { tts.synthesize(&text, tx).await });
    let mut file = tokio::fs::File::create(&out)
        .await
        .with_context(|| format!("create {}", out.display()))?;
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = rx.recv().await {
        file.write_all(&chunk).await?;
    }
    task.await??;
    eprintln!("wrote {}", out.display());
    Ok(())
}

// ── Local LLM auto-start helpers ─────────────────────────────────────

/// Check if a binary is on PATH.
fn which(bin: &str) -> bool {
    std::process::Command::new(bin)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn which_ollama() -> bool { which("ollama") }
fn which_mlx() -> bool {
    std::process::Command::new("python3")
        .args(["-c", "import mlx_lm"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Start `ollama serve` as a detached background process, wait for it to
/// become reachable, then ensure the model is pulled.
async fn start_ollama(
    base_url: &str,
    model: &str,
    status_tx: &mpsc::Sender<otoji::core::AsrEvent>,
) -> std::result::Result<(), ()> {
    // Spawn ollama serve detached (stdout/stderr to /dev/null so it doesn't
    // interfere with the TUI).
    let _child = match std::process::Command::new("ollama")
        .arg("serve")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = status_tx
                .send(otoji::core::AsrEvent::Status {
                    message: format!("polish: failed to start ollama: {e}"),
                })
                .await;
            return Err(());
        }
    };
    // Note: we intentionally don't store the child handle. ollama serve
    // forks its own server process and the child exits quickly, or it
    // stays running and we let it outlive otoji.

    // Wait for the server to become reachable (up to 30s).
    let client = reqwest::Client::new();
    let models_url = format!("{base_url}/models");
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    loop {
        if tokio::time::Instant::now() > deadline {
            let _ = status_tx
                .send(otoji::core::AsrEvent::Status {
                    message: "polish: ollama did not start in 30s".into(),
                })
                .await;
            return Err(());
        }
        if let Ok(resp) = client
            .get(&models_url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // Ensure the model is available. `ollama pull` is a no-op if already downloaded.
    ensure_ollama_model(base_url, model).await;
    let _ = status_tx
        .send(otoji::core::AsrEvent::Status {
            message: format!("polish: ollama model {model} ready"),
        })
        .await;
    Ok(())
}

/// Start `mlx_lm.server` in the background and wait for it to become reachable.
/// MLX works natively on Apple Silicon (M1-M5) via the Metal framework, making
/// it the best local LLM option when Ollama's ggml Metal shaders fail.
async fn start_mlx(
    status_tx: &mpsc::Sender<otoji::core::AsrEvent>,
) -> std::result::Result<(String, String), ()> {
    // Default MLX model — small, fast, good at text correction.
    let model = std::env::var("OTOJI_MLX_MODEL")
        .unwrap_or_else(|_| "mlx-community/Qwen2.5-1.5B-Instruct-4bit".into());
    let port = "11435"; // Avoid conflicting with Ollama's 11434.
    let base_url = format!("http://localhost:{port}/v1");

    let _ = status_tx
        .send(otoji::core::AsrEvent::Status {
            message: format!("polish: starting mlx_lm.server (model={model})…"),
        })
        .await;

    let _child = match std::process::Command::new("python3")
        .args(["-m", "mlx_lm.server", "--model", &model, "--port", port])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .stdin(std::process::Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = status_tx
                .send(otoji::core::AsrEvent::Status {
                    message: format!("polish: mlx_lm.server failed to start: {e}"),
                })
                .await;
            return Err(());
        }
    };

    // Wait for server to become reachable (model loading can take 10-30s).
    let client = reqwest::Client::new();
    let models_url = format!("{base_url}/models");
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(60);
    loop {
        if tokio::time::Instant::now() > deadline {
            let _ = status_tx
                .send(otoji::core::AsrEvent::Status {
                    message: "polish: mlx_lm.server did not start in 60s".into(),
                })
                .await;
            return Err(());
        }
        if let Ok(resp) = client
            .get(&models_url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
    }

    Ok((base_url, model))
}

/// Pull a model via `ollama pull` if not already present. Non-blocking —
/// runs the pull command as a subprocess.
async fn ensure_ollama_model(base_url: &str, model: &str) {
    // Quick check: does the model already exist?
    let client = reqwest::Client::new();
    let url = format!("{base_url}/models");
    if let Ok(resp) = client.get(&url).send().await {
        if let Ok(body) = resp.text().await {
            if body.contains(model) {
                return; // already pulled
            }
        }
    }

    // Pull in background subprocess (ollama pull shows progress on stderr,
    // but we pipe it to null to avoid TUI corruption).
    let _ = tokio::process::Command::new("ollama")
        .args(["pull", model])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;
}
