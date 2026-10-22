// Matrix: a civilization × a shared human activity → a patch.
// Every piece opens with the civilization's lead instrument alone for one bar,
// then each bar (4 beats) adds or changes one layer, from the culture's own
// instruments up to a full orchestra: climax, ebb, and it loops.
// Cultures live in cultures/*.js (CIVS, CULTURE_SCALES); this file composes.
"use strict";

const ACTIVITIES = {
  hunt:   { zh: "狩猎", glyph: "猎", en: "Hunt", about: "vs nature: a horn call, stalking, the chase", bpm: 112, mode: "scale", grid: 8,
    tune: [["x-x-x---", "leap", 0, 5], ["x0x0x0xx", "repeat", 3, 3], ["xxxxxxx-", "step", 2, 7], ["x-x-x---", "leap", 5, 0]], climb: true, prog: ["1", "1", "6,", "5,"], second: "third", horn: "call", timp: "pulse", perc: "calm", climax: "oct",
    adds: ["drone", "perc", "second", "low", "horns", "drive", "timp"] },
  battle: { zh: "战斗", glyph: "战", en: "Battle", about: "vs people: drums of war, fanfares, the clash", bpm: 132, mode: "dark", grid: 16,
    tune: [["x-xxx-x-x-xxx---", "repeat", 0, 0], ["x-x-x-x-xxxxx---", "step", 0, 4], ["x-xxx-xxx-xxx-x-", "leap", 4, 7], ["xxxxxxxxx---x---", "step", 6, 0]], climb: true, prog: ["1", "1", "6,", "7,"], second: "third", horn: "fanfare", timp: "roll", perc: "march", climax: "oct",
    adds: ["perc", "ostinato", "horns", "second", "timp", "drive", "melee"] },
  gather: { zh: "采集", glyph: "采", en: "Gather", about: "together in the fields: light and happy, unhurried, call and answer", bpm: 92, mode: "bright", grid: 8,
    tune: "motif", climb: false, prog: ["1", "4", "5", "1"], second: "echo", horn: "long", timp: null, perc: "calm", climax: "oct",
    adds: ["second", "perc", "low", "whistle", "harp", "pad", "sing"] },
  ritual: { zh: "祭祀", glyph: "祭", en: "Ritual", about: "offerings and divination (祭祀/占卜): asking the gods about what is to come; solemn and grand, not sad", bpm: 72, mode: "bright", grid: 8,
    tune: [["x-x-x---", "leap", 0, 4], ["x-xxx---", "repeat", 4, 4], ["x-x-x-x-", "leap", 3, 7], ["x-x-----", "step", 5, 5]], climb: false, prog: ["1", "4", "5", "1"], second: "long", horn: "long", timp: "roll", perc: "calm", climax: "oct",
    adds: ["drone", "bell", "perc", "choir", "horns", "second", "timp"] },
  rain:   { zh: "聴雨", glyph: "雨", en: "Waiting", about: "listening to the rain: waiting for the world outside to change, then it does", bpm: 63, mode: "dark", grid: 8,
    tune: [["x--0x---", "step", 4, 3], ["0-x-x---", "step", 3, 2], ["x-0-x-x-", "step", 5, 3], ["x---0---", "step", 1, 0]], climb: false, prog: ["1", "6,", "4,", "5,"], second: "echo", horn: "long", timp: null, perc: "heart", climax: "bright",
    adds: ["harp", "drone", "second", "pad", "low", "perc", "choir"] },
  flood:  { zh: "水灾", glyph: "洪", en: "Flood", about: "the great flood: waves that rise, a struggle, the water recedes", bpm: 84, mode: "dark", grid: 8,
    tune: [["xxxxxxx-", "wave", 0, 3], ["xxxxxxx-", "wave", 1, 4], ["xxxxxxx-", "wave", 2, 6], ["x-x-x---", "step", 4, 0]], climb: true, prog: ["1", "7,", "6,", "5,"], second: "third", horn: "long", timp: "roll", perc: "march", climax: "oct",
    adds: ["harp", "low", "perc", "pad", "timp", "horns", "choir"] },
  wind:   { zh: "风灾", glyph: "风", en: "Storm", about: "a great wind: the gale behind everything, swirling flutes, trembling strings", bpm: 92, mode: "dark", grid: 8,
    tune: [["x---xxx-", "leap", 0, 4], ["xxxx-x--", "wave", 4, 1], ["x-x-xxxx", "leap", 2, 7], ["x-----x-", "step", 3, 0]], climb: true, prog: ["1", "2", "1", "7,"], second: "long", horn: "long", timp: "roll", perc: "calm", climax: "oct", wind: true,
    adds: ["trem", "low", "swirl", "perc", "horns", "timp", "choir"] },
  fire:   { zh: "火", glyph: "火", en: "Fire", about: "fire: a spark, the blaze spreads, everyone fights it, embers at dawn", bpm: 104, mode: "dark", grid: 8,
    tune: [["x-xxx-x-", "wave", 0, 2], ["xxxx-x--", "wave", 2, 4], ["xxxxxxx-", "wave", 3, 7], ["x-x-x---", "step", 4, 0]], climb: true, prog: ["1", "6,", "7,", "1"], second: "third", horn: "long", timp: "roll", perc: "march", climax: "oct", fire: true,
    adds: ["trem", "low", "perc", "swirl", "horns", "drive", "timp"] },
  thunder: { zh: "雷", glyph: "雷", en: "Thunder", about: "thunder: the sky darkens, lightning, the gods speak, the storm passes", bpm: 80, mode: "dark", grid: 8,
    tune: [["x---x---", "leap", 0, 3], ["x-x-x---", "step", 3, 1], ["x---x-x-", "leap", 2, 6], ["x-x-x---", "step", 4, 0]], climb: false, prog: ["1", "1", "6,", "5,"], second: "long", horn: "long", timp: "roll", perc: "calm", climax: "oct", thunder: true,
    adds: ["low", "timp", "trem", "horns", "perc", "choir", "pad"] },
  birth:  { zh: "诞生", glyph: "生", en: "Birth", about: "a birth: a risky night, then hope. No one knows what history this child will make, what fortune it brings; some hope it will save us, some are afraid", bpm: 66, mode: "dark", grid: 8,
    tune: [["x---x-x-", "step", 2, 3], ["x-x-x---", "sigh", 4, 2], ["x-xxx-x-", "step", 2, 5], ["x-x-x---", "leap", 4, 5]], climb: false, prog: ["1", "4,", "6,", "5,"], second: "long", horn: "long", timp: null, perc: "heart", climax: "bright", open: true,
    adds: ["drone", "perc", "trem", "second", "bell", "pad", "choir"] },
  siege:  { zh: "围城", glyph: "围", en: "Siege", about: "a siege: walls, hunger, holding out for months; then the last assault", bpm: 70, mode: "dark", grid: 8,
    tune: [["x---x---", "repeat", 1, 1], ["x-x-x---", "step", 1, 0], ["x---x-x-", "step", 2, 4], ["x-x-x---", "step", 3, 0]], climb: true, prog: ["1", "1", "6,", "7,"], second: "third", horn: "long", timp: "pulse", perc: "march", climax: "oct",
    adds: ["ostinato", "perc", "horns", "second", "timp", "drive", "melee"] },
  triumph: { zh: "凯旋", glyph: "胜", en: "Triumph", about: "victory, a triumph or a coronation: fanfares, bells, the crowd cheers", bpm: 112, mode: "bright", grid: 8,
    tune: [["x-xxx---", "leap", 0, 4], ["x-x-xxx-", "step", 4, 5], ["x-xxx-x-", "leap", 5, 7], ["x-x-----", "step", 7, 5]], climb: false, prog: ["1", "4", "5", "1"], second: "third", horn: "fanfare", timp: "pulse", perc: "march", climax: "oct",
    adds: ["perc", "horns", "low", "second", "timp", "choir", "bell"] },
  build:  { zh: "营造", glyph: "筑", en: "Building", about: "building together: hammers and chisels, hauling stone, a work song keeps everyone in time", bpm: 96, mode: "scale", grid: 8,
    tune: [["x-x-x-x-", "repeat", 2, 2], ["x-x-x---", "step", 2, 0], ["x-x-x-x-", "repeat", 3, 3], ["x-x-x---", "step", 3, 0]], climb: false, prog: ["1", "1", "4", "5"], second: "echo", horn: "long", timp: null, perc: "calm", climax: "oct",
    adds: ["perc", "low", "second", "harp", "horns", "pad", "choir"] },
  voyage: { zh: "远航", glyph: "航", en: "Voyage", about: "a voyage or a migration: leaving home, open water or open steppe, until new land is sighted", bpm: 96, mode: "scale", grid: 8,
    tune: [["x-x-x---", "leap", 0, 4], ["x-xxx-x-", "wave", 2, 4], ["x-x-x-x-", "step", 3, 7], ["x-x-----", "step", 5, 5]], climb: false, prog: ["1", "6,", "4,", "5,"], second: "echo", horn: "call", timp: null, perc: "calm", climax: "bright",
    adds: ["harp", "low", "second", "perc", "pad", "horns", "choir"] },
  festival: { zh: "节庆", glyph: "节", en: "Festival", about: "a festival or the new year: everyone out, music and dancing, food and noise", bpm: 120, mode: "bright", grid: 8,
    tune: [["xxxx-xx-", "step", 2, 5], ["xx-xx-x-", "leap", 5, 2], ["xxxxxxx-", "step", 3, 7], ["x-xxx---", "step", 5, 0]], climb: false, prog: ["1", "4", "5", "1"], second: "third", horn: "call", timp: null, perc: "calm", climax: "oct",
    adds: ["perc", "second", "low", "horns", "harp", "drive", "sing"] },
  games:  { zh: "竞技", glyph: "戏", en: "Games", about: "games and contests: the ball game, wrestling, races; the crowd holds its breath, then roars", bpm: 124, mode: "bright", grid: 8,
    tune: [["xx-xxx--", "leap", 2, 5], ["xxxx-x--", "step", 5, 3], ["xx-xxx--", "leap", 3, 7], ["x-x-x---", "step", 4, 0]], climb: true, prog: ["1", "5,", "4,", "5,"], second: "third", horn: "call", timp: "pulse", perc: "march", climax: "oct",
    adds: ["perc", "horns", "second", "low", "drive", "harp", "choir"] },
  drought: { zh: "旱灾", glyph: "旱", en: "Drought", about: "drought and famine: the sky stays empty, the fields crack, people pray and wait", bpm: 56, mode: "dark", grid: 8,
    tune: [["x-------", "step", 2, 2], ["x---x---", "sigh", 3, 2], ["x-----x-", "step", 1, 3], ["x-------", "step", 1, 0]], climb: false, prog: ["1", "1", "6,", "5,"], second: "long", horn: "long", timp: null, perc: "heart", climax: "oct",
    adds: ["drone", "trem", "low", "second", "pad", "choir", "bell"] },
  quake:  { zh: "地震", glyph: "震", en: "Earthquake", about: "an earthquake or an eruption: the ground roars, everything falls, then the long rebuilding", bpm: 76, mode: "dark", grid: 8,
    tune: [["x-x-x---", "step", 2, 3], ["x0x0x0x0", "repeat", 3, 3], ["xxxxxxxx", "wave", 0, 5], ["x---x---", "sigh", 3, 0]], climb: true, prog: ["1", "7,", "6,", "5,"], second: "long", horn: "long", timp: "roll", perc: "march", climax: "oct",
    adds: ["low", "timp", "trem", "perc", "horns", "choir", "pad"] },
  winter: { zh: "寒冬", glyph: "冬", en: "Winter", about: "a hard winter: snow and a blizzard, enduring the cold together until spring", bpm: 58, mode: "dark", grid: 8,
    tune: [["x-------", "step", 4, 4], ["x---x---", "step", 4, 2], ["x---x-x-", "step", 3, 5], ["x-------", "step", 1, 0]], climb: false, prog: ["1", "6,", "4,", "5,"], second: "long", horn: "long", timp: null, perc: "heart", climax: "oct", noDrums: true,
    adds: ["harp", "drone", "low", "second", "pad", "bell", "choir"] },
  plague: { zh: "瘟疫", glyph: "疫", en: "Plague", about: "a plague: bells, whispers, doors marked, a city falls silent; those who live remember", bpm: 50, mode: "dark", grid: 8,
    tune: [["x---x---", "sigh", 3, 2], ["x---x---", "step", 2, 1], ["x-x-x---", "sigh", 4, 2], ["x-------", "step", 1, 0]], climb: false, prog: ["1", "6,", "4,", "5,"], second: "long", horn: "long", timp: "toll", perc: "heart", climax: "same", noDrums: true,
    adds: ["bell", "drone", "low", "second", "choir", "pad", "trem"] },
  wedding: { zh: "婚礼", glyph: "婚", en: "Wedding", about: "a wedding: the procession, two families joined, songs and a feast", bpm: 108, mode: "bright", grid: 8,
    tune: [["xx-xxx--", "step", 2, 4], ["xxx-x---", "step", 4, 2], ["xx-xxx--", "step", 3, 6], ["x-x-x---", "step", 4, 0]], climb: false, prog: ["1", "4", "5", "1"], second: "third", horn: "long", timp: null, perc: "calm", climax: "oct",
    adds: ["second", "perc", "low", "harp", "horns", "sing", "pad"] },
  death:  { zh: "死亡", glyph: "死", en: "Funeral", about: "funeral music, as this people mourns", bpm: 54, mode: "dark", grid: 4,
    tune: [["x--x", "sigh", 4, 3], ["x---", "step", 2, 2], ["x-xx", "sigh", 5, 3], ["x---", "step", 1, 0]], climb: false, prog: ["1", "6,", "4,", "5,"], second: "long", horn: "long", timp: "toll", perc: "heart", climax: "oct",
    adds: ["drone", "bell", "low", "second", "choir", "pad", "horns"] },
};
// Shown in this order: conflict, work and joy, the sky and the earth, life.
const ACTIVITY_IDS = ["hunt", "battle", "siege", "triumph", "gather", "build", "voyage", "festival", "games", "ritual",
  "rain", "drought", "flood", "wind", "fire", "thunder", "quake", "winter", "plague", "birth", "wedding", "death"];
// Scenes a people would not have lived through.
const NEVER = {
  winter: "malay khmer burmese vietnamese lac-viet dravidians bengalis malians hausa mayans aztecs tupi egyptians saracens palmyrans ethiopians muisca",
  quake: "dutch rus russians lithuanians poles slavs swedes malians hausa",
};
// tune: four bars, each [rhythm mask, shape, from, to]. Pitches are ranks in the
// scale counted as if it had 5 notes an octave (0 tonic, 5 the octave), so a
// shape reads the same in pentatonic and seven-note scales. Shapes:
//   step   walks from → to;  leap  jumps there in wide intervals;  repeat  a
//   reciting tone with a neighbour;  neighbor  tone, upper neighbour, back, to;
//   wave   rises in ripples;  sigh  falling two-note sighs.
// "motif" (gather) sings the culture's own folk motifs instead.

// ── 简谱 tokens as scale steps: i = degree-1 + 7·octave ─────────────────
const jp = {
  parse(t) {
    const m = /^([#b]?)([1-7])(['’,]*)$/.exec(t); if (!m) return null;
    return { acc: m[1], i: Number(m[2]) - 1 + 7 * [...m[3]].reduce((a, c) => a + (c === "," ? -1 : 1), 0) };
  },
  fmt(n) { const o = Math.floor(n.i / 7), d = n.i - 7 * o + 1; return n.acc + d + (o > 0 ? "'".repeat(o) : ",".repeat(-o)); },
  up(n, k) { return { acc: n.acc, i: n.i + k }; },
  notes(motif) { return motif.trim().split(/\s+/).map(jp.parse).filter(Boolean); },
};
const rest = (n) => Array(n).fill("0"), hold = (n) => Array(n).fill("-");
// A held chord per bar over the progression; open fifths on gapped scales.
function chordOf(root, gapped, spread = 0) {
  const r = jp.parse(root);
  return (gapped ? [0, 4, 7] : [0, 2, 4]).map((k) => jp.fmt(jp.up(r, k + spread))).join("+");
}
const perBar = (toks, grid) => toks.flatMap((t) => [t, ...hold(grid - 1)]);
const q = (toks) => `"${toks.join(" ")}"`;

// role spec "kind@name opt=v …" → { kind, name, opts }
function role(spec, fallback) {
  const [head, ...opts] = (spec || fallback).trim().split(/\s+/);
  const [kind, name] = head.split("@");
  return { kind, name: name || kind, opts: opts.join(" ") };
}
const DEFAULT_GROOVES = {
  calm: "x.......x.......|....x.......x...|..x...x...x...x.",
  march: "x...x...x...x...|..x...x...x.x.xx|x.x.x.x.x.x.x.x.",
  drive: "x.x.x.x.x.x.x.x.|....x..x....x.xx|xxxxxxxxxxxxxxxx",
};

// What the warriors' shields were made of (a culture can set shield: …).
const SHIELDS = {
  rattan: "chinese shu wei wu zhu-xis-legacy jurchens khitans mongols golden-horde huns cumans tatars persians achaemenids burmese khmer malay vietnamese lac-viet",
  hide: "aztecs mayans incas haudenosaunee lakota mapuche muisca tupi malians hausa ethiopians berbers egyptians bengalis dravidians",
  wood: "vikings swedes goths celts britons slavs lithuanians franks teutons japanese yamato sengoku-daimyo koreans choson romans carthaginians phoenicians sumerians babylonians",
};
function shieldOf(civ) {
  if (civ.shield) return civ.shield;
  for (const [m, ids] of Object.entries(SHIELDS)) if (ids.split(" ").includes(civ.id)) return m;
  return "metal";
}
// Funerals sound different in every culture: the death piece takes one of these.
const FUNERALS = {
  procession: { about: "a funeral procession: a wailing shawm, the big drum and cymbals walk the coffin", bpm: 60, mode: "dark", grid: 8,
    tune: [["x-x-x---", "sigh", 4, 3], ["x-xxx---", "leap", 2, 5], ["x-x-x-x-", "sigh", 5, 2], ["x-x-----", "step", 2, 0]],
    roles: { lead: "brass@suona oct=4" }, second: "third", perc: "procession", climax: "oct",
    adds: ["perc", "drone", "second", "low", "bell", "horns", "choir"] },
  sutra: { about: "a Buddhist funeral: monks chant on one tone over the wooden fish and the bowl bell", bpm: 66, mode: "scale", grid: 8,
    tune: [["xxxxxxxx", "repeat", 0, 0], ["xxxxxx--", "neighbor", 0, 1], ["xxxxxxxx", "repeat", 1, 1], ["xxxx----", "step", 1, 0]],
    roles: { lead: "choir@monks oct=3", drone: "choir@drone oct=2 vol=0.6", horns: "brass@horns oct=2 vol=0.5" }, second: "long", climax: "same",
    adds: ["woodfish", "rin", "drone", "second", "low", "horns", "choir"] },
  requiem: { about: "a requiem: plainchant, the organ, a tolling bell, trombones", bpm: 56, mode: "dark", grid: 8,
    tune: [["x-x-x-x-", "step", 0, 2], ["x-x-x---", "step", 2, 1], ["x-x-x-x-", "step", 3, 1], ["x-x-----", "step", 1, 0]],
    roles: { lead: "choir@cantor oct=3", drone: "organ@organ oct=2", second: "organ@manual oct=4 vol=0.6", horns: "brass@trombones oct=3 vol=0.6" }, second: "long", timp: "toll", climax: "oct", noDrums: true,
    adds: ["bell", "drone", "low", "pad", "second", "horns", "timp"] },
  orthodox: { about: "an Orthodox funeral: voices only, over the held ison, with bells (Eternal Memory)", bpm: 56, mode: "dark", grid: 8,
    tune: [["x-xxx-x-", "repeat", 1, 1], ["x-x-xx--", "neighbor", 1, 0], ["x-xxx-x-", "repeat", 2, 2], ["x-x-x---", "step", 2, 0]],
    roles: { lead: "choir@psaltis oct=3", drone: "choir@ison oct=2", second: "choir@altos oct=4 vol=0.5", low: "choir@basso oct=2 vol=0.6", pad: "choir@sopranos oct=4 vol=0.35", horns: "choir@tenors oct=3 vol=0.45", bell: "bell@bells vol=0.5" }, second: "long", climax: "oct", noDrums: true,
    adds: ["drone", "bell", "second", "low", "pad", "horns", "choir"] },
  mourning: { about: "mourning without drums: a lone reed flute's lament over a drone", bpm: 52, mode: "dark", grid: 8,
    tune: [["x---x-x-", "step", 2, 4], ["x-x-x---", "sigh", 4, 2], ["x---x-xx", "step", 3, 5], ["x-x-x---", "sigh", 3, 0]],
    roles: { lead: "@flute", choir: "choir@hum vol=0.3", horns: "strings@violas oct=3 vol=0.45" }, second: "long", climax: "oct", noDrums: true,
    adds: ["drone", "low", "second", "pad", "choir", "trem", "horns"] },
  keening: { about: "keening: wailing laments of the mourners, a pipe, a drone", bpm: 54, mode: "dark", grid: 8,
    tune: [["x---x-x-", "leap", 3, 5], ["x-x-x---", "sigh", 5, 2], ["x---x-x-", "leap", 4, 6], ["x-x-x---", "sigh", 3, 0]],
    roles: { choir: "choir@keeners oct=4 vol=0.45" }, second: "echo", climax: "oct", noDrums: true,
    adds: ["drone", "second", "choir", "low", "pad", "harp", "trem"] },
  military: { about: "a soldier's funeral: a muffled drum, a bugle call, a brass chorale", bpm: 58, mode: "scale", grid: 8,
    tune: [["x--x----", "leap", 0, 2], ["x--x--x-", "leap", 0, 4], ["x-x-x---", "leap", 2, 4], ["x-x-x---", "step", 2, 0]],
    roles: { lead: "brass@bugle oct=4" }, second: "long", timp: "toll", horn: "long", climax: "oct",
    adds: ["muffled", "low", "horns", "pad", "timp", "bell", "choir"] },
  pyre: { about: "a funeral pyre: horns over the fire, a slow drum, a chant for the dead", bpm: 60, mode: "scale", grid: 8,
    tune: [["x-x-x---", "step", 0, 2], ["x---x---", "leap", 2, 4], ["x-x-x-x-", "step", 4, 2], ["x-------", "step", 1, 0]],
    second: "long", timp: "toll", horn: "long", perc: "heart", climax: "oct",
    adds: ["perc", "horns", "drone", "second", "low", "choir", "timp"] },
  ancestral: { about: "a mourning song for the ancestors: heartbeat drum, rattle, flute", bpm: 60, mode: "dark", grid: 8,
    tune: [["x-x-x---", "step", 3, 1], ["x-x-x---", "step", 2, 0], ["x-x-x-x-", "step", 4, 2], ["x-x-----", "step", 1, 0]],
    roles: { lead: "@flute" }, second: "echo", perc: "steady", climax: "oct",
    adds: ["perc", "drone", "second", "choir", "low", "harp", "bell"] },
  dance: { about: "a dirge that turns into a dance: grief first, then the celebration of a life", bpm: 76, mode: "dark", grid: 8,
    tune: [["x---x-x-", "step", 2, 0], ["x-x-x---", "step", 1, 3], ["x---x-x-", "step", 4, 2], ["x-x-x---", "step", 1, 0]],
    second: "third", horn: "long", perc: "heart", climax: "dance", climb: true,
    adds: ["horns", "low", "second", "pad", "perc", "drive", "choir"] },
};
const FUNERAL_OF = {
  procession: "chinese shang shu wei wu jurchens khitans koreans choson vietnamese lac-viet hindustanis indians bengalis dravidians gurjaras",
  sutra: "japanese yamato sengoku-daimyo zhu-xis-legacy mongols burmese khmer",
  orthodox: "byzantines macedonian-dynasty rus russians bulgarians georgians armenians ethiopians",
  mourning: "saracens abbasids ayyubids turks ottomans berbers delhi-sultanate tughlaq-dynasty malay hausa golden-horde",
  keening: "celts egyptians greeks athenians minoans palmyrans persians achaemenids huns cumans tatars phoenicians carthaginians babylonians assyrians sumerians hittites",
  military: "romans spartans macedonians",
  pyre: "vikings goths slavs",
  ancestral: "aztecs mayans incas haudenosaunee lakota mapuche muisca tupi",
  dance: "americans mexicans malians",
};
// Who leads a procession or a dance, where it isn't the default.
const FUNERAL_LEAD = { koreans: "brass@taepyeongso oct=4", choson: "brass@taepyeongso oct=4", vietnamese: "brass@ken oct=4", "lac-viet": "brass@ken oct=4",
  hindustanis: "brass@shehnai oct=4", indians: "brass@shehnai oct=4", bengalis: "brass@shehnai oct=4", gurjaras: "brass@shehnai oct=4", dravidians: "brass@nadaswaram oct=4",
  americans: "brass@trumpet oct=4", mexicans: "brass@trompeta oct=4", mongols: "throat@kargyraa oct=3" };
function funeralOf(civ) {
  if (civ.funeral) return civ.funeral;
  for (const [k, ids] of Object.entries(FUNERAL_OF)) if (ids.split(" ").includes(civ.id)) return k;
  return /Europe/.test(civ.region) ? "requiem" : "keening";
}
// Where a scene feels different to a people: overrides on the activity.
const MOODS = {
  inundation: { ids: "egyptians", act: "flood", about: "the inundation: the Nile rises and brings life; a festival, not a disaster", mode: "bright", climax: "oct", perc: "calm", timp: null,
    adds: ["harp", "low", "perc", "pad", "choir", "second", "horns"] },
  kamikaze: { ids: "japanese", act: "wind", about: "the divine wind (神風): a typhoon wrecks the invading fleet; terror turns to deliverance", climax: "bright" },
  valhalla: { ids: "vikings", act: "death", about: "a warrior's pyre: grief, then glory; the dead feast in Valhalla", climax: "bright" },
  thunderfear: { ids: "mongols golden-horde", act: "thunder", about: "thunder, what the steppe fears most: strangers are sent out of the ger, people wait it out" },
  prayer: { ids: "saracens abbasids ayyubids turks ottomans berbers delhi-sultanate tughlaq-dynasty malay hausa malians", act: "ritual",
    about: "prayer for guidance (istikhara), not divination: asking God about what is to come; solemn, not sad", noDrums: true, adds: ["drone", "low", "second", "pad", "choir", "harp", "trem"] },
  rarerain: { ids: "berbers saracens palmyrans", act: "rain", about: "rain in the desert: a rare blessing, long waited for; then it comes" },
  swidden: { ids: "tupi", act: "fire", about: "fire as work: clearing the forest for a new garden (slash and burn), planting in the ashes", mode: "scale", perc: "calm" },
};
const moodOf = (civ, act) => Object.values(MOODS).find((m) => m.act === act && m.ids.split(" ").includes(civ.id));
// What "gathering" is for a people that doesn't farm or forage the usual way, and its rhythm.
const GATHER_AS = [
  ["mongols huns cumans tatars golden-horde", "milking the mares, making felt, moving with the herds", "ride"],
  ["phoenicians carthaginians vikings maltese malay", "hauling the nets and rowing home", "row"],
  ["berbers saracens palmyrans", "the date harvest at the oasis", null],
  ["egyptians", "the Nile harvest", null],
  ["dutch", "the herring catch and the market", "row"],
  ["americans", "the wheat harvest", null],
  ["haudenosaunee", "the Three Sisters (corn, beans, squash) and maple sugaring", null],
  ["lakota", "gathering wild turnips and chokecherries", null],
  ["tupi", "manioc and forest fruit", null],
  ["mapuche", "the araucaria pine-nut harvest (ngülliw)", null],
];
// Peoples whose battles are led by a war drum: it marches from bar 2 and rolls (擂鼓) at the climax.
const WAR_DRUMS = { zhangu: "chinese shang shu wei wu zhu-xis-legacy jurchens khitans" };
function warDrumOf(civ) {
  if (civ.warDrum) return civ.warDrum;
  for (const [k, ids] of Object.entries(WAR_DRUMS)) if (ids.split(" ").includes(civ.id)) return k;
  return null;
}
// Battle cries at the climax (synthesized voices, crowd node): [ids, lines].
const WAR_CRIES = [
  ["greeks athenians spartans macedonians minoans", ['crowd@alala shout "a-la-la-LAI" "x-x-x-x---......"']], // ἀλαλά
  ["rus russians slavs bulgarians", ['crowd@ura shout "u-RAA" "x-x-------......"']],
  ["japanese yamato sengoku-daimyo", ['crowd@taishou shout "EI EI" "x--.x--........." voices=1 pitch=1.1', 'crowd@kachidoki shout "Ō" "........x-------"']], // 鬨の声: ei, ei — ō!
  ["chinese shang shu wei wu zhu-xis-legacy jurchens khitans", ['crowd@sha shout "SHA SHA SHA" "x-..x-..x---...."']], // 杀
  ["koreans choson vietnamese lac-viet", ['crowd@cry shout "WAA" "x-------........"']],
  ["goths teutons vikings swedes germans holy-roman-empire order-of-the-dragon franks", ['crowd@barritus chant "HU" "x---x---x---x-x-" pitch=0.8']], // Tacitus' barritus
  ["mongols golden-horde huns cumans tatars", ['crowd@hurai shout "hu-RAI" "x-x-----........"']],
  ["saracens abbasids ayyubids berbers hausa malians ethiopians egyptians palmyrans", ['crowd@zaghrouta ululate "li" "x-------x-------"']],
  ["lakota haudenosaunee", ['crowd@whoop ululate "ya" "x-------........" voice=men pitch=1.3']],
];
// What chatter sounds like while people gather (unintelligible syllables in the language's sound).
const MURMUR = [
  ["japanese yamato sengoku-daimyo", "ka ki ku ke ko sa shi su so ta to na no ni ha wa ya yo ma mo"],
  ["chinese shang shu wei wu zhu-xis-legacy jurchens khitans", "ma ni hao shi de le wo ta ba ge zhe na ye jiu"],
  ["saracens abbasids ayyubids berbers egyptians palmyrans phoenicians carthaginians", "al ha ma ya wa la bi ka fi na ru sa"],
  ["romans italians sicilians spanish portuguese mexicans", "la ma te ri no si ca bo de lo pa ra"],
];
const lookup = (table, civ) => (table.find(([ids]) => ids.split(" ").includes(civ.id)) || [])[1];
// Deterministic randomness per civilization × activity.
function seeded(str) {
  let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
// One bar: a rhythm mask filled with ranks following a shape from → to.
function shapeBar(mask, shape, from, to, rnd) {
  const n = [...mask].filter((c) => c === "x").length, out = [];
  const lerp = (i) => (n === 1 ? to : from + ((to - from) * i) / (n - 1));
  for (let i = 0; i < n; i++) {
    const last = i === n - 1, j = rnd();
    let r;
    if (shape === "step") r = Math.round(lerp(i)) + (!last && i && j < 0.3 ? (j < 0.15 ? -1 : 1) : 0);
    else if (shape === "leap") r = Math.round(lerp(i)) + (!last && i ? [0, 2, -1][Math.floor(j * 3)] : 0);
    else if (shape === "repeat") r = from + (!last && i % 2 && j < 0.45 ? (j < 0.2 ? -1 : 1) : 0) + (last ? to - from : 0);
    else if (shape === "neighbor") r = last ? to : from + (i % 2);
    else if (shape === "wave") r = Math.round(lerp(i)) + [0, 1, 2, 1][i % 4] - (j < 0.25 ? 1 : 0);
    else if (shape === "sigh") r = Math.round(lerp(i - (i % 2))) + (i % 2 ? 0 : 1);
    else r = Math.round(lerp(i));
    out.push(r);
  }
  let k = 0; return [...mask].map((c) => (c === "x" ? out[k++] : c));
}
// A story (cultures/stories/*.js) as a """ block, wrapped at ~76 columns.
function storyBlock(text) {
  if (!text) return [];
  const out = [];
  for (const para of text.trim().split(/\n\s*\n/)) {
    if (out.length) out.push("");
    let line = "";
    for (const w of para.split(/\s+/)) { if (line && (line + " " + w).length > 76) { out.push(line); line = w; } else line = line ? line + " " + w : w; }
    if (line) out.push(line);
  }
  return ['"""', ...out, '"""'];
}
function compose(civ, actId) {
  const fun = actId === "death" ? funeralOf(civ) : null;
  const mood = moodOf(civ, actId), gatherAs = actId === "gather" ? GATHER_AS.find(([ids]) => ids.split(" ").includes(civ.id)) : null;
  const A = { ...ACTIVITIES[actId], ...(fun ? FUNERALS[fun] : {}), ...(mood || {}) }, R = A.roles || {};
  if (gatherAs) A.about = `together: ${gatherAs[1]}; light and happy, unhurried`;
  // A role: the activity's override ("@flute" = the culture's own flute), else the culture's, else a default.
  const pick = (k, civSpec, def) => { let x = R[k]; if (x && x.startsWith("@")) x = civ[x.slice(1)]; if (k === "lead" && fun && FUNERAL_LEAD[civ.id]) x = FUNERAL_LEAD[civ.id]; return role(x || civSpec, def); };
  const scaleOf = (mode) => (mode === "dark" ? civ.dark : mode === "bright" ? civ.bright : null) || civ.scale;
  const scale = scaleOf(A.mode), key = civ.key, sc = `${scale} ${key}`;
  const gapped = (SCALES[scale] || []).includes(null);
  const bpm = Math.round(A.bpm * (civ.tempo || 1));
  const lead = pick("lead", civ.lead, "strings@lead"), second = pick("second", civ.second, "pluck@second"), drone = pick("drone", civ.drone, "strings@drone oct=3");
  const grooves = { ...DEFAULT_GROOVES, ...(civ.grooves || {}) }, kit = civ.kit || "rock";
  const L = [], names = { [scale]: true, [scaleOf("bright")]: true, song: true, clock: true };
  // One line: a node playing a phrase from bar `a` to bar `b` (1-based, inclusive).
  const line = (r, extra, phrase, a, b, scaleArg = sc) => {
    let id = r.name; for (let k = 2; names[id]; k++) id = `${r.name}${k}`; names[id] = true;
    const kindAt = id === r.kind ? r.kind : `${r.kind}@${id}`;
    L.push(`. ${kindAt} ${[scaleArg, r.opts, extra, phrase].filter(Boolean).join(" ")} ?song.${a === b ? a : `${a}-${b}`}`);
  };
  const drum = (nm, kitName, pattern, a, b, vol) => {
    let id = nm; for (let k = 2; names[id]; k++) id = `${nm}${k}`; names[id] = true;
    L.push(`. drums@${id} kit=${kitName} "${pattern}"${vol ? "" : ""} ?song.${a === b ? a : `${a}-${b}`}`);
  };
  const g = A.grid;
  // The lead's 4-bar tune as ranks (null = hold/rest char kept in `chars`).
  const P = (SCALES[scale] || SCALES.major).map((c, i) => (c === null ? null : i)).filter((x) => x !== null);
  const rnd = seeded(`${civ.id}:${actId}`);
  let bars;
  if (A.tune === "motif") {
    const P0 = (SCALES[civ.scale] || SCALES.major).map((c, i) => (c === null ? null : i)).filter((x) => x !== null);
    const toRank = (n) => { const o = Math.floor(n.i / 7), d = n.i - 7 * o; let k = P0.findIndex((x) => x >= d); if (k < 0) k = P0.length - 1; return k + o * P0.length; };
    const motifBar = (m) => m.trim().split(/\s+/).map((t) => (t === "-" ? "-" : toRank(jp.parse(t))));
    const [a1, b1] = [civ.motifs[0], civ.motifs[1] || civ.motifs[0]].map(motifBar);
    const up = (bar, k) => bar.map((x) => (x === "-" ? x : x + k));
    bars = [a1, b1, up(a1, 2), b1]; // call, answer, the call higher, the answer home
  } else bars = A.tune.map(([mask, shape, from, to]) => shapeBar(mask, shape, Math.round(from * P.length / 5), Math.round(to * P.length / 5), rnd));
  const render = (bar, sc2, shift = 0) => {
    const Q = (SCALES[sc2] || SCALES.major).map((c, i) => (c === null ? null : i)).filter((x) => x !== null);
    return bar.map((x) => (typeof x === "number" ? jp.fmt((() => { const r = Math.round((x + shift) * Q.length / P.length), o = Math.floor(r / Q.length); return { acc: "", i: Q[r - o * Q.length] + 7 * o }; })()) : x));
  };
  const phrase = (sc2, shiftOf) => bars.flatMap((bar, k) => render(bar, sc2, shiftOf(k)));
  // Bars 1–6: the tune (once, then its first half again as layers pile up).
  line(lead, `grid=${g}`, q(phrase(scale, () => 0)), 1, 6);
  // Bars 7–10: once more, an octave up, or climbing a step each bar.
  const hiShift = (k) => (A.climb ? k + (k > 1 ? 1 : 0) : P.length);
  if (A.climax === "dance") line(lead, `grid=${g}`, q(phrase(scaleOf("bright"), hiShift)), 7, 10, `${scaleOf("bright")} ${key}`);
  else if (A.climax === "same") line(lead, `grid=${g}`, q(phrase(scale, () => 0)), 7, 10);
  else if (A.climax === "bright") {
    line(lead, `grid=${g}`, q(phrase(scale, hiShift).slice(0, 2 * g * (g === 4 ? 1 : 1))), 7, 8);
    line(lead, `grid=${g}`, q(phrase(scaleOf("bright"), hiShift).slice(2 * g)), 9, 10, `${scaleOf("bright")} ${key}`);
  } else line(lead, `grid=${g}`, q(phrase(scale, hiShift)), 7, 10);
  // Bars 11–12: the opening slowed down, settling on the tonic.
  const firstNotes = bars.flat().filter((x) => typeof x === "number").slice(0, 5);
  // (a birth ends unresolved, on the 5th: its story is not written yet)
  line(lead, "grid=4", q([...render(firstNotes, A.open ? scaleOf("bright") : scale), A.open ? "5" : "1", "-", "-"]), 11, 12, A.open ? `${scaleOf("bright")} ${key}` : sc);
  const prog = A.prog, roots = prog.map((t) => jp.parse(t));
  const layers = {
    drone: (a) => line(drone, "grid=8", q(["1+5", ...hold(7)]), a, 12),
    low: (a) => line(pick("low", civ.low, "strings@cellos oct=2 vol=0.8"), "grid=8", q(perBar(prog, 8)), a, 11),
    ostinato: (a) => line(role(civ.low, "strings@cellos oct=2 vol=0.8"), "grid=16",
      q(roots.flatMap((r) => [r, r, r, r, r, r, jp.up(r, -3), r, r, r, r, r, jp.up(r, 2), r, jp.up(r, -3), r].map(jp.fmt))), a, 10),
    second: (a) => {
      if (A.second === "third") line(second, `grid=${g}`, q(phrase(scale, () => -2)), a, 10);
      else if (A.second === "echo") line(second, `grid=${g}`, q([...rest(g), ...render(bars[0], scale), ...rest(g), ...render(bars[2], scale, -P.length)]), a, 10);
      else line(second, "grid=4", q(roots.flatMap((r) => [jp.fmt(jp.up(r, 2)), "-", jp.fmt(jp.up(r, 4)), "-"])), a, 10);
    },
    pad: (a) => line(pick("pad", civ.pad, "strings@violins vol=0.5"), "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped, 7)), 8)), a, 11),
    harp: (a) => line(role(civ.harp, "pluck@harp oct=4 vol=0.6"), "grid=16",
      q(roots.flatMap((r) => [0, 2, 4, 7, 9, 11, 14, 11, 9, 7, 4, 2, 0, 2, 4, 7].map((k) => jp.fmt(jp.up(r, gapped && k % 7 === 2 ? k + 1 : k))))), a, 11),
    choir: (a) => line(pick("choir", civ.choir, "choir@choir vol=0.55"), "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped)), 8)), a, 11),
    bell: (a) => line(pick("bell", civ.bell, "bell@bell vol=0.6"), "grid=4", q(["1", "-", "-", "-", "5,", "-", "-", "-"]), a, 11),
    horns: (a) => {
      const h = pick("horns", civ.horns, "brass@horns vol=0.7");
      if (A.horn === "call") line(h, "grid=8", q(["1", "-", "5", "-", "1'", "-", "-", "-", ...rest(4), "5", "-", "1", "-"]), a, 10);
      else if (A.horn === "fanfare") line(h, "grid=16", q(["1", "0", "1", "1", "5", "-", "-", "-", "1'", "-", "5", "-", "1", "-", "-", "-"]), a, 10);
      else line(h, "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped)), 8)), a, 10);
    },
    timp: (a) => {
      const t = pick("timp", civ.timp, "timpani@timp vol=0.9");
      if (A.timp === "roll") line(t, "grid=16", q([..."1".repeat(12)].map(() => "1").concat(["5,", "5,", "5,", "1"])), a, 10);
      else if (A.timp === "toll") line(t, "grid=4", q(["1", "-", "-", "-"]), a, 11);
      else line(t, "grid=8", q(["1", "0", "0", "0", "5,", "0", "1", "0"]), a, 10);
    },
    perc: (a, until) => {
      if (A.perc === "procession") return drum(warDrumOf(civ) || kit, warDrumOf(civ) || kit, "x.......x.......|................|....x.......x...", a, until || 11);
      if (A.perc === "steady") return drum(kit, kit, "x...x...x...x...|................|..x...x...x...x.", a, until || 11);
      const pat = A.perc === "heart" ? grooves.calm.split("|").map((l, i) => (i === 0 ? "x..x............" : ".".repeat(16))).join("|") : grooves[A.perc] || grooves.calm;
      drum(kit, kit, pat, a, until || 10);
      if (actId === "battle" && warDrumOf(civ)) drum(warDrumOf(civ), warDrumOf(civ), "X.......x...x...|..x...x...x...x.|................", a, until || 10);
    },
    drive: (a) => {
      drum(`${kit}Drive`, kit, grooves.drive, a, 10);
      const wd = actId === "battle" && warDrumOf(civ);
      if (wd) drum(`${wd}Roll`, wd, "X.x.X.x.XxXxXxXx|....x.......x...|x...............", a, 10);
      else if (civ.bigDrum) drum(civ.bigDrum, civ.bigDrum, "X.......x.......|....x.......x.xx|................", a, 10);
      else drum("orch", "orch", "x.......x.......|....x.......x.xx|................", a, 10);
    },
    // Weapons and shields: blades ring on the off-beats, shields take the blows.
    melee: (a) => {
      const shield = shieldOf(civ), k = { metal: "clash", wood: "woodshield", rattan: "rattan", hide: "hide" }[shield];
      drum(`melee`, k, "..x...X.....x.x.|x.....x..x....x.|.....x.......x..", a, 10);
    },
    // Gathering: a whistle answering the tune, and everyone singing it softly.
    whistle: (a) => line(pick("flute", civ.flute, "flute@whistle oct=5 vol=0.5"), `grid=${g}`, q([...rest(g), ...render(bars[1], scale, P.length), ...rest(g), ...render(bars[3], scale, P.length)]), a, 10),
    sing: (a) => line(role(null, "choir@singers vol=0.35"), `grid=${g}`, q(phrase(scale, () => 0)), a, 10),
    // Funerals: the wooden fish and bowl bell, a muffled drum.
    woodfish: (a) => drum("mokugyo", "temple", "x...x...x...x...|................|................", a, 11),
    rin: (a) => drum("rin", "temple", "................|x...............|................", a, 12),
    muffled: (a) => drum("muffled", "orch", "x...............|x.......x..x.x..|................", a, 11),
    trem: (a) => line(pick("trem", civ.trem, "strings@tremolo vol=0.5"), "grid=16", q(roots.flatMap((r) => Array(16).fill(chordOf(jp.fmt(r), true)))), a, 11),
    swirl: (a) => line(role(civ.flute, "flute@swirl oct=5 vol=0.6"), "grid=16",
      q([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, -1].map((k) => jp.fmt({ acc: "", i: k }))), a, 10),
  };
  // A culture without drums swaps them for another layer, so the form stays 12 bars.
  const adds = A.adds.map((k) => (k === "perc" && (civ.noDrums || A.noDrums) ? ["pad", "choir", "harp", "low"].find((x) => !A.adds.includes(x)) : k));
  const drive = adds.indexOf("drive");
  adds.forEach((k, i) => (k === "perc" && drive > i ? layers.perc(i + 2, drive + 1) : layers[k](i + 2)));
  if (civ.extra) line(role(civ.extra), "grid=4", q(["1", "-", "-", "-"]), 9, 10);
  if (civ.cymbals !== false && !["death", "gather", "birth", "drought", "plague", "winter", "build", "voyage"].includes(actId)) drum("crash", "orch", "................|................|x...............", 9, 9);
  // Voices: the culture's war cry at the climax; people chatting while they gather.
  if (actId === "battle") for (const l of lookup(WAR_CRIES, civ) || ['crowd@cry shout "HAA" "x-------........"']) L.push(`. ${l} ?song.9-10`);
  if (actId === "gather") {
    const pool = lookup(MURMUR, civ);
    L.push(`. crowd@talk murmur${pool ? ` "${pool}"` : ""} voices=10 vol=0.7 ?song.3-8`);
    if (gatherAs && gatherAs[2] === "row") L.push('. crowd@rowers chant "HEI ya" "x---....x---...." voices=12 pitch=0.9 ?song.5-10'); // pulling together
    if (gatherAs && gatherAs[2] === "ride") L.push(`. drums@ride kit=${kit} "x..x..x.x..x..x.|................|..x.....x.....x." ?song.3-10`); // the gait of the horses
    if (["japanese", "yamato", "sengoku-daimyo"].includes(civ.id)) L.push('. crowd@hayashi chant "i-YA SA-SA" "x-x-x-x-........" voices=10 voice=mixed ?song.9-10'); // イヤサッサ
  }
  // Sounds of each scene.
  const cry = lookup(WAR_CRIES, civ) || ['crowd@cry shout "HAA" "x-------........"'];
  if (actId === "siege") { for (const l of cry) L.push(`. ${l} ?song.9-10`); L.push(". crowd@hungry murmur voices=6 vol=0.4 pitch=0.85 ?song.3-6"); }
  if (actId === "triumph" || actId === "games" || actId === "festival") {
    L.push(`. crowd@people murmur${lookup(MURMUR, civ) ? ` "${lookup(MURMUR, civ)}"` : ""} voices=14 vol=0.8 ?song.2-10`);
    L.push(`. crowd@cheer shout "${actId === "games" ? "O" : "HEI"}" "x-------........" voices=30 voice=mixed ?song.9-10`);
  }
  if (actId === "wedding") L.push(`. crowd@guests murmur${lookup(MURMUR, civ) ? ` "${lookup(MURMUR, civ)}"` : ""} voices=10 vol=0.6 ?song.6-10`, '. crowd@toast shout "HEI" "x-------........" voices=16 voice=mixed ?song.9');
  if (actId === "build") L.push('. drums@work kit=work "................|x.......x.......|x...x...x...x..." ?song.2-10', '. crowd@haul chant "HEI ho" "x---....x---...." voices=14 pitch=0.9 ?song.4-10');
  if (actId === "voyage") L.push(". wind@sea 0.25 gust=0.08Hz", '. crowd@rowers chant "HEI ya" "x---....x---...." voices=12 pitch=0.9 ?song.4-8');
  if (actId === "plague") L.push(". crowd@whispers murmur voices=5 vol=0.35 pitch=0.8 ?song.3-8");
  if (actId === "drought") L.push(". wind@dry 0.2 gust=0.05Hz");
  if (actId === "winter") L.push(". wind@blizzard 0.4 gust=0.2Hz", ". wind@gale 0.6 gust=0.3Hz ?song.7-10");
  if (actId === "quake") L.push(`. drums@rumble kit=sky "X${".".repeat(63)}|${".".repeat(64)}|${".".repeat(64)}" ?song.3-10`, '. drums@crack kit=sky "................|x..x....x.......|....x.x........." ?song.3-4', '. drums@aftershock kit=sky "x...............|................|................" ?song.9');
  if (A.fire) L.push(". fire@spark 0.25 crackle=0.2 ?song.1-6", ". fire@blaze 0.8 crackle=0.7 ?song.7-10", ". fire@embers 0.2 crackle=0.08 ?song.11-12");
  if (A.thunder) L.push(`. drums@thunder kit=sky "${"X".padEnd(32, ".")}|${".".repeat(32)}|${".".repeat(32)}" ?song.3-10`,
    '. drums@lightning kit=sky "................|x.......x.......|................" ?song.7-10', ". rain@storm 0.5 drops=0.4 ?song.5-11");
  if (A.wind) { // the storm itself: wind throughout, rain that grows, thunder at the height
    L.unshift(". wind 0.5 gust=0.15Hz");
    L.push(". wind@gale 0.7 gust=0.3Hz ?song.7-10", ". rain@drizzle 0.3 drops=0.15 ?song.3-6", ". rain@downpour 0.7 drops=0.6 ?song.7-11",
      `. drums@thunder kit=sky "${"X".padEnd(32, ".")}|${".".repeat(32)}|${".".repeat(32)}" ?song.6-11`, '. drums@strike kit=sky "................|x...............|................" ?song.9');
  }
  // Section names: what enters in that bar.
  const label = (k) => ({ woodfish: "mokugyo", muffled: "drum", melee: { metal: "steel", wood: "shields", rattan: "rattan", hide: "hide" }[shieldOf(civ)], second: second.name, perc: kit, drone: drone.name, horns: "horns", timp: "timpani", drive: "drive" })[k] || k;
  const secs = [lead.name, ...adds.map(label), "climax", "peak", "ebb", "end"].map((x) => `${x.replace(/[^\p{L}\p{N}_-]/gu, "")}:1bars`);
  const head = [
    `# ${civ.zh} ${civ.name} × ${A.zh} ${A.en}${fun ? ` (${fun})` : ""} — ${A.about}`,
    `# ${scale} on ${key} · ${bpm} bpm · bar 1: ${lead.name} alone; each bar adds one layer: ${adds.map(label).join(", ")} · climax · ebb · it loops`,
    civ.note ? `# ${civ.note}` : null,
    ...storyBlock(STORIES[`${civ.id}:${actId}`]),
    `. clock ${bpm} 4/4`,
    `. arrange@song ${secs.join(" ")}`,
    ...[...new Set([scale, A.climax === "bright" || A.climax === "dance" || A.open ? scaleOf("bright") : scale])].map((n) => `. scale@${n} ${formatScaleDef(SCALES[n])}`),
    "",
  ].filter((x) => x !== null);
  const text = [...head, ...L, "", `*> reverb ${A.bpm < 70 ? "3.5s wet=0.38" : "2.5s wet=0.3"}`, "> speaker 0.5", ""].join("\n");
  try { return formatPatch(parsePatch(text.replace(/\n$/, ""))) + "\n"; } catch (e) { return text; }
}

// ── the left nav: region → civilization → one chip per activity ────────
const REGION_ORDER = ["East Asia", "South & Southeast Asia", "Steppe & Central Asia", "Middle East", "Africa", "Ancient Mediterranean & Near East",
  "Western Europe", "Northern & Central Europe", "Eastern Europe & Byzantium", "Americas"];
function civKey(civ, act) { return `m:${civ.id}:${act}`; }
function activitiesFor(civ) { return ACTIVITY_IDS.filter((a) => !(civ.skip || []).includes(a) && !(NEVER[a] || "").split(" ").includes(civ.id)); }
for (const civ of CIVS) for (const a of activitiesFor(civ)) Object.defineProperty(EXAMPLES, civKey(civ, a), { get: () => compose(civ, a), enumerable: false });
function renderMatrix() {
  const d = document.createElement("details"); d.className = "matrix"; d.open = true;
  const sum = document.createElement("summary"); sum.textContent = `Civilizations × activities (${CIVS.length})`; d.append(sum);
  const legend = document.createElement("p"); legend.className = "legend";
  legend.textContent = ACTIVITY_IDS.map((a) => `${ACTIVITIES[a].glyph} ${ACTIVITIES[a].en.toLowerCase()}`).join(" · ");
  d.append(legend);
  const regions = [...new Set([...REGION_ORDER, ...CIVS.map((c) => c.region)])].filter((r) => CIVS.some((c) => c.region === r));
  for (const reg of regions) {
    const rd = document.createElement("details"); const rs = document.createElement("summary");
    const civs = CIVS.filter((c) => c.region === reg);
    rs.textContent = `${reg} (${civs.length})`; rd.append(rs);
    const ul = document.createElement("ul"); ul.className = "civs";
    for (const civ of civs) {
      const li = document.createElement("li");
      const nm = document.createElement("span"); nm.className = "civ";
      nm.append(`${civ.zh} ${civ.name}`);
      nm.title = civ.note || "";
      const chips = document.createElement("span"); chips.className = "chips";
      for (const a of ACTIVITY_IDS) {
        const b = document.createElement("button"); b.type = "button";
        const ok = activitiesFor(civ).includes(a);
        b.textContent = ACTIVITIES[a].glyph; b.disabled = !ok;
        b.title = ok ? `${civ.name} × ${ACTIVITIES[a].en}: ${ACTIVITIES[a].about}` : `${civ.name}: no ${ACTIVITIES[a].en.toLowerCase()}`;
        if (ok) { b.dataset.ex = civKey(civ, a); b.setAttribute("aria-current", "false"); b.addEventListener("click", () => loadExample(civKey(civ, a))); }
        chips.append(b);
      }
      li.append(nm, chips); ul.append(li);
    }
    rd.append(ul); d.append(rd);
  }
  // Right after the world-music demos.
  const tree = document.getElementById("tree"), after = EXAMPLE_TREE.findIndex((n) => n.label === "World music");
  tree.insertBefore(d, tree.children[after + 1] || null);
}
renderMatrix();
