# Instrument catalog

`?instruments` lists every instrument the matrix uses. Each file here pushes
entries onto `INSTRUMENT_CATALOG`:

```js
INSTRUMENT_CATALOG.push({
  id: "erhu",                         // lowercase-kebab, unique across files
  name: "erhu", native: "二胡", zh: "二胡",
  aliases: ["erhu", "erhu-section"],  // node names in cultures/*.js that are this instrument
  family: "bowed",                    // plucked | bowed | struck-string | flute | reed | brass | free-reed | bagpipe | drum | idiophone | voice
  kind: "strings",                    // the synth kind that plays it (strings, pluck, flute, reed, brass, bagpipe, throat, jawharp, hurdygurdy, organ, bell, marimba, timpani, choir)
  peoples: ["chinese-middle", "chinese"], // civ ids it belongs to (see cultures/*.js)
  svg: '<svg viewBox="0 0 64 64">…</svg>', // a simple line drawing of its shape: stroke="currentColor", fill="none", stroke-width 2
  origin: "…",      // where and among which peoples/cultures it arose (native names in native script)
  history: "…",     // how it developed over time
  materials: "…",   // what it is made of
  usage: "…",       // how it is held and played
  skills: "…",      // advanced techniques (e.g. 揉弦, sliding, circular breathing)
  scenes: "…",      // where it is typically heard (court, opera, festivals, funerals…)
  partners: ["pipa", "dizi", "sheng"], // ids of instruments it usually plays with
  // sound
  sound: "…",       // what it sounds like: timbre (bright, nasal, breathy, metallic…), attack and decay, dynamics, and how its techniques sound
  range: "…",       // pitch range, e.g. "D4–A6 (about 2½ octaves)"
  tuning: "…",      // how it is tuned; the scale or mode system it plays in
  // construction
  acoustics: "…",   // how the sound is made: exciter (pluck, bow, breath, lips, strike) → vibrator → resonator
  // context
  repertoire: "…",  // well-known pieces or genres it is heard in
  notation: "…",    // its traditional notation, if any (减字谱, 工尺谱, sargam, tablature…)
  meaning: "…",     // symbolism and cultural meaning
  relatives: ["oud", "pipa"], // ids of related instruments across cultures (ancestors, descendants, cousins)
  role: "…",        // its role in an ensemble: melody, drone, bass, harmony, rhythm
  players: "…",     // who traditionally plays it (griots, women, monks, court musicians…)
  making: "…",      // how it is made, and by whom
  variants: "…",    // regional variants and sizes
  finds: "…",       // the earliest evidence: excavated or depicted examples
  today: "…",       // living, revived or endangered today (UNESCO listings)
  hs: "…",          // Hornbostel–Sachs number, e.g. 321.321-6
  uncertain: "…",   // optional: what in this entry is uncertain and why (shown as ⓘ)
});
```

Each text field is 1–3 sentences of plain English. No political wording.
Check a file: `bun cultures/instruments/check.mjs cultures/instruments/<file>.js`.
