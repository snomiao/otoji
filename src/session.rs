//! High-level push-based transcription session.
//!
//! Wraps the SenseVoice sliding-window architecture into a simple API
//! that downstream crates (like CapsLockX) can use without reimplementing
//! VAD, sentence detection, or buffer management.
//!
//! ```rust,no_run
//! use otoji::session::ListenSession;
//!
//! let mut session = ListenSession::new(Default::default())?;
//! // Push 16kHz mono f32 audio chunks:
//! session.push(&samples);
//! // Collect events:
//! for event in session.drain_events() {
//!     match event {
//!         otoji::core::AsrEvent::Partial { text, .. } => println!("... {text}"),
//!         otoji::core::AsrEvent::Final { text, .. } => println!("✓ {text}"),
//!         _ => {}
//!     }
//! }
//! // On end of audio:
//! session.flush();
//! ```

use crate::asr::sensevoice::{SenseVoice, SenseVoiceConfig};
use crate::asr::AsrProvider;
use crate::core::{AsrEvent, AudioChunk, AudioFormat};
use anyhow::Result;
use bytes::Bytes;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Configuration for a ListenSession.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub sensevoice: SenseVoiceConfig,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            sensevoice: SenseVoiceConfig::from_env(),
        }
    }
}

/// A push-based transcription session. Thread-safe (Send + Sync).
///
/// Internally runs the SenseVoice sliding-window decode loop on a
/// background tokio runtime. You push audio via [`push`] and collect
/// events via [`drain_events`].
pub struct ListenSession {
    audio_tx: mpsc::Sender<AudioChunk>,
    event_rx: std::sync::Mutex<mpsc::Receiver<AsrEvent>>,
    _runtime: tokio::runtime::Runtime,
}

impl ListenSession {
    /// Create a new session. Loads the SenseVoice model (first call may
    /// download ~228MB). The background worker starts immediately.
    pub fn new(config: SessionConfig) -> Result<Self> {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()?;

        let (audio_tx, audio_rx) = mpsc::channel(64);
        let (event_tx, event_rx) = mpsc::channel(128);

        let provider = Arc::new(SenseVoice::new(config.sensevoice));
        rt.spawn(async move {
            if let Err(e) = provider.run(audio_rx, event_tx).await {
                tracing::error!("session asr: {e}");
            }
        });

        Ok(Self {
            audio_tx,
            event_rx: std::sync::Mutex::new(event_rx),
            _runtime: rt,
        })
    }

    /// Push 16kHz mono f32 samples into the session.
    pub fn push(&self, samples: &[f32]) -> Result<()> {
        let pcm: Vec<u8> = samples
            .iter()
            .flat_map(|&s| {
                let i = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                i.to_le_bytes()
            })
            .collect();
        let chunk = AudioChunk::new(AudioFormat::PCM16K_MONO, Bytes::from(pcm));
        self.audio_tx
            .blocking_send(chunk)
            .map_err(|_| anyhow::anyhow!("session closed"))?;
        Ok(())
    }

    /// Drain all pending events (non-blocking). Returns an empty vec if
    /// no events are ready.
    pub fn drain_events(&self) -> Vec<AsrEvent> {
        let mut rx = self.event_rx.lock().unwrap();
        let mut events = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            events.push(ev);
        }
        events
    }

    /// Signal end of audio. Drops the audio sender so the provider flushes
    /// remaining audio and emits Closed. Blocks until all events drain.
    pub fn finish(self) -> Vec<AsrEvent> {
        // Drop audio_tx to signal EOF.
        drop(self.audio_tx);
        // Collect remaining events until Closed.
        let mut rx = self.event_rx.into_inner().unwrap();
        let mut events = Vec::new();
        while let Some(ev) = rx.blocking_recv() {
            let is_closed = matches!(ev, AsrEvent::Closed);
            events.push(ev);
            if is_closed {
                break;
            }
        }
        events
    }
}
