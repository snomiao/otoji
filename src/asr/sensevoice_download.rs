//! SenseVoice model bundle download + extraction.
//!
//! Streams the official sherpa-onnx asset from GitHub releases and extracts
//! it via the system `tar` (bsdtar on macOS, GNU tar elsewhere — both handle
//! `.tar.bz2`). Reports byte-level progress via a callback so UIs can render
//! a live progress bar.

use crate::asr::sensevoice::{cache_dir, model_dir_for_variant, variant_is_present};
use crate::core::{OtojiError, Result};
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

const ASR_RELEASE_BASE: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models";
const TTS_RELEASE_BASE: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models";

/// One progress tick emitted by `download_variant`.
#[derive(Debug, Clone, Copy)]
pub struct DownloadProgress {
    pub downloaded: u64,
    /// `0` if the server didn't send `Content-Length`.
    pub total: u64,
    pub bytes_per_sec: u64,
    pub stage: DownloadStage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadStage {
    Connecting,
    Downloading,
    Extracting,
    Done,
}

/// Resolve `<cache>/<variant>.tar.bz2`.
fn tarball_path(variant: &str) -> PathBuf {
    let mut p = cache_dir();
    p.push(format!("{variant}.tar.bz2"));
    p
}

/// Asset category — picks the GitHub release tag and the presence-check files.
#[derive(Debug, Clone, Copy)]
pub enum AssetKind {
    SttSenseVoice,
    TtsKokoro,
}

impl AssetKind {
    fn release_base(self) -> &'static str {
        match self {
            AssetKind::SttSenseVoice => ASR_RELEASE_BASE,
            AssetKind::TtsKokoro => TTS_RELEASE_BASE,
        }
    }
    /// True if `dir` already contains the files this asset needs.
    pub fn is_present(self, dir: &Path) -> bool {
        match self {
            AssetKind::SttSenseVoice => {
                crate::asr::sensevoice::pick_model_file(dir).is_some()
                    && dir.join("tokens.txt").exists()
            }
            AssetKind::TtsKokoro => {
                (dir.join("model.int8.onnx").exists() || dir.join("model.onnx").exists())
                    && dir.join("voices.bin").exists()
                    && dir.join("tokens.txt").exists()
            }
        }
    }
}

/// Download + extract a SenseVoice variant. Idempotent — a second call with
/// the model already present is a no-op.
pub async fn download_variant<F>(variant: &str, on_progress: F) -> Result<()>
where
    F: FnMut(DownloadProgress) + Send,
{
    download_asset(AssetKind::SttSenseVoice, variant, on_progress).await
}

/// Generic asset downloader — handles both STT and TTS bundles.
///
/// `on_progress` is called from the async task that owns the download. It
/// must not block; channel-send + return is the expected pattern.
pub async fn download_asset<F>(kind: AssetKind, variant: &str, mut on_progress: F) -> Result<()>
where
    F: FnMut(DownloadProgress) + Send,
{
    let target_dir = model_dir_for_variant(variant);
    if kind.is_present(&target_dir) {
        on_progress(DownloadProgress {
            downloaded: 0,
            total: 0,
            bytes_per_sec: 0,
            stage: DownloadStage::Done,
        });
        return Ok(());
    }

    let cache = cache_dir();
    tokio::fs::create_dir_all(&cache)
        .await
        .map_err(|e| OtojiError::Provider(format!("cache_dir create failed: {e}")))?;

    let url = format!("{}/{variant}.tar.bz2", kind.release_base());
    let tarball = tarball_path(variant);
    let partial = tarball.with_extension("bz2.partial");
    // Clean any prior partial — we re-download from byte 0 for simplicity.
    let _ = tokio::fs::remove_file(&partial).await;

    on_progress(DownloadProgress {
        downloaded: 0,
        total: 0,
        bytes_per_sec: 0,
        stage: DownloadStage::Connecting,
    });

    let client = reqwest::Client::builder()
        .user_agent(concat!("otoji/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| OtojiError::Provider(format!("http client: {e}")))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| OtojiError::Provider(format!("GET {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(OtojiError::Provider(format!(
            "GET {url}: HTTP {}",
            resp.status()
        )));
    }
    let total = resp.content_length().unwrap_or(0);

    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|e| OtojiError::Provider(format!("create {}: {e}", partial.display())))?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let started = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| OtojiError::Provider(format!("stream: {e}")))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| OtojiError::Provider(format!("write: {e}")))?;
        downloaded += chunk.len() as u64;

        // Throttle UI updates to ~10 Hz.
        let now = std::time::Instant::now();
        if now.duration_since(last_emit) >= std::time::Duration::from_millis(100) {
            let dt = now.duration_since(last_emit).as_secs_f64().max(0.001);
            let rate = ((downloaded - last_bytes) as f64 / dt) as u64;
            on_progress(DownloadProgress {
                downloaded,
                total,
                bytes_per_sec: rate,
                stage: DownloadStage::Downloading,
            });
            last_emit = now;
            last_bytes = downloaded;
        }
    }
    file.flush()
        .await
        .map_err(|e| OtojiError::Provider(format!("flush: {e}")))?;
    drop(file);
    let _ = started; // silence unused warning when we drop the metric

    // Final download tick so the UI shows 100%.
    on_progress(DownloadProgress {
        downloaded,
        total: if total == 0 { downloaded } else { total },
        bytes_per_sec: 0,
        stage: DownloadStage::Downloading,
    });

    // Promote .partial → final and extract via system tar.
    tokio::fs::rename(&partial, &tarball)
        .await
        .map_err(|e| OtojiError::Provider(format!("rename: {e}")))?;

    on_progress(DownloadProgress {
        downloaded,
        total: if total == 0 { downloaded } else { total },
        bytes_per_sec: 0,
        stage: DownloadStage::Extracting,
    });

    let cache_str = cache.clone();
    let tarball_str = tarball.clone();
    let extract = tokio::task::spawn_blocking(move || {
        std::process::Command::new("tar")
            .arg("-xjf")
            .arg(&tarball_str)
            .arg("-C")
            .arg(&cache_str)
            .status()
    })
    .await
    .map_err(|e| OtojiError::Provider(format!("tar join: {e}")))?
    .map_err(|e| OtojiError::Provider(format!("tar spawn: {e}")))?;
    if !extract.success() {
        return Err(OtojiError::Provider(format!(
            "tar -xjf {} failed (exit {:?})",
            tarball.display(),
            extract.code()
        )));
    }
    let _ = tokio::fs::remove_file(&tarball).await;

    if !kind.is_present(&target_dir) {
        return Err(OtojiError::Provider(format!(
            "extracted but {} still missing required files",
            target_dir.display()
        )));
    }

    on_progress(DownloadProgress {
        downloaded,
        total: if total == 0 { downloaded } else { total },
        bytes_per_sec: 0,
        stage: DownloadStage::Done,
    });

    Ok(())
}

/// Returns the directory size for a downloaded variant (0 if absent).
pub fn variant_disk_size(variant: &str) -> u64 {
    let dir = model_dir_for_variant(variant);
    fn walk(p: &Path) -> u64 {
        let mut sum = 0u64;
        if let Ok(rd) = std::fs::read_dir(p) {
            for entry in rd.flatten() {
                let path = entry.path();
                if let Ok(md) = entry.metadata() {
                    if md.is_dir() {
                        sum += walk(&path);
                    } else {
                        sum += md.len();
                    }
                }
            }
        }
        sum
    }
    walk(&dir)
}
