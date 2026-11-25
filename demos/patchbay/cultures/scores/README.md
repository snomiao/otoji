# Scores: pieces rebuilt from the people's own music

A scene listed here is played from its own score instead of the matrix template.
Each file is one piece, `<civ id>.<activity>.js`; `build.sh` joins them into
`cultures/scores.js` (generated, do not edit).

```js
SCORES["ottomans:rain"] = {
  about: "one line: what is heard",
  heard: "where and how its people heard it: a meyhane at night, rain on the shutters, friends singing along",
  refs: [{ title: "Üsküdar (Katip)", who: "Safiye Ayla, 78 rpm", url: "https://www.youtube.com/watch?v=…" }],
  measured: "what refs/analyse.py found that the score follows (tempo, scale in cents, groove, space)",
  text: `
. clock 68 2/4
…
`,
};
```

How a score is made:

1. Find recordings of the music as its own people played it: field recordings,
   early records, traditional ensembles on period instruments. Avoid modern
   orchestral or fusion arrangements. Search with
   `uvx yt-dlp --flat-playlist --print "%(id)s %(duration)s %(channel)s | %(title)s" "ytsearch15:<query>"`.
2. `refs/fetch.sh <id>` caches the audio in `~/.cache/otoji/refs/` (never in
   the repo), and `uv run refs/analyse.py <wav>` measures it: tempo, meter,
   groove, the scale in cents, the melody, timbre, dynamics and the space.
3. Write the score from that: the same instruments (or the nearest voices),
   tuning (a `scale@` in cents where it is not 12-tone), rhythm, melody,
   ornament, and the scene around it: the room or open air (`space`), the
   weather, the crowd, people singing along, talking, shouting.
4. Check and render ours (`bun refs/render.ts check|wav <civ:act> --score <file>`), measure it with
   `analyse.py`, compare, adjust, and note what still differs in `measured`.

Links only: no recorded audio is stored in this repo.
