fn main() {
    #[cfg(feature = "node")]
    napi_build::setup();

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
