//! Native macOS speech (`/usr/bin/say`) as a TTS provider: free, offline.
//!
//! `say` renders to a temporary WAV file and the PCM is streamed from there.
//! It always gets `-o`, so nothing ever plays on the speakers from here.

use super::{TtsAudioTx, TtsProvider};
use crate::core::{OtojiError, Result};
use async_trait::async_trait;
use bytes::Bytes;

const SAMPLE_RATE: u32 = 16_000;
/// 100 ms of 16-bit mono per audio chunk.
const CHUNK_BYTES: usize = SAMPLE_RATE as usize / 10 * 2;

pub struct NativeTts {
    /// `say -v` voice. None = the system default voice.
    voice: Option<String>,
}

impl NativeTts {
    /// Fails off macOS, where there is no `say`. `OTOJI_NATIVE_TTS_VOICE`
    /// picks a voice.
    pub fn from_env() -> Result<Self> {
        if !cfg!(target_os = "macos") {
            return Err(OtojiError::Config(
                "native TTS (`say`) is macOS only".into(),
            ));
        }
        Ok(Self {
            voice: std::env::var("OTOJI_NATIVE_TTS_VOICE")
                .ok()
                .filter(|v| !v.trim().is_empty()),
        })
    }
}

/// Removes the temp files when synthesis ends, however it ends.
struct TempFiles(Vec<std::path::PathBuf>);

impl Drop for TempFiles {
    fn drop(&mut self) {
        for p in &self.0 {
            let _ = std::fs::remove_file(p);
        }
    }
}

/// Raw PCM bytes out of the WAV `say` wrote.
fn read_pcm(path: &std::path::Path) -> Result<Vec<u8>> {
    let mut r = hound::WavReader::open(path)
        .map_err(|e| OtojiError::Provider(format!("say output: {e}")))?;
    let mut pcm = Vec::with_capacity(r.len() as usize * 2);
    for s in r.samples::<i16>() {
        let s = s.map_err(|e| OtojiError::Provider(format!("say output: {e}")))?;
        pcm.extend_from_slice(&s.to_le_bytes());
    }
    Ok(pcm)
}

#[async_trait]
impl TtsProvider for NativeTts {
    fn name(&self) -> &'static str {
        "native"
    }

    fn sample_rate(&self) -> u32 {
        SAMPLE_RATE
    }

    async fn synthesize(&self, text: &str, audio: TtsAudioTx) -> Result<()> {
        let stem = std::env::temp_dir().join(format!("otoji-say-{}", uuid::Uuid::new_v4()));
        let input = stem.with_extension("txt");
        let wav = stem.with_extension("wav");
        let _cleanup = TempFiles(vec![input.clone(), wav.clone()]);
        // Text goes through a file so one starting with `-` can't read as a flag.
        tokio::fs::write(&input, text)
            .await
            .map_err(|e| OtojiError::Provider(format!("say input: {e}")))?;

        let mut cmd = tokio::process::Command::new("say");
        cmd.arg("-o")
            .arg(&wav)
            .arg("--data-format=LEI16@16000")
            .arg("-f")
            .arg(&input);
        if let Some(v) = &self.voice {
            cmd.arg("-v").arg(v);
        }
        let out = cmd
            .output()
            .await
            .map_err(|e| OtojiError::Provider(format!("say: {e}")))?;
        if !out.status.success() {
            return Err(OtojiError::Provider(format!(
                "say {}: {}",
                out.status,
                String::from_utf8_lossy(&out.stderr).trim()
            )));
        }

        for chunk in read_pcm(&wav)?.chunks(CHUNK_BYTES) {
            if audio.send(Bytes::copy_from_slice(chunk)).await.is_err() {
                break; // receiver gone
            }
        }
        Ok(())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    /// Renders to a temp file via `say -o`; nothing reaches the speakers.
    #[tokio::test]
    async fn synthesizes_pcm_from_text_that_looks_like_a_flag() {
        let tts = NativeTts { voice: None };
        let (tx, mut rx) = tokio::sync::mpsc::channel(64);
        let task = tokio::spawn(async move { tts.synthesize("-v water bottle", tx).await });
        let mut bytes = 0;
        while let Some(chunk) = rx.recv().await {
            assert!(chunk.len() <= CHUNK_BYTES);
            bytes += chunk.len();
        }
        task.await.unwrap().unwrap();
        // Over 0.1 s of 16-bit mono audio, on a whole sample.
        assert!(bytes > CHUNK_BYTES, "only {bytes} bytes");
        assert_eq!(bytes % 2, 0);
    }
}
