# Brief: rebuilding a scene from its people's own music

You are writing scores for the otoji Patchbay (demos/patchbay): a scene (people × activity) that
today is composed by a shared template in matrix.js gets its own hand-written score, made from
recordings of that people's own music. Read `cultures/scores/README.md` and the example
`cultures/scores/ottomans.rain.js` first, and look at the scene as it is now
(`bun refs/render.ts check <civ:act>` prints it; `compose()` output is in the page).

## What the user asked for (the bar to meet)

- Find the music each people actually made, especially the named piece of the scene
  (FAMOUS in cultures/famous/*.js, PIECES in cultures/pieces/*.js; the story in cultures/stories/*.js).
- Download it with yt-dlp, analyse it, then write our own engine version that restores the same
  feeling: timbre, rhythm, mood, melody.
- NOT modern re-creations: no symphonic, "epic", cinematic, fusion, lo-fi, AI or "relaxing" remakes.
  Wanted: what people of that time heard on the instruments of that time — early records, field
  recordings, ethnographic collections (Folkways, Ocora, UNESCO, archives), traditional ensembles on
  period instruments, liturgical choirs for chant. For music that is lost or ancient, use scholarly
  reconstructions on reconstructed instruments and the nearest living tradition, and say so.
- The setting as they heard it: indoors or outdoors, by a fire or the water, in the rain, quiet or
  noisy, a crowd talking, people singing along, shouting, dancing. If many people take part, the
  atmosphere of those people must come through.

## Tools (all local; never play audio on this machine)

- Search: `uvx yt-dlp --flat-playlist --print "%(id)s %(duration)s %(channel)s | %(title)s" "ytsearch15:<query>"`
  (search in the people's own language too).
- Fetch: `refs/fetch.sh <id> [start] [len]` → `~/.cache/otoji/refs/<id>.wav`. Audio stays out of the repo.
- Stems: `uvx --python 3.11 --from demucs --with torchaudio==2.5.1 --with torch==2.5.1 --with soundfile demucs -d cpu -n htdemucs -o ~/.cache/otoji/stems <wav>`
  → vocals/drums/bass/other.wav (about 1 min per 3 min of audio).
- Measure: `uv run -q refs/analyse.py <wav> [--tonic D] [--notes 120] [--json out.json]` on the mix and on stems.
  It is rough: judge tonic (where phrases come to rest), meter and scale with musical sense; a 78 rpm
  record's dull top and hiss are the medium, not the instrument.
- Check: `bun refs/render.ts check <civ:act> --score cultures/scores/<file>.js --port <YOUR PORT>`
  (errors, which lines sound in each section, levels). Render: `bun refs/render.ts wav <civ:act> out.wav --secs 40 --score … --port …`,
  then analyse it and compare with the reference. Iterate at least once.

## The engine (read src.html's CATALOG for every option)

Kinds: strings pluck flute reed brass organ choir bell marimba piano bass timpani throat chant
jawharp hurdygurdy bagpipe drums(kit=…, vol=) crowd(shout/chant/ululate/murmur) chant(sung IPA, voice=men/women/boy,
voices=) rain wind water boat insects reeds fire caption; `space <place>` (room hall ancestral temple church cathedral theatre
pavilion courtyard cave boat river forest valley field; size= wet= dry=). Name nodes after the real instrument
(the soundbox is picked from the name; body= overrides). `scale@name` with exact cents (`2:150`), `key`, `clock bpm N/4`
(6/8, 12/8; aksak as 9/4 at the eighth-note rate), `arrange@song name:Nbars@bpm` (`@~bpm` glides), `?song.N` gates,
`dyn=`, `human=`, `grid=` 4/8/16, phrase marks (slides `~`, grace `(3)5`, strum `/`, chords `1+5`, techniques).
Timing: `clock sway=` (the ensemble breathes), `name:2bars@50*` a free-time section, `rubato=` `drift=` `tune=` per line.
Brass: `bell=` trumpet horn trombone tuba cornett natural conch (guessed from the name); louder dynamics bite brighter,
so use `dyn=` for a forte rather than `vol=`. A shawm (suona, shehnai, zurna) belongs on a `reed` line.
Voice (chant): `scoop=` cents from below, `glide=` from the last note, `head=A4` the register break (a yodel, a grito),
`shake=` held-note shading (nonghyeon, yuri), `press=` a pressed chest voice, `bright=` the ring; ˈ in the IPA stresses a
syllable; `5t` a turn (the notes above and below), `5f` flutter, `5r` tremolo, `(3)5` grace, `5~6` slide.
Sung words: public-domain or traditional texts only, in the original language as IPA; captions in native script.

## Rules

- One file per scene: `cultures/scores/<civ id>.<activity>.js` setting `SCORES["<civ>:<act>"] = { about, heard, refs, measured, text }`.
  Only create files there. Do not edit src.html, matrix.js or other files, do not run build.sh, do not commit.
- Copyright: do not reproduce melodies or lyrics of works still in copyright; traditional and public-domain only
  (otherwise write in the style without copying). Links to recordings only.
- No political framing; name cultures, not states; native scripts. Comments and docs in English.
- `check` must show no line or page errors, and every line must sound in the sections it is meant for.
- `measured`: what you measured and followed, and honestly what still differs.

## Report back

For each scene: file, the reference(s) used and why they are authentic, what was measured, how close our render came.
Then a list of engine gaps you hit (a timbre the engine cannot make, a rhythm or ornament it cannot express),
most important first. The lead agent will improve the engine from that list.
