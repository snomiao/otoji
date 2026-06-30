# otoji

> CLI bridge for **[otoji.org](https://otoji.org)** — wire any terminal's stdio
> into a voice graph.

A zero-dependency launcher for the **CLI pipe** node. Text arriving at a pipe
node in the graph is written to stdout (one line per message); each line you
type (or pipe in) on stdin is sent into the graph's pipe node(s). It connects to
the signaling relay over a plain WebSocket — no WebRTC, no native build.

```bash
# Copy the target from the pipe node in the graph (host/room/nodeId):
npx otoji node otoji.org/keen-gibbon-4a0d/pipe-ab12

# Just a room code targets every pipe node in that room:
otoji node keen-gibbon-4a0d            # interactive
otoji node my-room | grep ERROR        # consume transcripts downstream
some-producer | otoji node my-room     # feed text into the graph
otoji node my-room -d                  # -d: log activity to stderr
```

`$OTOJI_ROOM` sets the default target; `$OTOJI_SIGNAL` overrides the signaling
endpoint (defaults to `wss://<host>/signal`). Requires a global `WebSocket`
(Node 22+, Bun, or Deno).

For the on-device speech models (ASR/TTS) as Node/Bun bindings, see
[`@otoji/core`](https://www.npmjs.com/package/@otoji/core). Full project:
<https://github.com/snomiao/otoji>.

## License

MIT
