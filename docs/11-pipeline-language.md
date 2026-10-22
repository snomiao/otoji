# Pipeline language (`*.otoji`)

A line-based text form of otoji's voice graph: one node per line. The tray
reads `~/Library/Application Support/otoji/pipeline.otoji`, shows each line
verbatim in its menu with a live status, and turns a node on/off when its row
is clicked (by rewriting the file). Saving the file in an editor applies it
within half a second.

Implementation: `src/pipeline.rs` (parser, formatter, status rendering,
duty-cycle meter, graph-JSON conversion); tray runtime in
`src/bin/tray/graph.rs`.

## Example

```
# otoji pipeline: click a row to turn it on/off
.            mic  mic default
|mic>        stt  stt sensevoice
|stt>        cap  overlay
|stt.final>  pol  polish auto
#|stt.final> tr   translate en
|stt.final>  log  append transcripts/$date.stt
```

As shown in the menu (the part after `#` is generated live, never stored):

```
.            mic  mic default                   # ~ ▁▂▅▇▅▂▁ · 3:42
|mic>        stt  stt sensevoice                # / 12% busy · 5 sentences · 120 chars · hearing “我在家…”
|stt>        cap  overlay                       # - captions on screen
|stt.final>  pol  polish auto                   # - 5 done · “I'm at home.”
#|stt.final> tr   translate en                  # off
|stt.final>  log  append transcripts/$date.stt  # - 5 lines
```

## Syntax

```
line   := blank | comment | node
comment:= "#" " " text                      # full-line comment
node   := "#"? head ws id ws kind (ws arg)* (ws "#" text)?
head   := "."                               # source node: no input
        | "|" ws? refs? ws? ">"             # input; "|>" = previous node line
refs   := ref (ws? "," ws? ref)*            # several refs fan in
ref    := id ("." port)? (":" policy)?      # e.g. stt.final:latest
arg    := word | key "=" value | "\"" quoted "\"" | "@" device
id, port, policy, key := [A-Za-z0-9_-]+
```

- **`.` source / `|…>` input.** Spaces are allowed inside the input clause:
  `| stt.final , mic >` is the same as `|stt.final,mic>`. A ref itself has no
  spaces (`stt . final` is an error).
- **`#` before the head** turns the node off; the line stays in the graph
  (and keeps its alignment) so turning it back on is just removing the `#`.
  `#|stt.final> pol …` is the polish node, off. `# text` (hash, space, text)
  is an ordinary comment.
- **Arguments:** positional words, `key=value`, `"quoted strings"` (may
  contain `#`, `|`, `>`, spaces; `\"` escapes), and `@device` for placement.
- **Variables** in arguments: `$date`, `${date}` (`YYYY-MM-DD`), `$time`
  (`HHMMSS`). Unknown names are left as written.
- **Ids are names, not indexes.** Sequence vs parallel is a property of the
  graph shape, so inserting a node never renumbers others.

## Status (rendered only)

Live status is never part of the source. It is rendered after `# ` and the
formatter strips any status comment, so a row copied out of the menu is valid
source. A comment counts as a status when it is `off` or starts with one of
the symbols below.

| Symbol | Meaning |
|---|---|
| `~` | processing, streaming (output keeps pace with each audio frame) |
| `/` | processing a chunk (a sentence decode, an LLM request in flight) |
| `-` | ready, nothing to process |
| `.` | loading (model, connection, download) |
| `!` | error — only this node is affected |
| `?` | waiting on the user (permission, API key) |
| `off` | the line is turned off (`#`) |

Whether a node is streaming or chunked is derived from the node, not written
in the source. A stray `~` / `-` / `/` token after the id (copied from an old
menu format) is accepted and dropped.

### Duty-cycle rendering (占空比)

A chunked stage can flip busy/idle many times per second, too fast to read.
Each node keeps an activity meter (`pipeline::Activity`) of its busy intervals
over the last second, and the menu renders that share as a steady rhythm:
within each one-second display period the busy symbol shows for the busy
fraction and `-` for the rest, plus the number (`12% busy`). A stage busy 800
ms out of every second shows `/` for 800 ms and `-` for 200 ms, regardless of
how the work was split up. The STT stage measures real compute: `otoji listen`
emits `{"type":"decode","ms":N}` after every recognizer pass.

## Formatting

`Pipeline::format` is canonical and idempotent:

- input clauses without inner spaces: `|a,b.final>`;
- `|>` kept in a linear chain, made explicit (`|id>`) once any node feeds more
  than one consumer;
- columns aligned per block (blank-line separated): head, id, then two spaces
  before the kind; a trailing comment two spaces after the widest body;
- blank lines, comments and line order preserved; status comments dropped.

The tray writes the canonical form when a row is clicked.

## Graph JSON

`Pipeline::to_graph_json` / `from_graph_json` convert to and from the web
editor's `VoiceGraph` (`web/src/graph/model.ts`): `kind` → `type`, `@device`
→ `device`, `key=value` → `config[key]`, other args → `config.args`, off →
`config.enabled = false`. Edges use the named port or `out` → `in`; an edge
policy is kept as `policy`. Comments and blank lines are not part of the
graph.

## Tray runtime v1

The tray runs a fixed topology and maps lines onto it by node kind (the first
enabled node of each kind is used):

| kind | role | args |
|---|---|---|
| `mic` | microphone capture (the default input device) | `default` |
| `stt` | SenseVoice (pseudo-streaming partials, final after VAD silence) | `sensevoice` |
| `overlay` | caption panel; off = no captions | |
| `polish` | LLM polish of each final | provider: `auto` (default), `gemini`, `openai`, `anthropic`, `ollama` |
| `translate` | LLM translation of each final | target language (default `en`), then provider |
| `append` | append `HH:MM:SS<TAB>text` per final to a file under the data dir | path (default `transcripts/$date.stt`) |

- `mic` and `stt` both on = the `otoji listen` child runs; either off stops it.
  Fn+/ (or Alt+CapsLock) flips the `mic` line.
- `polish` and `translate` run in parallel on each final.
- Providers: `gemini` / `anthropic` / `openai` use `GEMINI_API_KEY` /
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (`openai` calls api.openai.com with
  `OTOJI_OPENAI_MODEL`, default `gpt-4.1-mini`). `auto` tries them in that
  order. `ollama` (local, `OTOJI_POLISH_BASE_URL`) runs the model on this
  Mac's GPU and is never chosen by `auto`. Translation is implemented by the
  Gemini and OpenAI clients; Anthropic only polishes.
- Keys come from the tray's environment or `<data>/.env` (`KEY=value` lines),
  since a LaunchAgent does not inherit the login shell's environment.
- Wiring the v1 runtime doesn't execute (e.g. `polish` fed by `mic`) is
  accepted and flagged in the status: `(input wiring not run by v1 runtime)`.
  Unknown kinds show `!`.
