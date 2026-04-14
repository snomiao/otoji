# Polish Model Benchmarks

TTFB (time-to-full-response) comparison for the polish layer, measured
from Tokyo, Japan. Each provider runs a one-sentence tidy prompt; the
number here is **median of 3-5 non-streaming round-trips** after warmup.

Run yourself:

```bash
./scripts/bench-polish.sh 5
```

## Latest run (2026-04-15, Tokyo)

| Model                             | Median TTFB | Notes                                          |
|-----------------------------------|-------------|------------------------------------------------|
| Cloudflare llama-3.1-8b-fast      | **~289 ms** | Edge inference at Tokyo PoP. Winner.           |
| OpenAI gpt-4.1-nano               | ~662 ms     | Low latency for OpenAI, but backend in US.     |
| Gemini 2.5-flash-lite (think=0)   | ~1150 ms    | Extra overhead vs Cloudflare.                  |

Earlier measurements:

- Gemini 2.5-flash-lite with default thinking: ~1600 ms
- Gemini 2.5-flash-lite with `thinkingBudget=0`: ~760 ms median
- Cloudflare llama-3.3-70b-instruct-fp8-fast: ~900 ms
- Cloudflare llama-3.2-3b-instruct: ~500 ms (similar to 8b-fast)

## Why Cloudflare wins from Tokyo

Cloudflare Workers AI routes the request to the nearest PoP (Tokyo for
this user) where both the TCP/TLS termination *and* the inference happen.
RTT to the edge is ~10 ms; inference latency on llama-3.1-8b-fast is
~200-300 ms; total ~300 ms.

OpenAI terminates TLS at a Cloudflare-fronted edge (~20 ms RTT) but
inference runs in US data centers (~100-150 ms added RTT to the backend).

Gemini through `generativelanguage.googleapis.com` also terminates at a
nearby GFE but inference may route to `us-central1`. Plus the 2.5-series
adds reasoning tokens by default — `thinkingBudget=0` mitigates but
doesn't eliminate the gap.

## Recommended defaults

- **Speed-first (default)**: Cloudflare `@cf/meta/llama-3.1-8b-instruct-fast`
- **Offline**: local Ollama (`--polish-preset offline`)
- **Quality-first**: Anthropic `claude-haiku-4-5` or OpenAI `gpt-4.1-mini`

Pick via `otoji listen --polish-preset {fast|balanced|quality|offline}`
or by setting `OTOJI_POLISH_BASE_URL` / `_API_KEY` / `_MODEL` directly.
