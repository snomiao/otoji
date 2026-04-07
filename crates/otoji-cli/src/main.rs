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
            let mut cfg = SenseVoiceConfig::from_env();
            cfg.input_device = device;
            let provider = SenseVoice::new(cfg);
            let (_audio_tx, audio_rx) = otoji_audio::channel(1);
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
            "for i, d in enumerate(sd.query_devices()):\n",
            "    if d['max_input_channels'] > 0:\n",
            "        mark = '*' if i == sd.default.device[0] else ' '\n",
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
    let provider = Arc::new(provider);
    let p2 = provider.clone();
    tokio::spawn(async move {
        if let Err(e) = p2.run(audio_rx, event_tx).await {
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
