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
.           mic
mic>        stt       sensevoice
stt>        overlay
stt.final>  polish    auto
#stt.final> translate en
stt.final>  log=append transcripts/$date.stt
```

As shown in the menu (the part after `#` is generated live, never stored):

```
.           mic                                 # ~ ▁▂▅▇▅▂▁ · 3:42
mic>        stt       sensevoice                # / 5 sentences · 120 chars · hearing “我在家…”
stt>        overlay                             # - captions on screen
stt.final>  polish    auto                      # - 5 done · “I'm at home.”
#stt.final> translate en                        # off
stt.final>  log=append transcripts/$date.stt    # - 5 lines
```

## Syntax

```
line   := blank | comment | node
comment:= "#" text                          # anything that isn't "#" + node
node   := "#"? head ws (name "=")? kind (ws arg)* (ws "#" text)?
head   := "."                               # source node: no input
        | "|"? ws? refs? ws? ">"            # input; bare ">" = previous node line
refs   := ref (ws? "," ws? ref)*            # several refs fan in
ref    := id ("." port)? (":" policy)?      # e.g. stt.final:latest
arg    := word | key "=" value | "\"" quoted "\"" | "@" device
name, kind, id, port, policy, key := [A-Za-z0-9_-]+
```

- **`.` source / `refs>` input.** A leading `|` is allowed (`|mic> stt`) but
  not needed; the formatter drops it. Spaces are allowed inside the input
  clause: `stt.final , mic >` is the same as `stt.final,mic>`. A ref itself
  has no spaces (`stt . final` is an error). A line counts as a node only if
  the text before its first `>` is a valid input list, so a comment like
  `# see a > b` stays a comment.
- **`#` before a node** turns it off; the line stays in the file (and keeps
  its alignment) so turning it back on is just removing the `#`.
  `#stt.final> polish …` is the polish node, off.
- **Arguments:** positional words, `key=value`, `"quoted strings"` (may
  contain `#`, `|`, `>`, spaces; `\"` escapes), and `@device` for placement.
- **Variables** in arguments: `$date`, `${date}` (`YYYY-MM-DD`), `$time`
  (`HHMMSS`). Unknown names are left as written.
- **Names are optional.** A node's id defaults to its kind, so `. mic` is a
  complete line and `mic>` refers to it.
- **Same kind more than once:** later unnamed nodes are numbered in order —
  `mic`, `mic2`, `mic3` — skipping names already taken. The formatter writes
  those numbers down (`mic2=mic`), so a node added later gets the next free
  number instead of renumbering existing ones. (A new unnamed line placed
  *above* the bare `mic` takes the bare name and the old one gets the next
  number; name it explicitly to avoid that.) An explicit name (`log=append`)
  works anywhere; a redundant `mic=mic` is dropped.
- **Ids are names, not indexes.** Sequence vs parallel is a property of the
  graph shape.

## Errors keep the rest running

Parsing is lenient (`Pipeline::parse_lenient`). A line with a syntax error,
an unknown input, a duplicate explicit name, a self-reference, or a bare `>`
after a broken line becomes an invalid line:

- it is kept verbatim (the formatter never rewrites it) and left out of the
  graph;
- its menu row shows the reason: `nope> polish  # ! unknown node \`nope\``;
- nodes fed by it are invalid too (`! input \`polish\` has an error`);
- every other line keeps running.

`Pipeline::parse` is the strict variant (first error fails), used for tests
and conversions.

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
in the source.

### Duty-cycle rendering (占空比)

A chunked stage can flip busy/idle many times per second, too fast to read.
Each node keeps an activity meter (`pipeline::Activity`) of its busy intervals
over the last second, and the menu renders that share as a steady rhythm:
within each one-second display period the busy symbol shows for the busy
fraction and `-` for the rest; the flashing itself shows the load, so no
number is printed. A stage busy 800
ms out of every second shows `/` for 800 ms and `-` for 200 ms, regardless of
how the work was split up. The STT stage measures real compute: `otoji listen`
emits `{"type":"decode","ms":N}` after every recognizer pass.

## Formatting

`Pipeline::format` is canonical and idempotent:

- input clauses without inner spaces: `a,b.final>`;
- `>` (previous line) kept in a linear chain, made explicit (`id>`) once any
  node feeds more than one consumer; no leading `|`;
- columns aligned per block (blank-line separated): head, node (`kind` or
  `name=kind`), arguments; a trailing comment two spaces after the widest
  arguments;
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
| `polish` | LLM polish of each final | model (default `auto`) |
| `translate` | LLM translation of each final | target language (default `en`), then model |
| `append` | append `HH:MM:SS<TAB>text` per final to a file under the data dir | path (default `transcripts/$date.stt`) |

- `mic` and `stt` both on = the `otoji listen` child runs; either off stops it.
  Fn+/ (or Alt+CapsLock) flips the `mic` line.
- `polish` and `translate` run in parallel on each final.
- Model argument (one word): `auto` = the first cloud key found (Gemini →
  OpenAI → Anthropic). A provider name (`gemini`, `openai`, `anthropic`,
  `ollama`) uses its default model. A model name is routed by its spelling:
  `gemini-*` → Gemini, `gpt-*` / `o1*` / `o3*` / `o4*` → OpenAI, `claude-*` →
  Anthropic, anything else — Ollama's `name:tag`, e.g. `gemma3:4b` — → local
  Ollama. `provider/model` forces a provider (`openai/my-model`).
- Ollama runs the model on this Mac's GPU, so it is only used when written
  explicitly; `auto` never picks it. Its status says `(local GPU)`.
- Translation is implemented by the Gemini and OpenAI clients; Anthropic only
  polishes.
- Keys come from the tray's environment or `<data>/.env` (`KEY=value` lines),
  since a LaunchAgent does not inherit the login shell's environment.
- Wiring the v1 runtime doesn't execute (e.g. `polish` fed by `mic`) is
  accepted and flagged in the status: `(input wiring not run by v1 runtime)`.
  Unknown kinds show `!`.
