//! 音字 (otoji) — realtime speech ⇄ text.
//!
//! Modules mirror the original workspace layout:
//! - [`core`]: shared types (`AudioFormat`, `AsrEvent`, error type).
//! - [`audio`]: mic + file PCM sources.
//! - [`asr`]: streaming ASR providers (SenseVoice / iFlytek RTASR).
//! - [`tts`]: TTS providers (iFlytek).
//! - [`polish`]: LLM-based final-segment polish layer.

pub mod asr;
pub mod audio;
pub mod config;
pub mod core;
pub mod assistant;
pub mod kws;
pub mod notes;
pub mod polish;
pub mod session;
pub mod slug;
pub mod tts;

#[cfg(feature = "node")]
mod napi;
