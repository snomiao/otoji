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
use otoji_asr::{iflytek_rtasr::{IflytekRtasr, IflytekRtasrConfig}, AsrProvider};
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

#[derive(Subcommand)]
enum Cmd {
    /// Capture from the default microphone and stream to RTASR.
    Listen {
        /// Frame size in milliseconds.
        #[arg(long, default_value_t = 40)]
        frame_ms: u32,
    },
    /// Replay a 16kHz mono PCM file as if it were live mic input.
    File {
        path: PathBuf,
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
        Cmd::Listen { frame_ms } => run_listen(frame_ms).await,
        Cmd::File { path, frame_ms, burst } => run_file(path, frame_ms, !burst).await,
        Cmd::Speak { text, out } => run_speak(text, out).await,
    }
}

async fn run_listen(frame_ms: u32) -> Result<()> {
    let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
    let provider = IflytekRtasr::new(cfg);
    let (audio_tx, audio_rx) = otoji_audio::channel(64);
    let _stream = mic::start_default(frame_ms, audio_tx).context("mic")?;
    drive(provider, audio_rx).await
}

async fn run_file(path: PathBuf, frame_ms: u32, realtime: bool) -> Result<()> {
    let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
    let provider = IflytekRtasr::new(cfg);
    let (audio_tx, audio_rx) = otoji_audio::channel(64);
    let p = path.clone();
    tokio::spawn(async move {
        if let Err(e) =
            stream_pcm_file(p, AudioFormat::PCM16K_MONO, frame_ms, realtime, audio_tx).await
        {
            tracing::error!("file source: {e}");
        }
    });
    drive(provider, audio_rx).await
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
