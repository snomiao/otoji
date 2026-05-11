//! otoji-audio — audio sources (mic / file) emitting `AudioChunk`s.

pub mod file;
pub mod mic;
#[cfg(target_os = "macos")]
pub mod vpio;

use crate::core::AudioChunk;
use tokio::sync::mpsc;

/// Receiver side of an audio source. Sources push `AudioChunk`s and close when done.
pub type AudioRx = mpsc::Receiver<AudioChunk>;
pub type AudioTx = mpsc::Sender<AudioChunk>;

pub fn channel(buffer: usize) -> (AudioTx, AudioRx) {
    mpsc::channel(buffer)
}
