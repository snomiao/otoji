//! Integration tests for the PTT wire protocol: JSON event serialization,
//! translate-JSON parsing, language-tag extraction.
//!
//! These tests do NOT require network / API keys — they exercise the
//! deterministic parts of the pipeline (protocol, parsing, state).

use otoji::core::AsrEvent;

#[test]
fn serialize_ptt_events_as_json_lines() {
    let events = vec![
        AsrEvent::Open,
        AsrEvent::PttPartial { text: "hello".into() },
        AsrEvent::PttFinal { text: "hello world".into() },
        AsrEvent::PttUpgrade { text: "Hello, world.".into() },
        AsrEvent::PttTranslated { text: "こんにちは、世界。".into(), lang: "ja".into() },
        AsrEvent::LanguageDetected { lang: "en".into() },
        AsrEvent::Closed,
    ];
    for ev in events {
        let s = serde_json::to_string(&ev).expect("serialize");
        assert!(s.starts_with("{\"type\":"), "bad prefix: {s}");
        // Round-trip.
        let back: AsrEvent = serde_json::from_str(&s).expect("parse");
        assert_eq!(
            serde_json::to_string(&back).unwrap(),
            s,
            "round-trip differs"
        );
    }
}

#[test]
fn ptt_events_have_snake_case_type_discriminant() {
    let e = AsrEvent::PttPartial { text: "hi".into() };
    let s = serde_json::to_string(&e).unwrap();
    assert!(s.contains("\"type\":\"ptt_partial\""), "bad: {s}");

    let e = AsrEvent::PttUpgrade { text: "hi.".into() };
    let s = serde_json::to_string(&e).unwrap();
    assert!(s.contains("\"type\":\"ptt_upgrade\""), "bad: {s}");

    let e = AsrEvent::PttTranslated { text: "ja".into(), lang: "ja".into() };
    let s = serde_json::to_string(&e).unwrap();
    assert!(s.contains("\"type\":\"ptt_translated\""), "bad: {s}");
    assert!(s.contains("\"lang\":\"ja\""));

    let e = AsrEvent::LanguageDetected { lang: "zh".into() };
    let s = serde_json::to_string(&e).unwrap();
    assert!(s.contains("\"type\":\"language_detected\""), "bad: {s}");
}

#[test]
fn language_tag_regex_accepts_valid_codes() {
    // These strings mirror real SenseVoice outputs.
    let cases = [
        ("<|en|><|NEUTRAL|><|Speech|><|woitn|>hello", Some("en")),
        ("<|ja|><|NEUTRAL|>こんにちは", Some("ja")),
        ("<|zh|><|HAPPY|>你好", Some("zh")),
        ("<|yue|>粤语测试", Some("yue")),
        ("<|ko|>안녕하세요", Some("ko")),
        ("no tags at all", None),
        ("<|EMOTION|>not a language", None),
        ("<|toolong|>too long tag", None),
    ];
    for (input, expected) in cases {
        let got = parse_tag_for_test(input);
        assert_eq!(got.as_deref(), expected, "input={input:?}");
    }
}

// Duplicate the language tag parser locally so the test doesn't need a
// `pub` re-export from the library's private internals. Keep in sync with
// `src/asr/sensevoice.rs::parse_language_tag`.
fn parse_tag_for_test(raw: &str) -> Option<String> {
    let start = raw.find("<|")?;
    let rest = &raw[start + 2..];
    let end = rest.find("|>")?;
    let tag = &rest[..end];
    if (2..=4).contains(&tag.len()) && tag.chars().all(|c| c.is_ascii_lowercase()) {
        Some(tag.to_string())
    } else {
        None
    }
}

#[test]
fn translate_json_parsing_handles_fenced_output() {
    // The Gemini / OpenAI polishers sometimes wrap JSON in ```json fences
    // despite being asked not to. The parser should tolerate both.
    let samples = [
        r#"{"original": "How are you?", "translated": "お元気ですか？"}"#,
        r#"```json
{"original": "Hi", "translated": "こんにちは"}
```"#,
        r#"```
{"original": "Hello", "translated": "Bonjour"}
```"#,
        r#"Sure! {"original": "Test", "translated": "テスト"}"#,
    ];
    for s in samples {
        let parsed = try_parse_translate_json(s);
        assert!(parsed.is_some(), "failed to parse: {s:?}");
        let (orig, trans) = parsed.unwrap();
        assert!(!orig.is_empty(), "empty original in: {s:?}");
        assert!(trans.is_some(), "missing translation in: {s:?}");
    }
}

// Local helper for test — keep in sync with polish.rs::parse_translate_json.
fn try_parse_translate_json(s: &str) -> Option<(String, Option<String>)> {
    let trimmed = s.trim();
    let body = if let Some(stripped) = trimmed.strip_prefix("```json") {
        stripped.trim_end_matches("```").trim()
    } else if let Some(stripped) = trimmed.strip_prefix("```") {
        stripped.trim_end_matches("```").trim()
    } else {
        trimmed
    };
    let start = body.find('{')?;
    let end = body.rfind('}')?;
    let json = &body[start..=end];
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let original = v.get("original")?.as_str()?.trim().to_string();
    let translated = v.get("translated").and_then(|t| t.as_str()).map(|t| t.trim().to_string());
    Some((original, translated))
}
