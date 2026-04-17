//! `otoji-tray` — standalone macOS menu bar process.
//!
//! Owns the tray icon and (eventually) auto-spawns `otoji listen` as a
//! child for actual STT, reads `notes.jsonl` for the recent-notes menu.
//! Kept in its own binary so a sensevoice panic in the listen child can't
//! take down the tray, and so the existing `#[tokio::main]` on the main
//! `otoji` binary is left untouched.
//!
//! Milestone 1 (this commit): empty menu with "Quit" item, no child, no
//! notes. If the icon appears in the menu bar without a Dock icon, the
//! structural piece is solved.

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

    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, sel: *mut c_void, ...) -> *mut c_void;
        fn CFRunLoopRun();
    }

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
        let cstr = std::ffi::CString::new(s).unwrap();
        let f: extern "C" fn(*mut c_void, *mut c_void, *const std::ffi::c_char) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls_str, sel_utf8, cstr.as_ptr())
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

            // Title-only button (no icon asset yet — milestone 1).
            let button = msg0(item, sel(b"button\0"));
            if !button.is_null() {
                msg1_ptr(button, sel(b"setTitle:\0"), nsstring("音"));
            }

            // Menu with single "Quit" item wired to NSApp terminate:.
            let menu = msg0(msg0(cls(b"NSMenu\0"), sel(b"alloc\0")), sel(b"init\0"));
            let menuitem_cls = cls(b"NSMenuItem\0");
            let quit_alloc = msg0(menuitem_cls, sel(b"alloc\0"));
            let quit_item: *mut c_void = {
                let f: extern "C" fn(
                    *mut c_void, *mut c_void,
                    *mut c_void, *mut c_void, *mut c_void,
                ) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(
                    quit_alloc,
                    sel(b"initWithTitle:action:keyEquivalent:\0"),
                    nsstring("Quit otoji"),
                    sel(b"terminate:\0"),
                    nsstring("q"),
                )
            };
            msg1_ptr(quit_item, sel(b"setTarget:\0"), app);
            msg1_ptr(menu, sel(b"addItem:\0"), quit_item);
            msg1_ptr(item, sel(b"setMenu:\0"), menu);

            eprintln!("otoji-tray: installed (pid {})", std::process::id());
            CFRunLoopRun();
        }
    }
}
