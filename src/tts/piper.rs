//! Local Piper TTS via sherpa-onnx (VITS).
//!
//! Targets the pre-packaged Piper voices published by the sherpa-onnx
//! project, e.g. `vits-piper-en_US-amy-low`. A voice directory contains:
//!   - `<voice>.onnx` — the VITS model
//!   - `tokens.txt`   — token table
//!   - `espeak-ng-data/` — phoneme data dir
//!
//! Lazy-friendly streaming: sherpa-onnx exposes a progress callback that
//! receives partial sample buffers as the model decodes, so we forward each
//! callback batch to the channel and the consumer can start playing /
//! piping before the full utterance is finished.
//!
//! Cross-platform, no auth, ~30MB per voice — this is the default `say`
//! provider when a model is present.

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use bytes::Bytes;
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig,
    OfflineTtsVitsModelConfig,
};
use std::sync::Mutex;

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

#[derive(Debug, Clone)]
pub struct PiperTtsConfig {
    /// Directory containing `<voice>.onnx`, `tokens.txt`, `espeak-ng-data/`.
    pub model_dir: String,
    /// Speaker id for multi-speaker models.
    pub sid: i32,
    /// Inverse-speed (1.0 = normal, 0.8 = faster, 1.2 = slower).
    pub length_scale: f32,
}

impl PiperTtsConfig {
    pub fn from_env() -> Self {
        let default_dir = {
            let mut d = cache_dir();
            d.push("vits-piper-en_US-amy-low");
            d.to_string_lossy().into_owned()
        };
        Self {
            model_dir: std::env::var("OTOJI_PIPER_DIR").unwrap_or(default_dir),
            sid: std::env::var("OTOJI_PIPER_SID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0),
            length_scale: std::env::var("OTOJI_PIPER_SPEED")
                .ok()
                .and_then(|s| s.parse().ok())
                .map(|spd: f32| 1.0 / spd)
                .unwrap_or(1.0),
        }
    }

    /// Detect the `<voice>.onnx` file inside `model_dir`. Piper voices ship
    /// with a single `*.onnx` so we just pick the first one we find.
    fn find_model_file(&self) -> Result<String> {
        let dir = std::path::Path::new(&self.model_dir);
        if !dir.is_dir() {
            return Err(OtojiError::Config(format!(
                "Piper model dir not found: {dir}\n\
                 Download a voice once with:\n  \
                 mkdir -p {parent} && curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-amy-low.tar.bz2 \
                 | tar -xj -C {parent}",
                dir = dir.display(),
                parent = dir.parent().unwrap_or(std::path::Path::new(".")).display()
            )));
        }
        for entry in std::fs::read_dir(dir)
            .map_err(|e| OtojiError::Config(format!("read piper dir: {e}")))?
        {
            let entry = entry.map_err(|e| OtojiError::Config(format!("read piper dir: {e}")))?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("onnx") {
                return Ok(path.to_string_lossy().into_owned());
            }
        }
        Err(OtojiError::Config(format!(
            "no .onnx file found in {}",
            dir.display()
        )))
    }
}

pub struct PiperTts {
    /// `OfflineTts` is `Send` but not `Sync`; wrap in a Mutex so the
    /// provider satisfies `Send + Sync` for `Arc<dyn TtsProvider>`.
    inner: Mutex<OfflineTts>,
    sample_rate: u32,
    cfg: PiperTtsConfig,
}

impl PiperTts {
    pub fn create(cfg: PiperTtsConfig) -> Result<Self> {
        let model_path = cfg.find_model_file()?;
        let tokens = format!("{}/tokens.txt", cfg.model_dir);
        let data_dir = format!("{}/espeak-ng-data", cfg.model_dir);

        eprintln!("piper: loading {model_path} …");
        let started = std::time::Instant::now();
        let config = OfflineTtsConfig {
            model: OfflineTtsModelConfig {
                vits: OfflineTtsVitsModelConfig {
                    model: Some(model_path),
                    tokens: Some(tokens),
                    data_dir: Some(data_dir),
                    length_scale: cfg.length_scale,
                    ..Default::default()
                },
                ..Default::default()
            },
            ..Default::default()
        };
        let tts = OfflineTts::create(&config).ok_or_else(|| {
            OtojiError::Provider(
                "OfflineTts::create returned None — check Piper model files and espeak-ng-data"
                    .into(),
            )
        })?;
        let sample_rate = tts.sample_rate() as u32;
        eprintln!(
            "piper: loaded in {:.2}s (native sample rate {sample_rate} Hz)",
            started.elapsed().as_secs_f32()
        );
        Ok(Self {
            inner: Mutex::new(tts),
            sample_rate,
            cfg,
        })
    }
}

#[async_trait]
impl TtsProvider for PiperTts {
    fn name(&self) -> &'static str {
        "piper"
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        // sherpa-onnx is sync; offload to a blocking thread so we don't
        // stall the tokio runtime. The progress callback fires on the
        // worker thread and `blocking_send`s into the async channel,
        // giving the consumer a real streaming feel.
        let text = text.to_string();
        let sid = self.cfg.sid;

        // Move the locked handle into the blocking task. We hold the
        // mutex for the entire generate call (which is the contract: a
        // single text → audio synthesis is atomic from the model's
        // perspective).
        let guard = self
            .inner
            .lock()
            .map_err(|_| OtojiError::Provider("piper mutex poisoned".into()))?;
        // SAFETY of the move: OfflineTts is `Send`. We split the lifetime
        // of the lock from the spawn_blocking call by performing the work
        // synchronously inside an async block — the entire `synthesize`
        // future is single-threaded from the caller's POV.
        let tx = audio.clone();
        let result = tokio::task::block_in_place(|| {
            let cfg = GenerationConfig {
                sid,
                ..Default::default()
            };
            let cb = move |samples: &[f32], _progress: f32| -> bool {
                let mut bytes = Vec::with_capacity(samples.len() * 2);
                for s in samples {
                    let clamped = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                    bytes.extend_from_slice(&clamped.to_le_bytes());
                }
                tx.blocking_send(Bytes::from(bytes)).is_ok()
            };
            guard.generate_with_config(&text, &cfg, Some(cb))
        });
        if result.is_none() {
            return Err(OtojiError::Provider("piper: generate returned None".into()));
        }
        Ok(())
    }
}
