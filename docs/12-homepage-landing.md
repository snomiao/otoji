# Homepage: an editor landing page (draft)

Status: proposal, 2026-10-23. Nothing here is built yet; the room question
(below) is open.

## Why

`otoji.org/` today is the voice-graph lobby (`web/src/ui/Lobby.tsx`): a
"Create / Join room" gate over a decorative graph, with "?local" as a
single-device try-out. Rooms are not switched on for the public yet, so the
first thing a visitor meets is a form for a feature they can't fully use.

Meanwhile the Patchbay editor (`demos/patchbay`, served at
`otoji.org/editor/` since 9f3d9ea) has become the part of otoji that people
can open and enjoy in seconds: music written as text, 107 peoples × 23 scenes,
536 instruments, stories, captions, a chanting voice, sharing by link, and
release-ready recording. The homepage should lead with that.

## Goals

- A first-time visitor hears something good within one click, and sees that
  it is code they can change.
- One clear path into each part: the editor, the player (no code), the
  instrument atlas.
- Nothing that works today breaks: room links (`otoji.org/<room-code>`),
  `?local`, `?graph`, `?simple`, shared-graph links (`#g=`), `/signal/*`.
- Fast: the landing renders before any audio code or culture data loads.

## The page, top to bottom

1. **Hero: the live editor, playable.**
   - Headline, roughly: "otoji — music as code, from every culture".
     Sub-line: "Write a line, hear it. 107 peoples × 23 scenes, 536 instruments,
     all in your browser."
   - The real editor, embedded and loaded with 琵琶行. It shows the patch with
     its live status column, ▶ Start, ● Rec, and the floating subtitles. The
     visitor presses ▶, hears it, and can edit it in place.
   - Buttons beside it: **Open the full editor**, **Player**, **Instruments**.
   - Browsers allow sound only after a click, so nothing autoplays.
2. **"Pick a people, pick a scene":** a strip of the player matrix (a few
   featured rows, e.g. 汉, Mongols, Norse, Mexica, Yoruba). Each cell plays,
   with the existing crossfade, and "see all 2,400 pieces" links to
   `/editor/?player`.
3. **"It's just text":** three short side-by-side patches, each with ▶ and
   ✎ (open in the editor):
   - a 4-line groove;
   - 吟诵 · 静夜思, the chant voice singing IPA;
   - a `scale@` definition being forked.
   One sentence each on what they show: nodes, `?song.N` gates, `key`,
   `dyn`, tempo glides.
4. **Instruments of the world:** six instrument cards from the atlas (SVG
   shape, name in its own script, one-line sound description, ▶). Links to
   `/editor/?instruments`.
5. **Made to be shared and released:**
   - every example and every edit has its own link (`?ex=`, `#d=` diffs);
   - ● Rec saves 24-bit WAV at −14 LUFS with an `.lrc` from the captions;
   - links to the publishing notes (branch `publish`,
     `docs/publish-netease.md`).
6. **Stories with every piece:** a short excerpt, colour-keyed by type. Teal
   is recorded history, plain text is an imagined scene. Language switch
   (English / 简体中文).
7. **The voice graph (rooms):** see the open question below.
8. **Footer:** GitHub, npm (`otoji` CLI, `@otoji/core`), blog, credits (the
   reconstructions we compared, linked; the note that descriptions were
   written with an AI model).

Tone: no political framing anywhere, as in the rest of the demos. Peoples are
named by their cultures (Han, Norse, Mexica), not by states.

## How to build it

- **Where:** `/` is the React SPA (`web/src/main.tsx` → `Lobby`). Replace
  `Lobby` with a `Landing` component. It is a light page with no Monaco and no
  audio code. Room routing (`isRoomCode(path)`), `?local`, `?graph`, `#g=` and
  the others stay exactly as they are.
- **The hero editor:** an `<iframe src="/editor/?ex=pipaxing&embed">`, loaded
  when the hero scrolls into view or after first paint. A new `embed` mode in
  the Patchbay keeps the patch, the transport, the status column and the
  subtitles, and hides the side panels and page chrome.
  - Pros: zero coupling with the SPA's bundle; the editor keeps its own
    service-worker exclusion; one code path.
  - Cons: the editor's ~5 MB of culture data loads for the hero. To shrink
    that, `embed` could load only the data the example needs.
- **Player strip and instrument cards:** either more small iframes
  (`/editor/?player&embed&rows=…`), or a static snapshot rendered at build
  time with ▶ that opens the full page. Start with links plus the iframe hero,
  and measure before adding more embeds.
- **Service worker:** the landing is part of the SPA, so it is precached.
  `/editor` stays out of the precache and the navigation fallback, as now.
- **Mobile:** the hero editor stacks under the headline at full width, with
  the status column hidden; ▶ and the subtitles still show.
- **Languages:** English and 简体中文 from the start (the Patchbay's
  `I18N["zh-CN"]` already covers the editor side).
- **SEO / sharing:**
  - a real `<title>` and description, plus an Open Graph image (a screenshot of
    the hero with a subtitle showing);
  - the landing's text is static HTML, so search engines see it without
    running JS.

## Open question: the voice-graph rooms

Rooms (create/join a voice graph across devices) are not enabled for the
public yet. Options:

- **A. A section on the landing.** A compact "Voice graph: create or join a
  room" block, far down the page.
- **B. Move it to `/rooms`.** Linked from the header. The landing is only
  about music.
- **C. Hide it until rooms are switched on.** Keep it reachable at
  `/rooms` (and `?local`) for us, with no link from the landing.

All three keep `otoji.org/<room-code>` working, since that route is
independent of `/`. To decide: is otoji's public face "music as code" now,
with the voice graph as an advanced feature later, or both side by side? A
related question is whether the editor's language (the `.otoji` pipeline text)
and the voice graph should be presented as one idea ("everything is a graph
of nodes, written as lines").

## Rollout

1. Add the `embed` mode to the Patchbay, and try it at `/editor/?ex=pipaxing&embed`.
2. Build `Landing` behind `/?landing` and review it on phone and desktop.
3. Decide the room question, then make `Landing` the default `/`.
4. Measure: time to first ▶, how many visitors press ▶, how many open the
   editor. Use simple counters only; no tracking of individuals.
