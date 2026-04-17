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

        // Header: clicking opens the data folder in Finder.
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
            let title = if recent.is_empty() {
                "音".to_string()
            } else {
                format!("音 {}", recent.len().min(99))
            };
            msg1_ptr(button, sel(b"setTitle:\0"), nsstring(&title));
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
        let mtime = notes_mtime_secs();
        let prev = LAST_MTIME.load(std::sync::atomic::Ordering::Acquire);
        if mtime == prev {
            return;
        }
        LAST_MTIME.store(mtime, std::sync::atomic::Ordering::Release);
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
