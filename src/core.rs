//! otoji-core — shared types and traits for the otoji speech stack.

use bytes::Bytes;
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// PCM audio format used everywhere in the pipeline.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
}

impl AudioFormat {
    pub const PCM16K_MONO: Self = Self {
        sample_rate: 16_000,
        channels: 1,
        bits_per_sample: 16,
    };

    pub fn bytes_per_sample(&self) -> usize {
        (self.bits_per_sample as usize / 8) * self.channels as usize
    }
}

/// A chunk of raw PCM audio.
#[derive(Debug, Clone)]
pub struct AudioChunk {
    pub format: AudioFormat,
    pub pcm: Bytes,
}

impl AudioChunk {
    pub fn new(format: AudioFormat, pcm: impl Into<Bytes>) -> Self {
        Self {
            format,
            pcm: pcm.into(),
        }
    }
}

/// A single recognised word with optional timing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub text: String,
    pub start_ms: Option<u32>,
    pub end_ms: Option<u32>,
}

/// Streaming ASR event emitted by every `AsrProvider`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AsrEvent {
    /// Connection established.
    Open,
    /// Live partial hypothesis (may be revised).
    Partial { seg_id: u64, text: String },
    /// Confirmed segment, will not change.
    Final {
        seg_id: u64,
        text: String,
        words: Vec<Word>,
        /// Raw PCM audio for this segment (16kHz mono f32, -1.0..1.0).
        /// Preserved for multimodal polish (e.g. Gemini). `None` when the
        /// ASR provider doesn't retain original audio (cloud providers).
        #[serde(skip)]
        audio: Option<Vec<f32>>,
    },
    /// Non-fatal status message (device picked, model downloading, …).
    /// Surfaced in the TUI header rather than the transcript body.
    Status { message: String },
    /// Provider closed cleanly.
    Closed,
    /// Provider-side error message (does not necessarily terminate the stream).
    Error { message: String },
    /// Push-to-talk: live partial while segment is being held.
    PttPartial { text: String },
    /// Push-to-talk: final transcription of the held segment.
    PttFinal { text: String },
}

#[derive(Debug, Error)]
pub enum OtojiError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("auth: {0}")]
    Auth(String),
    #[error("transport: {0}")]
    Transport(String),
    #[error("decode: {0}")]
    Decode(String),
    #[error("provider: {0}")]
    Provider(String),
    #[error("config: {0}")]
    Config(String),
}

pub type Result<T> = std::result::Result<T, OtojiError>;
