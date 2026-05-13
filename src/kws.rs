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
    pub model_dir: String,
    pub keywords_file: String,
    pub threshold: f32,
    /// Min interval between successive detections of the same keyword (ms).
    /// Prevents flooding stdout while a keyword is sustained.
    pub cooldown_ms: u64,
}

pub async fn run(opts: KwsOptions) -> Result<()> {
    let dir = Path::new(&opts.model_dir);
    if !dir.is_dir() {
        return Err(anyhow!(
            "KWS model dir not found: {}\nDownload e.g.\n  \
             curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/\
             sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2 | tar -xj",
            opts.model_dir
        ));
    }
    if !Path::new(&opts.keywords_file).is_file() {
        return Err(anyhow!(
            "KWS keywords file not found: {}",
            opts.keywords_file
        ));
    }

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
    cfg.keywords_file = Some(opts.keywords_file.clone());
    cfg.keywords_threshold = opts.threshold;

    let spotter = KeywordSpotter::create(&cfg)
        .ok_or_else(|| anyhow!("sherpa: failed to create KeywordSpotter"))?;
    let stream = spotter.create_stream();

    eprintln!(
        "[otoji-kws] ready — model={} keywords={} threshold={}",
        opts.model_dir, opts.keywords_file, opts.threshold
    );

    let (audio_tx, mut audio_rx) = audio::channel(64);
    let _mic = mic::start(opts.device.as_deref(), opts.frame_ms, audio_tx).context("mic")?;

    let start = Instant::now();
    let mut last_emit: Option<(String, Instant)> = None;
    let cooldown = Duration::from_millis(opts.cooldown_ms);

    while let Some(chunk) = audio_rx.recv().await {
        // chunk.pcm is 16kHz mono s16 LE. Convert to f32 normalized [-1, 1].
        let samples = pcm16_to_f32(&chunk.pcm);
        if samples.is_empty() {
            continue;
        }
        stream.accept_waveform(16_000, &samples);

        while spotter.is_ready(&stream) {
            spotter.decode(&stream);
        }

        if let Some(result) = spotter.get_result(&stream) {
            let keyword = result.keyword.clone();
            if keyword.is_empty() {
                continue;
            }
            let now = Instant::now();
            let skip = matches!(
                &last_emit,
                Some((prev, t)) if prev == &keyword && now.duration_since(*t) < cooldown
            );
            if !skip {
                let ts_ms = now.duration_since(start).as_millis() as u64;
                let line = serde_json::json!({
                    "type": "wake",
                    "keyword": keyword,
                    "timestamp_ms": ts_ms,
                });
                println!("{line}");
                use std::io::Write;
                let _ = std::io::stdout().flush();
                last_emit = Some((keyword, now));
            }
            // Reset the detector state so the same utterance doesn't
            // re-fire endlessly.
            spotter.reset(&stream);
        }
    }
    Ok(())
}

fn pcm16_to_f32(bytes: &[u8]) -> Vec<f32> {
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
