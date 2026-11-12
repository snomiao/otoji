// Wake word — opt-in (`wake_word` in config.json). The tray's own mic
// capture (overlay::pump_mic) is teed into an in-process keyword spotter
// (otoji::kws::WakeSpotter), so no second process opens the microphone.
// A detection starts a push-to-talk segment; tray.rs ends it after
// SILENCE_RELEASE of VAD silence (from the listen child's `vad` events), or
// at HOLD_CAP.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Mutex;
use std::time::Duration;

/// Safety cap: a stuck VAD can't pin a wake-started segment open forever.
pub const HOLD_CAP: Duration = Duration::from_millis(8000);
/// Continuous VAD silence that ends a wake-started segment.
pub const SILENCE_RELEASE: Duration = Duration::from_millis(1200);
/// After the wake, ignore silence this long (user hasn't started talking yet).
pub const POST_WAKE_GRACE: Duration = Duration::from_millis(600);

/// Mic PCM (16 kHz mono s16le) into the spotter thread; None = wake word off.
static TX: Mutex<Option<SyncSender<Vec<u8>>>> = Mutex::new(None);
/// Set by the spotter thread on a detection; drained by the main tick.
static WOKE: AtomicBool = AtomicBool::new(false);
/// Settings the running spotter was built with, to restart on change.
static RUNNING_WITH: Mutex<Option<(String, u32)>> = Mutex::new(None);
/// Model load failed for these settings — don't retry every tick.
static FAILED_WITH: Mutex<Option<(String, u32)>> = Mutex::new(None);

/// Tee one mic chunk to the spotter. Never blocks the mic pump.
pub fn feed(pcm: &[u8]) {
    if let Some(tx) = TX.lock().unwrap().as_ref() {
        let _ = tx.try_send(pcm.to_vec());
    }
}

/// True once per detection.
pub fn take_wake() -> bool {
    WOKE.swap(false, Ordering::AcqRel)
}

/// Start/stop/restart the spotter to match config. Cheap; call ~1/s.
pub fn sync(cfg: &otoji::config::OtojiConfig) {
    let want = cfg.wake_word.then(|| {
        (
            cfg.wake_keyword.trim().to_string(),
            cfg.wake_threshold.to_bits(),
        )
    });
    let mut running = RUNNING_WITH.lock().unwrap();
    if *running == want {
        return;
    }
    // Stop the current spotter (dropping the sender ends its thread).
    *TX.lock().unwrap() = None;
    *running = None;
    let Some(key) = want else {
        eprintln!("otoji-tray: wake word off");
        return;
    };
    if FAILED_WITH.lock().unwrap().as_ref() == Some(&key) {
        return;
    }
    let (tx, rx) = sync_channel::<Vec<u8>>(64);
    *TX.lock().unwrap() = Some(tx);
    *running = Some(key.clone());
    let (keyword, threshold) = (key.0.clone(), f32::from_bits(key.1));
    std::thread::Builder::new()
        .name("wake-word".into())
        .spawn(move || {
            let model = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(anyhow::Error::from)
                .and_then(|rt| rt.block_on(otoji::kws::ensure_kws_model()));
            let spotter = model.and_then(|dir| {
                otoji::kws::WakeSpotter::new(&dir, "", Some(&keyword), threshold, 1500)
            });
            let mut spotter = match spotter {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("otoji-tray: wake word unavailable: {e:#}");
                    *FAILED_WITH.lock().unwrap() = Some(key);
                    *RUNNING_WITH.lock().unwrap() = None;
                    *TX.lock().unwrap() = None;
                    return;
                }
            };
            eprintln!("otoji-tray: wake word on ({})", spotter.keywords_file);
            for pcm in rx {
                if let Some(k) = spotter.feed(&otoji::kws::pcm16_bytes_to_f32(&pcm)) {
                    eprintln!("otoji-tray: wake word {k:?}");
                    WOKE.store(true, Ordering::Release);
                }
            }
        })
        .ok();
}
