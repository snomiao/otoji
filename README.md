# otoji (音字)

realtime voice recognition — "音を字に".

Pluggable RT ASR providers (iFlytek RTASR / CoLi / SenseVoice / …) with an optional LLM polish layer. See [`./docs/`](./docs/README.md) for the architecture and provider comparison.
## infra

```mermaid
sequenceDiagram
    browser ->> browser: record voice to mp3
    browser -) server: mp3
    server ->> server: decode voice to pcm
    server ->> api: pcm
```


## input

Providing an app-view using: nextjs

using

```typescript
const mrRef = useRef(null);
mediaRecorder = new MediaRecorder(stream!, { mimeType: mimeType });
mrRef.current = mediaRecorder;
```

record from user microphone

## convert input to pcm stream

## output

api provider: ifly

s