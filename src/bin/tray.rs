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
#[link(name = "objc")]
extern "C" {}

#[cfg(target_os = "macos")]
mod tray_macos {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, Ordering};

    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, sel: *mut c_void, ...) -> *mut c_void;
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

        // Header: data folder path (display-only).
        let dir = otoji::notes::data_dir();
        let header = init_fn(
            msg0(menuitem_cls, sel(b"alloc\0")),
            init_sel,
            nsstring(&format!("📁 {}", truncate(&dir.to_string_lossy(), 60))),
            std::ptr::null_mut(),
            nsstring(""),
        );
        msg1_ptr(menu, sel(b"addItem:\0"), header);

        let sep1 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep1);

        // Recent notes (display-only — clicking does nothing for milestone 2).
        let recent = otoji::notes::recent(10);
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
                    std::ptr::null_mut(),
                    nsstring(""),
                );
                msg1_ptr(menu, sel(b"addItem:\0"), it);
            }
        }

        let sep2 = msg0(menuitem_cls, sel(b"separatorItem\0"));
        msg1_ptr(menu, sel(b"addItem:\0"), sep2);

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
        unsafe { rebuild_menu(); }
    }

    pub fn run() {
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

            // Title-only button (no icon asset yet).
            let button = msg0(item, sel(b"button\0"));
            if !button.is_null() {
                msg1_ptr(button, sel(b"setTitle:\0"), nsstring("音"));
            }

            // Initial menu population.
            rebuild_menu();

            // Refresh menu every 3s so newly-appended notes appear without
            // the user having to restart the tray. CFRunLoopTimer avoids
            // needing a custom ObjC target for NSTimer.
            let timer = CFRunLoopTimerCreate(
                std::ptr::null_mut(),
                CFAbsoluteTimeGetCurrent() + 3.0,
                3.0,
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
            CFRunLoopRun();
        }
    }
}
