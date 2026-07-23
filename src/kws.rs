//! Keyword spotting ("wake word") — always-on detector that emits
//! `{"type":"wake",...}` JSON lines on stdout when a configured keyword
//! is heard.
//!
//! Designed to be spawned by CLX so mic ownership stays in otoji. CLX's
//! otoji reader already parses `ptt_partial`/`ptt_final`/`vad` lines; adding
//! `wake` keeps the transport uniform.
//!
//! Model layout (gigaspeech KWS example):
//!   <model_dir>/
//!     encoder-epoch-12-avg-2-chunk-16-left-64.onnx
//!     decoder-epoch-12-avg-2-chunk-16-left-64.onnx
//!     joiner-epoch-12-avg-2-chunk-16-left-64.onnx
//!     tokens.txt
//!     bpe.model
//!
//! Keywords file format is sherpa-onnx's BPE-encoded one-per-line, e.g.:
//!   ▁HEY ▁C L X :Hey CLX
//! Build with sherpa-onnx's `keywords.py` helper.

use anyhow::{anyhow, Context, Result};
use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};
use std::path::Path;
use std::time::{Duration, Instant};

use crate::audio;
use crate::audio::mic;

pub struct KwsOptions {
    pub device: Option<String>,
    pub frame_ms: u32,
    /// Model directory. Empty → auto-download the Chinese wenetspeech KWS
    /// model (3.3M params, designed for always-on use) into the cache.
    pub model_dir: String,
    /// Path to a sherpa keywords file. Empty → write a default file from
    /// `keyword_line` into the cache.
    pub keywords_file: String,
    /// One sherpa keyword line (space-separated tokens + `@phrase`), used to
    /// build the keywords file when `keywords_file` is empty. Default wakes on
    /// "小克小克": `x iǎo k è x iǎo k è @小克小克`.
    pub keyword_line: Option<String>,
    pub threshold: f32,
    /// Min interval between successive detections of the same keyword (ms).
    pub cooldown_ms: u64,
    /// Read this WAV as input instead of the mic (for testing / batch use).
    pub wav: Option<std::path::PathBuf>,
}

const KWS_MODEL: &str = "sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01";
const KWS_RELEASE: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models";
/// Wake on "小克小克" by default — pinyin-token form for the wenetspeech model.
pub const DEFAULT_KEYWORD_LINE: &str = "x iǎo k è x iǎo k è @小克小克";

fn otoji_cache() -> std::path::PathBuf {
    std::env::var_os("OTOJI_CACHE_DIR")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::Path::new(&h).join(".cache").join("otoji")))
        .unwrap_or_else(|| std::path::PathBuf::from(".otoji-cache"))
}

/// Ensure the default Chinese KWS model is present; download+extract if not.
/// Returns its directory. Idempotent.
pub async fn ensure_kws_model() -> Result<std::path::PathBuf> {
    let cache = otoji_cache();
    let dir = cache.join(KWS_MODEL);
    if dir.join("tokens.txt").is_file() {
        return Ok(dir);
    }
    tokio::fs::create_dir_all(&cache).await.ok();
    let url = format!("{KWS_RELEASE}/{KWS_MODEL}.tar.bz2");
    let tarball = cache.join(format!("{KWS_MODEL}.tar.bz2"));
    eprintln!("[otoji-kws] downloading {KWS_MODEL} …");
    let bytes = reqwest::Client::builder()
        .user_agent(concat!("otoji/", env!("CARGO_PKG_VERSION")))
        .build()?
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    tokio::fs::write(&tarball, &bytes).await.context("write kws tarball")?;
    // system tar handles .tar.bz2 (bsdtar on macOS, GNU tar elsewhere)
    let status = std::process::Command::new("tar")
        .arg("-xjf")
        .arg(&tarball)
        .arg("-C")
        .arg(&cache)
        .status()
        .context("run tar")?;
    if !status.success() {
        return Err(anyhow!("tar extraction of {} failed", tarball.display()));
    }
    let _ = tokio::fs::remove_file(&tarball).await;
    if !dir.join("tokens.txt").is_file() {
        return Err(anyhow!("KWS model missing tokens.txt after extract: {}", dir.display()));
    }
    Ok(dir)
}

/// Build a KeywordSpotter + its stream from a model dir and a keywords file.
/// Shared by `otoji kws` and the native assistant loop.
pub fn build_spotter(
    model_dir: &Path,
    keywords_file: &str,
    threshold: f32,
) -> Result<(KeywordSpotter, sherpa_onnx::OnlineStream)> {
    let (encoder, decoder, joiner) = find_transducer_files(model_dir)?;
    let tokens = model_dir.join("tokens.txt");
    if !tokens.is_file() {
        return Err(anyhow!("tokens.txt missing in {}", model_dir.display()));
    }
    let mut cfg = KeywordSpotterConfig::default();
    cfg.model_config.transducer.encoder = Some(encoder);
    cfg.model_config.transducer.decoder = Some(decoder);
    cfg.model_config.transducer.joiner = Some(joiner);
    cfg.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    cfg.model_config.num_threads = 1;
    cfg.model_config.provider = Some("cpu".into());
    cfg.keywords_file = Some(keywords_file.to_string());
    cfg.keywords_threshold = threshold;
    let spotter = KeywordSpotter::create(&cfg)
        .ok_or_else(|| anyhow!("sherpa: failed to create KeywordSpotter"))?;
    let stream = spotter.create_stream();
    Ok((spotter, stream))
}

/// Resolve model dir (auto-download if empty) and keywords file (write default
/// from `keyword_line` if empty), for reuse by the assistant loop.
pub async fn resolve_model_and_keywords(
    model_dir: &str,
    keywords_file: &str,
    keyword_line: Option<&str>,
) -> Result<(std::path::PathBuf, String)> {
    let dir = if model_dir.trim().is_empty() {
        ensure_kws_model().await?
    } else {
        std::path::PathBuf::from(model_dir)
    };
    let kw = if keywords_file.trim().is_empty() {
        let line = keyword_line.unwrap_or(DEFAULT_KEYWORD_LINE);
        let path = dir.join("otoji-keywords.txt");
        std::fs::write(&path, format!("{}\n", line.trim()))
            .with_context(|| format!("write {}", path.display()))?;
        path.to_string_lossy().into_owned()
    } else {
        keywords_file.to_string()
    };
    Ok((dir, kw))
}

/// 16 kHz mono f32 samples from a WAV (any rate/channels), for --wav mode.
pub fn read_wav_16k_mono(path: &Path) -> Result<Vec<f32>> {
    let mut r = hound::WavReader::open(path).with_context(|| format!("open {}", path.display()))?;
    let spec = r.spec();
    let ch = spec.channels.max(1) as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            r.samples::<i32>().filter_map(|s| s.ok()).map(|s| s as f32 / max).collect()
        }
        hound::SampleFormat::Float => r.samples::<f32>().filter_map(|s| s.ok()).collect(),
    };
    // downmix to mono
    let mono: Vec<f32> = if ch > 1 {
        raw.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect()
    } else {
        raw
    };
    // resample to 16k (linear)
    if spec.sample_rate == 16_000 {
        return Ok(mono);
    }
    let ratio = 16_000f32 / spec.sample_rate as f32;
    let n = (mono.len() as f32 * ratio) as usize;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let src = i as f32 / ratio;
        let a = src.floor() as usize;
        let b = (a + 1).min(mono.len().saturating_sub(1));
        let t = src - a as f32;
        out.push(mono.get(a).copied().unwrap_or(0.0) * (1.0 - t) + mono.get(b).copied().unwrap_or(0.0) * t);
    }
    Ok(out)
}

pub async fn run(opts: KwsOptions) -> Result<()> {
    // Model: use the given dir, else auto-download the Chinese wenetspeech KWS.
    let model_dir = if opts.model_dir.trim().is_empty() {
        ensure_kws_model().await?
    } else {
        std::path::PathBuf::from(&opts.model_dir)
    };
    let dir = model_dir.as_path();
    if !dir.is_dir() {
        return Err(anyhow!("KWS model dir not found: {}", dir.display()));
    }
    // Keywords: use the given file, else write one from `keyword_line` (default
    // wakes on 小克小克) into the cache next to the model.
    let keywords_file = if opts.keywords_file.trim().is_empty() {
        let line = opts.keyword_line.clone().unwrap_or_else(|| DEFAULT_KEYWORD_LINE.to_string());
        let path = dir.join("otoji-keywords.txt");
        std::fs::write(&path, format!("{}\n", line.trim()))
            .with_context(|| format!("write {}", path.display()))?;
        path.to_string_lossy().into_owned()
    } else {
        if !Path::new(&opts.keywords_file).is_file() {
            return Err(anyhow!("KWS keywords file not found: {}", opts.keywords_file));
        }
        opts.keywords_file.clone()
    };

    let (encoder, decoder, joiner) = find_transducer_files(dir)?;
    let tokens = dir.join("tokens.txt");
    if !tokens.is_file() {
        return Err(anyhow!("tokens.txt missing in {}", opts.model_dir));
    }

    let mut cfg = KeywordSpotterConfig::default();
    cfg.model_config.transducer.encoder = Some(encoder);
    cfg.model_config.transducer.decoder = Some(decoder);
    cfg.model_config.transducer.joiner = Some(joiner);
    cfg.model_config.tokens = Some(tokens.to_string_lossy().into_owned());
    cfg.model_config.num_threads = 1;
    cfg.model_config.provider = Some("cpu".into());
    cfg.keywords_file = Some(keywords_file.clone());
    cfg.keywords_threshold = opts.threshold;

    let spotter = KeywordSpotter::create(&cfg)
        .ok_or_else(|| anyhow!("sherpa: failed to create KeywordSpotter"))?;
    let stream = spotter.create_stream();

    eprintln!(
        "[otoji-kws] ready — model={} keywords={} threshold={}",
        dir.display(), keywords_file, opts.threshold
    );

    let start = Instant::now();
    let mut last_emit: Option<(String, Instant)> = None;
    let cooldown = Duration::from_millis(opts.cooldown_ms);

    // Detection step shared by mic and --wav: emit a `wake` JSON line on a
    // fresh keyword, honoring the cooldown, and reset so it doesn't re-fire.
    let mut on_samples = |samples: &[f32]| {
        if samples.is_empty() {
            return;
        }
        stream.accept_waveform(16_000, samples);
        while spotter.is_ready(&stream) {
            spotter.decode(&stream);
        }
        if let Some(result) = spotter.get_result(&stream) {
            let keyword = result.keyword.clone();
            if keyword.is_empty() {
                return;
            }
            let now = Instant::now();
            let skip = matches!(&last_emit, Some((prev, t)) if prev == &keyword && now.duration_since(*t) < cooldown);
            if !skip {
                let ts_ms = now.duration_since(start).as_millis() as u64;
                let line = serde_json::json!({ "type": "wake", "keyword": keyword, "timestamp_ms": ts_ms });
                println!("{line}");
                use std::io::Write;
                let _ = std::io::stdout().flush();
                last_emit = Some((keyword, now));
            }
            spotter.reset(&stream);
        }
    };

    if let Some(wav) = opts.wav.clone() {
        let samples = read_wav_16k_mono(&wav)?;
        // feed in 100ms hops so streaming decode advances naturally
        for hop in samples.chunks(1600) {
            on_samples(hop);
        }
        stream.input_finished();
        while spotter.is_ready(&stream) {
            spotter.decode(&stream);
        }
        on_samples(&[]);
        return Ok(());
    }

    let (audio_tx, mut audio_rx) = audio::channel(64);
    let _mic = mic::start(opts.device.as_deref(), opts.frame_ms, audio_tx).context("mic")?;
    while let Some(chunk) = audio_rx.recv().await {
        let samples = pcm16_to_f32(&chunk.pcm);
        on_samples(&samples);
    }
    Ok(())
}


pub fn pcm16_to_f32(bytes: &[u8]) -> Vec<f32> {
    let mut out = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        let s = i16::from_le_bytes([chunk[0], chunk[1]]);
        out.push(s as f32 / 32768.0);
    }
    out
}

/// Locate encoder/decoder/joiner ONNX files inside `dir`. Accepts any
/// filename containing `encoder`/`decoder`/`joiner` so it works across the
/// different sherpa KWS releases (they each ship with different epoch
/// suffixes).
fn find_transducer_files(dir: &Path) -> Result<(String, String, String)> {
    let mut encoder = None;
    let mut decoder = None;
    let mut joiner = None;
    for entry in std::fs::read_dir(dir).with_context(|| format!("read {}", dir.display()))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".onnx") {
            continue;
        }
        let path = entry.path().to_string_lossy().into_owned();
        if name.contains("encoder") && encoder.is_none() {
            encoder = Some(path);
        } else if name.contains("decoder") && decoder.is_none() {
            decoder = Some(path);
        } else if name.contains("joiner") && joiner.is_none() {
            joiner = Some(path);
        }
    }
    Ok((
        encoder.ok_or_else(|| anyhow!("no encoder*.onnx in {}", dir.display()))?,
        decoder.ok_or_else(|| anyhow!("no decoder*.onnx in {}", dir.display()))?,
        joiner.ok_or_else(|| anyhow!("no joiner*.onnx in {}", dir.display()))?,
    ))
}
