// Permission onboarding for `otoji-tray`: otoji owns the microphone and the
// global hotkey, so it asks for them itself with native UI instead of telling
// the user to run commands. Microphone → AVCaptureDevice request (system
// dialog) or, when already denied, an alert that opens the right Settings
// pane. Accessibility (hotkey) → the system AX prompt. `tick` polls both so
// listening / the hotkey start the moment access is granted — no restart.
//
// Grants attach to the app bundle identity (`scripts/build-tray-app.sh`);
// a bare binary launched from a terminal is attributed to that terminal.

use super::{cls, msg0, msg1_ptr, nsstring, objc_msgSend, sel};
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};

#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
    static _NSConcreteGlobalBlock: c_void;
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    static kAXTrustedCheckOptionPrompt: *const c_void;
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mic {
    NotDetermined,
    Denied,
    Authorized,
}

/// `[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]`.
pub fn mic_status() -> Mic {
    unsafe {
        let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i64 =
            std::mem::transmute(objc_msgSend as *const ());
        // AVMediaTypeAudio == @"soun"
        match f(
            cls(b"AVCaptureDevice\0"),
            sel(b"authorizationStatusForMediaType:\0"),
            nsstring("soun"),
        ) {
            0 => Mic::NotDetermined,
            3 => Mic::Authorized,
            _ => Mic::Denied, // 1 restricted, 2 denied
        }
    }
}

pub fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrustedWithOptions(std::ptr::null()) }
}

// A static (global) ObjC block for the request completion handler. Global
// blocks need no copy/dispose helpers, so a plain repr(C) struct suffices.
#[repr(C)]
struct BlockDescriptor {
    reserved: usize,
    size: usize,
}
#[repr(C)]
struct Block {
    isa: *const c_void,
    flags: i32,
    reserved: i32,
    invoke: extern "C" fn(*const Block, bool),
    descriptor: *const BlockDescriptor,
}
unsafe impl Sync for Block {}
static DESCRIPTOR: BlockDescriptor = BlockDescriptor { reserved: 0, size: std::mem::size_of::<Block>() };

/// Set (from any thread) when the mic request finishes; `tick` reacts.
static MIC_ANSWERED: AtomicBool = AtomicBool::new(false);
static MIC_REQUESTED: AtomicBool = AtomicBool::new(false);
static MIC_ALERT_SHOWN: AtomicBool = AtomicBool::new(false);
static AX_PROMPTED: AtomicBool = AtomicBool::new(false);

extern "C" fn on_mic_answer(_block: *const Block, granted: bool) {
    eprintln!("otoji-tray: microphone access {}", if granted { "granted" } else { "denied" });
    MIC_ANSWERED.store(true, Ordering::Release);
}

/// Show the system "otoji would like to access the microphone" dialog.
unsafe fn request_mic() {
    if MIC_REQUESTED.swap(true, Ordering::AcqRel) {
        return;
    }
    // Block flags: BLOCK_IS_GLOBAL (1 << 28).
    let block = Box::leak(Box::new(Block {
        isa: &_NSConcreteGlobalBlock,
        flags: 1 << 28,
        reserved: 0,
        invoke: on_mic_answer,
        descriptor: &DESCRIPTOR,
    }));
    let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *const Block) =
        std::mem::transmute(objc_msgSend as *const ());
    f(
        cls(b"AVCaptureDevice\0"),
        sel(b"requestAccessForMediaType:completionHandler:\0"),
        nsstring("soun"),
        block,
    );
}

unsafe fn open_url(url: &str) {
    let nsurl = msg1_ptr(cls(b"NSURL\0"), sel(b"URLWithString:\0"), nsstring(url));
    let ws = msg0(cls(b"NSWorkspace\0"), sel(b"sharedWorkspace\0"));
    msg1_ptr(ws, sel(b"openURL:\0"), nsurl);
}

pub unsafe fn open_mic_settings() {
    open_url("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
}

/// Mic was denied earlier: explain, and offer to open the Settings pane.
unsafe fn alert_mic_denied() {
    let alert = msg0(msg0(cls(b"NSAlert\0"), sel(b"alloc\0")), sel(b"init\0"));
    msg1_ptr(alert, sel(b"setMessageText:\0"), nsstring("otoji needs microphone access"));
    msg1_ptr(
        alert,
        sel(b"setInformativeText:\0"),
        nsstring(
            "otoji turns your speech into text on this Mac. Turn on “otoji” under \
             Privacy & Security → Microphone — listening starts automatically once it’s allowed.",
        ),
    );
    msg1_ptr(alert, sel(b"addButtonWithTitle:\0"), nsstring("Open Microphone Settings"));
    msg1_ptr(alert, sel(b"addButtonWithTitle:\0"), nsstring("Later"));
    // An accessory app must activate itself or the alert opens behind others.
    let app = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
    let act: extern "C" fn(*mut c_void, *mut c_void, bool) = std::mem::transmute(objc_msgSend as *const ());
    act(app, sel(b"activateIgnoringOtherApps:\0"), true);
    let run: extern "C" fn(*mut c_void, *mut c_void) -> i64 = std::mem::transmute(objc_msgSend as *const ());
    if run(alert, sel(b"runModal\0")) == 1000 {
        // NSAlertFirstButtonReturn
        open_mic_settings();
    }
}

/// Show the system Accessibility prompt (once per launch) for the hotkey.
pub unsafe fn prompt_accessibility() {
    if AX_PROMPTED.swap(true, Ordering::AcqRel) || accessibility_granted() {
        return;
    }
    let dict_fn: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *const c_void) -> *mut c_void =
        std::mem::transmute(objc_msgSend as *const ());
    let yes = {
        let f: extern "C" fn(*mut c_void, *mut c_void, bool) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls(b"NSNumber\0"), sel(b"numberWithBool:\0"), true)
    };
    let opts = dict_fn(
        cls(b"NSDictionary\0"),
        sel(b"dictionaryWithObject:forKey:\0"),
        yes,
        kAXTrustedCheckOptionPrompt,
    );
    AXIsProcessTrustedWithOptions(opts);
}

/// Kick off the microphone flow. Main thread only.
pub unsafe fn ensure_mic() {
    match mic_status() {
        Mic::Authorized => {}
        Mic::NotDetermined => request_mic(),
        Mic::Denied => {
            if !MIC_ALERT_SHOWN.swap(true, Ordering::AcqRel) {
                alert_mic_denied();
            }
        }
    }
}

/// Re-run the flow from a menu click (always shows UI again).
pub unsafe fn ensure_mic_interactive() {
    match mic_status() {
        Mic::Authorized => {}
        Mic::NotDetermined => request_mic(),
        Mic::Denied => alert_mic_denied(),
    }
}

/// Polled from the refresh tick. Returns true when the mic just became usable
/// after the request dialog was answered (the caller then starts listening).
pub fn mic_answer_pending() -> bool {
    MIC_ANSWERED.swap(false, Ordering::AcqRel)
}
