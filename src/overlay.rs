//! Floating transparent voice overlay (macOS).
//!
//! A small always-on-top, click-through panel that draws a live mic waveform
//! plus the live subtitle/transcript. Pure Cocoa + Core Graphics — NO
//! WKWebView, so it needs no `navigator.mediaDevices`; the audio is captured
//! natively by `otoji listen`.
//!
//! Ported and slimmed down from CapsLockX's `voice_overlay.rs`: a custom
//! `OtojiWaveformView` (NSView subclass) is registered at runtime with a
//! `drawRect:` IMP that reads a global waveform buffer and renders via CG.
//!
//! Public API (no-ops on non-macOS):
//!   - [`init`]            register the view class (call once)
//!   - [`run_event_loop`]  bootstrap NSApplication + show + run (blocks)
//!   - [`show`] / [`hide`] order the panel in/out
//!   - [`update_waveform`] push mic RMS levels + VAD state
//!   - [`update_subtitle`] set the transcript line
//!   - [`update_translation`] set the sticky translation line
//!   - [`set_enabled`] / [`is_enabled`] gate pushes when no overlay is shown

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
    use std::sync::Mutex;

    // ── ObjC exception catcher (objc_try.m) ──────────────────────────────────
    extern "C" {
        fn objc_try_catch(fn_ptr: extern "C" fn(*mut c_void), context: *mut c_void) -> i32;
    }

    // ── ObjC runtime + libdispatch FFI ───────────────────────────────────────
    extern "C" {
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *mut c_void;
        fn objc_msgSend(receiver: *mut c_void, sel: *mut c_void, ...) -> *mut c_void;
        fn objc_allocateClassPair(
            sup: *mut c_void,
            name: *const std::ffi::c_char,
            extra: usize,
        ) -> *mut c_void;
        fn objc_registerClassPair(cls: *mut c_void);
        fn class_addMethod(
            cls: *mut c_void,
            sel: *mut c_void,
            imp: *const c_void,
            types: *const std::ffi::c_char,
        ) -> bool;
        fn dispatch_async_f(queue: *mut c_void, ctx: *mut c_void, work: extern "C" fn(*mut c_void));
        fn dlsym(handle: *mut c_void, symbol: *const std::ffi::c_char) -> *mut c_void;
    }

    #[allow(dead_code)]
    extern "C" {
        fn CGContextSaveGState(ctx: *mut c_void);
        fn CGContextRestoreGState(ctx: *mut c_void);
        fn CGContextSetRGBFillColor(ctx: *mut c_void, r: f64, g: f64, b: f64, a: f64);
        fn CGContextSetRGBStrokeColor(ctx: *mut c_void, r: f64, g: f64, b: f64, a: f64);
        fn CGContextSetLineWidth(ctx: *mut c_void, w: f64);
        fn CGContextMoveToPoint(ctx: *mut c_void, x: f64, y: f64);
        fn CGContextAddLineToPoint(ctx: *mut c_void, x: f64, y: f64);
        fn CGContextStrokePath(ctx: *mut c_void);
        fn CGContextSetLineCap(ctx: *mut c_void, cap: i32);
        fn CGContextAddArc(ctx: *mut c_void, x: f64, y: f64, r: f64, sa: f64, ea: f64, cw: i32);
        fn CGContextFillPath(ctx: *mut c_void);
        fn CGContextBeginPath(ctx: *mut c_void);
        fn CGContextClosePath(ctx: *mut c_void);
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct NSRect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    }

    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

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
    unsafe fn main_queue() -> *mut c_void {
        dlsym(RTLD_DEFAULT, b"_dispatch_main_q\0".as_ptr() as *const _)
    }
    unsafe fn nsstring(s: &str) -> *mut c_void {
        let cstr = match std::ffi::CString::new(s) {
            Ok(c) => c,
            Err(_) => std::ffi::CString::new("(invalid)").unwrap(),
        };
        let f: extern "C" fn(*mut c_void, *mut c_void, *const std::ffi::c_char) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(
            cls(b"NSString\0"),
            sel(b"stringWithUTF8String:\0"),
            cstr.as_ptr(),
        )
    }

    // ── Geometry ─────────────────────────────────────────────────────────────
    const OVERLAY_WIDTH: f64 = 560.0;
    const OVERLAY_HEIGHT: f64 = 148.0;
    const OVERLAY_TOP_MARGIN: f64 = 40.0;
    const CARD_INSET: f64 = 6.0;
    const CARD_RADIUS: f64 = 14.0;
    const CONTENT_X_PAD: f64 = 14.0;
    const CONTENT_Y_PAD: f64 = 11.0;
    const WAVE_SECTION_HEIGHT: f64 = 44.0;
    const WAVE_SECTION_GAP: f64 = 8.0;
    const WAVE_ROW_RADIUS: f64 = 9.0;

    fn overlay_card_rect(w: f64, h: f64) -> NSRect {
        NSRect {
            x: CARD_INSET,
            y: CARD_INSET,
            w: (w - 2.0 * CARD_INSET).max(0.0),
            h: (h - 2.0 * CARD_INSET).max(0.0),
        }
    }
    fn overlay_wave_rect(w: f64, h: f64) -> NSRect {
        let card = overlay_card_rect(w, h);
        NSRect {
            x: card.x + CONTENT_X_PAD - 4.0,
            y: card.y + card.h - CONTENT_Y_PAD - WAVE_SECTION_HEIGHT,
            w: (card.w - 2.0 * (CONTENT_X_PAD - 4.0)).max(0.0),
            h: WAVE_SECTION_HEIGHT,
        }
    }
    fn overlay_label_rect(w: f64, h: f64) -> NSRect {
        let card = overlay_card_rect(w, h);
        let wave = overlay_wave_rect(w, h);
        NSRect {
            x: card.x + CONTENT_X_PAD,
            y: card.y + CONTENT_Y_PAD,
            w: (card.w - 2.0 * CONTENT_X_PAD).max(0.0),
            h: (wave.y - card.y - CONTENT_Y_PAD - WAVE_SECTION_GAP).max(0.0),
        }
    }

    unsafe fn add_rounded_rect_path(cg: *mut c_void, rect: NSRect, radius: f64) {
        if rect.w <= 0.0 || rect.h <= 0.0 {
            return;
        }
        let r = radius.min(rect.w / 2.0).min(rect.h / 2.0).max(0.0);
        let (x, y, w, h) = (rect.x, rect.y, rect.w, rect.h);
        let half_pi = std::f64::consts::FRAC_PI_2;
        let pi = std::f64::consts::PI;
        CGContextBeginPath(cg);
        if r <= 0.0 {
            CGContextMoveToPoint(cg, x, y);
            CGContextAddLineToPoint(cg, x + w, y);
            CGContextAddLineToPoint(cg, x + w, y + h);
            CGContextAddLineToPoint(cg, x, y + h);
        } else {
            CGContextMoveToPoint(cg, x + r, y);
            CGContextAddLineToPoint(cg, x + w - r, y);
            CGContextAddArc(cg, x + w - r, y + r, r, -half_pi, 0.0, 0);
            CGContextAddLineToPoint(cg, x + w, y + h - r);
            CGContextAddArc(cg, x + w - r, y + h - r, r, 0.0, half_pi, 0);
            CGContextAddLineToPoint(cg, x + r, y + h);
            CGContextAddArc(cg, x + r, y + h - r, r, half_pi, pi, 0);
            CGContextAddLineToPoint(cg, x, y + r);
            CGContextAddArc(cg, x + r, y + r, r, pi, pi + half_pi, 0);
        }
        CGContextClosePath(cg);
    }
    unsafe fn fill_rounded_rect(cg: *mut c_void, rect: NSRect, radius: f64) {
        add_rounded_rect_path(cg, rect, radius);
        CGContextFillPath(cg);
    }
    unsafe fn stroke_rounded_rect(cg: *mut c_void, rect: NSRect, radius: f64) {
        add_rounded_rect_path(cg, rect, radius);
        CGContextStrokePath(cg);
    }
    unsafe fn stroke_line(cg: *mut c_void, x1: f64, y1: f64, x2: f64, y2: f64) {
        CGContextMoveToPoint(cg, x1, y1);
        CGContextAddLineToPoint(cg, x2, y2);
        CGContextStrokePath(cg);
    }
    unsafe fn fill_circle(cg: *mut c_void, x: f64, y: f64, radius: f64) {
        CGContextBeginPath(cg);
        CGContextAddArc(cg, x, y, radius, 0.0, std::f64::consts::PI * 2.0, 0);
        CGContextClosePath(cg);
        CGContextFillPath(cg);
    }
    unsafe fn draw_wave(
        cg: *mut c_void,
        levels: &[f32],
        mid_y: f64,
        max_amp: f64,
        start_x: f64,
        width: f64,
    ) {
        if levels.is_empty() || width <= 0.0 {
            return;
        }
        let n = levels.len();
        let step = if n > 1 { width / (n - 1) as f64 } else { width };
        CGContextMoveToPoint(cg, start_x, mid_y);
        for (i, &l) in levels.iter().enumerate() {
            let x = start_x + i as f64 * step;
            CGContextAddLineToPoint(cg, x, mid_y + l.clamp(0.0, 1.0) as f64 * max_amp);
        }
        CGContextStrokePath(cg);
        CGContextMoveToPoint(cg, start_x, mid_y);
        for (i, &l) in levels.iter().enumerate() {
            let x = start_x + i as f64 * step;
            CGContextAddLineToPoint(cg, x, mid_y - l.clamp(0.0, 1.0) as f64 * max_amp);
        }
        CGContextStrokePath(cg);
    }
    unsafe fn draw_wave_track(
        cg: *mut c_void,
        levels: &[f32],
        row: NSRect,
        active: bool,
        color: (f64, f64, f64),
    ) {
        let dot_x = row.x + 14.0;
        let wave_x = row.x + 30.0;
        let wave_w = (row.w - 42.0).max(0.0);
        let mid_y = row.y + row.h / 2.0;
        let amp = (row.h / 2.0 - 5.0).max(2.0);
        let (r, g, b) = color;
        CGContextSetRGBFillColor(cg, r, g, b, if active { 0.95 } else { 0.35 });
        fill_circle(cg, dot_x, mid_y, 4.0);
        CGContextSetRGBStrokeColor(cg, r, g, b, if active { 0.22 } else { 0.10 });
        CGContextSetLineWidth(cg, 1.0);
        stroke_line(cg, wave_x, mid_y, wave_x + wave_w, mid_y);
        if levels.is_empty() {
            return;
        }
        CGContextSetRGBStrokeColor(cg, r, g, b, if active { 0.20 } else { 0.09 });
        CGContextSetLineWidth(cg, if active { 5.5 } else { 4.0 });
        CGContextSetLineCap(cg, 1);
        draw_wave(cg, levels, mid_y, amp, wave_x, wave_w);
        CGContextSetRGBStrokeColor(cg, r, g, b, if active { 0.98 } else { 0.55 });
        CGContextSetLineWidth(cg, if active { 2.4 } else { 1.8 });
        CGContextSetLineCap(cg, 1);
        draw_wave(cg, levels, mid_y, amp, wave_x, wave_w);
    }

    // ── Shared state ─────────────────────────────────────────────────────────
    struct WaveformData {
        mic_levels: Vec<f32>,
        mic_vad: bool,
        subtitle: String,
        translation: String,
    }
    static WAVEFORM_DATA: Mutex<WaveformData> = Mutex::new(WaveformData {
        mic_levels: Vec::new(),
        mic_vad: false,
        subtitle: String::new(),
        translation: String::new(),
    });
    static VIEW_PTR: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static WINDOW_PTR: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static LABEL_PTR: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    static ENABLED: AtomicBool = AtomicBool::new(false);

    static REDRAW_PENDING: AtomicBool = AtomicBool::new(false);
    static LAST_REDRAW_MS: AtomicU64 = AtomicU64::new(0);
    const REDRAW_MIN_INTERVAL_MS: u64 = 50; // 20 Hz max

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    // ── drawRect: callback ───────────────────────────────────────────────────
    static DRAW_RECT_THIS: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
    extern "C" fn draw_rect(this: *mut c_void, _cmd: *mut c_void, _dirty: NSRect) {
        DRAW_RECT_THIS.store(this, Ordering::Release);
        let r = unsafe { objc_try_catch(draw_rect_c, std::ptr::null_mut()) };
        if r != 0 {
            eprintln!("[otoji] ObjC exception in draw_rect (caught)");
        }
    }
    extern "C" fn draw_rect_c(_: *mut c_void) {
        draw_rect_inner(DRAW_RECT_THIS.load(Ordering::Acquire));
    }
    fn draw_rect_inner(this: *mut c_void) {
        unsafe {
            let ns_gfx = cls(b"NSGraphicsContext\0");
            let ctx_obj = msg0(ns_gfx, sel(b"currentContext\0"));
            if ctx_obj.is_null() {
                return;
            }
            let cg = msg0(ctx_obj, sel(b"CGContext\0"));
            if cg.is_null() {
                return;
            }
            #[cfg(target_arch = "aarch64")]
            let bounds: NSRect = {
                let f: extern "C" fn(*mut c_void, *mut c_void) -> NSRect =
                    std::mem::transmute(objc_msgSend as *const ());
                f(this, sel(b"bounds\0"))
            };
            #[cfg(not(target_arch = "aarch64"))]
            let bounds = NSRect {
                x: 0.0,
                y: 0.0,
                w: OVERLAY_WIDTH,
                h: OVERLAY_HEIGHT,
            };
            let _ = this;

            let (w, h) = (bounds.w, bounds.h);
            let (mic_levels, mic_vad) = {
                let g = WAVEFORM_DATA.lock().unwrap_or_else(|e| e.into_inner());
                (g.mic_levels.clone(), g.mic_vad)
            };

            CGContextSaveGState(cg);
            let card = overlay_card_rect(w, h);
            let wave = overlay_wave_rect(w, h);

            // Card background.
            CGContextSetRGBFillColor(cg, 0.05, 0.06, 0.08, 0.84);
            fill_rounded_rect(cg, card, CARD_RADIUS);
            CGContextSetRGBStrokeColor(cg, 1.0, 1.0, 1.0, 0.08);
            CGContextSetLineWidth(cg, 1.0);
            stroke_rounded_rect(cg, card, CARD_RADIUS);

            // Single mic waveform row.
            CGContextSetRGBFillColor(cg, 0.11, 0.21, 0.15, if mic_vad { 0.24 } else { 0.11 });
            fill_rounded_rect(cg, wave, WAVE_ROW_RADIUS);
            CGContextSetRGBStrokeColor(cg, 0.29, 0.87, 0.5, if mic_vad { 0.18 } else { 0.08 });
            CGContextSetLineWidth(cg, 1.0);
            stroke_rounded_rect(cg, wave, WAVE_ROW_RADIUS);
            draw_wave_track(cg, &mic_levels, wave, mic_vad, (0.29, 0.87, 0.50));

            let divider_y = wave.y - WAVE_SECTION_GAP / 2.0;
            CGContextSetRGBStrokeColor(cg, 1.0, 1.0, 1.0, 0.06);
            CGContextSetLineWidth(cg, 1.0);
            stroke_line(
                cg,
                card.x + CONTENT_X_PAD - 2.0,
                divider_y,
                card.x + card.w - CONTENT_X_PAD + 2.0,
                divider_y,
            );
            CGContextRestoreGState(cg);
        }
    }

    // ── Text styling ─────────────────────────────────────────────────────────
    unsafe fn nscolor(r: f64, g: f64, b: f64, a: f64) -> *mut c_void {
        let f: extern "C" fn(*mut c_void, *mut c_void, f64, f64, f64, f64) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(
            cls(b"NSColor\0"),
            sel(b"colorWithRed:green:blue:alpha:\0"),
            r,
            g,
            b,
            a,
        )
    }
    unsafe fn system_font(size: f64) -> *mut c_void {
        let f: extern "C" fn(*mut c_void, *mut c_void, f64) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls(b"NSFont\0"), sel(b"systemFontOfSize:\0"), size)
    }
    unsafe fn bold_system_font(size: f64) -> *mut c_void {
        let f: extern "C" fn(*mut c_void, *mut c_void, f64) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(cls(b"NSFont\0"), sel(b"boldSystemFontOfSize:\0"), size)
    }
    unsafe fn paragraph_style(alignment: i64, line_spacing: f64) -> *mut c_void {
        let para = msg0(
            msg0(cls(b"NSMutableParagraphStyle\0"), sel(b"alloc\0")),
            sel(b"init\0"),
        );
        let f_i64: extern "C" fn(*mut c_void, *mut c_void, i64) =
            std::mem::transmute(objc_msgSend as *const ());
        let f_f64: extern "C" fn(*mut c_void, *mut c_void, f64) =
            std::mem::transmute(objc_msgSend as *const ());
        f_i64(para, sel(b"setAlignment:\0"), alignment);
        f_f64(para, sel(b"setLineSpacing:\0"), line_spacing);
        para
    }
    unsafe fn make_attrs(
        color: *mut c_void,
        font: *mut c_void,
        paragraph: *mut c_void,
    ) -> *mut c_void {
        let f2: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());
        let dict = msg0(
            msg0(cls(b"NSMutableDictionary\0"), sel(b"alloc\0")),
            sel(b"init\0"),
        );
        f2(dict, sel(b"setObject:forKey:\0"), color, nsstring("NSColor"));
        f2(dict, sel(b"setObject:forKey:\0"), font, nsstring("NSFont"));
        f2(
            dict,
            sel(b"setObject:forKey:\0"),
            paragraph,
            nsstring("NSParagraphStyle"),
        );
        dict
    }
    unsafe fn append_attr_text(target: *mut c_void, text: &str, attrs: *mut c_void) {
        if text.is_empty() {
            return;
        }
        let ns_seg = nsstring(text);
        let attr_seg: *mut c_void = {
            let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            f(
                msg0(cls(b"NSAttributedString\0"), sel(b"alloc\0")),
                sel(b"initWithString:attributes:\0"),
                ns_seg,
                attrs,
            )
        };
        msg1_ptr(target, sel(b"appendAttributedString:\0"), attr_seg);
    }
    unsafe fn set_attributed_subtitle(label: *mut c_void, text: &str) {
        let pool = msg0(
            msg0(cls(b"NSAutoreleasePool\0"), sel(b"alloc\0")),
            sel(b"init\0"),
        );
        let mic_accent = nscolor(0.45, 0.95, 0.63, 1.0);
        let primary = nscolor(0.95, 0.97, 1.0, 0.97);
        let secondary = nscolor(0.70, 0.77, 0.87, 0.90);
        let paragraph = paragraph_style(0, 4.0);
        let body_attrs = make_attrs(primary, system_font(18.0), paragraph);
        let mic_prefix_attrs = make_attrs(mic_accent, bold_system_font(18.0), paragraph);
        let secondary_attrs = make_attrs(secondary, system_font(17.0), paragraph);

        let mut_attr_cls = cls(b"NSMutableAttributedString\0");
        let result = msg0(msg0(mut_attr_cls, sel(b"alloc\0")), sel(b"init\0"));

        let lines: Vec<&str> = text.split('\n').collect();
        for (li, line) in lines.iter().enumerate() {
            if let Some(rest) = line.strip_prefix("🎤 ") {
                append_attr_text(result, "🎤 ", mic_prefix_attrs);
                append_attr_text(result, rest, body_attrs);
            } else {
                append_attr_text(result, line, secondary_attrs);
            }
            if li < lines.len() - 1 {
                append_attr_text(result, "\n", secondary_attrs);
            }
        }
        msg1_ptr(label, sel(b"setAttributedStringValue:\0"), result);
        msg0(pool, sel(b"drain\0"));
    }

    // ── Redraw ───────────────────────────────────────────────────────────────
    fn request_redraw() {
        let now = now_ms();
        let last = LAST_REDRAW_MS.load(Ordering::Relaxed);
        if now.saturating_sub(last) >= REDRAW_MIN_INTERVAL_MS {
            if !REDRAW_PENDING.swap(true, Ordering::AcqRel) {
                LAST_REDRAW_MS.store(now, Ordering::Relaxed);
                unsafe {
                    let q = main_queue();
                    if !q.is_null() {
                        dispatch_async_f(q, std::ptr::null_mut(), trigger_redraw_throttled);
                    } else {
                        REDRAW_PENDING.store(false, Ordering::Release);
                    }
                }
            }
        } else if !REDRAW_PENDING.load(Ordering::Acquire) {
            let delay = REDRAW_MIN_INTERVAL_MS - now.saturating_sub(last);
            REDRAW_PENDING.store(true, Ordering::Release);
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(delay));
                LAST_REDRAW_MS.store(now_ms(), Ordering::Relaxed);
                unsafe {
                    let q = main_queue();
                    if !q.is_null() {
                        dispatch_async_f(q, std::ptr::null_mut(), trigger_redraw_throttled);
                    } else {
                        REDRAW_PENDING.store(false, Ordering::Release);
                    }
                }
            });
        }
    }
    extern "C" fn trigger_redraw_throttled(ctx: *mut c_void) {
        REDRAW_PENDING.store(false, Ordering::Release);
        let _ = ctx;
        let r = unsafe { objc_try_catch(trigger_redraw_c, std::ptr::null_mut()) };
        if r != 0 {
            eprintln!("[otoji] ObjC exception in trigger_redraw (caught)");
        }
    }
    extern "C" fn trigger_redraw_c(_: *mut c_void) {
        unsafe {
            let view = VIEW_PTR.load(Ordering::Acquire);
            if !view.is_null() {
                let f: extern "C" fn(*mut c_void, *mut c_void, bool) =
                    std::mem::transmute(objc_msgSend as *const ());
                f(view, sel(b"setNeedsDisplay:\0"), true);
            }
            let label = LABEL_PTR.load(Ordering::Acquire);
            if !label.is_null() {
                let text = {
                    let g = WAVEFORM_DATA.lock().unwrap_or_else(|e| e.into_inner());
                    let translation_line = if g.translation.is_empty() {
                        String::new()
                    } else {
                        format!("\n→ {}", g.translation)
                    };
                    let top = if g.subtitle.is_empty() {
                        if g.mic_vad {
                            "🎤 Speaking…".to_string()
                        } else {
                            "🎤 Listening…".to_string()
                        }
                    } else {
                        format!("🎤 {}", truncate_tail(&g.subtitle, 120))
                    };
                    format!("{top}{translation_line}")
                };
                set_attributed_subtitle(label, &text);
            }
        }
    }
    fn truncate_tail(s: &str, max_chars: usize) -> String {
        let chars: Vec<char> = s.chars().collect();
        if chars.len() <= max_chars {
            s.to_string()
        } else {
            let tail: String = chars[chars.len() - max_chars..].iter().collect();
            format!("…{tail}")
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────
    pub fn init() {
        unsafe {
            let sup = cls(b"NSView\0");
            if sup.is_null() {
                return;
            }
            let name = b"OtojiWaveformView\0";
            // If already registered (objc_getClass returns non-null), skip.
            if !cls(name).is_null() {
                return;
            }
            let new_cls = objc_allocateClassPair(sup, name.as_ptr() as *const _, 0);
            if new_cls.is_null() {
                return;
            }
            let types = b"v@:{CGRect={CGPoint=dd}{CGSize=dd}}\0";
            class_addMethod(
                new_cls,
                sel(b"drawRect:\0"),
                draw_rect as *const c_void,
                types.as_ptr() as *const _,
            );
            objc_registerClassPair(new_cls);
        }
    }

    pub fn show() {
        unsafe {
            let q = main_queue();
            if !q.is_null() {
                dispatch_async_f(q, std::ptr::null_mut(), show_main);
            }
        }
    }
    extern "C" fn show_main(_: *mut c_void) {
        let r = unsafe { objc_try_catch(show_main_c, std::ptr::null_mut()) };
        if r != 0 {
            eprintln!("[otoji] ObjC exception in show_main (caught)");
        }
    }
    extern "C" fn show_main_c(_: *mut c_void) {
        show_main_inner();
    }
    fn show_main_inner() {
        unsafe {
            let pool = msg0(
                msg0(cls(b"NSAutoreleasePool\0"), sel(b"alloc\0")),
                sel(b"init\0"),
            );
            let existing = WINDOW_PTR.load(Ordering::Acquire);
            if !existing.is_null() {
                let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
                    std::mem::transmute(objc_msgSend as *const ());
                f(existing, sel(b"orderFront:\0"), std::ptr::null_mut());
                msg0(pool, sel(b"drain\0"));
                return;
            }
            let scr = msg0(cls(b"NSScreen\0"), sel(b"mainScreen\0"));
            if scr.is_null() {
                return;
            }
            #[cfg(target_arch = "aarch64")]
            let sf: NSRect = {
                let f: extern "C" fn(*mut c_void, *mut c_void) -> NSRect =
                    std::mem::transmute(objc_msgSend as *const ());
                f(scr, sel(b"frame\0"))
            };
            #[cfg(not(target_arch = "aarch64"))]
            let sf = NSRect {
                x: 0.0,
                y: 0.0,
                w: 1920.0,
                h: 1080.0,
            };

            let ow = OVERLAY_WIDTH;
            let oh = OVERLAY_HEIGHT;
            let rect = NSRect {
                x: (sf.w - ow) / 2.0,
                y: sf.h - oh - OVERLAY_TOP_MARGIN,
                w: ow,
                h: oh,
            };

            let alloc = msg0(cls(b"NSWindow\0"), sel(b"alloc\0"));
            let win: *mut c_void = {
                let f: extern "C" fn(
                    *mut c_void,
                    *mut c_void,
                    NSRect,
                    u64,
                    u64,
                    bool,
                ) -> *mut c_void = std::mem::transmute(objc_msgSend as *const ());
                f(
                    alloc,
                    sel(b"initWithContentRect:styleMask:backing:defer:\0"),
                    rect,
                    0u64, // borderless
                    2u64, // buffered
                    false,
                )
            };
            if win.is_null() {
                return;
            }
            let f_bool: extern "C" fn(*mut c_void, *mut c_void, bool) =
                std::mem::transmute(objc_msgSend as *const ());
            f_bool(win, sel(b"setOpaque:\0"), false);
            msg1_ptr(
                win,
                sel(b"setBackgroundColor:\0"),
                msg0(cls(b"NSColor\0"), sel(b"clearColor\0")),
            );
            let f_i64: extern "C" fn(*mut c_void, *mut c_void, i64) =
                std::mem::transmute(objc_msgSend as *const ());
            f_i64(win, sel(b"setLevel:\0"), 3); // floating
            f_bool(win, sel(b"setIgnoresMouseEvents:\0"), true);
            f_bool(win, sel(b"setHasShadow:\0"), false);
            let f_u64: extern "C" fn(*mut c_void, *mut c_void, u64) =
                std::mem::transmute(objc_msgSend as *const ());
            f_u64(win, sel(b"setCollectionBehavior:\0"), 1 | 16); // allSpaces + stationary

            let view_cls = cls(b"OtojiWaveformView\0");
            if view_cls.is_null() {
                return;
            }
            let vr = NSRect {
                x: 0.0,
                y: 0.0,
                w: ow,
                h: oh,
            };
            let view: *mut c_void = {
                let f: extern "C" fn(*mut c_void, *mut c_void, NSRect) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(msg0(view_cls, sel(b"alloc\0")), sel(b"initWithFrame:\0"), vr)
            };
            if view.is_null() {
                return;
            }
            let container: *mut c_void = {
                let f: extern "C" fn(*mut c_void, *mut c_void, NSRect) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(
                    msg0(cls(b"NSView\0"), sel(b"alloc\0")),
                    sel(b"initWithFrame:\0"),
                    vr,
                )
            };
            msg1_ptr(container, sel(b"addSubview:\0"), view);

            let label_rect = overlay_label_rect(ow, oh);
            let label: *mut c_void = {
                let f: extern "C" fn(*mut c_void, *mut c_void, NSRect) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(
                    msg0(cls(b"NSTextField\0"), sel(b"alloc\0")),
                    sel(b"initWithFrame:\0"),
                    label_rect,
                )
            };
            if !label.is_null() {
                f_bool(label, sel(b"setBezeled:\0"), false);
                f_bool(label, sel(b"setDrawsBackground:\0"), false);
                f_bool(label, sel(b"setEditable:\0"), false);
                f_bool(label, sel(b"setSelectable:\0"), false);
                f_i64(label, sel(b"setAlignment:\0"), 0);
                f_i64(label, sel(b"setMaximumNumberOfLines:\0"), 0);
                let cell = msg0(label, sel(b"cell\0"));
                if !cell.is_null() {
                    f_i64(cell, sel(b"setLineBreakMode:\0"), 0);
                    f_bool(cell, sel(b"setWraps:\0"), true);
                }
                set_attributed_subtitle(label, "🎤 Listening…");
                msg1_ptr(container, sel(b"addSubview:\0"), label);
                LABEL_PTR.store(label, Ordering::Release);
            }

            msg1_ptr(win, sel(b"setContentView:\0"), container);
            let f_show: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
                std::mem::transmute(objc_msgSend as *const ());
            f_show(win, sel(b"orderFront:\0"), std::ptr::null_mut());

            VIEW_PTR.store(view, Ordering::Release);
            WINDOW_PTR.store(win, Ordering::Release);
            msg0(pool, sel(b"drain\0"));
        }
    }

    pub fn hide() {
        unsafe {
            let q = main_queue();
            if !q.is_null() {
                dispatch_async_f(q, std::ptr::null_mut(), hide_main);
            }
        }
    }
    extern "C" fn hide_main(_: *mut c_void) {
        let r = unsafe { objc_try_catch(hide_main_c, std::ptr::null_mut()) };
        if r != 0 {
            eprintln!("[otoji] ObjC exception in hide_main (caught)");
        }
    }
    extern "C" fn hide_main_c(_: *mut c_void) {
        unsafe {
            let win = WINDOW_PTR.load(Ordering::Acquire);
            if !win.is_null() {
                let f: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) =
                    std::mem::transmute(objc_msgSend as *const ());
                f(win, sel(b"orderOut:\0"), std::ptr::null_mut());
            }
            if let Ok(mut g) = WAVEFORM_DATA.lock() {
                g.mic_levels.clear();
                g.mic_vad = false;
                g.subtitle.clear();
                g.translation.clear();
            }
        }
    }

    /// Bootstrap NSApplication as a UI agent (no Dock icon), show the overlay,
    /// and run the main event loop. BLOCKS until the app is terminated. Must be
    /// called on the process's main thread.
    pub fn run_event_loop() {
        init();
        show();
        unsafe {
            let app = msg0(cls(b"NSApplication\0"), sel(b"sharedApplication\0"));
            if app.is_null() {
                eprintln!("[otoji] NSApplication sharedApplication returned null");
                return;
            }
            // NSApplicationActivationPolicyAccessory = 1 (agent, no Dock icon).
            let f_pol: extern "C" fn(*mut c_void, *mut c_void, i64) -> bool =
                std::mem::transmute(objc_msgSend as *const ());
            f_pol(app, sel(b"setActivationPolicy:\0"), 1);
            let f_run: extern "C" fn(*mut c_void, *mut c_void) =
                std::mem::transmute(objc_msgSend as *const ());
            f_run(app, sel(b"run\0"));
        }
    }

    // ── Data pushes ──────────────────────────────────────────────────────────
    pub fn set_enabled(on: bool) {
        ENABLED.store(on, Ordering::Release);
    }
    pub fn is_enabled() -> bool {
        ENABLED.load(Ordering::Acquire)
    }

    pub fn update_waveform(levels: &[f32], vad_active: bool) {
        let mut changed;
        {
            let mut g = WAVEFORM_DATA.lock().unwrap_or_else(|e| e.into_inner());
            changed = g.mic_vad != vad_active;
            g.mic_vad = vad_active;
            if !levels.is_empty() {
                g.mic_levels.extend_from_slice(levels);
                if g.mic_levels.len() > 100 {
                    let drop = g.mic_levels.len() - 100;
                    g.mic_levels.drain(..drop);
                }
                changed = true;
            }
        }
        if changed {
            request_redraw();
        }
    }

    pub fn update_subtitle(text: &str) {
        let mut changed = false;
        {
            let mut g = WAVEFORM_DATA.lock().unwrap_or_else(|e| e.into_inner());
            if g.subtitle != text {
                g.subtitle = text.to_string();
                changed = true;
            }
        }
        if changed {
            request_redraw();
        }
    }

    pub fn update_translation(text: &str) {
        let mut changed = false;
        {
            let mut g = WAVEFORM_DATA.lock().unwrap_or_else(|e| e.into_inner());
            if g.translation != text {
                g.translation = text.to_string();
                changed = true;
            }
        }
        if changed {
            request_redraw();
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn init() {}
    pub fn show() {}
    pub fn hide() {}
    pub fn run_event_loop() {}
    pub fn set_enabled(_on: bool) {}
    pub fn is_enabled() -> bool {
        false
    }
    pub fn update_waveform(_levels: &[f32], _vad_active: bool) {}
    pub fn update_subtitle(_text: &str) {}
    pub fn update_translation(_text: &str) {}
}

pub use imp::*;
