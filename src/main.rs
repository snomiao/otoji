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
use otoji::audio::{
    self,
    file::{stream_pcm_file, stream_wav_reader_blocking},
    mic,
};
use otoji::core::AudioFormat;
use otoji::polish::{
    AnthropicPolisher, DeferredPolisher, GeminiPolisher, NoopPolisher, OpenAiPolisher, Polisher,
};
use otoji::tts::{
    cloudflare::{CloudflareTts, CloudflareTtsConfig},
    elevenlabs::{ElevenLabsTts, ElevenLabsTtsConfig},
    gemini::{GeminiTts, GeminiTtsConfig},
    iflytek_tts::{IflytekTts, IflytekTtsConfig},
    openai::{OpenAiTts, OpenAiTtsConfig},
    piper::{PiperTts, PiperTtsConfig},
    TtsProvider,
};
use std::io::IsTerminal;
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
        /// SenseVoice model directory (default: ~/.cache/otoji/...).
        #[arg(long)]
        model: Option<String>,
        /// Frame size in milliseconds.
        #[arg(long, default_value_t = 40)]
        frame_ms: u32,
        /// Skip the ratatui TUI and emit AsrEvents as JSON lines on stdout.
        /// Useful for piping into scripts and for headless testing.
        #[arg(long)]
        plain: bool,
        /// Run an LLM polish pass on `ptt_final` events (fixes punctuation
        /// like `?` vs `.`). Requires GEMINI_API_KEY / ANTHROPIC_API_KEY /
        /// OPENAI_API_KEY in env or .env.local. Value = polisher name:
        /// `gemini`, `anthropic`, `openai`, or `auto` (default, picks any).
        #[arg(long)]
        ptt_polish: Option<String>,
        /// After `ptt_final`, synthesize the text via TTS and play it via
        /// `afplay` (macOS). Useful for pronunciation learning. Provider
        /// value: `gemini`, `openai`, `elevenlabs`, `piper`, `auto`.
        #[arg(long)]
        ptt_tts: Option<String>,
        /// Path to a file the consumer writes with external context (e.g.
        /// the frontmost app's accessibility tree). Read once per PTT
        /// segment and passed to the polisher for context-aware corrections.
        #[arg(long)]
        ptt_context_file: Option<PathBuf>,
        /// BCP-47 language code to translate the polished output into
        /// (e.g. `en`, `ja`, `zh`). When set, emits a `ptt_translated`
        /// event alongside `ptt_upgrade`. If the input is already in the
        /// target language, no additional event is emitted.
        #[arg(long)]
        ptt_translate_to: Option<String>,
        /// Which text the TTS should speak: `original` (polished source
        /// language) or `translated` (target language). Only meaningful
        /// when `--ptt-translate-to` is set. Defaults to `original`.
        #[arg(long, default_value = "original")]
        ptt_tts_source: String,
        /// Path to a Unix domain socket (or `host:port` for TCP) that
        /// otoji will bind on and accept text control messages for PTT.
        /// Alternative to SIGUSR1/SIGUSR2 — works on Windows and avoids
        /// process-permission issues.
        ///
        /// Protocol (one command per line, ASCII):
        ///   PTT_START           — start a PTT segment (like SIGUSR1)
        ///   PTT_END             — end the segment (like SIGUSR2)
        ///   CONTEXT <text>      — set the accessibility/UI context
        ///                         in-band; replaces --ptt-context-file
        ///
        /// Examples:
        ///   --ptt-control-socket /tmp/otoji-ctrl.sock
        ///   --ptt-control-socket 127.0.0.1:18080
        #[arg(long)]
        ptt_control_socket: Option<String>,
        /// Polish speed/quality preset. Overrides OTOJI_POLISH_* env vars
        /// when set, so a single CLI flag picks a sensible combination.
        ///
        /// Presets:
        ///   fast      — Cloudflare llama-3.1-8b-instruct-fast (~200-500ms,
        ///               edge inference in Tokyo PoP). Requires
        ///               CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
        ///   balanced  — Gemini 2.5-flash-lite + thinkingBudget=0 (~760ms).
        ///               Requires GEMINI_API_KEY. Default fallback.
        ///   quality   — Anthropic claude-haiku or OpenAI gpt-4.1-mini.
        ///   offline   — Local Ollama at localhost:11434. Requires a model
        ///               to be pulled already.
        #[arg(long)]
        polish_preset: Option<String>,
        /// Use VoiceProcessingIO (AEC) instead of cpal for mic capture.
        /// macOS only — suppresses speaker bleed from system audio.
        #[arg(long)]
        aec: bool,
    },
    /// List available audio input devices.
    Devices,
    /// Stream mic audio as 16 kHz mono WAV to stdout.
    /// Pipe-friendly: `otoji mic | otoji listen -`.
    Mic {
        /// Input device — substring of the device name or numeric index.
        /// Omit to use the system default. Use `otoji devices` to list.
        device: Option<String>,
        /// Frame size in milliseconds.
        #[arg(long, default_value_t = 40)]
        frame_ms: u32,
    },
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
    /// Start a WebSocket server that accepts binary PCM audio (16 kHz
    /// mono s16le) and broadcasts AsrEvents as JSON text frames.
    ///
    /// One WebSocket connection = one live SenseVoice session. Clients
    /// (browser apps, Electron, etc.) send binary PCM frames to stream
    /// audio in, and receive events on the same connection.
    ///
    /// Control messages (text frames IN):
    ///   PTT_START        — mark PTT segment start
    ///   PTT_END          — mark segment end
    ///   CONTEXT <text>   — set UI context for polish
    ///
    /// Example URL: ws://127.0.0.1:8080/
    Server {
        /// Bind address (default: `127.0.0.1:8080`).
        #[arg(long, default_value = "127.0.0.1:8080")]
        addr: String,
    },
    /// One-shot transcribe a WAV or PCM file. Prints a single JSON line
    /// `{"text": "..."}` to stdout and exits — designed for CI, batch
    /// processing, and scripts.
    Transcribe {
        /// Path to a WAV (any sample rate) or raw 16 kHz mono PCM16 LE file.
        path: PathBuf,
        /// SenseVoice model directory (default: ~/.cache/otoji/...).
        #[arg(long)]
        model: Option<String>,
        /// Optionally also translate the transcript to this language code
        /// or name. When set, output becomes `{"text":"...","translated":"..."}`.
        #[arg(long)]
        translate_to: Option<String>,
    },
    /// Synthesize text and stream a 16 kHz mono WAV to stdout.
    /// Pipe-friendly: `echo "hi" | otoji say - | otoji listen -`.
    #[command(alias = "speak")]
    Say {
        /// Literal text, or `-` to read from stdin.
        text: String,
        /// TTS provider. `auto` picks the best available: piper if a model
        /// is on disk, otherwise the first env-key match (openai → 11labs
        /// → gemini).
        #[arg(long, value_enum, default_value_t = TtsKind::Auto)]
        provider: TtsKind,
        /// Write to file instead of stdout (for backward compat with old
        /// `otoji speak` command).
        #[arg(long)]
        out: Option<PathBuf>,
    },

    /// List note metadata (stem, time, kind). No content.
    #[command(alias = "list")]
    Ls {
        /// Number of recent entries to show (default: 20, 0 = all).
        #[arg(short = 'n', long, default_value_t = 20)]
        lines: usize,
    },

    /// Read note text content. With --follow, streams new notes as they arrive.
    #[command(alias = "r")]
    Read {
        /// Keep watching for new notes (like `tail -f`).
        #[arg(short, long)]
        follow: bool,
        /// Number of recent notes to show on startup (default: 1).
        #[arg(short = 'n', long, default_value_t = 1)]
        lines: usize,
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
    /// Cloudflare Workers AI TTS (MeloTTS). Edge inference at Tokyo PoP.
    /// Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
    Cloudflare,
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
    let try_cloudflare = || -> Option<Arc<dyn TtsProvider>> {
        CloudflareTtsConfig::from_env()
            .ok()
            .map(|c| Arc::new(CloudflareTts::new(c)) as Arc<dyn TtsProvider>)
    };

    match kind {
        TtsKind::Auto => try_cloudflare()
            .or_else(try_piper)
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
        TtsKind::Cloudflare => {
            let cfg = CloudflareTtsConfig::from_env().context("cloudflare tts config")?;
            Ok(Arc::new(CloudflareTts::new(cfg)))
        }
    }
}

/// Start a PTT control server that accepts line-based commands.
/// Accepts either a Unix-domain-socket path (contains '/' on unix) or a
/// `host:port` TCP address. Portable alternative to SIGUSR1/2 for
/// non-Unix consumers.
fn start_ptt_control_server(addr: String) {
    use otoji::asr::sensevoice::{WorkerMsg, PTT_WORKER_TX};
    std::thread::Builder::new()
        .name("ptt-control".into())
        .spawn(move || {
            let is_unix_path = addr.starts_with('/');
            eprintln!("[otoji] PTT control server listening on {addr}");

            #[cfg(unix)]
            if is_unix_path {
                let _ = std::fs::remove_file(&addr);
                let listener = match std::os::unix::net::UnixListener::bind(&addr) {
                    Ok(l) => l,
                    Err(e) => {
                        eprintln!("[otoji] bind unix socket {addr}: {e}");
                        return;
                    }
                };
                for stream in listener.incoming().flatten() {
                    handle_ptt_control_conn(stream);
                }
                return;
            }
            let _ = is_unix_path; // silence unused on non-unix

            // TCP fallback (and Windows default).
            let listener = match std::net::TcpListener::bind(&addr) {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("[otoji] bind tcp {addr}: {e}");
                    return;
                }
            };
            for stream in listener.incoming().flatten() {
                handle_ptt_control_conn(stream);
            }

            // Silence unused-import warning when neither branch uses.
            let _ = (PTT_WORKER_TX.lock(), WorkerMsg::PttStart);
        })
        .ok();
}

fn handle_ptt_control_conn<R>(stream: R)
where
    R: std::io::Read + Send + 'static,
{
    use otoji::asr::sensevoice::{
        WorkerMsg, PTT_SIGNAL_PENDING_END, PTT_SIGNAL_PENDING_RESUME, PTT_SIGNAL_PENDING_STANDBY,
        PTT_SIGNAL_PENDING_START, PTT_WORKER_TX,
    };
    use std::io::BufRead;
    std::thread::spawn(move || {
        let reader = std::io::BufReader::new(stream);
        for line in reader.lines().map_while(|r| r.ok()) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            // Parse command.
            if line.eq_ignore_ascii_case("PTT_START") {
                // Set the same flag used by the SIGUSR1 poller so the
                // worker_tx path stays consistent.
                PTT_SIGNAL_PENDING_START.store(true, std::sync::atomic::Ordering::Relaxed);
                eprintln!("[otoji-ctrl] PTT_START");
            } else if line.eq_ignore_ascii_case("PTT_END") {
                PTT_SIGNAL_PENDING_END.store(true, std::sync::atomic::Ordering::Relaxed);
                eprintln!("[otoji-ctrl] PTT_END");
            } else if line.eq_ignore_ascii_case("STANDBY") {
                PTT_SIGNAL_PENDING_STANDBY.store(true, std::sync::atomic::Ordering::Relaxed);
                eprintln!("[otoji-ctrl] STANDBY");
            } else if line.eq_ignore_ascii_case("RESUME") {
                PTT_SIGNAL_PENDING_RESUME.store(true, std::sync::atomic::Ordering::Relaxed);
                eprintln!("[otoji-ctrl] RESUME");
            } else if let Some(ctx) = line.strip_prefix("CONTEXT ") {
                // Write to the standard context file path so the existing
                // read path picks it up. Keeps integration simple.
                if let Ok(path) = std::env::var("OTOJI_PTT_CONTEXT_FILE") {
                    let _ = std::fs::write(path, ctx);
                    eprintln!("[otoji-ctrl] CONTEXT ({} bytes)", ctx.len());
                }
            } else {
                eprintln!("[otoji-ctrl] unknown command: {line:?}");
            }
            let _ = (PTT_WORKER_TX.lock(), WorkerMsg::PttStart); // silence import warn
        }
    });
}

/// Apply a polish preset by setting the OTOJI_POLISH_* env vars that
/// `OpenAiPolisher::from_env` reads. Each preset picks a speed/quality
/// sweet-spot and can be overridden on a per-field basis via env or flags.
fn apply_polish_preset(preset: &str) {
    match preset {
        "fast" => {
            let account = std::env::var("CLOUDFLARE_ACCOUNT_ID").unwrap_or_default();
            let token = std::env::var("CLOUDFLARE_API_TOKEN").unwrap_or_default();
            if account.is_empty() || token.is_empty() {
                eprintln!(
                    "[otoji] polish-preset fast: set CLOUDFLARE_ACCOUNT_ID \
                     + CLOUDFLARE_API_TOKEN to use Cloudflare Workers AI"
                );
                return;
            }
            std::env::set_var(
                "OTOJI_POLISH_BASE_URL",
                format!("https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1"),
            );
            std::env::set_var("OTOJI_POLISH_API_KEY", token);
            std::env::set_var("OTOJI_POLISH_MODEL", "@cf/meta/llama-3.1-8b-instruct-fast");
            eprintln!("[otoji] polish-preset=fast → Cloudflare llama-3.1-8b-instruct-fast");
        }
        "balanced" => {
            // Clear so the Gemini polisher is chosen by auto-resolution.
            std::env::remove_var("OTOJI_POLISH_BASE_URL");
            std::env::remove_var("OTOJI_POLISH_API_KEY");
            std::env::remove_var("OTOJI_POLISH_MODEL");
            eprintln!("[otoji] polish-preset=balanced → Gemini 2.5-flash-lite");
        }
        "quality" => {
            if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
                std::env::set_var("OTOJI_POLISH_BASE_URL", "https://api.anthropic.com/v1");
                std::env::set_var("OTOJI_POLISH_API_KEY", key);
                std::env::set_var("OTOJI_POLISH_MODEL", "claude-haiku-4-5-20251001");
                eprintln!("[otoji] polish-preset=quality → Anthropic claude-haiku-4-5");
            } else if let Ok(key) = std::env::var("OPENAI_API_KEY") {
                std::env::set_var("OTOJI_POLISH_BASE_URL", "https://api.openai.com/v1");
                std::env::set_var("OTOJI_POLISH_API_KEY", key);
                std::env::set_var("OTOJI_POLISH_MODEL", "gpt-4.1-mini");
                eprintln!("[otoji] polish-preset=quality → OpenAI gpt-4.1-mini");
            } else {
                eprintln!("[otoji] polish-preset quality: set ANTHROPIC_API_KEY or OPENAI_API_KEY");
            }
        }
        "offline" => {
            std::env::set_var("OTOJI_POLISH_BASE_URL", "http://localhost:11434/v1");
            std::env::remove_var("OTOJI_POLISH_API_KEY");
            // Leave MODEL empty so OpenAiPolisher::probe picks the first
            // available local model automatically.
            std::env::remove_var("OTOJI_POLISH_MODEL");
            eprintln!("[otoji] polish-preset=offline → local Ollama at :11434");
        }
        other => eprintln!("[otoji] unknown --polish-preset value: {other:?}"),
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
        // Install to wherever the running binary actually lives, so the
        // re-exec sees a fresh mtime. Without this, `cargo install` would
        // default to ~/.cargo/bin/, leaving the running ~/.local/bin/otoji
        // (or similar) untouched and triggering an infinite rebuild loop
        // on the next start.
        let install_root = exe
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf());
        let mut cmd = std::process::Command::new("cargo");
        cmd.args(["install", "--path", manifest_dir])
            .env("OTOJI_REBUILDING", "1");
        if let Some(root) = install_root {
            cmd.env("CARGO_INSTALL_ROOT", root);
        }
        cmd.stdout(std::process::Stdio::null())
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
            #[cfg(unix)]
            {
                // Replace the process image so the PID/stdio stay stable.
                let err = exec::execvp(&new_exe, &args);
                eprintln!("otoji: re-exec failed: {err}");
            }
            #[cfg(not(unix))]
            {
                // Windows has no execv — spawn the rebuilt binary and exit.
                match std::process::Command::new(&new_exe)
                    .args(&args[1..])
                    .spawn()
                {
                    Ok(_) => std::process::exit(0),
                    Err(e) => eprintln!("otoji: re-exec (spawn) failed: {e}"),
                }
            }
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
    // Load .env / .env.local (manifest dir, then cwd). Silent if absent.
    let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path(manifest.join(".env.local"));
    let _ = dotenvy::from_path(manifest.join(".env"));
    let _ = dotenvy::from_filename(".env.local");
    let _ = dotenvy::from_filename(".env");

    // PTT signal handling for `--plain` stdin mode (used by CapsLockX).
    // SIGUSR1 starts a PTT segment, SIGUSR2 ends it and emits ptt_final.
    //
    // Implementation note: raw signal() + atomic flags + 10ms poller thread.
    // Using signal_hook's iterator-based API was unreliable in piped-stdio +
    // tokio runtime setups — the internal self-pipe didn't fire handlers.
    #[cfg(unix)]
    {
        use otoji::asr::sensevoice::{
            WorkerMsg, PTT_SIGNAL_PENDING_END, PTT_SIGNAL_PENDING_RESUME,
            PTT_SIGNAL_PENDING_STANDBY, PTT_SIGNAL_PENDING_START, PTT_WORKER_TX,
        };
        unsafe {
            extern "C" fn handler(sig: i32) {
                use std::sync::atomic::Ordering;
                match sig {
                    10 => PTT_SIGNAL_PENDING_START.store(true, Ordering::Relaxed),
                    12 => PTT_SIGNAL_PENDING_END.store(true, Ordering::Relaxed),
                    _ => {}
                }
            }
            extern "C" {
                fn signal(sig: i32, handler: extern "C" fn(i32)) -> usize;
            }
            signal(10, handler); // SIGUSR1
            signal(12, handler); // SIGUSR2
        }
        std::thread::Builder::new()
            .name("ptt-poll".into())
            .spawn(|| {
                use std::sync::atomic::Ordering;
                loop {
                    if PTT_SIGNAL_PENDING_START.swap(false, Ordering::Relaxed) {
                        if let Some(tx) = PTT_WORKER_TX.lock().unwrap().as_ref() {
                            let _ = tx.send(WorkerMsg::PttStart);
                        }
                    }
                    if PTT_SIGNAL_PENDING_END.swap(false, Ordering::Relaxed) {
                        if let Some(tx) = PTT_WORKER_TX.lock().unwrap().as_ref() {
                            let _ = tx.send(WorkerMsg::PttEnd);
                        }
                    }
                    if PTT_SIGNAL_PENDING_STANDBY.swap(false, Ordering::Relaxed) {
                        if let Some(tx) = PTT_WORKER_TX.lock().unwrap().as_ref() {
                            let _ = tx.send(WorkerMsg::SetStandby(true));
                        }
                    }
                    if PTT_SIGNAL_PENDING_RESUME.swap(false, Ordering::Relaxed) {
                        if let Some(tx) = PTT_WORKER_TX.lock().unwrap().as_ref() {
                            let _ = tx.send(WorkerMsg::SetStandby(false));
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
            })
            .ok();
    }

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
            model,
            frame_ms,
            plain,
            ptt_polish,
            ptt_tts,
            ptt_context_file,
            ptt_translate_to,
            ptt_tts_source,
            ptt_control_socket,
            polish_preset,
            aec,
        } => {
            if let Some(ref dir) = model {
                std::env::set_var("OTOJI_SENSEVOICE_DIR", dir);
            }
            if let Some(ref preset) = polish_preset {
                apply_polish_preset(preset);
            }
            // Start the PTT control socket server if requested.
            if let Some(addr) = ptt_control_socket {
                start_ptt_control_server(addr);
            }
            let force_plain = plain || !std::io::stdout().is_terminal();
            run_listen(
                provider,
                device,
                frame_ms,
                force_plain,
                ptt_polish,
                ptt_tts,
                ptt_context_file,
                ptt_translate_to,
                ptt_tts_source,
                aec,
            )
            .await
        }
        Cmd::File {
            path,
            provider,
            frame_ms,
            burst,
        } => run_file(provider, path, frame_ms, !burst).await,
        Cmd::Say {
            text,
            provider,
            out,
        } => {
            if let Some(out_path) = out {
                run_speak(text, out_path).await
            } else {
                run_say(provider, text).await
            }
        }
        Cmd::Devices => run_devices().await,
        Cmd::Mic { device, frame_ms } => run_mic(device, frame_ms).await,
        Cmd::Server { addr } => run_server(addr).await,
        Cmd::Transcribe {
            path,
            model,
            translate_to,
        } => {
            if let Some(ref dir) = model {
                std::env::set_var("OTOJI_SENSEVOICE_DIR", dir);
            }
            run_transcribe(path, translate_to).await
        }
        Cmd::Ls { lines } => run_ls(lines),
        Cmd::Read { follow, lines } => run_read(follow, lines),
    }
}

fn run_ls(n: usize) -> Result<()> {
    let notes = if n == 0 {
        let all = otoji::notes::recent(usize::MAX);
        all.into_iter().rev().collect::<Vec<_>>()
    } else {
        otoji::notes::recent(n).into_iter().rev().collect()
    };
    for note in &notes {
        let dt = chrono::DateTime::from_timestamp_millis(note.ts)
            .map(|d| {
                d.with_timezone(&chrono::Local)
                    .format("%m-%d %H:%M:%S")
                    .to_string()
            })
            .unwrap_or_else(|| note.stem.clone());
        let preview: String = note.text.chars().take(40).collect();
        let ellipsis = if note.text.chars().count() > 40 {
            "…"
        } else {
            ""
        };
        println!("{dt}  [{kind}]  {preview}{ellipsis}", kind = note.kind);
    }
    Ok(())
}

/// Prefer polished `.md` over raw `text` from the note.
fn note_content(note: &otoji::notes::Note) -> String {
    let md = otoji::notes::artifact_path(&note.stem, "md");
    if md.exists() {
        std::fs::read_to_string(&md)
            .ok()
            .unwrap_or_else(|| note.text.clone())
    } else {
        note.text.clone()
    }
}

/// For `ptt_final` notes in follow mode, the polish `.md` may not be
/// written yet (async LLM call). Poll up to `max_wait` for it to appear.
fn note_content_await_polish(note: &otoji::notes::Note, max_wait: std::time::Duration) -> String {
    if note.kind != "ptt_final" {
        return note_content(note);
    }
    let md = otoji::notes::artifact_path(&note.stem, "md");
    let deadline = std::time::Instant::now() + max_wait;
    loop {
        if md.exists() {
            if let Ok(s) = std::fs::read_to_string(&md) {
                return s;
            }
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    note.text.clone()
}

fn run_read(follow: bool, n: usize) -> Result<()> {
    use std::fs::File;
    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    let path = otoji::notes::notes_path();

    // Print existing tail (last n lines, 0 = all). Prefer polished .md.
    let existing = if n == 0 {
        let all = otoji::notes::recent(usize::MAX);
        all.into_iter().rev().collect::<Vec<_>>()
    } else {
        let tail = otoji::notes::recent(n);
        tail.into_iter().rev().collect::<Vec<_>>()
    };
    for note in &existing {
        println!("{}", note_content(note));
    }

    if !follow {
        return Ok(());
    }

    // Follow mode: poll for new lines appended to the file.
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => {
            // File doesn't exist yet — wait for it.
            loop {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if let Ok(f) = File::open(&path) {
                    break f;
                }
            }
        }
    };
    // Seek to end so we only see new entries.
    file.seek(SeekFrom::End(0))?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => {
                // No new data yet — sleep and retry.
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Ok(_) => {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(note) = serde_json::from_str::<otoji::notes::Note>(trimmed) {
                        // Wait up to 3s for polish .md on ptt_final notes.
                        let content =
                            note_content_await_polish(&note, std::time::Duration::from_secs(3));
                        println!("{content}");
                    }
                }
            }
            Err(e) => {
                eprintln!("read error: {e}");
                break;
            }
        }
    }
    Ok(())
}

// No more pre-flight mic permission check. Just open the mic directly —
// macOS will show the permission dialog on first access. If the user
// grants it, audio starts flowing immediately. If denied, the VAD sees
// silence and the TUI shows rms=0.0000 (the warning is in the RMS meter).

/// Re-transcribe a saved 16 kHz mono segment WAV with whisper.cpp (`whisper-cli`)
/// for a higher-accuracy PTT upgrade. Best-effort: returns `None` (keeping the
/// raw SenseVoice text) if the model/wav is missing, `whisper-cli` isn't on
/// PATH, it exits non-zero, or the output is empty. `model` is a path to a ggml
/// model (e.g. `…/ggml-large-v3-turbo-q5_0.bin`).
fn whisper_cli_upgrade(model: &str, wav: &std::path::Path) -> Option<String> {
    if model.is_empty() || !wav.exists() {
        return None;
    }
    let out = std::process::Command::new("whisper-cli")
        .args(["-m", model, "-f"])
        .arg(wav)
        .args(["-nt", "-np"]) // no timestamps, no progress prints
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

async fn run_listen(
    kind: AsrKind,
    device: Option<String>,
    frame_ms: u32,
    plain: bool,
    ptt_polish: Option<String>,
    ptt_tts: Option<String>,
    ptt_context_file: Option<PathBuf>,
    ptt_translate_to: Option<String>,
    ptt_tts_source: String,
    aec: bool,
) -> Result<()> {
    if device.as_deref() == Some("-") {
        return run_listen_stdin(
            kind,
            frame_ms,
            plain,
            ptt_polish,
            ptt_tts,
            ptt_context_file,
            ptt_translate_to,
            ptt_tts_source,
        )
        .await;
    }

    // On macOS with --aec, use VoiceProcessingIO instead of cpal.
    #[cfg(target_os = "macos")]
    if aec {
        return run_listen_vpio(
            kind,
            frame_ms,
            plain,
            ptt_polish,
            ptt_tts,
            ptt_context_file,
            ptt_translate_to,
            ptt_tts_source,
        )
        .await;
    }
    #[cfg(not(target_os = "macos"))]
    if aec {
        tracing::warn!("--aec is macOS-only, falling back to cpal");
    }

    match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            let provider = IflytekRtasr::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = mic::start(device.as_deref(), frame_ms, audio_tx).context("mic")?;
            drive(provider, audio_rx).await
        }
        AsrKind::Sensevoice => {
            let cfg = SenseVoiceConfig::from_env();
            let provider = SenseVoice::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = mic::start(device.as_deref(), frame_ms, audio_tx).context("mic")?;
            if plain {
                drive_plain(
                    provider,
                    audio_rx,
                    ptt_polish,
                    ptt_tts,
                    ptt_context_file,
                    ptt_translate_to,
                    ptt_tts_source,
                )
                .await
            } else {
                drive(provider, audio_rx).await
            }
        }
    }
}

#[cfg(target_os = "macos")]
async fn run_listen_vpio(
    kind: AsrKind,
    frame_ms: u32,
    plain: bool,
    ptt_polish: Option<String>,
    ptt_tts: Option<String>,
    ptt_context_file: Option<PathBuf>,
    ptt_translate_to: Option<String>,
    ptt_tts_source: String,
) -> Result<()> {
    use audio::vpio;
    match kind {
        AsrKind::Iflytek => {
            let cfg = IflytekRtasrConfig::from_env().context("RTASR config")?;
            let provider = IflytekRtasr::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = vpio::start(frame_ms, audio_tx).context("VPIO mic")?;
            drive(provider, audio_rx).await
        }
        AsrKind::Sensevoice => {
            let cfg = SenseVoiceConfig::from_env();
            let provider = SenseVoice::new(cfg);
            let (audio_tx, audio_rx) = audio::channel(64);
            let _stream = vpio::start(frame_ms, audio_tx).context("VPIO mic")?;
            if plain {
                drive_plain(
                    provider,
                    audio_rx,
                    ptt_polish,
                    ptt_tts,
                    ptt_context_file,
                    ptt_translate_to,
                    ptt_tts_source,
                )
                .await
            } else {
                drive(provider, audio_rx).await
            }
        }
    }
}

async fn run_listen_stdin(
    kind: AsrKind,
    frame_ms: u32,
    plain_flag: bool,
    ptt_polish: Option<String>,
    ptt_tts: Option<String>,
    ptt_context_file: Option<PathBuf>,
    ptt_translate_to: Option<String>,
    ptt_tts_source: String,
) -> Result<()> {
    if std::io::stdin().is_terminal() {
        anyhow::bail!(
            "`otoji listen -` expects WAV data on stdin, but stdin is a terminal. \
             Try:  cat sample.wav | otoji listen -"
        );
    }
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
                drive_plain(
                    provider,
                    audio_rx,
                    ptt_polish.clone(),
                    ptt_tts.clone(),
                    ptt_context_file.clone(),
                    ptt_translate_to.clone(),
                    ptt_tts_source.clone(),
                )
                .await
            } else {
                drive(provider, audio_rx).await
            }
        }
        AsrKind::Sensevoice => {
            let cfg = SenseVoiceConfig::from_env();
            let provider = SenseVoice::new(cfg);
            if plain {
                drive_plain(
                    provider,
                    audio_rx,
                    ptt_polish,
                    ptt_tts,
                    ptt_context_file,
                    ptt_translate_to,
                    ptt_tts_source,
                )
                .await
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
    ptt_polish: Option<String>,
    ptt_tts: Option<String>,
    ptt_context_file: Option<PathBuf>,
    ptt_translate_to: Option<String>,
    ptt_tts_source: String,
) -> Result<()> {
    let (event_tx, mut event_rx) = mpsc::channel(128);
    let provider = Arc::new(provider);
    let p2 = provider.clone();
    tokio::spawn(async move {
        if let Err(e) = p2.run(audio_rx, event_tx).await {
            tracing::error!("asr: {e}");
        }
    });

    let polisher: Option<Arc<dyn Polisher>> = ptt_polish
        .as_deref()
        .and_then(|name| resolve_polisher(name));

    // Prewarm the polisher connection so the first real PTT segment doesn't
    // pay DNS / TLS / cold-start overhead. Typical saving: 200-400ms on
    // the first ptt_final after startup.
    if let Some(p) = polisher.clone() {
        tokio::spawn(async move {
            let _ = p
                .polish(otoji::polish::PolishInput {
                    text: "hi",
                    prev: None,
                    audio: None,
                    context: None,
                    translate_to: None,
                })
                .await;
            eprintln!("[otoji] polish connection prewarmed");
        });
    }
    let tts_provider: Option<Arc<dyn TtsProvider>> = ptt_tts.as_deref().and_then(|name| {
        let kind = match name {
            "auto" | "" => TtsKind::Auto,
            "piper" => TtsKind::Piper,
            "openai" => TtsKind::Openai,
            "elevenlabs" => TtsKind::Elevenlabs,
            "gemini" => TtsKind::Gemini,
            "iflytek" => TtsKind::Iflytek,
            "cloudflare" | "cf" => TtsKind::Cloudflare,
            other => {
                eprintln!("[otoji] unknown --ptt-tts value: {other:?}");
                return None;
            }
        };
        resolve_tts(kind).ok()
    });
    if polisher.is_some() {
        eprintln!(
            "[otoji] PTT polish enabled: {}",
            polisher.as_ref().unwrap().name()
        );
    }
    if tts_provider.is_some() {
        eprintln!(
            "[otoji] PTT TTS enabled: {}",
            tts_provider.as_ref().unwrap().name()
        );
    }
    if ptt_context_file.is_some() {
        eprintln!(
            "[otoji] PTT context file: {:?}",
            ptt_context_file.as_ref().unwrap()
        );
    }

    use std::io::Write;
    // Emit a single JSON event line with flush.
    fn emit(ev: &otoji::core::AsrEvent) -> std::io::Result<()> {
        let line = serde_json::to_string(ev).unwrap_or_default();
        let stdout = std::io::stdout();
        let mut out = stdout.lock();
        writeln!(out, "{line}")?;
        out.flush()?;
        Ok(())
    }

    // Track the stem of the most recent PttFinal so the async polish task
    // (which produces PttUpgrade later) can write the polished `.md`
    // sibling next to the same wav/srt.
    let mut last_ptt_stem: Option<String> = None;

    while let Some(ev) = event_rx.recv().await {
        // Persist finalized segments + sidecar artifacts (wav/srt) into
        // the notes store. Best-effort: failures are logged, not raised.
        match &ev {
            otoji::core::AsrEvent::Final { text, audio, .. } => {
                let mut note = otoji::notes::Note::new("final", text, None);
                if let Some(samples) = audio {
                    note.duration_ms = Some((samples.len() as u32 * 1000) / 16_000);
                    otoji::notes::save_wav(&note.stem, samples, 16_000);
                }
                otoji::notes::save_srt(&note.stem, &note.text, note.duration_ms.unwrap_or(0));
                otoji::notes::mux_webm(&note.stem);
                otoji::notes::append(&note);
            }
            otoji::core::AsrEvent::PttFinal { text, audio, .. } => {
                let mut note = otoji::notes::Note::new("ptt_final", text, None);
                // Persist the spoken audio as the `.wav` sibling so the exact
                // segment can be re-transcribed by other models offline (the
                // note text is the reference). Best-effort.
                if let Some(samples) = audio {
                    note.duration_ms = Some((samples.len() as u32 * 1000) / 16_000);
                    otoji::notes::save_wav(&note.stem, samples, 16_000);
                }
                otoji::notes::save_srt(&note.stem, &note.text, note.duration_ms.unwrap_or(0));
                otoji::notes::append(&note);
                last_ptt_stem = Some(note.stem);
            }
            _ => {}
        }
        match &ev {
            otoji::core::AsrEvent::PttFinal { text, lang, .. } => {
                // 1. Emit RAW ptt_final IMMEDIATELY so consumer types ASAP.
                if emit(&ev).is_err() {
                    break;
                }

                // 2. Spawn polish + optional translation + TTS in background.
                let raw = text.clone();
                let polisher_bg = polisher.clone();
                let tts_bg = tts_provider.clone();
                let ctx_path = ptt_context_file.clone();
                let translate_to_bg = ptt_translate_to.clone();
                let tts_source_bg = ptt_tts_source.clone();
                let stem_bg = last_ptt_stem.clone();
                // When OTOJI_PTT_WHISPER_MODEL points at a whisper.cpp ggml model,
                // re-transcribe the held segment with whisper-cli and use THAT as
                // the upgrade — SenseVoice streams live for instant feedback, then
                // the more accurate whisper result rewrites it. Falls back to LLM
                // polish when unset or on any failure.
                let whisper_model_bg = std::env::var("OTOJI_PTT_WHISPER_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty());
                // Language gate: whisper.cpp wins on English but mis-detects
                // short CJK speech as English (benched ja/ko errors >100%), so
                // only upgrade when SenseVoice detected English. Unknown/other
                // languages keep the SenseVoice result. Override the allow-list
                // with OTOJI_PTT_WHISPER_LANGS (comma-separated, "*" = any).
                let whisper_langs =
                    std::env::var("OTOJI_PTT_WHISPER_LANGS").unwrap_or_else(|_| "en".into());
                let lang_ok = {
                    let allow: Vec<String> = whisper_langs
                        .split(',')
                        .map(|s| s.trim().to_ascii_lowercase())
                        .filter(|s| !s.is_empty())
                        .collect();
                    let detected = lang.as_deref().unwrap_or("").to_ascii_lowercase();
                    allow.iter().any(|a| a == "*") || allow.iter().any(|a| *a == detected)
                };
                tokio::spawn(async move {
                    let ctx = ctx_path
                        .as_ref()
                        .and_then(|p| std::fs::read_to_string(p).ok());

                    // Prefer a whisper.cpp re-transcription of the segment wav —
                    // but only for languages where whisper beats SenseVoice.
                    let whisper_up = match (&whisper_model_bg, &stem_bg, lang_ok) {
                        (Some(model), Some(stem), true) => {
                            let wav = otoji::notes::artifact_path(stem, "wav");
                            let model = model.clone();
                            tokio::task::spawn_blocking(move || whisper_cli_upgrade(&model, &wav))
                                .await
                                .ok()
                                .flatten()
                        }
                        _ => None,
                    };

                    // Polish (+ translate if enabled) — skipped when whisper
                    // produced an upgrade.
                    let output = if let Some(w) = whisper_up {
                        otoji::polish::PolishOutput {
                            original: w,
                            translated: None,
                        }
                    } else {
                        match polisher_bg {
                            Some(p) => {
                                let input = otoji::polish::PolishInput {
                                    text: &raw,
                                    prev: None,
                                    audio: None,
                                    context: ctx.as_deref(),
                                    translate_to: translate_to_bg.as_deref(),
                                };
                                p.polish_full(input).await.unwrap_or_else(|e| {
                                    eprintln!("[otoji] PTT polish error: {e}");
                                    otoji::polish::PolishOutput {
                                        original: raw.clone(),
                                        translated: None,
                                    }
                                })
                            }
                            None => otoji::polish::PolishOutput {
                                original: raw.clone(),
                                translated: None,
                            },
                        }
                    };

                    let polished = output.original.trim().to_string();
                    let translated = output.translated.as_ref().map(|s| s.trim().to_string());

                    // Emit ptt_upgrade only if polish changed the original.
                    if polished != raw.trim() {
                        let _ = emit(&otoji::core::AsrEvent::PttUpgrade {
                            text: polished.clone(),
                        });
                        if let Some(stem) = stem_bg.as_deref() {
                            otoji::notes::save_polish_md(stem, &polished);
                        }
                    }

                    // Emit ptt_translated if translation produced something
                    // distinct from the polished original.
                    if let (Some(tr), Some(lang)) =
                        (translated.as_ref(), translate_to_bg.as_deref())
                    {
                        if !tr.is_empty() && tr != &polished {
                            let _ = emit(&otoji::core::AsrEvent::PttTranslated {
                                text: tr.clone(),
                                lang: lang.to_string(),
                            });
                        }
                    }

                    // TTS — pick which text to speak.
                    if let Some(tts) = tts_bg {
                        let spoken = match tts_source_bg.as_str() {
                            "translated" => translated.as_deref().unwrap_or(&polished),
                            _ => &polished,
                        };
                        speak_via_afplay(tts, spoken).await;
                    }
                });
            }
            otoji::core::AsrEvent::Closed => {
                let _ = emit(&ev);
                break;
            }
            _ => {
                if emit(&ev).is_err() {
                    break;
                }
            }
        }
    }
    Ok(())
}

/// Resolve polish provider name to an instance. Returns None on error.
fn resolve_polisher(name: &str) -> Option<Arc<dyn Polisher>> {
    use otoji::polish::{AnthropicPolisher, GeminiPolisher, OpenAiPolisher};
    let try_gemini = || -> Option<Arc<dyn Polisher>> {
        GeminiPolisher::from_env()
            .ok()
            .map(|p| Arc::new(p) as Arc<dyn Polisher>)
    };
    let try_anthropic = || -> Option<Arc<dyn Polisher>> {
        AnthropicPolisher::from_env()
            .ok()
            .map(|p| Arc::new(p) as Arc<dyn Polisher>)
    };
    let try_openai = || -> Option<Arc<dyn Polisher>> {
        OpenAiPolisher::from_env()
            .ok()
            .map(|p| Arc::new(p) as Arc<dyn Polisher>)
    };
    match name {
        "gemini" => try_gemini(),
        "anthropic" => try_anthropic(),
        "openai" => try_openai(),
        "auto" | "" => try_gemini().or_else(try_openai).or_else(try_anthropic),
        other => {
            eprintln!("[otoji] unknown --ptt-polish value: {other:?}");
            None
        }
    }
}

/// Synthesize `text` via `tts` and play back via `afplay` (macOS).
async fn speak_via_afplay(tts: Arc<dyn TtsProvider>, text: &str) {
    if text.is_empty() {
        return;
    }
    use bytes::BytesMut;
    let sample_rate = tts.sample_rate();
    let is_pcm = tts.is_pcm();
    let (audio_tx, mut audio_rx) = tokio::sync::mpsc::channel::<bytes::Bytes>(64);
    let text_owned = text.to_string();
    let tts_run = tokio::spawn(async move {
        if let Err(e) = tts.synthesize(&text_owned, audio_tx).await {
            eprintln!("[otoji] TTS synth error: {e}");
        }
    });
    // Collect audio bytes.
    let mut buf = BytesMut::new();
    while let Some(chunk) = audio_rx.recv().await {
        buf.extend_from_slice(&chunk);
    }
    let _ = tts_run.await;

    // Write to temp file and play via afplay. Wrap PCM in WAV header if needed.
    let tmp = std::env::temp_dir().join(format!("otoji-tts-{}.wav", std::process::id()));
    if let Err(e) = write_wav_file(&tmp, &buf, sample_rate, is_pcm) {
        eprintln!("[otoji] TTS write file error: {e}");
        return;
    }
    let _ = std::process::Command::new("afplay").arg(&tmp).status();
    let _ = std::fs::remove_file(&tmp);
}

/// Write audio bytes to a WAV file. If `is_pcm`, wrap mono i16 LE PCM in
/// a RIFF header; otherwise treat `bytes` as already-packaged audio (e.g. MP3).
fn write_wav_file(
    path: &std::path::Path,
    bytes: &[u8],
    sample_rate: u32,
    is_pcm: bool,
) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::File::create(path)?;
    if is_pcm {
        let data_len = bytes.len() as u32;
        let byte_rate = sample_rate * 2; // mono, 16-bit
        f.write_all(b"RIFF")?;
        f.write_all(&(36u32 + data_len).to_le_bytes())?;
        f.write_all(b"WAVE")?;
        f.write_all(b"fmt ")?;
        f.write_all(&16u32.to_le_bytes())?;
        f.write_all(&1u16.to_le_bytes())?; // PCM
        f.write_all(&1u16.to_le_bytes())?; // mono
        f.write_all(&sample_rate.to_le_bytes())?;
        f.write_all(&byte_rate.to_le_bytes())?;
        f.write_all(&2u16.to_le_bytes())?; // block align
        f.write_all(&16u16.to_le_bytes())?; // bits per sample
        f.write_all(b"data")?;
        f.write_all(&data_len.to_le_bytes())?;
    }
    f.write_all(bytes)?;
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

/// Stream mic audio to stdout as a 16 kHz mono WAV. The denoise pipeline
/// (RNNoise) runs before output so downstream consumers see clean audio.
/// Use: `otoji mic | otoji listen -` or `otoji mic > recording.wav`.
async fn run_mic(device: Option<String>, frame_ms: u32) -> Result<()> {
    let (audio_tx, mut audio_rx) = audio::channel(64);
    let _stream = mic::start(device.as_deref(), frame_ms, audio_tx).context("mic")?;

    use std::io::Write;
    let mut out = std::io::stdout().lock();
    out.write_all(&streaming_wav_header(16_000))
        .context("write wav header")?;

    while let Some(chunk) = audio_rx.recv().await {
        if out.write_all(&chunk.pcm).is_err() {
            break; // stdout closed (pipe broken)
        }
    }
    Ok(())
}

/// Run a minimal WebSocket server. Each connection = one SenseVoice
/// session. Binary frames are treated as raw 16 kHz mono s16le PCM audio.
/// Text frames are control commands. Events flow back as JSON text frames.
async fn run_server(addr: String) -> Result<()> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .context("bind ws server")?;
    eprintln!("[otoji] WebSocket server listening on ws://{addr}/");

    while let Ok((stream, peer)) = listener.accept().await {
        eprintln!("[otoji] client connected: {peer}");
        tokio::spawn(async move {
            let ws = match tokio_tungstenite::accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    eprintln!("[otoji] ws accept: {e}");
                    return;
                }
            };
            let (mut tx, mut rx) = ws.split();

            // Audio bridge: PCM bytes → SenseVoice worker.
            let (audio_tx, audio_rx) = audio::channel(256);
            let (event_tx, mut event_rx) = mpsc::channel(128);

            let cfg = SenseVoiceConfig::from_env();
            let provider = Arc::new(SenseVoice::new(cfg));
            let p2 = provider.clone();
            tokio::spawn(async move {
                if let Err(e) = p2.run(audio_rx, event_tx).await {
                    eprintln!("[otoji-ws] asr: {e}");
                }
            });

            // Forward events → WebSocket.
            let send_task = tokio::spawn(async move {
                while let Some(ev) = event_rx.recv().await {
                    if let Ok(line) = serde_json::to_string(&ev) {
                        if tx.send(Message::Text(line.into())).await.is_err() {
                            break;
                        }
                    }
                    if matches!(ev, otoji::core::AsrEvent::Closed) {
                        break;
                    }
                }
            });

            // Read incoming WS frames.
            while let Some(msg) = rx.next().await {
                let msg = match msg {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("[otoji-ws] recv: {e}");
                        break;
                    }
                };
                match msg {
                    Message::Binary(data) => {
                        let chunk = otoji::core::AudioChunk::new(
                            otoji::core::AudioFormat::PCM16K_MONO,
                            data.to_vec(),
                        );
                        if audio_tx.send(chunk).await.is_err() {
                            break;
                        }
                    }
                    Message::Text(t) => {
                        use otoji::asr::sensevoice::{
                            PTT_SIGNAL_PENDING_END, PTT_SIGNAL_PENDING_START,
                        };
                        use std::sync::atomic::Ordering;
                        let line = t.trim();
                        if line.eq_ignore_ascii_case("PTT_START") {
                            PTT_SIGNAL_PENDING_START.store(true, Ordering::Relaxed);
                        } else if line.eq_ignore_ascii_case("PTT_END") {
                            PTT_SIGNAL_PENDING_END.store(true, Ordering::Relaxed);
                        } else if let Some(_ctx) = line.strip_prefix("CONTEXT ") {
                            // Context handling: write to configured file if set.
                            if let Ok(path) = std::env::var("OTOJI_PTT_CONTEXT_FILE") {
                                let _ = std::fs::write(path, _ctx);
                            }
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            let _ = send_task.await;
            eprintln!("[otoji] client disconnected: {peer}");
        });
    }
    Ok(())
}

/// One-shot transcribe a WAV or PCM file. Collects all Final segments,
/// optionally polishes/translates, then prints a single JSON line:
///   {"text": "..."}                      (no --translate-to)
///   {"text": "...", "translated": "..."} (--translate-to set)
async fn run_transcribe(path: PathBuf, translate_to: Option<String>) -> Result<()> {
    // Detect WAV vs raw PCM by extension (simple heuristic).
    let is_wav = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("wav"))
        .unwrap_or(false);

    let (audio_tx, audio_rx) = audio::channel(256);
    let p = path.clone();
    let reader = tokio::task::spawn_blocking(move || {
        if is_wav {
            let file = std::fs::File::open(&p)?;
            let buf = std::io::BufReader::new(file);
            stream_wav_reader_blocking(buf, 100, audio_tx)
        } else {
            // Treat as 16kHz mono PCM16 LE, burst mode.
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                stream_pcm_file(p, AudioFormat::PCM16K_MONO, 100, false, audio_tx).await
            })
        }
    });

    let cfg = SenseVoiceConfig::from_env();
    let provider = SenseVoice::new(cfg);
    let (event_tx, mut event_rx) = mpsc::channel(256);
    let provider = Arc::new(provider);
    let p2 = provider.clone();
    tokio::spawn(async move {
        if let Err(e) = p2.run(audio_rx, event_tx).await {
            tracing::error!("asr: {e}");
        }
    });

    let mut all_text = String::new();
    while let Some(ev) = event_rx.recv().await {
        match ev {
            otoji::core::AsrEvent::Final { text, .. } => {
                if !all_text.is_empty() {
                    all_text.push(' ');
                }
                all_text.push_str(text.trim());
            }
            otoji::core::AsrEvent::Closed => break,
            _ => {}
        }
    }
    let _ = reader.await;

    // Optional polish + translate.
    let (text, translated) = if let Some(target) = translate_to.as_deref() {
        let polisher: Option<Arc<dyn Polisher>> = resolve_any_polisher();
        if let Some(p) = polisher {
            let input = otoji::polish::PolishInput {
                text: &all_text,
                prev: None,
                audio: None,
                context: None,
                translate_to: Some(target),
            };
            let out = p
                .polish_full(input)
                .await
                .unwrap_or(otoji::polish::PolishOutput {
                    original: all_text.clone(),
                    translated: None,
                });
            (out.original, out.translated)
        } else {
            (all_text, None)
        }
    } else {
        (all_text, None)
    };

    let obj = match translated {
        Some(t) => serde_json::json!({"text": text, "translated": t}),
        None => serde_json::json!({"text": text}),
    };
    println!("{}", serde_json::to_string(&obj).unwrap_or_default());
    Ok(())
}

/// Try to build any polisher for `run_transcribe` — Gemini → OpenAI → Anthropic.
fn resolve_any_polisher() -> Option<Arc<dyn Polisher>> {
    if let Ok(p) = GeminiPolisher::from_env() {
        return Some(Arc::new(p) as Arc<dyn Polisher>);
    }
    if let Ok(p) = OpenAiPolisher::from_env() {
        return Some(Arc::new(p) as Arc<dyn Polisher>);
    }
    if let Ok(p) = AnthropicPolisher::from_env() {
        return Some(Arc::new(p) as Arc<dyn Polisher>);
    }
    None
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
            let model = std::env::var("OTOJI_POLISH_MODEL").unwrap_or_else(|_| "gpt-4o".into());
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
                                    context: None,
                                    translate_to: None,
                                };
                                if p.polish(test).await.is_ok() {
                                    let _ = status_tx
                                        .send(otoji::core::AsrEvent::Status {
                                            message: format!(
                                                "polish: ollama ready (model={})",
                                                p.model
                                            ),
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

fn which_ollama() -> bool {
    which("ollama")
}
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
