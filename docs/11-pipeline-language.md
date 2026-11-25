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
mic>        vad       silence=3s
vad>        stt       sensevoice
stt>        overlay
stt.final>  polish    auto
#stt.final> translate en
stt.final>  append@log transcripts/$date.stt
```

As shown in the menu (the part after `#` is generated live, never stored):

```
.           mic                                 # ~ ▁▂▅▇▅▂▁ · 3:42
mic>        stt       sensevoice                # / 5 sentences · 120 chars · hearing “我在家…”
stt>        overlay                             # - captions on screen
stt.final>  polish    auto                      # - 5 done · “I'm at home.”
#stt.final> translate en                        # off
stt.final>  append@log transcripts/$date.stt    # - 5 lines
```

## Syntax

```
line   := blank | comment | node
comment:= "#" text                          # anything that isn't "#" + node
node   := "#"? head ws kind ("@" name)? (ws arg)* (ws "#" text)?
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
- **Story blocks:** lines between two `"""` fences are free text, kept
  verbatim and ignored by the graph, e.g. what a patch is about:
  `"""` / `In 1421 the St Elizabeth's flood broke the dikes…` / `"""`.
- **Arguments:** positional words, `key=value`, `"quoted strings"` (may
  contain `#`, `|`, `>`, spaces; `\"` escapes), and `@device` for placement.
- **Variables** in arguments: `$date`, `${date}` (`YYYY-MM-DD`), `$time`
  (`HHMMSS`). Unknown names are left as written.
- **Names are optional.** A node's id defaults to its kind, so `. mic` is a
  complete line and `mic>` refers to it.
- **Same kind more than once:** later unnamed nodes are numbered in order —
  `mic`, `mic2`, `mic3` — skipping names already taken. The formatter writes
  those numbers down (`mic@mic2`), so a node added later gets the next free
  number instead of renumbering existing ones. (A new unnamed line placed
  *above* the bare `mic` takes the bare name and the old one gets the next
  number; name it explicitly to avoid that.) An explicit name (`append@log`)
  works anywhere; a redundant `mic@mic` is dropped, and the older `name=kind` still reads (rewritten as `kind@name`).
- **Ids are names, not indexes.** Sequence vs parallel is a property of the
  graph shape.

## Environment nodes

Some kinds need an environment, e.g. `polish` and `translate` need an `llm`
(`pipeline::env_needs`). An environment node is an ordinary source line —
no extra syntax:

```
.           llm       ollama gemma3:4b
.           llm@llm2  openai gpt-4.1-mini
stt.final>  polish                 # implicitly llm,stt.final> (first enabled llm)
llm2,stt.final> translate en       # names its llm explicitly
```

- A node's need is filled by the **first enabled** node of that kind, unless
  its input list names one. The implicit input is never written to the file;
  `Pipeline::effective_inputs` returns it (flagged), and the graph JSON marks
  such edges `"implicit": true` (dropped again when reading JSON back).
- Model precedence for polish/translate: the node's own model word, else its
  `llm` node's, else `auto`.
- The `llm` row shows the model, who uses it, and for a local model whether
  Ollama is running and has it (`? run: ollama pull gemma3:4b`). The check is
  a plain HTTP call every 30 s; it never loads the model onto the GPU.

## `*>`: take everything that fits

`*> speaker` takes every output above it in its **group** that nothing
consumes yet, in line order. Groups are paragraphs, separated by a blank line
or `---`. At the top of a group, `*>` takes from the group above.

```
.  drums  kick ^vad
.  piano  arp
piano> reverb 2s
*> speaker 0.5          # ← drums, reverb   (piano is already consumed)
```

- Only dangling outputs: whatever is already wired somewhere isn't taken twice.
- Never environment nodes (`clock`, `llm`). Runtimes that know types filter
  further: in the Patchbay a speaker accepts audio only, so `mic`, `vad` and
  `learn` are never picked.
- The status lists what it resolved to (`← drums, reverb`), so a stray blank
  line can't silently re-wire anything. The formatter keeps `*>` and `---`.

## Control: `^x` / `?x` / `!x`

`>` carries data (audio, text). A node that should merely *react* to another
names it in an argument instead:

| Sugar | Long form | Meaning |
|---|---|---|
| `^vad` | `on=vad` | edge: fire once per event (one hit per speech onset) |
| `?vad` | `while=vad` | level: the node runs only while `vad` is active |
| `!vad` | `unless=vad` | inverse level: off while `vad` is active (ducking) |

```
speech     ____████████________███______
^vad (on)      x                  x
?vad (while)   ████████________███
!vad (unless)  ____        ████████   ███
```

- Both spellings parse; the formatter keeps the one written. `.port` is
  allowed (`?vad.speech`). Several combine: `?vad !fn`.
- A control ref must name a node; an unknown or broken one, or the node
  itself, breaks only that line (`! \`?nope\`: unknown node \`nope\``).
- `Pipeline::controls` / `NodeLine::controls()` return them; in graph JSON
  they are edges with `"targetHandle": "control"` and
  `"control": "on" | "while" | "unless"`, not inputs or config.
- `vad> drums` is reported as an error suggesting `. drums kick ^vad`.

## Shorthand values (CSS-style)

Runtimes may let a bare value stand for an option when its shape fits exactly
one of the node's options, like CSS `border: 1px solid red`:
`. clock 100 3/4` = `bpm=100 sig=3`, `. drums kick 1/16 ^vad` =
`hit=kick quantize=16`, `. piano "Am F C G" arp`. A value that fits no option
breaks only that line. The language itself keeps arguments as written; the
mapping belongs to each node kind.

## Errors keep the rest running

Parsing is lenient (`Pipeline::parse_lenient`). A line with a syntax error,
an unknown input, a duplicate explicit name or a self-reference becomes an
invalid line:

- it is kept verbatim (the formatter never rewrites it) and left out of the
  graph;
- its menu row shows the reason: `nope> polish  # ! unknown node \`nope\``;
- nodes fed by it are invalid too (`! input \`polish\` has an error`);
- a bare `>` below it takes the nearest *valid* line above, so a half-typed
  line doesn't cut off the rest of a chain;
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
  `kind@name`), arguments; a trailing comment two spaces after the widest
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
| `vad` | voice activity detection in front of STT; shows speech/silence live | `silence=3s` (end-of-speech pause), `max=15s` (longest chunk), `threshold=0.0005` (energy) |
| `stt` | SenseVoice (pseudo-streaming partials, final after VAD silence); input `mic` or `vad` | `sensevoice` |
| `overlay` | caption panel; off = no captions | |
| `polish` | LLM polish of each final | model (default `auto`) |
| `translate` | LLM translation of each final | target language (default `en`), then model |
| `llm` | environment for polish/translate (see above) | `openai`/`ollama`/`gemini`/`anthropic`/`auto`, then URL, `key=`, model |
| `append` | append `HH:MM:SS<TAB>text` per final to a file under the data dir | path (default `transcripts/$date.stt`) |

- `mic` and `stt` both on = the `otoji listen` child runs; either off stops it.
- `vad` options become listen's `OTOJI_VAD_*` settings; changing them
  restarts listen. Without a `vad` line (or with it off) the defaults apply.
  Listen reports `{"type":"vad","speech":true|false}` on each switch
  (300 ms of silence ends speech), shown as `~ speech` / `- silence`.
  Fn+/ (or Alt+CapsLock) flips the `mic` line.
- `polish` and `translate` run in parallel on each final.
- LLM words (an `llm` line, or one model word on a polish/translate line):
  - `openai [url] [key=…] [model]`: an OpenAI-compatible API. Default URL
    api.openai.com with `OPENAI_API_KEY` and `gpt-4.1-mini`
    (`OTOJI_OPENAI_MODEL`). With a custom URL the key is optional (local
    servers) and the model is required.
  - `ollama [url] [key=…] [model]`: `openai` with the URL prefilled to
    `http://localhost:11434/v1`, no key, default model `gemma3:4b`. Its row
    checks that the server runs and has the model.
  - `gemini [model]`, `anthropic [model]`: their own APIs and keys.
  - `auto`: the first cloud key found (Gemini → OpenAI → Anthropic); never
    the local GPU.
  - A bare model word is routed by spelling: `gemini-*` → Gemini, `gpt-*` /
    `o1*` / `o3*` / `o4*` → OpenAI, `claude-*` → Anthropic, anything else
    (Ollama's `name:tag`) → Ollama; `provider/model` forces a provider.
  - A word starting with `http(s)://` is the base URL; `key=$VAR` reads the
    key from the environment or `<data>/.env` (`key=literal` also works).
- Ollama on localhost runs the model on this Mac's GPU, so it is only used
  when written explicitly. Its status says `(local GPU)`; a remote URL shows
  `model @ host`.
- Translation is implemented by the Gemini and OpenAI-compatible clients;
  Anthropic only polishes.
- Keys come from the tray's environment or `<data>/.env` (`KEY=value` lines),
  since a LaunchAgent does not inherit the login shell's environment.
- Wiring the v1 runtime doesn't execute (e.g. `polish` fed by `mic`) is
  accepted and flagged in the status: `(input wiring not run by v1 runtime)`.
  Unknown kinds show `!`.
