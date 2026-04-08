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
use otoji::audio::{self, file::stream_pcm_file, mic};
use otoji::core::AudioFormat;
use otoji::polish::{AnthropicPolisher, NoopPolisher, Polisher};
use otoji::tts::{
    iflytek_tts::{IflytekTts, IflytekTtsConfig},
    TtsProvider,
};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Parser)]
#[command(name = "otoji", about = "音字 — realtime speech ⇄ text")]
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
}

#[tokio::main]
async fn main() -> Result<()> {
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
        } => run_listen(provider, device, frame_ms, plain).await,
        Cmd::File {
            path,
            provider,
            frame_ms,
            burst,
        } => run_file(provider, path, frame_ms, !burst).await,
        Cmd::Speak { text, out } => run_speak(text, out).await,
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
    let polisher: Arc<dyn Polisher> = match AnthropicPolisher::from_env() {
        Ok(p) => Arc::new(p),
        Err(_) => Arc::new(NoopPolisher),
    };

    // Tap the audio stream so the TUI can show a live RMS meter — this is
    // also the easiest way to confirm cpal is delivering frames at all.
    let (tap_tx, tap_rx) = audio::channel(64);
    let meter_tx = event_tx.clone();
    tokio::spawn(async move {
        let mut audio_rx = audio_rx;
        let mut sum_sq: f64 = 0.0;
        let mut samples: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let started = std::time::Instant::now();
        let mut warned_silent = false;
        let mut peak_rms: f64 = 0.0;
        while let Some(chunk) = audio_rx.recv().await {
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
    tui::run(event_rx, polisher).await
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
