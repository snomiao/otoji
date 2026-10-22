# Culture profiles for the Patchbay matrix

`matrix.js` composes one piece per **civilization × activity** (hunt, battle,
gather, ritual, waiting-for-rain, flood, storm, death). Each piece opens with the
civilization's lead instrument alone for one bar, then every bar (4 beats) adds
or changes one layer: the culture's own instruments first, then a symphonic
orchestra (strings, horns, timpani, choir), a climax, an ebb, and it loops.

Each file here pushes entries onto `CIVS` (and may add scales to
`CULTURE_SCALES`). Check a file with `bun cultures/check.mjs cultures/<file>.js`.

## Entry

```js
CIVS.push({
  id: "chinese",                 // lowercase-kebab, unique
  name: "Chinese", zh: "中国",    // English name as in the games; Chinese name
  region: "East Asia",           // one of the regions below
  games: [2, 3, 4],              // Age of Empires games this civ appears in
  key: "D",                      // tonic
  scale: "gong",                 // the native scale (hunt, ritual)
  dark: "yu",                    // optional: minor-ish scale (battle, rain, flood, storm, death)
  bright: "gong",                // optional: major-ish scale (gather; the rain lifting)
  lead: "strings@erhu",          // "kind@name" + optional oct=N vol=N adsr=a,d,s,r
  second: "pluck@pipa",          // answers / harmonises the lead
  drone: "strings@sheng oct=3",  // optional: held 1+5 (default strings@drone oct=3)
  flute: "flute@dizi oct=5",     // optional: storm swirls
  bell: "bell@bianzhong",        // optional: ritual / death tolls
  harp: "pluck@guzheng oct=4 vol=0.6", // optional: flowing 16th arpeggios (rain, flood, gather)
  low: "strings@cellos oct=2",   // optional: bass line
  extra: "bell@gong oct=3",      // optional: one signature hit at the climax
  kit: "opera",                  // drum kit
  grooves: {                     // optional, 3 lanes × 16 steps, x hit, X accent, . rest
    calm: "x.......x.......|................|....x.......x...",
    march: "…", drive: "…" },
  motifs: ["3 5 6 1' 6 5 3 2", "1 2 3 5 3 2 1 -"], // two 1-bar themes: 8 eighth notes each
  tempo: 1,                      // optional 0.8–1.2 multiplier
  skip: ["flood"],               // optional: activities that make no sense (flood for desert/steppe/landlocked peoples; ritual only for irreligious ones)
  noDrums: false,                // optional: true if the tradition has no drums
  note: "erhu 二胡 leads, pipa 琵琶 answers, …", // one line naming the real instruments imitated
});
```

**Motifs** are 简谱 in the native scale, relative to `key`: 1–7, `'` up an
octave, `,` down, `#`/`b` a semitone, `-` holds. Exactly 8 tokens (eighth notes),
starting with a note. Write something idiomatic to the tradition: a recognisable
melodic cell, contour and cadence, not a scale run. The composer reuses them
for every activity (moving them into the dark/bright scale by rank, augmenting,
diminishing, climbing).

**Kinds** (synth imitations): `strings` (bowed: violin, erhu, kemençe, fiddle),
`pluck` (koto, pipa, oud, lute, harp, kora, guitar, sitar), `flute` (ney,
shakuhachi, dizi, pan pipes, tin whistle, ocarina), `brass` (horn, trumpet,
karnay, shofar-like), `organ` (reed organ, harmonium, bagpipe drone), `choir`,
`bell` (bells, bianzhong, gongs with pitch), `marimba` (balafon, xylophone,
gamelan bars), `piano`, `bass`, `timpani`. Name the node after the real
instrument (`pluck@oud`).

**Kits**: rock, darbuka (Arabic/Turkish/Persian frame & goblet drums), taiko,
opera (京剧 clapper/gong/cymbals), aztec (huehuetl/teponaztli/rattle), african
(dundun/djembe/bell), tabla, gamelan (kendang/ketuk/gong), celtic
(bodhrán/rim/shaker), flamenco (cajón/slap/palmas), orch (bass drum/side
drum/crash — European military).

**Regions**: East Asia · South & Southeast Asia · Steppe & Central Asia ·
Middle East · Africa · Ancient Mediterranean & Near East · Western Europe ·
Northern & Central Europe · Eastern Europe & Byzantium · Americas.

**Scales**: built-ins in `src.html` (`major minor harmonic dorian phrygian lydian
mixolydian aeolian locrian hijaz bayati rast nahawand in yo hirajoshi ryukyu
gong shang jue zhi yu yanyue penta minorpenta yaman bhairav slendro pelog
freygish megh saba hexa hungarian`). A new one goes in `CULTURE_SCALES`:
`CULTURE_SCALES.tezeta = { cents: [0, 200, 400, null, 700, 900, null], doc: "Ethiopian qenet Tezeta: …" }`
— 7 slots for degrees 1–7 in cents, `null` where the scale has no such degree
(5- and 6-note scales are normal). Don't reuse a built-in name.
