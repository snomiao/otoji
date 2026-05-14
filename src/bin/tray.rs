//! `otoji-tray` — standalone macOS menu bar process.
//!
//! Owns the tray icon and (eventually) auto-spawns `otoji listen` as a
//! child for actual STT, reads `notes.jsonl` for the recent-notes menu.
//! Kept in its own binary so a sensevoice panic in the listen child can't
//! take down the tray, and so the existing `#[tokio::main]` on the main
//! `otoji` binary is left untouched.
//!
//! Milestone 2: menu shows recent notes (display-only) refreshed via a
//! CFRunLoopTimer every few seconds. Click handlers for individual notes
//! and child-process spawning come next.

#[cfg(target_os = "macos")]
fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--dump-menu") {
        // Diagnostic: print what the menu *would* contain without
        // touching AppKit. Lets us verify the recent-notes path from
        // CI / the terminal where AX isn't available.
        for (i, n) in otoji::notes::recent(10).iter().enumerate() {
            println!("[{i}] {} | {} | {}", n.kind, n.stem, n.text);
        }
        return;
    }
    tray_macos::run();
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("otoji-tray currently supports macOS only");
    std::process::exit(1);
}

#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
#[link(name = "Foundation", kind = "framework")]
#[link(name = "CoreFoundation", kind = "framework")]
#[link(name = "WebKit", kind = "framework")]
#[link(name = "objc")]
extern "C" {}

#[cfg(target_os = "macos")]
mod tray_macos {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, Ordering};

    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_getProtocol(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, sel: *mut c_void, ...) -> *mut c_void;
        fn objc_allocateClassPair(
            superclass: *mut c_void,
            name: *const std::ffi::c_char,
            extra_bytes: usize,
        ) -> *mut c_void;
        fn objc_registerClassPair(class: *mut c_void);
        fn class_addMethod(
            class: *mut c_void,
            sel: *mut c_void,
            imp: *const c_void,
            types: *const std::ffi::c_char,
        ) -> bool;
        fn class_addProtocol(class: *mut c_void, protocol: *mut c_void) -> bool;
        fn CFRunLoopRun();
        fn CFRunLoopGetMain() -> *mut c_void;
        fn CFRunLoopAddTimer(rl: *mut c_void, timer: *mut c_void, mode: *mut c_void);
        fn CFRunLoopTimerCreate(
            allocator: *mut c_void,
            fire_date: f64,
            interval: f64,
            flags: u32,
            order: i64,
            callout: extern "C" fn(*mut c_void, *mut c_void),
            context: *mut c_void,
        ) -> *mut c_void;
        fn CFAbsoluteTimeGetCurrent() -> f64;
        static kCFRunLoopCommonModes: *mut c_void;
    }

    // ── NSRect ───────────────────────────────────────────────────────────────
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSRect { x: f64, y: f64, w: f64, h: f64 }

    // ── Settings window globals ──────────────────────────────────────────────
    static SETTINGS_WINDOW: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static SETTINGS_WEBVIEW: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static SETTINGS_CLASS_ONCE: std::sync::Once = std::sync::Once::new();

    // Signal flag set by SIGUSR1 — checked in the timer tick.
    static OPEN_SETTINGS_FLAG: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);

    static SETTINGS_HTML: &str = include_str!("otoji_settings.html");

    // ── Model download state ─────────────────────────────────────────────────
    /// One progress / completion event from a model download worker thread.
    /// Dispatched to the WebView on the main thread by `refresh_tick`.
    #[derive(Debug, Clone)]
    struct DownloadEvt {
        kind: String, // "stt" | "tts"
        variant: String,
        stage: &'static str, // "connecting" | "downloading" | "extracting" | "done" | "error" | "cancelled"
        downloaded: u64,
        total: u64,
        bytes_per_sec: u64,
        error: String,
    }

    fn parse_asset_kind(s: &str) -> otoji::asr::sensevoice_download::AssetKind {
        use otoji::asr::sensevoice_download::AssetKind;
        match s {
            "tts" => AssetKind::TtsKokoro,
            _ => AssetKind::SttSenseVoice,
        }
    }
    fn default_variant_for(kind: otoji::asr::sensevoice_download::AssetKind) -> &'static str {
        use otoji::asr::sensevoice_download::AssetKind;
        match kind {
            AssetKind::SttSenseVoice => otoji::config::DEFAULT_SHERPA_VARIANT,
            AssetKind::TtsKokoro => otoji::config::DEFAULT_KOKORO_VARIANT,
        }
    }
    /// Drained on the main thread by the refresh timer.
    static DOWNLOAD_RX: std::sync::Mutex<Option<std::sync::mpsc::Receiver<DownloadEvt>>> =
        std::sync::Mutex::new(None);
    /// `true` while a download is in flight — prevents concurrent starts.
    static DOWNLOAD_ACTIVE: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);
    /// Set by `cancel_download` IPC; the worker checks this between chunks.
    static DOWNLOAD_CANCEL: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);

    // ── Settings message handler ─────────────────────────────────────────────

    unsafe fn nsstring_to_string(ns: *mut c_void) -> Option<String> {
        if ns.is_null() { return None; }
        let f: extern "C" fn(*mut c_void, *mut c_void) -> *const std::ffi::c_char =
            std::mem::transmute(objc_msgSend as *const ());
        let cstr = f(ns, sel(b"UTF8String\0"));
        if cstr.is_null() { return None; }
        Some(std::ffi::CStr::from_ptr(cstr).to_string_lossy().into_owned())
    }

    unsafe fn eval_settings_js(js: &str) {
        let wv = SETTINGS_WEBVIEW.load(Ordering::Acquire);
        if wv.is_null() { return; }
        let js_ns = nsstring(js);
        let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(wv, sel(b"evaluateJavaScript:completionHandler:\0"), js_ns, std::ptr::null_mut());
    }

    /// IMP for `userContentController:didReceiveScriptMessage:`.
    unsafe extern "C" fn handle_settings_message(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _controller: *mut c_void,
        message: *mut c_void,
    ) {
        let body = msg0(message, sel(b"body\0"));
        let Some(body_str) = nsstring_to_string(body) else { return };
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body_str) else { return };
        let cmd = parsed.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
        match cmd {
            "get_config" => {
                let cfg = otoji::config::load();
                let json = serde_json::to_string(&cfg).unwrap_or_default();
                let escaped = json.replace('\\', "\\\\").replace('\'', "\\'");
                eval_settings_js(&format!("window.handleGetConfig('{}')", escaped));
            }
            "set_config" => {
                if let Some(cfg_val) = parsed.get("cfg") {
                    if let Ok(cfg) = serde_json::from_value::<otoji::config::OtojiConfig>(cfg_val.clone()) {
                        otoji::config::save(&cfg);
                        eval_settings_js("window.handleSetConfig()");
                    }
                }
            }
            "close" => {
                let win = SETTINGS_WINDOW.load(Ordering::Acquire);
                if !win.is_null() {
                    msg1_ptr(win, sel(b"orderOut:\0"), std::ptr::null_mut());
                }
            }
            "check_model_status" => {
                let kind_str = parsed
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("stt");
                let variant = parsed
                    .get("variant")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let kind = parse_asset_kind(kind_str);
                let v_for_cb = if variant.is_empty() {
                    default_variant_for(kind).to_string()
                } else {
                    variant
                };
                let dir = otoji::asr::sensevoice::model_dir_for_variant(&v_for_cb);
                let present = kind.is_present(&dir);
                let size_bytes = if present {
                    otoji::asr::sensevoice_download::variant_disk_size(&v_for_cb)
                } else {
                    0
                };
                let active = DOWNLOAD_ACTIVE.load(std::sync::atomic::Ordering::Acquire);
                let payload = serde_json::json!({
                    "kind": kind_str,
                    "variant": v_for_cb,
                    "present": present,
                    "size_bytes": size_bytes,
                    "downloading": active,
                });
                let json = serde_json::to_string(&payload).unwrap_or_default();
                let escaped = json.replace('\\', "\\\\").replace('\'', "\\'");
                eval_settings_js(&format!("window.handleModelStatus('{}')", escaped));
            }
            "download_model" => {
                let kind_str = parsed
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("stt")
                    .to_string();
                let kind = parse_asset_kind(&kind_str);
                let variant = parsed
                    .get("variant")
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(default_variant_for(kind))
                    .to_string();
                start_model_download(kind, kind_str, variant);
            }
            "cancel_download" => {
                DOWNLOAD_CANCEL.store(true, std::sync::atomic::Ordering::Release);
            }
            _ => {}
        }
    }

    unsafe fn ensure_settings_handler_class() {
        SETTINGS_CLASS_ONCE.call_once(|| {
            let superclass = cls(b"NSObject\0");
            let new_cls = objc_allocateClassPair(
                superclass,
                b"OtojiSettingsHandler\0".as_ptr() as *const _,
                0,
            );
            if new_cls.is_null() { return; }
            let proto = objc_getProtocol(b"WKScriptMessageHandler\0".as_ptr() as *const _);
            if !proto.is_null() { class_addProtocol(new_cls, proto); }
            class_addMethod(
                new_cls,
                sel(b"userContentController:didReceiveScriptMessage:\0"),
                handle_settings_message as *const c_void,
                b"v@:@@\0".as_ptr() as *const _,
            );
            objc_registerClassPair(new_cls);
        });
    }

    pub(super) unsafe fn open_settings_window() {
        // Reuse existing window if already built.
        let existing = SETTINGS_WINDOW.load(Ordering::Acquire);
        if !existing.is_null() {
            let is_vis: extern "C" fn(*mut c_void, *mut c_void) -> bool =
                std::mem::transmute(objc_msgSend as *const ());
            if is_vis(existing, sel(b"isVisible\0")) {
                // Toggle: close if already visible
                msg1_ptr(existing, sel(b"orderOut:\0"), std::ptr::null_mut());
                return;
            }
            // Bring back and reload config
            msg1_ptr(existing, sel(b"makeKeyAndOrderFront:\0"), std::ptr::null_mut());
            let nsapp = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
            let f: extern "C" fn(*mut c_void, *mut c_void, i64) -> bool =
                std::mem::transmute(objc_msgSend as *const ());
            f(nsapp, sel(b"activateIgnoringOtherApps:\0"), 1);
            let cfg = otoji::config::load();
            let json = serde_json::to_string(&cfg).unwrap_or_default();
            let escaped = json.replace('\\', "\\\\").replace('\'', "\\'");
            eval_settings_js(&format!("window.handleGetConfig('{}')", escaped));
            return;
        }

        // First open: build the window.
        ensure_settings_handler_class();

        // WKWebViewConfiguration
        let wk_cfg_cls = cls(b"WKWebViewConfiguration\0");
        if wk_cfg_cls.is_null() { eprintln!("otoji-tray: WKWebViewConfiguration not found"); return; }
        let wk_cfg = msg0(msg0(wk_cfg_cls, sel(b"alloc\0")), sel(b"init\0"));

        // userContentController
        let ucc = msg0(wk_cfg, sel(b"userContentController\0"));

        // handler instance
        let handler_cls = cls(b"OtojiSettingsHandler\0");
        if handler_cls.is_null() { return; }
        let handler = msg0(msg0(handler_cls, sel(b"alloc\0")), sel(b"init\0"));

        // [ucc addScriptMessageHandler:handler name:@"otoji"]
        let f4: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f4(ucc, sel(b"addScriptMessageHandler:name:\0"), handler, nsstring("otoji"));

        // WKWebView
        let rect = NSRect { x: 0.0, y: 0.0, w: 560.0, h: 640.0 };
        let wk_view_cls = cls(b"WKWebView\0");
        if wk_view_cls.is_null() { eprintln!("otoji-tray: WKWebView not found"); return; }
        let wk_alloc = msg0(wk_view_cls, sel(b"alloc\0"));
        let webview: *mut c_void = {
            let f: extern "C" fn(*mut c_void, *mut c_void, NSRect, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            f(wk_alloc, sel(b"initWithFrame:configuration:\0"), rect, wk_cfg)
        };
        if webview.is_null() { eprintln!("otoji-tray: WKWebView init failed"); return; }
        SETTINGS_WEBVIEW.store(webview, Ordering::Release);

        // Load HTML
        let f4l: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f4l(webview, sel(b"loadHTMLString:baseURL:\0"), nsstring(SETTINGS_HTML), std::ptr::null_mut());

        // NSWindow
        let style_mask: u64 = 1 | 2 | 4 | 8; // titled | closable | miniaturizable | resizable
        let backing: u64 = 2;                  // NSBackingStoreBuffered
        let win_alloc = msg0(cls(b"NSWindow\0"), sel(b"alloc\0"));
        let window: *mut c_void = {
            let f: extern "C" fn(*mut c_void, *mut c_void, NSRect, u64, u64, bool) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            f(win_alloc, sel(b"initWithContentRect:styleMask:backing:defer:\0"),
              rect, style_mask, backing, false)
        };
        if window.is_null() { eprintln!("otoji-tray: NSWindow init failed"); return; }

        msg1_ptr(window, sel(b"setTitle:\0"), nsstring("otoji 設定"));
        msg1_ptr(window, sel(b"setContentView:\0"), webview);
        msg0(window, sel(b"center\0"));
        let f_bool: extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        f_bool(window, sel(b"setReleasedWhenClosed:\0"), false);
        msg0(window, sel(b"retain\0"));
        SETTINGS_WINDOW.store(window, Ordering::Release);

        msg1_ptr(window, sel(b"makeKeyAndOrderFront:\0"), std::ptr::null_mut());
        let nsapp = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
        let f_act: extern "C" fn(*mut c_void, *mut c_void, i64) -> bool =
            std::mem::transmute(objc_msgSend as *const ());
        f_act(nsapp, sel(b"activateIgnoringOtherApps:\0"), 1);
    }

    // NSMenu we rebuild on every refresh tick. Stored so the timer can
    // reach it without needing a custom NSObject delegate.
    static STATUS_ITEM: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    unsafe fn sel(name: &[u8]) -> *mut c_void {
        sel_registerName(name.as_ptr() as *const _)
    }
    unsafe fn cls(name: &[u8]) -> *mut c_void {
        objc_getClass(name.as_ptr() as *const _)
    }
    unsafe fn msg0(obj: *mut c_void, s: *mut c_void) -> *mut c_void {
        let f: extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s)
    }
    unsafe fn msg1_ptr(obj: *mut c_void, s: *mut c_void, a: *mut c_void) -> *mut c_void {
        let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s, a)
    }
    unsafe fn nsstring(s: &str) -> *mut c_void {
        let cls_str = cls(b"NSString\0");
        let sel_utf8 = sel(b"stringWithUTF8String:\0");
        let cstr = std::ffi::CString::new(s).unwrap_or_else(|_| {
            std::ffi::CString::new(s.replace('\0', "")).unwrap()
        });
        let f: extern "C" fn(*mut c_void, *mut c_void, *const std::ffi::c_char) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls_str, sel_utf8, cstr.as_ptr())
    }

    /// Set the status-bar button image to SF Symbol "mic.fill" as a template
    /// image (system tints it for dark/light mode automatically). Returns
    /// `false` if the symbol can't be loaded — caller should fall back to
    /// a text title.
    unsafe fn set_button_mic_image(button: *mut c_void, active: bool) -> bool {
        let nsimage = cls(b"NSImage\0");
        if nsimage.is_null() { return false; }
        // mic.fill when listen is running (the system shows the orange dot
        // anyway), mic.slash when stopped — so users can tell at a glance
        // that otoji is *not* recording, distinguishing the tray icon from
        // macOS's privacy indicator.
        let symbol = if active { "mic.fill" } else { "mic.slash" };
        let sel_sym = sel(b"imageWithSystemSymbolName:accessibilityDescription:\0");
        let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let img = f(nsimage, sel_sym, nsstring(symbol), nsstring("otoji"));
        if img.is_null() { return false; }
        let sel_tmpl = sel(b"setTemplate:\0");
        let f_set: extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        f_set(img, sel_tmpl, true);
        msg1_ptr(button, sel(b"setImage:\0"), img);
        true
    }

    static ACTION_TARGET: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static ACTION_CLASS_ONCE: std::sync::Once = std::sync::Once::new();

    // Cached mtime (seconds since epoch) of notes.jsonl from the last
    // successful menu rebuild. Used to skip rebuilds when nothing has
    // changed — avoids reshuffling the menu under the user's cursor at
    // every tick boundary.
    static LAST_MTIME: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    fn notes_mtime_secs() -> u64 {
        let path = otoji::notes::notes_path();
        std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    /// Read [sender representedObject] as a Rust String. Best-effort.
    unsafe fn rep_obj_to_string(sender: *mut c_void) -> Option<String> {
        if sender.is_null() {
            return None;
        }
        let obj = msg0(sender, sel(b"representedObject\0"));
        if obj.is_null() {
            return None;
        }
        let utf8: *const std::ffi::c_char = {
            let f: extern "C" fn(*mut c_void, *mut c_void) -> *const std::ffi::c_char =
                std::mem::transmute(objc_msgSend as *const ());
            f(obj, sel(b"UTF8String\0"))
        };
        if utf8.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }

    /// Click → write the note's text to the system pasteboard.
    unsafe extern "C" fn action_copy_note(
        _this: *mut c_void,
        _cmd: *mut c_void,
        sender: *mut c_void,
    ) {
        let Some(text) = rep_obj_to_string(sender) else { return };
        let pb = msg0(cls(b"NSPasteboard\0"), sel(b"generalPasteboard\0"));
        if pb.is_null() {
            return;
        }
        msg0(pb, sel(b"clearContents\0"));
        // [pb setString:text forType:NSPasteboardTypeString]
        let s = nsstring(&text);
        let ns_type = nsstring("public.utf8-plain-text");
        let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> bool =
            std::mem::transmute(objc_msgSend as *const ());
        f(pb, sel(b"setString:forType:\0"), s, ns_type);
    }

    /// Click → `open <data_dir>` in Finder.
    unsafe extern "C" fn action_open_folder(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        let dir = otoji::notes::data_dir();
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }

    /// Click → reveal the most recent note's .wav in Finder (`open -R`).
    unsafe extern "C" fn action_reveal_latest_wav(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        let recent = otoji::notes::recent(1);
        let Some(n) = recent.first() else { return };
        let wav = otoji::notes::artifact_path(&n.stem, "wav");
        if wav.exists() {
            let _ = std::process::Command::new("open").arg("-R").arg(&wav).spawn();
        } else {
            // Fall back to opening the data folder if no audio sidecar exists
            // (PttFinal segments don't currently capture audio).
            let _ = std::process::Command::new("open").arg(otoji::notes::data_dir()).spawn();
        }
    }

    /// Returns true if at least one `otoji listen` process is running.
    fn listen_is_running() -> bool {
        std::process::Command::new("pgrep")
            .args(["-f", "otoji listen"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Count notes whose stem starts with today's UTC date prefix
    /// (YYYY-MM-DD). Cheap O(N) over the recent window.
    fn today_count() -> usize {
        let today = chrono_today_prefix();
        otoji::notes::recent(1000)
            .iter()
            .filter(|n| n.stem.starts_with(&today) && !n.text.trim().is_empty())
            .count()
    }

    /// Today's prefix as `YYYY-MM-DD` (UTC, matching otoji's stem format).
    fn chrono_today_prefix() -> String {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // Days since epoch, then convert via civil_from_days.
        let days = (now / 86400) as i64;
        let (y, m, d) = civil_from_days(days);
        format!("{y:04}-{m:02}-{d:02}")
    }

    /// Howard Hinnant's date algorithm: days-since-epoch → (year, month, day).
    fn civil_from_days(z: i64) -> (i32, u32, u32) {
        let z = z + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = (z - era * 146097) as u64;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        (y as i32, m as u32, d as u32)
    }

    /// Click → kill all `otoji listen` processes. CLX will respawn one
    /// on the next voice trigger.
    unsafe extern "C" fn action_stop_listen(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "otoji listen"])
            .status();
    }

    /// Click → spawn a bare `otoji listen --plain` if none is running.
    unsafe extern "C" fn action_start_listen(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        if listen_is_running() {
            return;
        }
        let _ = std::process::Command::new("otoji")
            .args(["listen", "--plain"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }

    /// Click → open the most recent note's polished .md (or fall back to
    /// the .srt sidecar, which always exists for finalized notes).
    unsafe extern "C" fn action_open_latest_md(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        let recent = otoji::notes::recent(1);
        let Some(n) = recent.first() else { return };
        let md = otoji::notes::artifact_path(&n.stem, "md");
        let target = if md.exists() {
            md
        } else {
            otoji::notes::artifact_path(&n.stem, "srt")
        };
        if target.exists() {
            let _ = std::process::Command::new("open").arg(&target).spawn();
        }
    }

    /// Click → open the otoji settings window.
    unsafe extern "C" fn action_open_settings(
        _this: *mut c_void,
        _cmd: *mut c_void,
        _sender: *mut c_void,
    ) {
        open_settings_window();
    }

    unsafe fn ensure_action_class() {
        ACTION_CLASS_ONCE.call_once(|| {
            let superclass = cls(b"NSObject\0");
            let new_cls = objc_allocateClassPair(
                superclass,
                b"OtojiTrayTarget\0".as_ptr() as *const _,
                0,
            );
            if new_cls.is_null() {
                eprintln!("otoji-tray: failed to allocate OtojiTrayTarget");
                return;
            }
            // -(void)copyNote:(id)sender   types: v@:@
            class_addMethod(
                new_cls,
                sel(b"copyNote:\0"),
                action_copy_note as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"openFolder:\0"),
                action_open_folder as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"revealLatestWav:\0"),
                action_reveal_latest_wav as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"openLatestMd:\0"),
                action_open_latest_md as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"stopListen:\0"),
                action_stop_listen as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"startListen:\0"),
                action_start_listen as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            class_addMethod(
                new_cls,
                sel(b"openSettings:\0"),
                action_open_settings as *const c_void,
                b"v@:@\0".as_ptr() as *const _,
            );
            objc_registerClassPair(new_cls);
        });
    }

    unsafe fn action_target() -> *mut c_void {
        let existing = ACTION_TARGET.load(Ordering::Acquire);
        if !existing.is_null() {
            return existing;
        }
        ensure_action_class();
        let target_cls = cls(b"OtojiTrayTarget\0");
        if target_cls.is_null() {
            return std::ptr::null_mut();
        }
        let inst = msg0(msg0(target_cls, sel(b"alloc\0")), sel(b"init\0"));
        msg0(inst, sel(b"retain\0"));
        ACTION_TARGET.store(inst, Ordering::Release);
        inst
    }

    /// Build (or rebuild) the status item's menu in place.
    unsafe fn rebuild_menu() {
        let item = STATUS_ITEM.load(Ordering::Acquire);
        if item.is_null() {
            return;
        }

        let menu = msg0(msg0(cls(b"NSMenu\0"), sel(b"alloc\0")), sel(b"init\0"));
        let menuitem_cls = cls(b"NSMenuItem\0");
        let init_sel = sel(b"initWithTitle:action:keyEquivalent:\0");
        let init_fn: extern "C" fn(
            *mut c_void, *mut c_void,
            *mut c_void, *mut c_void, *mut c_void,
        ) -> *mut c_void = std::mem::transmute(objc_msgSend as *const ());

        let target = action_target();

        // ── Status + control header ──────────────────────────────
        let running = listen_is_running();
        let status_label = if running {
            format!("🟢 listen: running   •   today: {}", today_count())
        } else {
            format!("⚫ listen: stopped   •   today: {}", today_count())
        };
        let status_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring(&status_label),
            std::ptr::null_mut(),
            nsstring(""),
        );
        msg1_ptr(menu, sel(b"addItem:\0"), status_item);

        // Toggle: Start otoji listen / Stop otoji listen.
        let (toggle_label, toggle_sel): (&str, &[u8]) = if running {
            ("⏹  Stop otoji listen", b"stopListen:\0")
        } else {
            ("▶︎  Start otoji listen", b"startListen:\0")
        };
        let toggle_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring(toggle_label),
            sel(toggle_sel),
            nsstring(""),
        );
        if !target.is_null() {
            msg1_ptr(toggle_item, sel(b"setTarget:\0"), target);
        }
        msg1_ptr(menu, sel(b"addItem:\0"), toggle_item);

        let sep0 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep0);

        // Folder header: clicking opens the data folder in Finder.
        let dir = otoji::notes::data_dir();
        let header = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring(&format!("📁 {}", truncate(&dir.to_string_lossy(), 60))),
            sel(b"openFolder:\0"),
            nsstring(""),
        );
        if !target.is_null() {
            msg1_ptr(header, sel(b"setTarget:\0"), target);
        }
        msg1_ptr(menu, sel(b"addItem:\0"), header);

        let sep1 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep1);

        // Recent notes — clicking copies the full text to the pasteboard.
        // Filter out empty-text entries (brief PTT taps, VAD false starts).
        let recent: Vec<_> = otoji::notes::recent(20)
            .into_iter()
            .filter(|n| !n.text.trim().is_empty())
            .take(10)
            .collect();

        // Reflect the count in the menu-bar button title so the user can
        // tell at a glance whether the listen child is producing notes.
        let button = msg0(item, sel(b"button\0"));
        if !button.is_null() {
            // Icon-only: SF Symbol "mic.fill" as template image. Count is
            // not shown — it was capped at 10 (menu length) and conveyed
            // nothing useful past first use. Falls back to "音" if SF
            // Symbols are unavailable (pre-Big Sur).
            if !set_button_mic_image(button, running) {
                msg1_ptr(button, sel(b"setTitle:\0"), nsstring("音"));
            } else {
                msg1_ptr(button, sel(b"setTitle:\0"), nsstring(""));
            }
        }

        if recent.is_empty() {
            let empty = init_fn(
                msg0(menuitem_cls, sel(b"alloc\0")),
                init_sel,
                nsstring("(no notes yet)"),
                std::ptr::null_mut(),
                nsstring(""),
            );
            msg1_ptr(menu, sel(b"addItem:\0"), empty);
        } else {
            for note in &recent {
                let kind_glyph = match note.kind.as_str() {
                    "ptt_final" => "🎤",
                    "final" => "💬",
                    _ => "•",
                };
                let title = format!("{} {}", kind_glyph, truncate(&note.text, 60));
                let it = init_fn(
                    msg0(menuitem_cls, sel(b"alloc\0")),
                    init_sel,
                    nsstring(&title),
                    sel(b"copyNote:\0"),
                    nsstring(""),
                );
                // representedObject carries the FULL note text (not the
                // truncated title) so click → pasteboard gets the original.
                msg1_ptr(it, sel(b"setRepresentedObject:\0"), nsstring(&note.text));
                if !target.is_null() {
                    msg1_ptr(it, sel(b"setTarget:\0"), target);
                }
                msg1_ptr(menu, sel(b"addItem:\0"), it);
            }
        }

        let sep2 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep2);

        // Latest-segment shortcuts (no-ops if there are no notes yet —
        // the click handlers just return early).
        let reveal_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring("Reveal latest .wav in Finder"),
            sel(b"revealLatestWav:\0"),
            nsstring(""),
        );
        if !target.is_null() {
            msg1_ptr(reveal_item, sel(b"setTarget:\0"), target);
        }
        msg1_ptr(menu, sel(b"addItem:\0"), reveal_item);

        let open_md_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring("Open latest polished .md"),
            sel(b"openLatestMd:\0"),
            nsstring(""),
        );
        if !target.is_null() {
            msg1_ptr(open_md_item, sel(b"setTarget:\0"), target);
        }
        msg1_ptr(menu, sel(b"addItem:\0"), open_md_item);

        let sep3 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep3);

        // Settings…
        let settings_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring("Settings…"),
            sel(b"openSettings:\0"),
            nsstring(","),
        );
        if !target.is_null() {
            msg1_ptr(settings_item, sel(b"setTarget:\0"), target);
        }
        msg1_ptr(menu, sel(b"addItem:\0"), settings_item);

        let sep4 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep4);

        // Quit: terminate: on NSApp.
        let app = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
        let quit_item = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring("Quit otoji"),
            sel(b"terminate:\0"),
            nsstring("q"),
        );
        msg1_ptr(quit_item, sel(b"setTarget:\0"), app);
        msg1_ptr(menu, sel(b"addItem:\0"), quit_item);

        msg1_ptr(item, sel(b"setMenu:\0"), menu);
    }

    /// Truncate a string to `max` chars (not bytes), appending an ellipsis.
    /// Single-line: collapses internal newlines to spaces.
    fn truncate(s: &str, max: usize) -> String {
        let one_line: String = s.replace(['\n', '\r'], " ").trim().to_string();
        let chars: Vec<char> = one_line.chars().collect();
        if chars.len() <= max {
            one_line
        } else {
            let head: String = chars[..max.saturating_sub(1)].iter().collect();
            format!("{head}…")
        }
    }

    extern "C" fn refresh_tick(_timer: *mut c_void, _info: *mut c_void) {
        // SIGUSR1 pending → open settings window
        if OPEN_SETTINGS_FLAG.swap(false, std::sync::atomic::Ordering::SeqCst) {
            unsafe { open_settings_window(); }
        }

        // Drain any pending model-download progress events.
        drain_download_events();

        let mtime = notes_mtime_secs();
        let prev = LAST_MTIME.load(std::sync::atomic::Ordering::Acquire);
        if mtime == prev {
            return;
        }
        LAST_MTIME.store(mtime, std::sync::atomic::Ordering::Release);
        unsafe { rebuild_menu(); }
    }

    /// Pump every queued `DownloadEvt` to the WebView. Runs on the main
    /// thread (inside `refresh_tick`), which is required for WKWebView calls.
    fn drain_download_events() {
        let guard = DOWNLOAD_RX.lock().ok();
        let Some(mut g) = guard else { return };
        let Some(rx) = g.as_ref() else { return };
        loop {
            match rx.try_recv() {
                Ok(evt) => {
                    let payload = serde_json::json!({
                        "kind": evt.kind,
                        "variant": evt.variant,
                        "stage": evt.stage,
                        "downloaded": evt.downloaded,
                        "total": evt.total,
                        "bytes_per_sec": evt.bytes_per_sec,
                        "error": evt.error,
                    });
                    let json = serde_json::to_string(&payload).unwrap_or_default();
                    let escaped = json.replace('\\', "\\\\").replace('\'', "\\'");
                    unsafe {
                        eval_settings_js(&format!(
                            "window.handleModelProgress('{}')",
                            escaped
                        ));
                    }
                    if matches!(evt.stage, "done" | "error" | "cancelled") {
                        DOWNLOAD_ACTIVE.store(false, std::sync::atomic::Ordering::Release);
                    }
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => break,
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    *g = None;
                    DOWNLOAD_ACTIVE.store(false, std::sync::atomic::Ordering::Release);
                    break;
                }
            }
        }
    }

    /// Spawn a worker thread that downloads + extracts the variant and
    /// posts progress events back to the main thread via `DOWNLOAD_RX`.
    fn start_model_download(
        kind: otoji::asr::sensevoice_download::AssetKind,
        kind_str: String,
        variant: String,
    ) {
        if DOWNLOAD_ACTIVE.swap(true, std::sync::atomic::Ordering::AcqRel) {
            // Already running — silently ignore. UI guards against this too.
            return;
        }
        DOWNLOAD_CANCEL.store(false, std::sync::atomic::Ordering::Release);
        let (tx, rx) = std::sync::mpsc::channel::<DownloadEvt>();
        if let Ok(mut g) = DOWNLOAD_RX.lock() {
            *g = Some(rx);
        }

        std::thread::Builder::new()
            .name("otoji-model-dl".into())
            .spawn(move || {
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(r) => r,
                    Err(e) => {
                        let _ = tx.send(DownloadEvt {
                            kind: kind_str.clone(),
                            variant: variant.clone(),
                            stage: "error",
                            downloaded: 0,
                            total: 0,
                            bytes_per_sec: 0,
                            error: format!("tokio runtime: {e}"),
                        });
                        return;
                    }
                };
                let v = variant.clone();
                let k = kind_str.clone();
                let tx2 = tx.clone();
                let result = rt.block_on(async {
                    use otoji::asr::sensevoice_download::{download_asset, DownloadStage};
                    download_asset(kind, &v, |p| {
                        if DOWNLOAD_CANCEL.load(std::sync::atomic::Ordering::Acquire) {
                            let _ = tx2.send(DownloadEvt {
                                kind: k.clone(),
                                variant: v.clone(),
                                stage: "cancelled",
                                downloaded: p.downloaded,
                                total: p.total,
                                bytes_per_sec: 0,
                                error: String::new(),
                            });
                            return;
                        }
                        let stage = match p.stage {
                            DownloadStage::Connecting => "connecting",
                            DownloadStage::Downloading => "downloading",
                            DownloadStage::Extracting => "extracting",
                            DownloadStage::Done => "done",
                        };
                        let _ = tx2.send(DownloadEvt {
                            kind: k.clone(),
                            variant: v.clone(),
                            stage,
                            downloaded: p.downloaded,
                            total: p.total,
                            bytes_per_sec: p.bytes_per_sec,
                            error: String::new(),
                        });
                    })
                    .await
                });
                if let Err(e) = result {
                    let _ = tx.send(DownloadEvt {
                        kind: kind_str,
                        variant,
                        stage: "error",
                        downloaded: 0,
                        total: 0,
                        bytes_per_sec: 0,
                        error: format!("{e}"),
                    });
                }
            })
            .ok();
    }

    /// 一回限りのマイグレーション: otoji config が未作成かつ CLX config が存在する場合、
    /// CLX の音声設定フィールドを otoji config の初期値として流用する。
    /// 設定画面を初めて開いたときにデフォルト値が即座に保存されて CLX の設定を
    /// 上書きしてしまう問題を防ぐ。
    fn maybe_migrate_from_clx() {
        let dest = otoji::config::config_path();
        if dest.exists() {
            return; // 既にマイグレーション済み / ユーザーが直接作成済み
        }
        let clx_path = {
            let home = std::env::var("HOME").unwrap_or_default();
            std::path::PathBuf::from(home).join(".config/CapsLockX/config.json")
        };
        if !clx_path.exists() {
            return; // CLX 未設定 — 設定画面を初めて開いたときにデフォルトで作成される
        }
        let Ok(data) = std::fs::read_to_string(&clx_path) else { return };
        let Ok(val)  = serde_json::from_str::<serde_json::Value>(&data) else { return };
        // OtojiConfig のフィールドは CLX FullConfig のサブセット。
        // serde が一致するフィールド名を取り込み、存在しないフィールドはデフォルト値にする。
        match serde_json::from_value::<otoji::config::OtojiConfig>(val) {
            Ok(seeded) => {
                otoji::config::save(&seeded);
                eprintln!("[otoji-tray] CLX config から音声設定をマイグレーションしました");
            }
            Err(e) => {
                eprintln!("[otoji-tray] CLX config のパース失敗、デフォルト値を使用: {}", e);
            }
        }
    }

    pub fn run() {
        // CLX 設定が存在する場合、音声設定を otoji config に移行する (初回起動時のみ)。
        maybe_migrate_from_clx();

        unsafe {
            // NSApplication + Accessory activation policy (no Dock icon).
            let nsapp_cls = cls(b"NSApplication\0");
            let app = msg0(nsapp_cls, sel(b"sharedApplication\0"));
            let sel_policy = sel(b"setActivationPolicy:\0");
            let f: extern "C" fn(*mut c_void, *mut c_void, i64) -> bool =
                std::mem::transmute(objc_msgSend as *const ());
            f(app, sel_policy, 1); // NSApplicationActivationPolicyAccessory

            // NSStatusBar item with variable length.
            let bar = msg0(cls(b"NSStatusBar\0"), sel(b"systemStatusBar\0"));
            if bar.is_null() {
                eprintln!("otoji-tray: systemStatusBar nil");
                std::process::exit(1);
            }
            let sel_item = sel(b"statusItemWithLength:\0");
            let item: *mut c_void = {
                let f: extern "C" fn(*mut c_void, *mut c_void, f64) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(bar, sel_item, -1.0_f64)
            };
            if item.is_null() {
                eprintln!("otoji-tray: statusItem nil");
                std::process::exit(1);
            }
            msg0(item, sel(b"retain\0"));
            STATUS_ITEM.store(item, Ordering::Release);

            // Initial: SF Symbol "mic" template image, falls back to "音".
            let button = msg0(item, sel(b"button\0"));
            if !button.is_null() {
                if !set_button_mic_image(button, listen_is_running()) {
                    msg1_ptr(button, sel(b"setTitle:\0"), nsstring("音"));
                }
            }

            // Initial menu population.
            rebuild_menu();

            // SIGUSR1 → open settings window (sent by CLX when user clicks "Voice Settings…").
            extern "C" fn sigusr1_handler(_: libc::c_int) {
                OPEN_SETTINGS_FLAG.store(true, std::sync::atomic::Ordering::SeqCst);
            }
            libc::signal(libc::SIGUSR1, sigusr1_handler as *const () as libc::sighandler_t);

            // 200ms tick: drives both menu refresh (gated on notes mtime
            // change, so cheap when idle) and model-download progress drain
            // (must run on the main thread for WKWebView calls).
            let timer = CFRunLoopTimerCreate(
                std::ptr::null_mut(),
                CFAbsoluteTimeGetCurrent() + 0.2,
                0.2,
                0,
                0,
                refresh_tick,
                std::ptr::null_mut(),
            );
            if !timer.is_null() {
                CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes);
            }

            eprintln!(
                "otoji-tray: installed (pid {}, data {})",
                std::process::id(),
                otoji::notes::data_dir().display()
            );
            // [NSApp finishLaunching] + [NSApp run] — required for AppKit to
            // dispatch NSEvents (including status bar menu clicks). CFRunLoopRun()
            // alone only services CF sources and misses the NSEvent machinery.
            msg0(app, sel(b"finishLaunching\0"));
            msg0(app, sel(b"run\0"));
        }
    }
}
