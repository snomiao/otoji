# Multimodal Polish — Gemini Audio+Text Pipeline

## Problem

SenseVoice (offline ASR) is fast (~300ms per utterance) but makes errors:
homophones, proper nouns, ambiguous word boundaries. Text-only LLM polish
can guess from context, but **loses voice information** — intonation, emphasis,
pronunciation details that disambiguate.

Gemini is multimodal: it can accept audio + text together. By passing both
the raw audio segment and SenseVoice's hypothesis, Gemini can:
- Hear the actual pronunciation to resolve homophones
- Detect speaker intent from intonation
- Correct proper nouns it "hears" but SenseVoice misspelled
- Use cached conversation history for consistent terminology

## Architecture

```
Mic ──PCM──→ ┌─────────────────────┐
             │   SenseVoice (fast)  │
             │   VAD + offline ASR  │
             └──┬───────────────┬───┘
                │               │
         AsrEvent::Partial   AsrEvent::Final
         (display immediately)  │
                │               ├── text: "I went to the see"
                │               └── audio: Vec<f32> (kept!)
                │               │
                │        ┌──────▼──────────────────────────┐
                │        │  Gemini Multimodal Polish        │
                │        │                                  │
                │        │  Input:                          │
                │        │   - audio segment (PCM → base64) │
                │        │   - ASR hypothesis text          │
                │        │   - cached previous segments     │
                │        │                                  │
                │        │  Output:                         │
                │        │   - polished text                │
                │        └──────┬───────────────────────────┘
                │               │
                ▼               ▼
           ┌────────────────────────┐
           │   TUI / Display        │
           │                        │
           │   seg 1: "Hello world" │ ← polished (green)
           │   seg 2: "I went to    │ ← polishing... (yellow)
           │           the see"     │
           │   > I think that...    │ ← partial (dim)
           └────────────────────────┘
```

## Gemini Context Caching Strategy

Gemini API supports `cachedContent` — a stored prefix that persists across
requests (TTL ≥ 60s, billed at reduced rate). We use this to avoid re-sending
the entire conversation history on every polish call.

### Lifecycle

```
Segment 1 arrives:
  → No cache yet
  → Send: system_prompt + audio_1 + "ASR: <text_1>"
  → Receive: polished_1
  → Create cache: system_prompt + audio_1 + "ASR: <text_1>" + polished_1

Segment 2 arrives:
  → Use cache (contains seg 1)
  → Send: audio_2 + "ASR: <text_2>"  (only the delta!)
  → Receive: polished_2
  → Update cache: append audio_2 + text_2 + polished_2

Segment N arrives:
  → Use cache (contains segs 1..N-1)
  → Send: audio_N + "ASR: <text_N>"
  → Receive: polished_N
  → Update cache
```

### Cost model

Without caching: each request sends ALL previous audio + text → O(N²) tokens.
With caching: each request sends only the new segment → O(N) tokens total.
Cache storage is billed at ~25% of input token rate.

For a 1-hour session (~120 segments of ~5s each):
- Without cache: ~120 * 60 avg_segments * cost = very expensive
- With cache: ~120 * 1 segment * cost + cache storage = ~4x cheaper

### Cache content structure

```json
{
  "model": "gemini-2.5-flash",
  "cachedContent": {
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "System: You polish ASR transcripts..."},
          {"text": "[Segment 1]"},
          {"inlineData": {"mimeType": "audio/L16;rate=16000", "data": "<base64>"}},
          {"text": "ASR hypothesis: I went to the see"}
        ]
      },
      {
        "role": "model",
        "parts": [{"text": "I went to the sea."}]
      },
      {
        "role": "user",
        "parts": [
          {"text": "[Segment 2]"},
          {"inlineData": {"mimeType": "audio/L16;rate=16000", "data": "<base64>"}},
          {"text": "ASR hypothesis: Its really beautifull"}
        ]
      },
      {
        "role": "model",
        "parts": [{"text": "It's really beautiful."}]
      }
    ]
  }
}
```

New request (segment 3) references this cache and sends only:
```json
{
  "cachedContent": "<cache_name>",
  "contents": [{
    "role": "user",
    "parts": [
      {"text": "[Segment 3]"},
      {"inlineData": {"mimeType": "audio/L16;rate=16000", "data": "<base64>"}},
      {"text": "ASR hypothesis: I saw many ships on the see"}
    ]
  }]
}
```

## Implementation Plan

### Step 1: Keep audio in AsrEvent::Final

Currently SenseVoice discards the PCM buffer after decoding. We need to
preserve it so the polisher can access the audio.

```rust
// core.rs — add audio field
pub enum AsrEvent {
    Partial { seg_id: u64, text: String },
    Final {
        seg_id: u64,
        text: String,
        words: Vec<Word>,
        /// Raw PCM audio for this segment (16kHz mono f32).
        /// Kept for multimodal polish. None for cloud ASR providers
        /// that don't give us the original audio back.
        audio: Option<Vec<f32>>,
    },
    // ...
}
```

### Step 2: Extend Polisher trait

```rust
/// Input to the polish step. Carries both text and optional audio.
pub struct PolishInput<'a> {
    /// Raw ASR hypothesis text.
    pub text: &'a str,
    /// Previous polished sentence (for context continuity).
    pub prev: Option<&'a str>,
    /// Raw audio for this segment (16kHz mono f32, if available).
    /// Multimodal polishers use this; text-only polishers ignore it.
    pub audio: Option<&'a [f32]>,
}

#[async_trait]
pub trait Polisher: Send + Sync {
    fn name(&self) -> &'static str;

    /// Whether this polisher can use audio input for better results.
    fn is_multimodal(&self) -> bool { false }

    async fn polish(&self, input: PolishInput<'_>) -> Result<String>;
}
```

### Step 3: GeminiPolisher with caching

```rust
pub struct GeminiPolisher {
    api_key: String,
    model: String,
    client: reqwest::Client,
    /// Cached content name from the Gemini API. Updated after each segment.
    cache_name: tokio::sync::Mutex<Option<String>>,
    /// History of (audio_b64, asr_text, polished_text) for cache rebuilds.
    history: tokio::sync::Mutex<Vec<SegmentHistory>>,
}
```

### Step 4: Fallback chain update

```
Resolution order:
1. Gemini multimodal (if GEMINI_API_KEY set) — best quality, uses audio
2. Ollama / local LLM (if running) — good quality, text-only, free
3. Anthropic (if ANTHROPIC_API_KEY set) — good quality, text-only
4. NoopPolisher — no polishing
```

Wait — this conflicts with local-first. The principle should be:

```
Default (no config):
  Ollama → Noop

With GEMINI_API_KEY:
  Gemini multimodal → Ollama fallback → Noop

With ANTHROPIC_API_KEY:
  Ollama → Anthropic → Noop
```

User explicitly opts into cloud by setting API keys. Local always comes first
unless the user specifically wants multimodal quality (which requires cloud
today, until we have a local multimodal model).

**Exception**: Gemini multimodal is special because no local model currently
offers audio+text polish. When the user sets GEMINI_API_KEY, it's a deliberate
choice to get multimodal quality. So Gemini goes first when configured.

### Step 5: Audio memory management

Audio segments consume memory (~320KB per 10s segment at 16kHz f32). Strategies:
- Keep only last N segments in memory (configurable, default 20 = ~3 min)
- Drop audio after polish is complete (keep only text in history)
- Gemini cache handles the long-term context server-side

## Audio format for Gemini

Gemini accepts audio as `inlineData` with these formats:
- `audio/wav` — WAV container
- `audio/L16;rate=16000` — raw PCM (preferred, no overhead)
- `audio/mp3`, `audio/ogg` — also supported

We already have 16kHz mono i16 PCM from SenseVoice's buffer. Convert to
base64 and send as `audio/L16;rate=16000;channels=1;encoding=signed-integer;bits=16`.

Segment audio size:
- 5s segment: 16000 * 2 bytes * 5 = 160KB raw, ~214KB base64
- 10s segment: ~430KB base64
- Gemini input limit: 20MB per request → plenty of room

## Future: Local Multimodal

When local multimodal models mature (e.g., a fine-tuned whisper variant that
also does correction, or a local Gemma with audio support), the same
`PolishInput` interface works — just swap the implementation. The pipeline
design is provider-agnostic.
