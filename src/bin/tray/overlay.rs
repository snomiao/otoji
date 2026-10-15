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

/// Spawn `otoji listen --plain` with its stdout piped into the overlay.
/// Returns false when the spawn failed.
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
        .arg("--plain")
        .arg("--ptt-control-socket")
        .arg(&sock)
        // Speech-to-text only: never let this child play audio.
        .env("OTOJI_STT_ONLY", "1")
        .stdin(std::process::Stdio::null())
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
    *guard = Some(child);
    drop(guard);
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
    true
}

/// Kill the tray-owned listen child, if any. Returns true if one was running.
pub fn stop_listen() -> bool {
    let Some(mut child) = LISTEN_CHILD.lock().unwrap().take() else {
        return false;
    };
    let _ = child.kill();
    let _ = child.wait();
    true
}

fn read_events(out: std::process::ChildStdout) {
    for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let text = v.get("text").and_then(|t| t.as_str()).unwrap_or("").trim();
        match kind {
            "partial" | "ptt_partial" if !text.is_empty() => set_caption(text, true),
            "final" | "ptt_final" | "ptt_upgrade" | "ptt_translated" if !text.is_empty() => {
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
unsafe fn msg_i64(obj: *mut c_void, s: *mut c_void, v: i64) {
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
                msg_rect(panel, sel(b"setFrame:\0"), panel_frame());
                msg1_ptr(panel, sel(b"orderFrontRegardless\0"), std::ptr::null_mut());
            } else {
                msg1_ptr(panel, sel(b"orderOut:\0"), std::ptr::null_mut());
            }
        }
    }
    *shown = (rev, visible);
}
