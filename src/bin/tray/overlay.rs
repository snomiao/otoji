// Floating caption overlay for `otoji-tray`.
//
// otoji-tray owns the `otoji listen --plain` child: a reader thread parses its
// JSON event stream into `CAPTION`, and the main-thread refresh tick calls
// [`tick`] to mirror that state into a borderless, click-through, always-on-top
// panel at the bottom of the main screen. External hotkey front-ends (e.g.
// CapsLockX) only need to send `PTT_START` / `PTT_END` / `STANDBY` / `RESUME`
// lines to [`control_socket_path`] — mic, STT and display all stay in otoji.

use super::{cls, msg0, msg1_ptr, nsstring, objc_msgSend, sel, NSRect, PTT_HELD};
use std::ffi::c_void;
use std::io::BufRead;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a finished caption stays on screen after the last event.
const LINGER: Duration = Duration::from_secs(4);

struct Caption {
    text: String,
    /// `true` while the text is a live partial that may still change.
    live: bool,
    updated: Option<Instant>,
    /// Bumped on every change so `tick` can skip redundant AppKit calls.
    rev: u64,
}

static CAPTION: Mutex<Caption> = Mutex::new(Caption {
    text: String::new(),
    live: false,
    updated: None,
    rev: 0,
});
static LISTEN_CHILD: Mutex<Option<std::process::Child>> = Mutex::new(None);

// Live pipeline stats for the tray menu (reset on each listen start).
/// PCM bytes the mic stage has delivered to listen (16 kHz s16le mono).
static MIC_BYTES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Recent mic peak (0..32767), decaying, for the menu's level meter.
static MIC_LEVEL: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static STT_PARTIALS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static STT_FINALS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static STT_CHARS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub struct Stats {
    pub mic_bytes: u64,
    pub mic_level: u32,
    pub partials: u64,
    pub finals: u64,
    /// Characters across all final sentences.
    pub chars: u64,
    /// Current caption and whether it is a still-changing partial.
    pub text: String,
    pub live: bool,
}

/// Whether the tray-owned listen child is alive.
pub fn is_listening() -> bool {
    LISTEN_CHILD
        .lock()
        .unwrap()
        .as_mut()
        .is_some_and(|c| matches!(c.try_wait(), Ok(None)))
}

pub fn stats() -> Stats {
    use std::sync::atomic::Ordering::Relaxed;
    let c = CAPTION.lock().unwrap();
    Stats {
        mic_bytes: MIC_BYTES.load(Relaxed),
        mic_level: MIC_LEVEL.load(Relaxed),
        partials: STT_PARTIALS.load(Relaxed),
        finals: STT_FINALS.load(Relaxed),
        chars: STT_CHARS.load(Relaxed),
        text: c.text.clone(),
        live: c.live,
    }
}
/// The user wants otoji listening (cleared only by stop_listen), so a child
/// that dies on its own gets restarted by `supervise`.
static WANT_LISTEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static LAST_START: Mutex<Option<Instant>> = Mutex::new(None);

static PANEL: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
static LABEL: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
/// (rev, visible) last pushed to AppKit.
static SHOWN: Mutex<(u64, bool)> = Mutex::new((u64::MAX, false));

/// Control socket the tray-owned listen child binds (see `--ptt-control-socket`).
pub fn control_socket_path() -> std::path::PathBuf {
    otoji::notes::data_dir().join("ctrl.sock")
}

/// Prefer the `otoji` binary next to this executable (a fresh `cargo build`
/// or an installed bundle), falling back to PATH.
fn otoji_exe() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("otoji")))
        .filter(|p| p.exists())
        .unwrap_or_else(|| "otoji".into())
}

fn set_caption(text: &str, live: bool) {
    let mut c = CAPTION.lock().unwrap();
    c.text = text.to_string();
    c.live = live;
    c.updated = Some(Instant::now());
    c.rev += 1;
}

/// Briefly show a status line (e.g. "otoji off") in the caption panel.
pub fn notify(text: &str) {
    set_caption(text, false);
}

/// 44-byte WAV header for an endless 16 kHz mono s16le stream (same layout
/// `otoji mic` writes; sizes are 0xFFFFFFFE because the length is unknown).
fn streaming_wav_header() -> [u8; 44] {
    let (rate, channels, bits) = (16_000u32, 1u16, 16u16);
    let mut h = [0u8; 44];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&0xFFFF_FFFEu32.to_le_bytes());
    h[8..16].copy_from_slice(b"WAVEfmt ");
    h[16..20].copy_from_slice(&16u32.to_le_bytes());
    h[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM
    h[22..24].copy_from_slice(&channels.to_le_bytes());
    h[24..28].copy_from_slice(&rate.to_le_bytes());
    h[28..32].copy_from_slice(&(rate * (channels * bits / 8) as u32).to_le_bytes());
    h[32..34].copy_from_slice(&(channels * bits / 8).to_le_bytes());
    h[34..36].copy_from_slice(&bits.to_le_bytes());
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&0xFFFF_FFFEu32.to_le_bytes());
    h
}

/// Capture the mic in THIS process and stream it as WAV into `listen -`.
/// macOS grants the Microphone to the app bundle (otoji-tray); a spawned
/// `otoji listen` opening the mic itself was fed digital silence, so the
/// process that holds the grant does the capture. Ends when the child exits.
fn pump_mic(mut stdin: std::process::ChildStdin) {
    use std::io::Write;
    let (tx, mut rx) = otoji::audio::channel(64);
    // cpal streams are !Send on macOS: create and hold it on this thread.
    let _stream = match otoji::audio::mic::start(None, 20, tx) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("otoji-tray: mic capture failed: {e:#}");
            return;
        }
    };
    eprintln!("otoji-tray: mic capture started");
    if stdin.write_all(&streaming_wav_header()).is_err() {
        return;
    }
    // Per 5 s window, classify the level and log only when the class
    // changes, so "no captions" can be told apart from "mic delivers
    // silence" without growing tray.log forever.
    let (mut peak, mut sum_sq, mut n) = (0i32, 0f64, 0u64);
    let mut last_report = Instant::now();
    let mut last_class = "";
    while let Some(chunk) = rx.blocking_recv() {
        let mut chunk_peak = 0u32;
        for s in chunk.pcm.chunks_exact(2) {
            let v = i16::from_le_bytes([s[0], s[1]]) as i32;
            chunk_peak = chunk_peak.max(v.unsigned_abs());
            peak = peak.max(v.abs());
            sum_sq += (v as f64) * (v as f64);
            n += 1;
        }
        {
            use std::sync::atomic::Ordering::Relaxed;
            MIC_BYTES.fetch_add(chunk.pcm.len() as u64, Relaxed);
            // Fast attack, slow release (~25%/frame) so the meter is readable.
            let prev = MIC_LEVEL.load(Relaxed);
            MIC_LEVEL.store(chunk_peak.max(prev - prev / 4), Relaxed);
        }
        if last_report.elapsed() >= Duration::from_secs(5) {
            let rms = if n > 0 { (sum_sq / n as f64).sqrt() } else { 0.0 };
            // Denoised output idles at peak 0..~10, so no separate
            // digital-silence class (listen warns about all-zero input).
            let class = if peak < 1000 { "quiet" } else { "voice" };
            if class != last_class {
                eprintln!("otoji-tray: mic {class} (peak={peak} rms={rms:.1} of 32767)");
                last_class = class;
            }
            (peak, sum_sq, n) = (0, 0.0, 0);
            last_report = Instant::now();
        }
        if stdin.write_all(&chunk.pcm).is_err() {
            break; // listen exited
        }
    }
    eprintln!("otoji-tray: mic capture stopped");
}

/// Spawn `otoji listen - --plain`, feed it the tray's own mic capture, and
/// pipe its stdout events into the overlay. Returns false when the spawn failed.
pub fn start_listen() -> bool {
    let mut guard = LISTEN_CHILD.lock().unwrap();
    if let Some(child) = guard.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return true; // already running
        }
    }
    let sock = control_socket_path();
    if let Some(dir) = sock.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let log = std::fs::File::create(otoji::notes::data_dir().join("listen.log"))
        .map(std::process::Stdio::from)
        .unwrap_or_else(|_| std::process::Stdio::null());
    let spawned = std::process::Command::new(otoji_exe())
        .arg("listen")
        .arg("-")
        .arg("--plain")
        .arg("--ptt-control-socket")
        .arg(&sock)
        // Speech-to-text only: never let this child play audio.
        .env("OTOJI_STT_ONLY", "1")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(log)
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => {
            eprintln!("otoji-tray: failed to spawn otoji listen: {e}");
            return false;
        }
    };
    let stdout = child.stdout.take();
    if let Some(stdin) = child.stdin.take() {
        std::thread::Builder::new()
            .name("mic-pump".into())
            .spawn(move || pump_mic(stdin))
            .ok();
    }
    *guard = Some(child);
    drop(guard);
    WANT_LISTEN.store(true, Ordering::Release);
    for c in [&MIC_BYTES, &STT_PARTIALS, &STT_FINALS, &STT_CHARS] {
        c.store(0, Ordering::Relaxed);
    }
    *LAST_START.lock().unwrap() = Some(Instant::now());
    if let Some(out) = stdout {
        std::thread::Builder::new()
            .name("listen-events".into())
            .spawn(move || read_events(out))
            .ok();
    }
    eprintln!(
        "otoji-tray: listen started (control socket {})",
        control_socket_path().display()
    );
    notify("otoji on — Fn+/ or ⌥+Caps Lock turns it off");
    true
}

/// Kill the tray-owned listen child, if any. Returns true if one was running.
pub fn stop_listen() -> bool {
    WANT_LISTEN.store(false, Ordering::Release);
    let Some(mut child) = LISTEN_CHILD.lock().unwrap().take() else {
        return false;
    };
    let _ = child.kill();
    let _ = child.wait();
    true
}

/// Restart the listen child if it exited while the user still wants it on
/// (at most once per 10 s, so a crash loop can't spin). Logs the exit status.
pub fn supervise() {
    if !WANT_LISTEN.load(Ordering::Acquire) {
        return;
    }
    let status = {
        let mut guard = LISTEN_CHILD.lock().unwrap();
        match guard.as_mut().map(|c| c.try_wait()) {
            Some(Ok(Some(status))) => {
                guard.take();
                Some(status)
            }
            Some(Ok(None)) => return, // still running
            Some(Err(_)) | None => None,
        }
    };
    if let Some(status) = status {
        eprintln!("otoji-tray: listen exited unexpectedly ({status})");
    }
    let recent = LAST_START.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_secs(10));
    if !recent {
        eprintln!("otoji-tray: restarting listen");
        start_listen();
    }
}

/// Every listen event, timestamped, for diagnosing "no captions". Truncated
/// at each listen start and once it passes `EVENTS_LOG_MAX`.
fn events_log_path() -> std::path::PathBuf {
    otoji::notes::data_dir().join("events.log")
}
const EVENTS_LOG_MAX: u64 = 4 * 1024 * 1024;

fn read_events(out: std::process::ChildStdout) {
    use std::io::Write;
    let open_log = || std::fs::File::create(events_log_path()).ok();
    let mut log = open_log();
    for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
        if let Some(f) = log.as_mut() {
            let ts = chrono::Local::now().format("%H:%M:%S%.3f");
            let _ = writeln!(f, "{ts} {line}");
            if f.metadata().map(|m| m.len() > EVENTS_LOG_MAX).unwrap_or(false) {
                log = open_log();
            }
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let text = v.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
        match kind {
            // listen saw only all-zero samples: macOS is feeding silence, so
            // the mic permission is missing or stale. Say so on screen.
            "status"
                if v
                    .get("message")
                    .and_then(|m| m.as_str())
                    .is_some_and(|m| m.starts_with("mic: all-zero samples")) =>
            {
                set_caption(
                    "⚠ Microphone is silent — allow otoji in Privacy & Security → Microphone",
                    false,
                )
            }
            "partial" | "ptt_partial" if !text.is_empty() => {
                STT_PARTIALS.fetch_add(1, Ordering::Relaxed);
                set_caption(text, true)
            }
            "final" | "ptt_final" | "ptt_upgrade" | "ptt_translated" if !text.is_empty() => {
                if matches!(kind, "final" | "ptt_final") {
                    STT_FINALS.fetch_add(1, Ordering::Relaxed);
                    STT_CHARS.fetch_add(text.chars().count() as u64, Ordering::Relaxed);
                }
                set_caption(text, false)
            }
            "error" => {
                if let Some(m) = v.get("message").and_then(|m| m.as_str()) {
                    set_caption(&format!("⚠ {m}"), false);
                }
            }
            _ => {}
        }
    }
    eprintln!("otoji-tray: listen event stream closed");
}

unsafe fn msg_bool(obj: *mut c_void, s: *mut c_void, v: bool) {
    let f: extern "C" fn(*mut c_void, *mut c_void, bool) = std::mem::transmute(objc_msgSend as *const ());
    f(obj, s, v)
}
pub unsafe fn msg_i64(obj: *mut c_void, s: *mut c_void, v: i64) {
    let f: extern "C" fn(*mut c_void, *mut c_void, i64) = std::mem::transmute(objc_msgSend as *const ());
    f(obj, s, v)
}
unsafe fn msg_f64(obj: *mut c_void, s: *mut c_void, v: f64) {
    let f: extern "C" fn(*mut c_void, *mut c_void, f64) = std::mem::transmute(objc_msgSend as *const ());
    f(obj, s, v)
}
unsafe fn msg_rect(obj: *mut c_void, s: *mut c_void, r: NSRect) {
    let f: extern "C" fn(*mut c_void, *mut c_void, NSRect) = std::mem::transmute(objc_msgSend as *const ());
    f(obj, s, r)
}
unsafe fn white(w: f64, a: f64) -> *mut c_void {
    let f: extern "C" fn(*mut c_void, *mut c_void, f64, f64) -> *mut c_void =
        std::mem::transmute(objc_msgSend as *const ());
    f(cls(b"NSColor\0"), sel(b"colorWithWhite:alpha:\0"), w, a)
}

/// Bottom-centre frame on the main screen's visible area.
unsafe fn panel_frame() -> NSRect {
    let screen = msg0(cls(b"NSScreen\0"), sel(b"mainScreen\0"));
    let vis = if screen.is_null() {
        NSRect { x: 0.0, y: 0.0, w: 1440.0, h: 900.0 }
    } else {
        let f: extern "C" fn(*mut c_void, *mut c_void) -> NSRect =
            std::mem::transmute(objc_msgSend as *const ());
        f(screen, sel(b"visibleFrame\0"))
    };
    let w = (vis.w - 80.0).min(960.0);
    let h = 84.0;
    NSRect { x: vis.x + (vis.w - w) / 2.0, y: vis.y + 64.0, w, h }
}

/// Create the (hidden) overlay panel. Main thread only.
pub unsafe fn init() {
    if !PANEL.load(Ordering::Acquire).is_null() {
        return;
    }
    let frame = panel_frame();
    let panel = msg0(cls(b"NSPanel\0"), sel(b"alloc\0"));
    // borderless (0) | nonactivatingPanel (1 << 7)
    let f: extern "C" fn(*mut c_void, *mut c_void, NSRect, u64, u64, bool) -> *mut c_void =
        std::mem::transmute(objc_msgSend as *const ());
    let panel = f(
        panel,
        sel(b"initWithContentRect:styleMask:backing:defer:\0"),
        frame,
        1 << 7,
        2, // NSBackingStoreBuffered
        false,
    );
    if panel.is_null() {
        eprintln!("otoji-tray: overlay panel init failed");
        return;
    }
    msg_bool(panel, sel(b"setOpaque:\0"), false);
    msg1_ptr(panel, sel(b"setBackgroundColor:\0"), msg0(cls(b"NSColor\0"), sel(b"clearColor\0")));
    msg_bool(panel, sel(b"setHasShadow:\0"), false);
    msg_bool(panel, sel(b"setIgnoresMouseEvents:\0"), true);
    msg_bool(panel, sel(b"setReleasedWhenClosed:\0"), false);
    msg_bool(panel, sel(b"setHidesOnDeactivate:\0"), false);
    msg_i64(panel, sel(b"setLevel:\0"), 25); // NSStatusWindowLevel
    // canJoinAllSpaces | stationary | fullScreenAuxiliary | ignoresCycle
    msg_i64(panel, sel(b"setCollectionBehavior:\0"), 1 | 16 | 256 | 64);
    // Hidden from screenshots / screen sharing unless the user opted in.
    let sharing = if otoji::config::load().overlay_sharing { 1 } else { 0 };
    msg_i64(panel, sel(b"setSharingType:\0"), sharing);

    let content = msg0(panel, sel(b"contentView\0"));
    msg_bool(content, sel(b"setWantsLayer:\0"), true);
    let layer = msg0(content, sel(b"layer\0"));
    if !layer.is_null() {
        let cg = msg0(white(0.0, 0.62), sel(b"CGColor\0"));
        msg1_ptr(layer, sel(b"setBackgroundColor:\0"), cg);
        msg_f64(layer, sel(b"setCornerRadius:\0"), 14.0);
    }

    let label = msg1_ptr(cls(b"NSTextField\0"), sel(b"labelWithString:\0"), nsstring(""));
    msg_rect(label, sel(b"setFrame:\0"), NSRect { x: 18.0, y: 10.0, w: frame.w - 36.0, h: frame.h - 20.0 });
    msg1_ptr(label, sel(b"setTextColor:\0"), white(1.0, 1.0));
    let font = {
        let f: extern "C" fn(*mut c_void, *mut c_void, f64) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls(b"NSFont\0"), sel(b"systemFontOfSize:\0"), 24.0)
    };
    msg1_ptr(label, sel(b"setFont:\0"), font);
    msg_i64(label, sel(b"setAlignment:\0"), 1); // NSTextAlignmentCenter
    msg_i64(label, sel(b"setMaximumNumberOfLines:\0"), 2);
    msg_i64(label, sel(b"setLineBreakMode:\0"), 3); // truncate head: keep the newest words
    msg_i64(label, sel(b"setAutoresizingMask:\0"), 2 | 16); // width + height sizable
    msg1_ptr(content, sel(b"addSubview:\0"), label);

    PANEL.store(panel, Ordering::Release);
    LABEL.store(label, Ordering::Release);
}

/// Mirror `CAPTION` into the panel. Called from the main-thread refresh tick.
pub fn tick() {
    let panel = PANEL.load(Ordering::Acquire);
    let label = LABEL.load(Ordering::Acquire);
    if panel.is_null() || label.is_null() {
        return;
    }
    let held = PTT_HELD.load(Ordering::Relaxed);
    let (rev, text, visible) = {
        let c = CAPTION.lock().unwrap();
        // A partial can be orphaned if listen dies mid-utterance, so it expires too.
        let ttl = if c.live { LINGER * 4 } else { LINGER };
        let fresh = c.updated.is_some_and(|t| t.elapsed() < ttl);
        let text = if held && (c.text.is_empty() || !c.live) {
            "● …".to_string()
        } else {
            c.text.clone()
        };
        // Fold `held` into rev so the "● …" placeholder appears/disappears.
        (c.rev * 2 + held as u64, text, held || (fresh && !c.text.is_empty()))
    };
    let mut shown = SHOWN.lock().unwrap();
    if *shown == (rev, visible) {
        return;
    }
    unsafe {
        if shown.0 != rev {
            msg1_ptr(label, sel(b"setStringValue:\0"), nsstring(&text));
        }
        if visible != shown.1 {
            if visible {
                // NSWindow only has setFrame:display: (setFrame: is NSView's).
                let f: extern "C" fn(*mut c_void, *mut c_void, NSRect, bool) =
                    std::mem::transmute(objc_msgSend as *const ());
                f(panel, sel(b"setFrame:display:\0"), panel_frame(), true);
                msg1_ptr(panel, sel(b"orderFrontRegardless\0"), std::ptr::null_mut());
                let vis: extern "C" fn(*mut c_void, *mut c_void) -> bool =
                    std::mem::transmute(objc_msgSend as *const ());
                eprintln!("otoji-tray: overlay shown (isVisible={})", vis(panel, sel(b"isVisible\0")));
            } else {
                msg1_ptr(panel, sel(b"orderOut:\0"), std::ptr::null_mut());
            }
        }
    }
    *shown = (rev, visible);
}
