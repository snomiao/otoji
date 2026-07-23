# CLI pipe recipes

`otoji node` connects line-oriented terminal programs to transcript edges in an
otoji graph. It uses the signaling WebSocket directly; it does not use WebRTC.
The examples below require Node 22+ (or another runtime with a global
`WebSocket`) and at least one **CLI pipe (stdio)** node on the canvas.

## Join a room

Copy the target shown by a pipe node and run:

```bash
npx otoji node otoji.org/blue-otter-7x2k/pipe-ab12
```

The target may be a full URL, `host/room/nodeId`, `room/nodeId`, or just a room
code. With a node ID, the process is bound to that pipe node. With only a room
code, lines from every pipe node go to stdout and each stdin line is sent to
all pipe nodes in the room.

The mapping is deliberately Unix-like:

- Text entering the pipe node's `in` port becomes one line on CLI stdout.
- Each complete line on CLI stdin is emitted from the pipe node's `out` port.
- Message text is not trimmed. Debug logs go to stderr with `-d` or `--debug`.

For interactive testing, run with `-d`, wait for `connected to room`, type a
line, and press Enter. End stdin with Ctrl-D to close the process.

## Attach an LLM or agent CLI

There is currently **no `--exec` option**. In particular, this is not supported
yet:

```bash
# Future-work syntax; does not work today
npx otoji node ROOM/NODE --exec 'claude -p'
```

Use two bridge processes and a shell loop instead. The first receives graph
messages; the second returns the command's output to the same pipe node:

```bash
npx otoji node ROOM/NODE |
  while IFS= read -r prompt; do
    claude -p "$prompt"
  done |
  npx otoji node ROOM/NODE >/dev/null
```

Replace `claude -p "$prompt"` with any command that accepts one request and
writes its answer to stdout. The loop invokes it once per graph message. The
final redirection discards graph-to-CLI traffic received by the sending bridge.
Keep the graph free of a path from this pipe's output back to its input unless
you intentionally want an agent feedback loop.

## Process STT transcripts

On the canvas, connect an STT transcript output to a pipe node's `in`, then
connect that pipe node's `out` to a transcript sink. This example removes blank
lines, normalizes whitespace, and adds a label before returning each transcript:

```bash
npx otoji node ROOM/PIPE_NODE |
  awk '{$1=$1; if (length) print "[checked] " $0}' |
  npx otoji node ROOM/PIPE_NODE >/dev/null
```

Because the protocol is line-oriented, filters should emit one logical result
per line. Programs that buffer stdout may need their own line-buffering option.

## Two-terminal source and sink demo

Create two pipe nodes, `SOURCE_PIPE` and `SINK_PIPE`, and connect the source
pipe's `out` port to the sink pipe's `in` port.

Terminal 1 (source):

```bash
npx otoji node ROOM/SOURCE_PIPE -d
```

Wait for the connection message, type `hello from terminal 1`, and press Enter.
Leave this terminal open.

Terminal 2 (sink):

```bash
npx otoji node ROOM/SINK_PIPE -d
```

The line appears on terminal 2's stdout. Start the sink first if you do not want
to miss an early graph message; the relay is live transport, not a message log.

## Troubleshooting

### Target and room codes

If no target is passed, `OTOJI_ROOM` supplies it. A missing room exits with
status 2 and prints usage. A bare room code uses `otoji.org` and addresses all
pipe nodes; use `ROOM/NODE_ID` when a graph has more than one pipe and routing
must be unambiguous.

### Signaling URL

The default endpoint is `wss://HOST/signal`. Localhost, `127.*`, and `0.0.0.0`
targets use `ws://HOST/signal`. Override the complete endpoint when developing
against a different relay:

```bash
OTOJI_SIGNAL=ws://localhost:8787/signal npx otoji node ROOM -d
```

Trailing slashes are removed. With `-d`, the exact connection URL and WebSocket
errors are printed to stderr.

### Reconnects and stdin lifetime

After an unexpected WebSocket close, the bridge reconnects after one second.
Lines read while the socket is opening or reconnecting are queued in memory and
flushed when it opens. The queue is not persisted across process restarts.

Closing stdin intentionally stops the process and closes its socket; it does
not reconnect. For one-shot input, wait until `-d` reports a connection before
sending the line and closing stdin, or keep the producer open.

If startup reports that a global `WebSocket` is missing, use Node 22+, Bun, or
Deno.

## Always-on wake word (`otoji kws`)

`otoji kws` is a cheap, always-on keyword spotter (sherpa-onnx streaming KWS,
3.3M params — light enough to run all day on a laptop). It emits one JSON line
per detection on stdout, so it composes with the pipe recipes above to wake a
graph agent.

```bash
# default: auto-downloads the Chinese wenetspeech KWS model, wakes on 小克小克
otoji kws
# → {"type":"wake","keyword":"小克小克","timestamp_ms":1234}
```

The keyword is given in sherpa's pinyin-token form (`x iǎo k è x iǎo k è`),
mapped to a display label after `@`:

```bash
otoji kws --keyword 'x iǎo k è x iǎo k è @小克小克' --threshold 0.25
```

Tuning: raise `--threshold` for fewer false wakes, add a per-keyword boost
(`… :2.0 @小克小克`) for more sensitivity, and `--keywords-file` points at a full
sherpa keywords file for several phrases at once. Test a keyword against a clip
with `--wav clip.wav` before going live. A streaming spotter needs a little
audio *after* the phrase to confirm, so say the wake word then pause.

Wake a room agent by piping detections into a pipe node:

```bash
otoji kws | while IFS= read -r _; do echo "小克小克"; done | otoji node ROOM/PIPE_NODE
```
