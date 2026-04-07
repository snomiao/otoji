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
use otoji_asr::{
    iflytek_rtasr::{IflytekRtasr, IflytekRtasrConfig},
    sensevoice::{SenseVoice, SenseVoiceConfig},
    AsrProvider,
};
use otoji_audio::{file::stream_pcm_file, mic};
use otoji_core::AudioFormat;
use otoji_polish::{AnthropicPolisher, NoopPolisher, Polisher};
use otoji_tts::{iflytek_tts::{IflytekTts, IflytekTtsConfig}, TtsProvider};
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
        Cmd::Listen { device, provider, frame_ms } => {
            run_listen(provider, device, frame_ms).await
        }
        Cmd::File { path, provider, frame_ms, burst } => {
            run_file(provider, path, frame_ms, !burst).await
        }
        Cmd::Speak { text, out } => run_speak(text, out).await,
        Cmd::Devices => run_devices().await,
    }
}

async fn run_listen(kind: AsrKind, device: Option<String>, frame_ms: u32) -> Result<()> {
    match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            let provider = IflytekRtasr::new(cfg);
            let (audio_tx, audio_rx) = otoji_audio::channel(64);
            let _stream = mic::start_default(frame_ms, audio_tx).context("mic")?;
            if device.is_some() {
                eprintln!(
                    "warning: --provider iflytek currently always uses the system default device"
                );
            }
            drive(provider, audio_rx).await
        }
        AsrKind::Sensevoice => {
            // Capture in Rust via cpal so the `otoji` binary owns the mic
            // permission prompt — Python subprocesses spawned via `uv run`
            // do NOT inherit microphone access on macOS. The helper then
            // reads PCM from its stdin instead of opening its own device.
            let mut cfg = SenseVoiceConfig::from_env();
            cfg.feed_stdin = true;
            cfg.input_device = None;
            let provider = SenseVoice::new(cfg);
            let (audio_tx, audio_rx) = otoji_audio::channel(64);
            let _stream = mic::start_default(frame_ms, audio_tx).context("mic")?;
            if device.is_some() {
                eprintln!(
                    "warning: device selection is not yet wired through cpal; using system default"
                );
            }
            drive(provider, audio_rx).await
        }
    }
}

async fn run_devices() -> Result<()> {
    use std::process::Command;
    let cfg = SenseVoiceConfig::from_env();
    let (cmd, args) = cfg.python.split_first().context("empty python command")?;
    let status = Command::new(cmd)
        .args(args)
        .arg("-c")
        .arg(concat!(
            "import sounddevice as sd\n",
            "devs = list(enumerate(sd.query_devices()))\n",
            "default_in = sd.default.device[0] if isinstance(sd.default.device, (list, tuple)) else 0\n",
            "loopback_keywords = ('blackhole', 'loopback', 'soundflower', 'vb-cable', 'vb cable')\n",
            "loopback = next((i for i, d in devs if d['max_input_channels'] > 0 and any(k in d['name'].lower() for k in loopback_keywords)), None)\n",
            "print('aliases:')\n",
            "print(f\"  default / mic       → [{default_in}] {devs[default_in][1]['name']}\")\n",
            "if loopback is not None:\n",
            "    print(f\"  system / loopback   → [{loopback}] {devs[loopback][1]['name']}\")\n",
            "else:\n",
            "    print('  system / loopback   → (none — install BlackHole: brew install --cask blackhole-2ch)')\n",
            "print()\n",
            "print('input devices:')\n",
            "for i, d in devs:\n",
            "    if d['max_input_channels'] > 0:\n",
            "        mark = '*' if i == default_in else ' '\n",
            "        print(f\"{mark} [{i:>2}] {d['name']} ({d['max_input_channels']}ch @ {int(d['default_samplerate'])}Hz)\")\n",
        ))
        .status()
        .context("spawn device lister")?;
    if !status.success() {
        anyhow::bail!("device lister exited with {status}");
    }
    Ok(())
}

async fn run_file(kind: AsrKind, path: PathBuf, frame_ms: u32, realtime: bool) -> Result<()> {
    let (audio_tx, audio_rx) = otoji_audio::channel(64);
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
            let mut cfg = SenseVoiceConfig::from_env();
            cfg.feed_stdin = true;
            drive(SenseVoice::new(cfg), audio_rx).await
        }
    }
}

async fn drive<P: AsrProvider + 'static>(
    provider: P,
    audio_rx: otoji_audio::AudioRx,
) -> Result<()> {
    let (event_tx, event_rx) = mpsc::channel(128);
    let polisher: Arc<dyn Polisher> = match AnthropicPolisher::from_env() {
        Ok(p) => Arc::new(p),
        Err(_) => Arc::new(NoopPolisher),
    };

    // Tap the audio stream so the TUI can show a live RMS meter — this is
    // also the easiest way to confirm cpal is delivering frames at all.
    let (tap_tx, tap_rx) = otoji_audio::channel(64);
    let meter_tx = event_tx.clone();
    tokio::spawn(async move {
        let mut audio_rx = audio_rx;
        let mut sum_sq: f64 = 0.0;
        let mut samples: u64 = 0;
        let mut bytes_total: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let started = std::time::Instant::now();
        let mut warned_silent = false;
        let mut peak_rms: f64 = 0.0;
        while let Some(chunk) = audio_rx.recv().await {
            bytes_total += chunk.pcm.len() as u64;
            for pair in chunk.pcm.chunks_exact(2) {
                let s = i16::from_le_bytes([pair[0], pair[1]]) as f64 / 32768.0;
                sum_sq += s * s;
                samples += 1;
            }
            if tap_tx.send(chunk).await.is_err() {
                break;
            }
            if last_emit.elapsed() >= std::time::Duration::from_millis(500) {
                let rms = if samples > 0 { (sum_sq / samples as f64).sqrt() } else { 0.0 };
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
                    .send(otoji_core::AsrEvent::Status { message: msg })
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
