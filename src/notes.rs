//! Notes store — append-only JSONL of finalized transcripts, plus
//! per-segment artifacts (audio + SRT + polished markdown) in the same
//! data directory.
//!
//! Layout (under `data_dir()`):
//!   notes.jsonl                          — append-only index
//!   2026-04-17T12-34-56-789.wav          — 16 kHz mono segment audio
//!   2026-04-17T12-34-56-789.srt          — single-cue subtitle
//!   2026-04-17T12-34-56-789.md           — polished text (written async)
//!
//! Path of `data_dir()`:
//!   - macOS:   `~/Library/Application Support/otoji`
//!   - Linux:   `$XDG_DATA_HOME/otoji` or `~/.local/share/otoji`
//!   - Windows: `%APPDATA%/otoji`
//!   - Override with `OTOJI_DATA_DIR`.

use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    /// Unix epoch milliseconds.
    pub ts: i64,
    /// Filename stem shared by the `.wav`/`.srt`/`.md` siblings.
    pub stem: String,
    /// `"final"` (VAD segment) or `"ptt_final"` (push-to-talk).
    pub kind: String,
    pub text: String,
    /// BCP-47 language code if known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<String>,
    /// Duration of the segment in milliseconds, if audio was attached.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u32>,
}

impl Note {
    pub fn new(kind: &str, text: impl Into<String>, lang: Option<String>) -> Self {
        let ts = chrono::Utc::now().timestamp_millis();
        Self {
            ts,
            stem: stem_from_ts(ts),
            kind: kind.into(),
            text: text.into(),
            lang,
            duration_ms: None,
        }
    }
}

fn stem_from_ts(ts_ms: i64) -> String {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ts_ms)
        .unwrap_or_else(chrono::Utc::now);
    dt.format("%Y-%m-%dT%H-%M-%S-%3f").to_string()
}

pub fn data_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("OTOJI_DATA_DIR") {
        return PathBuf::from(custom);
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join("Library/Application Support/otoji");
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return PathBuf::from(appdata).join("otoji");
        }
    }
    if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(xdg).join("otoji");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".local/share/otoji");
    }
    PathBuf::from(".")
}

pub fn notes_path() -> PathBuf {
    data_dir().join("notes.jsonl")
}

pub fn artifact_path(stem: &str, ext: &str) -> PathBuf {
    data_dir().join(format!("{stem}.{ext}"))
}

fn ensure_dir() -> std::io::Result<()> {
    std::fs::create_dir_all(data_dir())
}

/// Append a single note to `notes.jsonl`. Best-effort.
pub fn append(note: &Note) {
    if let Err(e) = try_append(note) {
        tracing::warn!("notes: append failed: {e}");
    }
}

fn try_append(note: &Note) -> std::io::Result<()> {
    ensure_dir()?;
    let line = serde_json::to_string(note)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(notes_path())?;
    writeln!(f, "{line}")?;
    Ok(())
}

/// Save a 16 kHz mono PCM-f32 segment as `<stem>.wav`. Best-effort.
pub fn save_wav(stem: &str, samples: &[f32], sample_rate: u32) {
    if let Err(e) = try_save_wav(stem, samples, sample_rate) {
        tracing::warn!("notes: save_wav({stem}) failed: {e}");
    }
}

fn try_save_wav(stem: &str, samples: &[f32], sample_rate: u32) -> std::io::Result<()> {
    ensure_dir()?;
    let path = artifact_path(stem, "wav");
    let byte_rate: u32 = sample_rate * 2;
    let data_len: u32 = (samples.len() * 2) as u32;
    let mut f = File::create(&path)?;
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
    for &s in samples {
        let i = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        f.write_all(&i.to_le_bytes())?;
    }
    Ok(())
}

/// Save a single-cue SRT alongside the wav. `duration_ms` may be 0 if
/// unknown — the cue still serves as a textual sidecar.
pub fn save_srt(stem: &str, text: &str, duration_ms: u32) {
    if let Err(e) = try_save_srt(stem, text, duration_ms) {
        tracing::warn!("notes: save_srt({stem}) failed: {e}");
    }
}

fn try_save_srt(stem: &str, text: &str, duration_ms: u32) -> std::io::Result<()> {
    ensure_dir()?;
    let path = artifact_path(stem, "srt");
    let mut f = File::create(&path)?;
    writeln!(f, "1")?;
    writeln!(f, "{} --> {}", srt_time(0), srt_time(duration_ms))?;
    writeln!(f, "{}", text.trim())?;
    writeln!(f)?;
    Ok(())
}

fn srt_time(ms: u32) -> String {
    let h = ms / 3_600_000;
    let m = (ms / 60_000) % 60;
    let s = (ms / 1000) % 60;
    let ms_part = ms % 1000;
    format!("{h:02}:{m:02}:{s:02},{ms_part:03}")
}

/// Detached-spawn ffmpeg to mux `<stem>.wav` + `<stem>.srt` into
/// `<stem>.webm` (Opus + WebVTT). Originals untouched. No-op if ffmpeg
/// is missing or the output already exists. Fire-and-forget.
pub fn mux_webm(stem: &str) {
    let wav = artifact_path(stem, "wav");
    let srt = artifact_path(stem, "srt");
    let out = artifact_path(stem, "webm");
    if out.exists() || !wav.exists() || !srt.exists() {
        return;
    }
    let _ = std::process::Command::new("ffmpeg")
        .args(["-loglevel", "error", "-y", "-i"])
        .arg(&wav)
        .arg("-i")
        .arg(&srt)
        .args(["-c:a", "libopus", "-b:a", "24k", "-c:s", "webvtt"])
        .arg(&out)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

/// Write the polished version as `<stem>.md`. Best-effort.
pub fn save_polish_md(stem: &str, polished: &str) {
    if let Err(e) = try_save_md(stem, polished) {
        tracing::warn!("notes: save_polish_md({stem}) failed: {e}");
    }
}

fn try_save_md(stem: &str, polished: &str) -> std::io::Result<()> {
    ensure_dir()?;
    let path = artifact_path(stem, "md");
    std::fs::write(&path, polished.trim())?;
    Ok(())
}

/// Read the most recent `n` notes (newest-first). Best-effort.
pub fn recent(n: usize) -> Vec<Note> {
    try_recent(n).unwrap_or_default()
}

fn try_recent(n: usize) -> std::io::Result<Vec<Note>> {
    let path = notes_path();
    if !Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let f = File::open(&path)?;
    let reader = BufReader::new(f);
    let mut all: Vec<Note> = reader
        .lines()
        .filter_map(|l| l.ok())
        .filter_map(|l| serde_json::from_str(&l).ok())
        .collect();
    let take = n.min(all.len());
    let start = all.len() - take;
    let tail: Vec<Note> = all.drain(start..).collect();
    Ok(tail.into_iter().rev().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn with_tmp_dir<F: FnOnce()>(f: F) {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!(
            "otoji-notes-{}-{}",
            std::process::id(),
            rand_suffix()
        ));
        let _ = std::fs::remove_dir_all(&tmp);
        std::env::set_var("OTOJI_DATA_DIR", &tmp);
        f();
        let _ = std::fs::remove_dir_all(&tmp);
        std::env::remove_var("OTOJI_DATA_DIR");
    }

    fn rand_suffix() -> String {
        format!(
            "{:x}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        )
    }

    #[test]
    fn append_and_recent_roundtrip() {
        with_tmp_dir(|| {
            for i in 0..5 {
                append(&Note::new("final", format!("hello {i}"), Some("en".into())));
            }
            let last3 = recent(3);
            assert_eq!(last3.len(), 3);
            assert_eq!(last3[0].text, "hello 4");
            assert_eq!(last3[2].text, "hello 2");
            assert_eq!(last3[0].lang.as_deref(), Some("en"));
        });
    }

    #[test]
    fn recent_empty_when_no_file() {
        with_tmp_dir(|| {
            assert!(recent(10).is_empty());
        });
    }

    #[test]
    fn artifacts_share_stem() {
        with_tmp_dir(|| {
            let n = Note::new("ptt_final", "hi there", None);
            save_wav(&n.stem, &[0.1, -0.1, 0.0], 16_000);
            save_srt(&n.stem, &n.text, 1500);
            save_polish_md(&n.stem, "Hi there.");
            append(&n);
            assert!(artifact_path(&n.stem, "wav").exists());
            assert!(artifact_path(&n.stem, "srt").exists());
            assert!(artifact_path(&n.stem, "md").exists());
            let r = recent(1);
            assert_eq!(r[0].stem, n.stem);
        });
    }

    #[test]
    fn srt_format_is_valid() {
        assert_eq!(srt_time(0), "00:00:00,000");
        assert_eq!(srt_time(3_661_500), "01:01:01,500");
    }
}
