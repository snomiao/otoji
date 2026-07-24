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

## `otoji gdoc` — map a Google Doc into the graph

Fetch a Google Doc's text **locally** (via the [`gws`](https://github.com/) CLI,
so it uses your own Google auth — private docs work, no browser/CORS):

```sh
otoji gdoc "https://docs.google.com/document/d/<ID>/edit"    # print the text
otoji gdoc <ID> --json                                       # {type:"gdoc",id,title,text}
otoji gdoc <url> | otoji node my-room/gdoc-ab12              # feed a Google Docs node
otoji gdoc <url> --watch 30 | otoji node my-room/gdoc-ab12   # re-send on change
```

In the web app, dropping a `docs.google.com/document/...` URL onto the canvas
creates a **Google Docs** node. Public/link-shared docs load in the browser via
the plain-text export endpoint; for private docs, pipe `otoji gdoc` into that
node (copy its id from the node) and the text is injected onto its output.
Requires the `gws` CLI on `PATH` (override with `$OTOJI_GWS`).

For the on-device speech models (ASR/TTS) as Node/Bun bindings, see
[`@otoji/core`](https://www.npmjs.com/package/@otoji/core). Full project:
<https://github.com/snomiao/otoji>.

## License

MIT
