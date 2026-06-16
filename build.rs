fn main() {
    #[cfg(feature = "node")]
    napi_build::setup();

    // The otoji-tray binary uses raw ObjC FFI for NSStatusBar; link AppKit
    // (and the implicit Foundation/CoreFoundation that ride along) on macOS.
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreFoundation");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=AudioToolbox");
        println!("cargo:rustc-link-lib=dylib=objc");

        // Compile the ObjC exception catcher used by the floating voice
        // overlay (src/overlay.rs): a stray NSException in AppKit drawing is
        // caught and logged instead of aborting the process.
        cc::Build::new()
            .file("objc_try.m")
            .flag("-fobjc-arc")
            .compile("otoji_objc_try");
        println!("cargo:rerun-if-changed=objc_try.m");
    }

    // Embed build timestamp so `otoji --version` shows when it was compiled.
    let now = std::process::Command::new("date")
        .arg("+%Y-%m-%d %H:%M")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_else(|| "unknown".into());
    let version = format!(
        "{} (built {})",
        std::env::var("CARGO_PKG_VERSION").unwrap_or_default(),
        now.trim()
    );
    println!("cargo:rustc-env=OTOJI_LONG_VERSION={version}");
    // Rebuild when source changes (for the auto-rebuild mtime check to stay valid).
    println!("cargo:rerun-if-changed=src/");
}
