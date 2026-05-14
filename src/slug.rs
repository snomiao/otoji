//! Filename slug helpers — base36 timestamps + content-derived slugs.
//!
//! Target stem: `<base36-ms>-<slug>` (e.g. `kqx2u4t8-meeting-with-alice`).
//! When no slug can be derived (empty/garbage text), the bare ts stem
//! `kqx2u4t8` is still a valid final state.
//!
//! All filename chars are restricted to a cross-platform-safe set:
//! alphanumerics, `-`, plus any non-ASCII unicode (CJK is fine on every
//! modern filesystem). Windows-illegal punctuation `< > : " / \ | ? *`
//! and control chars are stripped.

/// Encode a unix-ms timestamp as base36 (lowercase). 13-digit ms fits
/// in 8 base36 chars (36^8 ≈ 2.8e12 > current ms).
pub fn base36_ts(ms: i64) -> String {
    let mut n = ms.max(0) as u64;
    if n == 0 {
        return "0".into();
    }
    let mut out = Vec::with_capacity(9);
    while n > 0 {
        let d = (n % 36) as u8;
        out.push(if d < 10 { b'0' + d } else { b'a' + d - 10 });
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

/// Derive a filename-safe slug from arbitrary text. Returns `None` when
/// the result would be empty.
///
/// Rules:
///   - whitespace → `-`
///   - strip Windows-illegal `< > : " / \ | ? *` + ASCII control chars
///   - strip leading/trailing dots (Windows trims these silently)
///   - collapse runs of `-`
///   - lowercase ASCII; preserve non-ASCII (CJK kept verbatim)
///   - cap to `max_chars` (char-count, not bytes); break at last `-` if
///     possible to avoid mid-word truncation
pub fn slug_from_text(text: &str, max_chars: usize) -> Option<String> {
    let mut buf = String::with_capacity(text.len());
    let mut last_dash = true; // collapse leading dashes
    for ch in text.chars() {
        let c = if ch.is_whitespace() { '-' } else { ch };
        let keep = match c {
            '-' => true,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => false,
            _ if c.is_control() => false,
            _ if c.is_ascii() => c.is_ascii_alphanumeric(),
            _ => true, // keep non-ASCII (CJK etc.)
        };
        if !keep {
            continue;
        }
        if c == '-' {
            if last_dash {
                continue;
            }
            last_dash = true;
        } else {
            last_dash = false;
        }
        buf.push(c.to_ascii_lowercase());
    }
    let trimmed = buf.trim_matches(|c: char| c == '-' || c == '.').to_string();
    if trimmed.is_empty() {
        return None;
    }
    Some(truncate_at_word(&trimmed, max_chars))
}

fn truncate_at_word(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        return s.to_string();
    }
    let head: String = chars[..max_chars].iter().collect();
    // Prefer breaking at last dash to avoid mid-word cut.
    if let Some(pos) = head.rfind('-') {
        if pos >= max_chars / 2 {
            return head[..pos].to_string();
        }
    }
    head
}

/// Compose the canonical stem `<base36-ts>[-<slug>]`.
pub fn compose_stem(ts_ms: i64, slug: Option<&str>) -> String {
    match slug {
        Some(s) if !s.is_empty() => format!("{}-{}", base36_ts(ts_ms), s),
        _ => base36_ts(ts_ms),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base36_round_trip_lengths() {
        assert_eq!(base36_ts(0), "0");
        // 13-digit ms → 8 base36 chars
        assert_eq!(base36_ts(1_745_151_893_020).len(), 8);
    }

    #[test]
    fn slug_basic() {
        assert_eq!(
            slug_from_text("Hello, World!", 50).as_deref(),
            Some("hello-world")
        );
        assert_eq!(
            slug_from_text("  multiple   spaces  ", 50).as_deref(),
            Some("multiple-spaces")
        );
        assert_eq!(
            slug_from_text("path/with\\bad:chars?", 50).as_deref(),
            Some("pathwithbadchars")
        );
    }

    #[test]
    fn slug_keeps_cjk() {
        let s = slug_from_text("こんにちは 世界", 50).unwrap();
        assert!(s.contains("こんにちは"));
        assert!(s.contains("世界"));
    }

    #[test]
    fn slug_truncates_at_word_boundary() {
        let s = slug_from_text("the quick brown fox jumps over the lazy dog", 20).unwrap();
        assert!(s.len() <= 20);
        assert!(!s.ends_with('-'));
    }

    #[test]
    fn slug_empty_returns_none() {
        assert_eq!(slug_from_text("", 50), None);
        assert_eq!(slug_from_text("???///", 50), None);
        assert_eq!(slug_from_text("   ", 50), None);
    }

    #[test]
    fn compose_with_and_without_slug() {
        let ts = 1_745_151_893_020;
        let b36 = base36_ts(ts);
        assert_eq!(
            compose_stem(ts, Some("hello-world")),
            format!("{b36}-hello-world")
        );
        assert_eq!(compose_stem(ts, None), b36.clone());
        assert_eq!(compose_stem(ts, Some("")), b36);
    }

    #[test]
    fn slug_strips_dots_and_dashes() {
        assert_eq!(slug_from_text("...---hi---...", 50).as_deref(), Some("hi"));
    }
}
