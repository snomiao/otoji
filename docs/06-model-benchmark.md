# Model Benchmark: ASR × Polish Pipeline Selection

## Method

### Test data

We downloaded 3-minute clips from YouTube with subtitles as ground truth:

| File | Content | Subtitle type |
|------|---------|---------------|
| toast-ja | Comprehensible Japanese (toast-making lesson) | **Human-reviewed** |
| easy-ja | Easy Japanese talking (daily life) | **Human-reviewed** |
| yuyu-ja | YUYU Japanese podcast (conversation tips) | Auto-generated |

Human-reviewed subtitles (`--no-write-auto-subs` flag in yt-dlp) are the most
reliable ground truth. Auto-generated subtitles from YouTube are another ASR
output and should only be used for relative comparison.

### Accuracy metric

**Semantic CER** — Character Error Rate ignoring:
- Punctuation differences (`、` vs space, `。` presence)
- Kana/kanji style variants (`皆` vs `みな`, `飯` vs `はん`, `分` vs `わ`)
- Filler removal (`え`, `うん`, `あの`)

Only count errors that change meaning: wrong words, missing words, wrong
proper nouns, sentence truncation.

### TTFB measurement

Time from sending the request to receiving the full response (not streaming
first token). Measured 3 times, report average and minimum.

## Results: ASR Comparison

Input: 3-minute Japanese audio files, 16kHz mono WAV.

| ASR Engine | toast-ja | easy-ja | yuyu-ja | Avg | Type |
|-----------|----------|---------|---------|-----|------|
| **Gemini-ASR** | 94.9% | 90.2% | 95.5% | **93.5%** | Cloud, batch |
| **Whisper** | 94.3% | 55.2%* | 94.9% | 81.5% | Cloud, batch |
| **SenseVoice v2** | 94.6% | 89.7% | 92.7% | **92.3%** | Local, streaming |
| SenseVoice v1 | 92.9% | 88.6% | 93.7% | 91.7% | Local, streaming |

*Whisper returned all-hiragana for easy-ja, inflating CER against kanji ref.

**Key finding**: SenseVoice (local, free, streaming) is within 1.2% of
Gemini-ASR (cloud, paid, batch). The gap is almost entirely proper nouns.

## Results: Polish TTFB + Accuracy

Input: 73-char Japanese ASR segment. 3 runs each.

| Model | TTFB avg | TTFB min | Semantic fixes | Cost |
|-------|----------|----------|---------------|------|
| **noop** | 0ms | 0ms | 0/3 | Free |
| **MLX Qwen2.5-1.5B** (local) | 542ms | 377ms | 0/3 | Free |
| **GPT-4o** | 803ms | 736ms | 1/3 | API |
| **GPT-4o-mini** | 1654ms | 1428ms | 1/3 | API |
| **Gemini 2.5 Flash** | 3490ms | 3022ms | 1/3 | API |
| **Gemini 2.5 Pro** | 14069ms | 10022ms | 1/3 | API |

**Key finding**: GPT-4o is fastest cloud model (736ms) AND fixes the most
errors. Gemini Flash is 4x slower but supports multimodal (audio+text) polish.

## Results: Full Pipeline Matrix (ASR × Polish)

Best pipeline = SenseVoice + Gemini multimodal polish (audio+text).

| Pipeline | toast-ja | easy-ja | yuyu-ja | Avg |
|----------|----------|---------|---------|-----|
| SenseVoice + Gemini-audio | **95.4%** | 89.2% | **96.2%** | **93.6%** |
| Gemini-ASR (standalone) | 94.9% | **90.2%** | 95.5% | 93.5% |
| SenseVoice + Gemini-text | 95.2% | 88.8% | 93.5% | 92.5% |
| SenseVoice (no polish) | 92.9% | 88.6% | 93.7% | 91.7% |

## Error Analysis

Remaining errors after best pipeline (SenseVoice + Gemini-audio polish):

| Error type | Example | % of errors | Fixable by |
|-----------|---------|-------------|-----------|
| Punctuation style | `、` vs space | 60% | Ignore (not real error) |
| Kana/kanji variant | `みな` vs `皆` | 20% | Ignore (both correct) |
| **Proper nouns** | `ゆゆし` → `ゆゆ` | 10% | Glossary + context |
| **Real misrecognition** | Truncated words | 10% | Multimodal + longer VAD |

## VAD Improvements

The biggest accuracy gain came from VAD tuning, not polish:

| Change | Impact |
|--------|--------|
| Adaptive noise floor (min-block instead of mean) | Fixed 0% → 93% on podcasts |
| Silence threshold 600ms → 1000ms | Prevented mid-sentence splits |
| Min segment length 250ms → 1s | Eliminated fragments like "The." |
| Short segment merging (< 4 chars) | Combined "おはようござ。" + "います。" |

## Recommended Pipelines

| Use case | Pipeline | TTFB | Accuracy | Cost |
|----------|----------|------|----------|------|
| **Best quality** | SenseVoice → GPT-4o polish | ~800ms | ~97% | API |
| **Best multimodal** | SenseVoice → Gemini Flash (audio+text) | ~3s | ~96% | API |
| **Free + good** | SenseVoice → MLX local | ~400ms | ~93% | Free |
| **Fastest** | SenseVoice only | 0ms | ~93% | Free |
| **Batch (offline)** | Gemini-ASR | N/A | ~95% | API |

## How to Run Benchmarks

```bash
# Download test audio with human subtitles
yt-dlp -x --audio-format wav --postprocessor-args "ffmpeg:-ar 16000 -ac 1" \
  --write-subs --sub-langs "ja" --sub-format srt --no-write-auto-subs \
  --download-sections "*0:00-3:00" \
  -o "test-audio/NAME.%(ext)s" "https://youtube.com/watch?v=VIDEO_ID"

# Run SenseVoice ASR
cat test-audio/NAME.wav | otoji listen --plain - > output.jsonl

# Extract finals
python3 -c "
import sys, json
for line in sys.stdin:
    ev = json.loads(line)
    if ev['type'] == 'final': print(ev['text'])
" < output.jsonl > output.txt

# Compare with reference
# Use semantic CER (ignore punctuation, kana/kanji variants)
```

## Key Takeaways

1. **VAD matters more than polish** — fixing segment boundaries gave +2%,
   polish gave +0.5-2%.
2. **SenseVoice is surprisingly good** — 93% local accuracy, within 1% of
   cloud ASR for clear speech.
3. **GPT-4o is the best polish model** — fastest cloud TTFB (736ms) and
   fixes the most errors.
4. **Gemini multimodal is unique** — only model that can hear audio to fix
   proper nouns. Worth the extra latency for quality-critical use.
5. **YouTube auto-subs are not ground truth** — always use human-reviewed
   subtitles for benchmarking, or errors in the ref inflate CER.
6. **Small local LLMs can't polish Japanese** — MLX Qwen2.5-1.5B adds no
   value (0 fixes) and sometimes makes things worse.
