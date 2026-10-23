// Matrix: a civilization × a shared human activity → a patch.
// Every piece opens with the civilization's lead instrument alone for one bar,
// then each bar (4 beats) adds or changes one layer, from the culture's own
// instruments up to a full orchestra: climax, ebb, and it loops.
// Cultures live in cultures/*.js (CIVS, CULTURE_SCALES); this file composes.
"use strict";

const ACTIVITIES = {
  showcase: { zh: "楽器", glyph: "楽", en: "Instruments", about: "the instruments themselves: each plays the people's own tune alone, one by one, then all together", bpm: 92, mode: "scale", grid: 8 },
  hunt:   { zh: "狩猎", glyph: "猎", en: "Hunt", about: "vs nature: stalking in silence, holding breath, then the sudden chase and the strike", bpm: 124, mode: "dark", grid: 16,
    tune: [["x---0---x-0-0---", "repeat", 1, 1], ["x-0-x-0-0-x-x---", "neighbor", 1, 2], ["xxxxxxxxxxxx----", "step", 0, 7], ["x---x---x-------", "leap", 6, 0]],
    climb: true, prog: ["1", "1", "6,", "7,"], second: "third", horn: "call", timp: "pulse", perc: "heart", climax: "oct",
    adds: ["trem", "ostinato", "perc", "second", "drive", "horns", "timp"] },
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
  siege:  { zh: "围城", glyph: "围", en: "Siege", about: "besieged or encircled: behind walls, a wagon-fort or a mountain refuge; hunger, holding out, the last stand", bpm: 70, mode: "dark", grid: 8,
    tune: [["x---x---", "repeat", 1, 1], ["x-x-x---", "step", 1, 0], ["x---x-x-", "step", 2, 4], ["x-x-x---", "step", 3, 0]], climb: true, prog: ["1", "1", "6,", "7,"], second: "third", horn: "long", timp: "pulse", perc: "march", climax: "oct",
    adds: ["ostinato", "perc", "horns", "second", "timp", "drive", "melee"] },
  triumph: { zh: "凯旋", glyph: "胜", en: "Triumph", about: "victory: the warriors come home, fanfares and bells, the crowd cheers", bpm: 112, mode: "bright", grid: 8,
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
// ── language: English, or a translation from cultures/i18n/<lang>/ ─────────
const LANGS = { en: "English", "zh-CN": "简体中文" };
let LANG = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q && LANGS[q]) return q;
  try { const saved = localStorage.getItem("otoji-lang"); if (saved && LANGS[saved]) return saved; } catch (e) { /* storage unavailable */ }
  return /^zh/i.test(navigator.language || "") ? "zh-CN" : "en";
})();
// A short text in the chosen language (looked up by its English), or the English.
const tr = (en) => (LANG !== "en" && en && I18N[LANG] && I18N[LANG].text[en]) || en;
// A story in the chosen language, or the English one.
const storyText = (key) => (LANG !== "en" && I18N[LANG] && I18N[LANG].stories[key]) || STORIES[key];
const ACTIVITY_IDS = ["showcase", "hunt", "battle", "siege", "triumph", "gather", "build", "voyage", "festival", "games", "ritual",
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
// A piece in three (3/4, 6/8): the tune is written in its own meter; every other
// line was written four beats to the bar, so each of its bars keeps its first three beats.
function inThree(L, keep) {
  const cut = (toks, per) => toks.filter((t, i) => i % per < (per * 3) / 4);
  L.forEach((ln, n) => {
    if (keep.includes(ln)) return;
    const grid = Number((ln.match(/\sgrid=(\d+)/) || [])[1]) || 0;
    L[n] = ln.replace(/"([^"]*)"/g, (m, body) => {
      if (/^[xXo.\-|]+$/.test(body)) return `"${body.split("|").map((lane) => [...lane].filter((c, i) => i % 16 < 12).join("")).join("|")}"`; // drum lanes: sixteenths, 16 to the bar
      if (grid && body.includes(" ")) return `"${cut(body.trim().split(/\s+/), grid).join(" ")}"`;
      return m;
    });
  });
}

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
  for (const [m, ids] of Object.entries(SHIELDS)) if (named(ids, civ)) return m;
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
  for (const [k, ids] of Object.entries(FUNERAL_OF)) if (named(ids, civ)) return k;
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
// How a hunt feels differs: a pageant with falcons and hounds, or easy where game is plenty
// (the default is tense: stalking dangerous game).
Object.assign(MOODS, {
  pageant: { ids: "persians achaemenids franks english house-of-lancaster french burgundians mongols japanese saracens abbasids khitans jurchens", act: "hunt",
    about: "the hunt as a pageant: falcons, hounds and horns, riders sure of the game, until a boar or a lion turns on them; then the kill and the feast", mode: "bright", bpm: 112, grid: 8, danger: true,
    tune: [["x-x-x---", "leap", 0, 5], ["x-xxx-x-", "step", 3, 5], ["xxxxxxx-", "step", 2, 7], ["x-x-x---", "leap", 5, 0]],
    perc: "calm", horn: "call", timp: "pulse", climax: "oct", adds: ["drone", "perc", "second", "horns", "low", "drive", "timp"] },
  plenty: { ids: "egyptians tupi malay khmer burmese vietnamese lac-viet", act: "hunt",
    about: "hunting where game is plenty: fowling in the marshes, fishing with a bow, half sport; but crocodiles and tigers wait in the reeds", mode: "bright", bpm: 104, grid: 8, danger: true,
    tune: [["xx-x-x--", "step", 2, 4], ["x-xx-x--", "step", 4, 2], ["xx-x-xx-", "leap", 3, 6], ["x-x-----", "step", 3, 0]],
    perc: "calm", horn: "call", timp: null, climb: false, climax: "oct", adds: ["second", "perc", "low", "harp", "whistle", "pad", "horns"] },
});
// Battles differ too: how a people fought shapes the sound.
const BATTLE = (about, extra) => ({ act: "battle", about, ...extra });
Object.assign(MOODS, {
  horsearchers: { ...BATTLE("horse archers: hooves thunder, arrows hiss, the riders wheel and strike and never stand still", { bpm: 144,
    tune: [["xxxxxxxx", "wave", 0, 4], ["xxxx-xxx", "wave", 4, 2], ["xxxxxxxx", "wave", 2, 7], ["x-x-x---", "leap", 6, 0]], grid: 8,
    adds: ["perc", "ostinato", "second", "horns", "drive", "timp", "melee"] }), ids: "mongols huns cumans tatars golden-horde jurchens khitans magyars saracens lakota",
    lines: ['drums@cavalry kit=horses "x...x...x...x...|................|..........x....." ?song.2-10', 'drums@riders kit=horses "................|x...............|..x...x...x...x." ?song.6-10'] },
  elephants: { ...BATTLE("war elephants: the ground shakes under their feet, they trumpet, the line breaks", { bpm: 104 }),
    ids: "hindustanis indians bengalis dravidians gurjaras delhi-sultanate tughlaq-dynasty khmer burmese",
    lines: ['drums@elephants kit=elephants "x.......x.......|x.......x.......|....x.......x..." ?song.3-10', 'drums@trumpeting kit=elephants "x...............|................|................" ?song.5-10'] },
  chariots: { ...BATTLE("chariots: wheels and hooves across the plain, archers on the platforms, the clash of the lines", { bpm: 132 }),
    ids: "egyptians hittites shang sumerians assyrians babylonians",
    lines: ['drums@chariots kit=horses "x.x.x.x.x.x.x.x.|................|..x.......x....." ?song.3-10', `drums@wheels kit=sky "X${".".repeat(31)}|${".".repeat(32)}|${".".repeat(32)}" ?song.5-10`] },
  naval: { ...BATTLE("a sea battle: oars to the drum, ships closing, grappling hooks, boarding", { bpm: 112, prog: ["1", "6,", "7,", "1"] }),
    ids: "vikings phoenicians carthaginians malay maltese",
    lines: ['wind@sea 0.3 gust=0.1Hz', 'crowd@oars chant "HEI ya" "x---....x---...." voices=14 pitch=0.9 ?song.3-8'] },
  gunpowder: { ...BATTLE("a battle of gunpowder: fife and drum, the lines advance, cannon and volleys of muskets", { bpm: 116 }),
    ids: "americans dutch germans russians swedes mexicans ottomans spanish portuguese italians french",
    lines: ['drums@fife-drum kit=orch "x...............|x.x.x.xxx.x.x.xx|................" ?song.2-10', 'drums@cannon kit=guns "x...............................|................................|................................" ?song.5-10',
      'drums@muskets kit=guns "................|........x.......|x...............x.......x......." ?song.7-10'] },
  ambush: { ...BATTLE("an ambush: silence in the forest, every breath held, then the attack comes from everywhere at once", { bpm: 132, grid: 16,
    tune: [["x-------0-------", "repeat", 1, 1], ["0---x---0---x---", "neighbor", 1, 2], ["xxxxxxxxxxxxxxxx", "step", 0, 7], ["x-x-x-x-x-------", "leap", 6, 0]], perc: "heart" }),
    ids: "mayans tupi lac-viet vietnamese muisca haudenosaunee mapuche" },
  duel: { ...BATTLE("single combat: two warriors face each other, nothing moves; one cry, one stroke", { bpm: 84, grid: 8,
    tune: [["x-------", "repeat", 2, 2], ["x---x---", "neighbor", 2, 3], ["x-------", "step", 4, 4], ["x-x-x---", "leap", 7, 0]], perc: "heart" }),
    ids: "japanese sengoku-daimyo yamato", lines: ['crowd@kiai shout "EI" "x-------........" voices=2 pitch=1.1 ?song.9'] },
  phalanx: { ...BATTLE("the phalanx: shields locked, a slow march to the pipe, the paean, then the push", { bpm: 96, perc: "march" }),
    ids: "greeks athenians spartans macedonians romans minoans",
    lines: ['crowd@paean chant "i-E PAI-an" "x-x-x---........" voices=24 pitch=0.9 ?song.4-8'] },
});
const moodOf = (civ, act) => Object.values(MOODS).find((m) => m.act === act && named(m.ids, civ));
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
  for (const [k, ids] of Object.entries(WAR_DRUMS)) if (named(ids, civ)) return k;
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
const lookup = (table, civ) => (table.find(([ids]) => named(ids, civ)) || [])[1];
// Does an id list name this culture? An era row (like: "chinese") also matches its parent's id.
const named = (ids, civ) => { const l = ids.split(" "); return l.includes(civ.id) || (!!civ.like && l.includes(civ.like)); };
// Why an endonym is uncertain (shown as ⓘ on hover).
const ENDONYM_NOTES = {
  shang: "商 / 大邑商 is on the oracle bones, but whether the Shang used it as their own people-name is unclear.",
  shu: "巴 and 蜀 are known only from Chinese records; they may be names others used.",
  wu: "句吳 and 於越 are the old kingdom names; later Jiangnan people called themselves 漢.",
  "chinese-middle": "唐人 rather than 漢人 for this period is a judgement call; both were used.",
  "zhu-xis-legacy": "士大夫 / 儒 is a self-designation of a class of scholars, not of a people.",
  yamato: "倭 is attested mainly through Chinese sources.",
  "koreans-early": "Hangul did not exist yet; 新羅 and 高麗 are written in Hanja and are also kingdom names.",
  choson: "朝鮮 for this era is known only from Chinese records.",
  jurchens: "Jušen is attested; the Jurchen script is not in Unicode, so only a romanization is shown.",
  khitans: "Kitai is attested; Khitan script would not display, so only a romanization is shown.",
  hindustanis: "Hindustānī is a Persian-derived term from the medieval period onward.",
  "delhi-sultanate": "Amir Khusrau's description of himself, not a name for a whole people.",
  dravidians: "தமிழர் covers Tamils only; 'Dravidian' is a modern term.",
  "lac-viet": "雒 comes from Chinese records; the Lạc people's own name is unknown.",
  "persians-early": "Ērān is the land; the people's name Ērānīgān might fit better.",
  cumans: "Qıpčaq is the name scholars attest; the Cumans' own name and script are uncertain.",
  tatars: "Medieval Volga Tatars often called themselves Bolgar, Qazanlı or Möselman instead.",
  malians: "N'Ko is a 20th-century script; tone marks are left out.",
  hausa: "The Ajami (Arabic-script) spelling is a reconstruction.",
  huns: "Οὖννοι / Hunni is a name others gave them; their own name is not recorded.",
  babylonians: "The cuneiform spells the city of Babylon, not the people's name.",
  hittites: "They called their land Ḫatti and their language nešili; no clear name for themselves as a people.",
  phoenicians: "Their self-name is debated: Canaan and Sidonians are the attested candidates.",
  carthaginians: "'Chanani' comes from Augustine; the Punic spelling is a reconstruction.",
  palmyrans: "The Palmyrene letters are written from knowledge of the script; worth checking.",
  sumerians: "'Black-headed ones' and Kiengir (the land); no ethnic self-name.",
  minoans: "No self-name is recorded.",
  mayans: "No shared self-name is recorded; people named themselves by their city.",
  mapuche: "Reche is the older attested name.",
  tupi: "Tupinambá is attested in European accounts.",
  goths: "Gutþiuda is attested only once, in the Gothic calendar fragment.",
  "holy-roman-empire": "A general medieval German self-name, not one specific to the Rhineland.",
  "order-of-the-dragon": "Rumâni is attested mostly from the 16th century.",
  lithuanians: "Lietuviai is attested in Lithuanian only later than the pagan era.",
  magyars: "Megyer is the early tribal and place-name form.",
  bulgarians: "Modern spelling; the Old Bulgarian form is Блъгарє.",
  rus: "Русь names the land and the people together.",
  franks: "Their own-language name *Frankon is only reconstructed; Franci is the Latin of their records.",
  celts: "Goídil / Gaeil is Gaelic and does not cover the Iron Age Celts.",
  "knights-templar": "A practice, not a people: the Latin self-reference of monks.",
};
// "汉 Han · late", with the era when a people has several rows.
const civLabel = (civ) => `${civ.zh} ${LANG === "zh-CN" ? "" : civ.name}${civ.era ? ` · ${tr(civ.era)}` : ""}`.replace(/\s+·/, " ·").trim();
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
function storyBlock(text, lang = "en") {
  if (!text) return [];
  const out = [];
  for (const para of text.trim().split(/\n\s*\n/)) {
    if (out.length) out.push("");
    let line = "";
    for (const w of para.split(/\s+/)) { if (line && (line + " " + w).length > 76) { out.push(line); line = w; } else line = line ? line + " " + w : w; }
    if (line) out.push(line);
  }
  return [lang === "en" ? '"""' : `"""${lang}`, ...out, '"""'];
}
// 楽: each of the culture's instruments plays its own tune alone for a bar, then all together.
function composeShowcase(civ) {
  const A = ACTIVITIES.showcase, scale = civ.scale, key = civ.key, sc = `${scale} ${key}`, bpm = Math.round(A.bpm * (civ.tempo || 1));
  const motif = (civ.motifs[0] + " " + (civ.motifs[1] || civ.motifs[0])).trim().split(/\s+/);
  const names = {}, L = [], secs = [];
  const roles = [["lead", civ.lead], ["second", civ.second], ["flute", civ.flute], ["harp", civ.harp], ["horns", civ.horns], ["trem", civ.trem], ["low", civ.low],
    ["drone", civ.drone], ["pad", civ.pad], ["choir", civ.choir], ["bell", civ.bell], ["timp", civ.timp]].filter(([, v]) => v);
  const seen = new Set(), shown = [];
  for (const [k, spec] of roles) { const r = role(spec); if (seen.has(r.name)) continue; seen.add(r.name); shown.push([k, r]); }
  const one = shown.slice(0, 9); // nine solos, then the drums, then everyone
  const lineOf = (r, phrase, grid, a, b) => {
    let id = r.name; for (let j = 2; names[id]; j++) id = `${r.name}${j}`; names[id] = true;
    L.push(`. ${r.kind}@${id} ${[sc, r.opts, `grid=${grid}`, phrase].filter(Boolean).join(" ")} ?song.${a === b ? a : `${a}-${b}`}`);
  };
  one.forEach(([k, r], i) => {
    const bar = i + 1, held = ["drone", "timp", "bell"].includes(k);
    lineOf(r, held ? q(["1+5", ...hold(7)]) : q(motif.slice(i % 2 ? 8 : 0, i % 2 ? 16 : 8).concat(Array(Math.max(0, 8 - motif.slice(i % 2 ? 8 : 0, i % 2 ? 16 : 8).length)).fill("-"))), 8, bar, bar);
    secs.push(r.name);
  });
  const drumsBar = one.length + 1, tutti = drumsBar + 1;
  L.push(`. drums@${civ.kit} kit=${civ.kit} "${(civ.grooves && civ.grooves.calm) || DEFAULT_GROOVES.calm}" ?song.${drumsBar}-${tutti + 1}`); secs.push(civ.kit);
  for (const [k, r] of one.filter(([k]) => ["lead", "second", "harp", "low", "drone", "pad"].includes(k)))
    lineOf(r, ["drone", "pad", "low"].includes(k) ? q(["1+5", ...hold(7)]) : q(motif.slice(0, 16)), 8, tutti, tutti + 1);
  secs.push("together", "together2");
  const head = [`# ${civLabel(civ)} × 楽器 Instruments — ${A.about}`, `# ${civ.signature || civ.note || ""}`,
    `# one at a time: ${one.map(([, r]) => r.name).join(", ")}; then ${civ.kit} drums; then together`,
    ...storyBlock(storyText(`${civ.id}:showcase`) || tr(civ.intro), LANG),
    `. clock ${bpm} 4/4`, `. arrange@song ${secs.map((x) => `${x.replace(/[^\p{L}\p{N}_-]/gu, "")}:1bars`).join(" ")}`, `. scale@${scale} ${formatScaleDef(SCALES[scale])}`, ""];
  const text = [...head, ...L, "", "*> reverb 2.5s wet=0.3", "> speaker 0.5", ""].join("\n");
  try { return formatPatch(parsePatch(text.replace(/\n$/, ""))) + "\n"; } catch (e) { return text; }
}
function compose(civ, actId) {
  if (actId === "showcase") return composeShowcase(civ);
  const fun = actId === "death" ? funeralOf(civ) : null;
  const mood = moodOf(civ, actId), gatherAs = actId === "gather" ? GATHER_AS.find(([ids]) => named(ids, civ)) : null;
  const A = { ...ACTIVITIES[actId], ...(fun ? FUNERALS[fun] : {}), ...(mood || {}) }, R = A.roles || {};
  if (gatherAs) A.about = `together: ${gatherAs[1]}; light and happy, unhurried`;
  // A role: the activity's override ("@flute" = the culture's own flute), else the culture's, else a default.
  const pick = (k, civSpec, def) => { let x = R[k]; if (x && x.startsWith("@")) x = civ[x.slice(1)]; if (k === "lead" && fun && FUNERAL_LEAD[civ.id] || FUNERAL_LEAD[civ.like]) x = FUNERAL_LEAD[civ.id] || FUNERAL_LEAD[civ.like]; return role(x || civSpec, def); };
  const scaleOf = (mode) => (mode === "dark" ? civ.dark : mode === "bright" ? civ.bright : null) || civ.scale;
  const scale = scaleOf(A.mode), key = civ.key, sc = `${scale} ${key}`;
  const gapped = (SCALES[scale] || []).includes(null);
  const bpm = Math.round(A.bpm * (civ.tempo || 1));
  const lead = pick("lead", civ.lead, "strings@lead"), second = pick("second", civ.second, "pluck@second"), drone = pick("drone", civ.drone, "strings@drone oct=3");
  const grooves = { ...DEFAULT_GROOVES, ...(civ.grooves || {}) }, kit = civ.kit || "rock";
  const L = [], names = { [scale]: true, [scaleOf("bright")]: true, [scaleOf("dark")]: true, song: true, clock: true };
  // A fixed line ("kind@name …") gets a free name if a culture's instrument took it.
  const own = (l) => l.replace(/^([a-z-]+)@([\w-]+)/, (_, k, n) => { let id = n; for (let j = 2; names[id]; j++) id = `${n}${j}`; names[id] = true; return `${k}@${id}`; });
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
  const g = A.grid, tuneLines = [];
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
  // 起承转合: one melody through the piece, each bar a development of the motifs.
  const mapNotes = (bar, fn) => { const ns = bar.filter((x) => typeof x === "number"), out = fn(ns); let k = 0; return bar.map((x) => (typeof x === "number" ? out[k++] : x)); };
  const shiftB = (bar, k) => mapNotes(bar, (ns) => ns.map((r) => r + k));
  const invertB = (bar) => mapNotes(bar, (ns) => ns.map((r) => 2 * ns[0] - r));
  const retroB = (bar) => mapNotes(bar, (ns) => ns.slice().reverse());
  const fifth = Math.round(3 * P.length / 5); // the 5th, in this scale's ranks
  const halfCad = (bar) => mapNotes(bar, (ns) => [...ns.slice(0, -1), fifth]);
  const [b0, b1, b2, b3] = bars;
  const qiCheng = [b0, b1, shiftB(b0, 1), b2, retroB(b3), halfCad(invertB(b1))];          // 起 bars 1–3, 承 bars 4–6
  const zhuan = [shiftB(b0, 2), shiftB(b2, 3), shiftB(b1, P.length), shiftB(b3, P.length - 1)]; // 转 bars 7–10: climbing to the peak
  // A named piece in the story whose tune survives: the lead plays it.
  // The story's named piece; if its melody is lost, a well-known piece for the scene (cultures/famous/).
  const storyPiece = PIECES[`${civ.id}:${actId}`], famous = FAMOUS[`${civ.id}:${actId}`];
  const piece = storyPiece && storyPiece.melody ? storyPiece : famous && famous.melody ? famous : storyPiece, tune = piece && piece.melody && SCALES[piece.scale] ? piece.melody.trim().split(/\s+/) : null;
  const meter = tune && piece.meter; // "3/4" or "6/8": a tune in three
  if (tune) {
    const up = tune.map((t) => (/^[#b]?[1-7]/.test(t) ? t.replace(/^([#b]?[1-7])([',]*)$/, (_, d, o) => d + (o.includes(",") ? o.slice(1) : o + "'")) : t));
    line(lead, `grid=${piece.grid || 8}`, q(tune), 1, 6, `${piece.scale} ${piece.key || key}`);
    line(lead, `grid=${piece.grid || 8}`, q(up), 7, 10, `${piece.scale} ${piece.key || key}`);
    tuneLines.push(L[L.length - 2], L[L.length - 1]);
  } else
  // Bars 1–6 (起承): the motif, its answer, the motif a step up; a new phrase, the answer turned back, a half cadence.
  line(lead, `grid=${g}`, q(qiCheng.flatMap((b) => render(b, scale))), 1, 6);
  // Bars 7–10: once more, an octave up, or climbing a step each bar.
  const hiShift = (k) => (A.climb ? k + (k > 1 ? 1 : 0) : P.length);
  const prog = A.prog, roots = prog.map((t) => jp.parse(t));
  if (tune) { /* the named piece carries bars 7–10 too */ } else if (A.danger) { // bars 7–8: a predator; the music turns dark and holds its breath, then 9–10 relief
    const dk = scaleOf("dark"), stalk = [["x---0---x-0-0---", "repeat", 1, 1], ["x-0-x-0-0-x-x---", "neighbor", 1, 2]].map(([m, sh, f, t]) => shapeBar(m, sh, Math.round(f * P.length / 5), Math.round(t * P.length / 5), rnd));
    line(lead, "grid=16", q(stalk.flatMap((b) => render(b, dk))), 7, 8, `${dk} ${key}`);
    line(pick("trem", civ.trem, "strings@tremolo vol=0.5"), "grid=16", q(roots.slice(0, 2).flatMap((r) => Array(16).fill(chordOf(jp.fmt(r), true)))), 7, 8, `${dk} ${key}`);
    drum("danger", kit, "x..x............|................|................", 7, 8);
    line(lead, `grid=${g}`, q(phrase(scale, hiShift).slice(2 * g)), 9, 10);
  } else if (A.climax === "dance") line(lead, `grid=${g}`, q(phrase(scaleOf("bright"), hiShift)), 7, 10, `${scaleOf("bright")} ${key}`);
  else if (A.climax === "same") line(lead, `grid=${g}`, q(phrase(scale, () => 0)), 7, 10);
  else if (A.climax === "bright") {
    line(lead, `grid=${g}`, q(phrase(scale, hiShift).slice(0, 2 * g * (g === 4 ? 1 : 1))), 7, 8);
    line(lead, `grid=${g}`, q(phrase(scaleOf("bright"), hiShift).slice(2 * g)), 9, 10, `${scaleOf("bright")} ${key}`);
  } else line(lead, `grid=${g}`, q((A.climb ? phrase(scale, hiShift) : zhuan.flatMap((b) => render(b, scale)))), 7, 10); // 转
  // Bars 11–12: the opening slowed down, settling on the tonic.
  const firstNotes = bars.flat().filter((x) => typeof x === "number").slice(0, 5);
  // (a birth ends unresolved, on the 5th: its story is not written yet)
  line(lead, "grid=4", q([...render(firstNotes, A.open ? scaleOf("bright") : scale), A.open ? "5" : "1", "-", "-"]), 11, 12, A.open ? `${scaleOf("bright")} ${key}` : sc);
  const layers = {
    drone: (a) => line(drone, "grid=8", q(["1+5", ...hold(7)]), a, 12),
    // the long line under everything: one note a bar, an arch that peaks at bar 9
    low: (a) => line(pick("low", civ.low, "strings@cellos oct=2 vol=0.8"), "grid=8",
      q(perBar(render([0, 0, 1, 2, 1, 3, 2, 4, 5, 4, 1, 0].map((r) => Math.round(r * P.length / 5)), scale).slice(a - 1, 11), 8)), a, 11),
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
  if (mood && mood.lines) for (const l of mood.lines) L.push(`. ${own(l)}${/\?song\./.test(l) ? "" : ""}`);
  // Voices: the culture's war cry at the climax; people chatting while they gather.
  if (actId === "battle") for (const l of lookup(WAR_CRIES, civ) || ['crowd@cry shout "HAA" "x-------........"']) L.push(`. ${own(l)} ?song.9-10`);
  if (actId === "gather") {
    const pool = lookup(MURMUR, civ);
    L.push(`. crowd@talk murmur${pool ? ` "${pool}"` : ""} voices=10 vol=0.7 ?song.3-8`);
    if (gatherAs && gatherAs[2] === "row") L.push('. crowd@rowers chant "HEI ya" "x---....x---...." voices=12 pitch=0.9 ?song.5-10'); // pulling together
    if (gatherAs && gatherAs[2] === "ride") L.push(`. drums@ride kit=${kit} "x..x..x.x..x..x.|................|..x.....x.....x." ?song.3-10`); // the gait of the horses
    if (named("japanese yamato sengoku-daimyo", civ)) L.push('. crowd@hayashi chant "i-YA SA-SA" "x-x-x-x-........" voices=10 voice=mixed ?song.9-10'); // イヤサッサ
  }
  // Sounds of each scene.
  const cry = lookup(WAR_CRIES, civ) || ['crowd@cry shout "HAA" "x-------........"'];
  if (actId === "siege") { for (const l of cry) L.push(`. ${own(l)} ?song.9-10`); L.push(". crowd@hungry murmur voices=6 vol=0.4 pitch=0.85 ?song.3-6"); }
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
    `# ${civLabel(civ)} × ${A.zh} ${A.en}${fun ? ` (${fun})` : ""} — ${A.about}`,
    `# ${scale} on ${key} · ${bpm} bpm · bar 1: ${lead.name} alone; each bar adds one layer: ${adds.map(label).join(", ")} · climax · ebb · it loops`,
    civ.note ? `# ${civ.note}` : null,
    ...(piece ? [`# ♫ ${piece.title}${piece.native ? ` (${piece.native})` : ""} — ${piece.about || ""}${tune ? " · its melody leads (" + (piece.source || "") + ")" : piece.source === "lost" ? " · the melody is lost" : ""}`] : []),
    ...storyBlock(storyText(`${civ.id}:${actId}`), LANG),
    `. clock ${bpm} ${meter || "4/4"}`,
    `. arrange@song ${secs.join(" ")}`,
    ...[...new Set([scale, A.climax === "bright" || A.climax === "dance" || A.open ? scaleOf("bright") : scale, A.danger ? scaleOf("dark") : scale, tune ? piece.scale : scale])].map((n) => `. scale@${n} ${formatScaleDef(SCALES[n])}`),
    "",
  ].filter((x) => x !== null);
  if (meter) inThree(L, tuneLines);
  const text = [...head, ...L, "", `*> reverb ${A.bpm < 70 ? "3.5s wet=0.38" : "2.5s wet=0.3"}`, "> speaker 0.5", ""].join("\n");
  try { return formatPatch(parsePatch(text.replace(/\n$/, ""))) + "\n"; } catch (e) { return text; }
}

// Featured pieces: a special voice, instrument or mode worth hearing first.
const FEATURED = [
  ["mongols:gather", "voice", "khöömii throat singing leads, a whistled overtone melody over its own drone"],
  ["japanese:gather", "voice", "the crowd's イヤサッサ (i-ya-sa-sa) call at the climax"],
  ["greeks:battle", "voice", "the ἀλαλά (a-la-la-lai) war cry"],
  ["berbers:battle", "voice", "zaghārīd: the high trilled ululation"],
  ["chinese:battle", "instrument", "战鼓 war drums marching, then 擂鼓 rolls; rattan shields; 杀!"],
  ["ottomans:battle", "instrument", "a mehter band: zurna double reeds, kös kettle drums, zil cymbals"],
  ["bulgarians:wedding", "instrument", "gaida bagpipe over its drone, in a Balkan mode"],
  ["japanese:death", "instrument", "a sutra chant over 木魚 and the りん bowl bell"],
  ["byzantines:death", "mode", "voices only over the ison, in a hard-chromatic Byzantine echos"],
  ["ethiopians:ritual", "mode", "the Tezeta qenet, on masenqo and krar"],
  ["tang", "mode", "the five modes 五调: 宫 商 角 徵 羽 on the same five notes"],
  ["pipaxing", "instrument", "琵琶行: the Tang pipa as 白居易 heard it — 拢捻抹挑, 嘈嘈如急雨, 银瓶乍破, 四弦一声如裂帛"],
  ["pozhen", "mode", "秦王破阵乐 at two tempos: as gagaku plays Tang music today, and as fast as the Tang court may have danced it"],
  ["egyptians:flood", "mood", "the Nile's inundation is a festival, not a disaster"],
  ["japanese:wind", "mood", "神風: the typhoon that saved them; terror turns to deliverance"],
  ["vikings:death", "mood", "a warrior's pyre: grief, then the glory of Valhalla"],
  ["americans:death", "mood", "a dirge that turns into a dance (jazz funeral)"],
];
const featuredKey = (k) => (k.includes(":") ? `m:${k}` : k);
const FEATURED_KEYS = new Set(FEATURED.map(([k]) => featuredKey(k)));
// A piece drawn from recorded history (its story isn't marked "Imagined:").
const storyOf = (civ, a) => STORIES[`${civ.id}:${a}`]; // the English decides history vs imagined
const isHistory = (civ, a) => { const st = storyOf(civ, a); return !!st && !/Imagined:/i.test(st); };
// ── the left nav: region → civilization → one chip per activity ────────
const REGION_ORDER = ["East Asia", "South & Southeast Asia", "Steppe & Central Asia", "Middle East", "Africa", "Ancient Mediterranean & Near East",
  "Western Europe", "Northern & Central Europe", "Eastern Europe & Byzantium", "Americas"];
function civKey(civ, act) { return `m:${civ.id}:${act}`; }
function activitiesFor(civ) { return ACTIVITY_IDS.filter((a) => !(civ.skip || []).includes(a) && !named(NEVER[a] || "", civ)); }
for (const civ of CIVS) for (const a of activitiesFor(civ)) Object.defineProperty(EXAMPLES, civKey(civ, a), { get: () => compose(civ, a), enumerable: false });
function renderMatrix() {
  const d = document.createElement("details"); d.className = "matrix"; d.open = true;
  const sum = document.createElement("summary"); sum.textContent = `Civilizations × activities (${CIVS.length})`; d.append(sum);
  const legend = document.createElement("p"); legend.className = "legend";
  legend.textContent = ACTIVITY_IDS.map((a) => `${ACTIVITIES[a].glyph} ${ACTIVITIES[a].en.toLowerCase()}`).join(" · ");
  d.append(legend);
  // Featured first, highlighted.
  const fd = document.createElement("details"); fd.open = true; fd.className = "featured-list";
  fd.append(Object.assign(document.createElement("summary"), { textContent: "★ Featured: special voices, instruments, modes" }));
  const ful = document.createElement("ul");
  for (const [k, kind, why] of FEATURED) {
    const key = featuredKey(k), [id, act] = k.split(":"), civ = act && CIVS.find((c) => c.id === id);
    const label = civ ? `${civLabel(civ)} × ${ACTIVITIES[act].zh}` : (EXAMPLE_TREE.flatMap((n) => [...(n.items || []), ...(n.children || []).flatMap((c) => c.items || [])]).find((x) => x[0] === k) || [k, k])[1];
    const li = document.createElement("li"), btn = document.createElement("button");
    btn.type = "button"; btn.dataset.ex = key; btn.setAttribute("aria-current", "false");
    btn.append(label, Object.assign(document.createElement("span"), { className: "why", textContent: `${kind}: ${why}` }));
    btn.addEventListener("click", () => loadExample(key));
    li.append(btn); ful.append(li);
  }
  fd.append(ful); d.append(fd);
  const regions = [...new Set([...REGION_ORDER, ...CIVS.map((c) => c.region)])].filter((r) => CIVS.some((c) => c.region === r));
  for (const reg of regions) {
    const rd = document.createElement("details"); const rs = document.createElement("summary");
    const civs = CIVS.filter((c) => c.region === reg);
    rs.textContent = `${reg} (${civs.length})`; rd.append(rs);
    const ul = document.createElement("ul"); ul.className = "civs";
    for (const civ of civs) {
      const li = document.createElement("li");
      const nm = document.createElement("span"); nm.className = "civ";
      nm.append(civLabel(civ)); if (civ.endonym) nm.title = `${civ.endonym} · ${nm.title || ""}`;
      nm.title = civ.note || "";
      const chips = document.createElement("span"); chips.className = "chips";
      for (const a of ACTIVITY_IDS) {
        const b = document.createElement("button"); b.type = "button";
        const ok = activitiesFor(civ).includes(a);
        b.textContent = ACTIVITIES[a].glyph; b.disabled = !ok;
        b.title = ok ? `${civ.name} × ${ACTIVITIES[a].en}: ${ACTIVITIES[a].about}` : `${civ.name}: no ${ACTIVITIES[a].en.toLowerCase()}`;
        if (ok && isHistory(civ, a)) { b.classList.add("history"); b.title += " · from recorded history"; }
        if (ok && FEATURED_KEYS.has(civKey(civ, a))) { b.classList.add("featured"); b.title += " ★ " + FEATURED.find(([k]) => featuredKey(k) === civKey(civ, a))[2]; }
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

// ── player: every piece as a play button, no code ─────────────────────
function renderPlayer() {
  const root = document.createElement("section"); root.id = "player"; root.setAttribute("aria-label", "Player");
  const legend = tr("{n} peoples × {m} scenes · each piece starts with one instrument and adds one every bar").replace("{n}", CIVS.length).replace("{m}", ACTIVITY_IDS.length);
  root.innerHTML = `<header><h1>${tr("otoji · music of the world's peoples")}</h1><a class="to-player" href="?lang=${LANG}">${tr("✎ open the editor")}</a> <a class="to-player" href="?instruments&lang=${LANG}">${tr("🪕 instruments")}</a>
    <span class="legend">${legend} · <b>${tr("violet")}</b> = ${tr("featured")} · <i>${tr("teal")}</i> = ${tr("from recorded history (the rest are imagined scenes)")} · <span class="pc">♫</span> = ${tr("a named piece of music")}</span>
    <select class="lang" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}"${k === LANG ? " selected" : ""}>${v}</option>`).join("")}</select></header>
    <div class="now" aria-live="polite"><span class="title">${tr("Pick a piece below.")}</span><div class="story"></div></div>
    <div class="batch"><input type="search" class="pfind" placeholder="${tr("filter: a people, a scene, a word from the stories…")}" aria-label="${tr("filter")}">
      <button type="button" class="pall" title="${tr("Play every piece shown, one after another")}">▶ ${tr("Play all shown")}</button>
      <label>${tr("each")} <select class="peach"><option value="loop">${tr("one loop")}</option><option value="15">15 s</option><option value="30">30 s</option><option value="60">60 s</option></select></label>
      <span class="pcount"></span></div>`;
  root.querySelector(".lang").addEventListener("change", (e) => {
    LANG = e.target.value; try { localStorage.setItem("otoji-lang", LANG); } catch (err) { /* storage unavailable */ }
    const u = new URL(location.href); u.searchParams.set("lang", LANG); history.replaceState(null, "", u);
    if (running) stop(); root.remove(); renderPlayer();
  });
  root.insertAdjacentHTML("beforeend", `
    <div class="grid-wrap"><table><thead></thead><tbody></tbody></table></div>`);
  document.body.append(root);
  const head = root.querySelector("thead"), body = root.querySelector("tbody"), now = root.querySelector(".now");
  const hr = document.createElement("tr"); hr.append(document.createElement("th"), Object.assign(document.createElement("th"), { textContent: tr("the people and their instruments"), className: "sig" }));
  for (const a of ACTIVITY_IDS) {
    const th = Object.assign(document.createElement("th"), { textContent: ACTIVITIES[a].glyph, title: `${ACTIVITIES[a].zh} ${LANG === "zh-CN" ? "" : ACTIVITIES[a].en}: ${tr(ACTIVITIES[a].about)}`, scope: "col" });
    const pb = Object.assign(document.createElement("button"), { type: "button", className: "colplay", textContent: "▶", title: `${tr("Play this scene across the peoples shown")}: ${ACTIVITIES[a].zh}` });
    pb.addEventListener("click", () => playBatch(shownButtons().filter((b) => b._a === a))); th.append(document.createElement("br"), pb); hr.append(th);
  }
  head.append(hr);
  let current = null, switching = 0;
  // Fades on the master gain: out before switching or stopping, in after starting.
  const fadeOut = (secs) => new Promise((done) => {
    if (!running || !ctx) return done();
    const g = master.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + secs);
    setTimeout(done, secs * 1000 + 30);
  });
  const fadeIn = (secs) => { const g = master.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.linearRampToValueAtTime(volume(), t + secs); };
  const stopSoftly = async () => { const my = ++switching; await fadeOut(0.6); if (my === switching) stop(); };
  // Batch: play pieces one after another (each for a loop of its arrangement, or N seconds).
  const pq = { list: [], i: 0, on: false, timer: 0, gen: 0 };
  const shownButtons = () => [...body.querySelectorAll("td button[data-ex]")].filter((b) => !b.classList.contains("dim") && !b.closest("tr").hidden);
  const batchLabel = () => { const b = root.querySelector(".pall"); b.textContent = pq.on ? `■ ${pq.i} / ${pq.list.length}` : `▶ ${tr("Play all shown")}`; };
  const stopBatch = () => { pq.on = false; pq.gen++; clearTimeout(pq.timer); batchLabel(); };
  const playBatch = (btns) => { stopBatch(); if (!btns.length) return; Object.assign(pq, { list: btns, i: 0, on: true }); nextInBatch(); };
  const nextInBatch = async () => {
    if (!pq.on || pq.i >= pq.list.length) { stopBatch(); return; }
    const btn = pq.list[pq.i++], my = pq.gen; batchLabel();
    btn.scrollIntoView({ block: "center", inline: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    await play(btn._civ, btn._a, btn, true); if (my !== pq.gen) return;
    const each = root.querySelector(".peach").value;
    if (each !== "loop") { pq.timer = setTimeout(() => my === pq.gen && running && current === btn && nextInBatch(), Number(each) * 1000); return; }
    const watch = () => { // one pass through the arrangement
      if (my !== pq.gen) return; if (!running || current !== btn) { stopBatch(); return; }
      const fc = firstClock(), arr = [...live.values()].find((r) => r.node.kind === "arrange" && !r.error);
      if (fc && fc.c && arr && stepAtTime(ctx.currentTime) >= arr.cfg.total * 4 * fc.c.sig) return nextInBatch();
      pq.timer = setTimeout(watch, 250);
    };
    pq.timer = setTimeout(watch, 500);
  };
  const play = async (civ, a, btn, fromBatch = false) => {
    if (!fromBatch && pq.on) stopBatch(); // a click of your own ends the batch
    const key = civKey(civ, a);
    if (current === btn && running && !fromBatch) { btn.setAttribute("aria-pressed", "false"); current = null; return stopSoftly(); }
    if (current) current.setAttribute("aria-pressed", "false");
    current = btn; btn.setAttribute("aria-pressed", "true");
    const my = ++switching;
    await fadeOut(0.5);
    if (my !== switching) return; // another click came in while fading
    loadExample(key); await start(); fadeIn(1.0);
    const A = ACTIVITIES[a], f = FEATURED.find(([k]) => featuredKey(k) === key);
    now.querySelector(".title").textContent = `${civLabel(civ)} × ${A.zh}${LANG === "zh-CN" ? "" : " " + A.en}${f ? " ★ " + tr(f[2]) : ""}`;
    const kind = storyOf(civ, a) ? (isHistory(civ, a) ? ["history", tr("recorded history")] : ["imagined", tr("an imagined scene")]) : null;
    let pl = now.querySelector(".pieceline"); if (!pl) { pl = document.createElement("div"); pl.className = "pieceline"; now.append(pl); }
    const pk = `${civ.id}:${a}`, pc = (PIECES[pk] && PIECES[pk].melody ? PIECES[pk] : FAMOUS[pk]) || PIECES[pk];
    pl.textContent = pc ? `♫ ${pc.title}${pc.native ? ` (${pc.native})` : ""} — ${pc.about || ""}${pc.melody ? ` · ${tr("you are hearing its melody")} (${pc.source || ""})` : pc.source === "lost" ? ` · ${tr("its melody is lost")}` : ""}` : "";
    let kb = now.querySelector(".kind"); if (!kb) { kb = document.createElement("span"); now.querySelector(".title").after(kb); }
    kb.className = "kind " + (kind ? kind[0] : ""); kb.textContent = kind ? kind[1] : "";
    const sb = now.querySelector(".story"); sb.textContent = (storyText(`${civ.id}:${a}`) || (a === "showcase" && tr(civ.intro)) || tr(A.about)) + (civ.note ? `\n♪ ${tr(civ.note)}` : "");
    if (!now.querySelector("button")) { const st = Object.assign(document.createElement("button"), { type: "button", textContent: tr("■ Stop") }); st.addEventListener("click", () => { if (current) current.setAttribute("aria-pressed", "false"); current = null; stopSoftly(); }); now.querySelector(".title").after(st); }
  };
  const regions = [...new Set([...REGION_ORDER, ...CIVS.map((c) => c.region)])].filter((r) => CIVS.some((c) => c.region === r));
  for (const reg of regions) {
    const rr = document.createElement("tr"); rr.className = "region";
    rr.append(Object.assign(document.createElement("th"), { textContent: tr(reg), colSpan: ACTIVITY_IDS.length + 2, scope: "colgroup" })); body.append(rr);
    for (const civ of CIVS.filter((c) => c.region === reg)) {
      const row = document.createElement("tr");
      const nameCell = Object.assign(document.createElement("th"), { textContent: civLabel(civ), scope: "row", title: civ.note || "" });
      if (civ.endonym) {
        const sm = Object.assign(document.createElement("small"), { className: "endonym", textContent: civ.endonym.replace(/\s*\(attested\)/, ""), title: tr("what they call themselves") });
        const why = ENDONYM_NOTES[civ.id] || (/\(attested\)/.test(civ.endonym) ? "Known from others' records or later sources; their own form is uncertain." : /unknown/.test(civ.endonym) ? "No self-name is recorded." : null);
        if (why) sm.append(Object.assign(document.createElement("span"), { className: "info", textContent: " ⓘ", title: tr(why), tabIndex: 0, role: "note" }));
        nameCell.append(sm);
      }
      const rp = Object.assign(document.createElement("button"), { type: "button", className: "rowplay", textContent: "▶", title: `${tr("Play this people's pieces shown")}: ${civLabel(civ)}` });
      rp.addEventListener("click", () => playBatch(shownButtons().filter((b) => b._civ === civ))); nameCell.append(" ", rp);
      row.append(nameCell);
      const intro = document.createElement("td"); intro.className = "sig"; intro.title = civ.note || "";
      if (civ.signature) intro.append(Object.assign(document.createElement("b"), { textContent: civ.signature }));
      intro.append(tr(civ.intro) || (civ.signature ? "" : tr(civ.note) || ""));
      row.append(intro);
      const ok = activitiesFor(civ);
      for (const a of ACTIVITY_IDS) {
        const td = document.createElement("td");
        if (ok.includes(a)) {
          const btn = document.createElement("button"); btn.type = "button"; btn.textContent = ACTIVITIES[a].glyph; btn.setAttribute("aria-pressed", "false");
          btn.setAttribute("aria-label", `Play ${civ.name}, ${ACTIVITIES[a].en}`);
          const f = FEATURED.find(([k]) => featuredKey(k) === civKey(civ, a));
          btn.title = `${civ.name} × ${ACTIVITIES[a].en}${f ? " ★ " + f[2] : ""}`;
          if (f) btn.classList.add("featured");
          if (isHistory(civ, a)) { btn.classList.add("history"); btn.title += " · from recorded history"; }
          const pk = civKey(civ, a).slice(2), pc = (PIECES[pk] && PIECES[pk].melody ? PIECES[pk] : FAMOUS[pk]) || PIECES[pk]; if (pc) { btn.classList.add("piece"); btn.title += ` · ♫ ${pc.title}`; }
          btn.addEventListener("click", () => play(civ, a, btn)); btn.dataset.ex = civKey(civ, a); btn._civ = civ; btn._a = a;
          btn.dataset.find = [civ.name, civ.zh, civ.endonym, civ.region, tr(civ.region), civ.signature, civ.intro, tr(civ.intro), ACTIVITIES[a].en, ACTIVITIES[a].zh, ACTIVITIES[a].about,
            storyOf(civ, a), storyText(`${civ.id}:${a}`), pc && pc.title, pc && pc.native, f && f[2]].filter(Boolean).join(" ").toLowerCase();
          td.append(btn);
        }
        row.append(td);
      }
      body.append(row);
    }
  }
  // The filter: every word must appear in the piece's people, scene, story or music.
  const filterPieces = () => {
    const terms = root.querySelector(".pfind").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of body.querySelectorAll("tr:not(.region)")) {
      let any = false;
      for (const b of row.querySelectorAll("td button[data-ex]")) { const ok = terms.every((t) => b.dataset.find.includes(t)); b.classList.toggle("dim", !ok); if (ok) { any = true; shown++; } }
      row.hidden = !!terms.length && !any;
    }
    for (const rr of body.querySelectorAll("tr.region")) { let n = rr.nextElementSibling, any = false; while (n && !n.classList.contains("region")) { if (!n.hidden) any = true; n = n.nextElementSibling; } rr.hidden = !any; }
    root.querySelector(".pcount").textContent = terms.length ? `${shown} ${tr("pieces")}` : "";
  };
  root.querySelector(".pfind").addEventListener("input", filterPieces);
  root.querySelector(".pall").addEventListener("click", () => (pq.on ? (stopBatch(), stopSoftly()) : playBatch(shownButtons())));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pq.on) stopBatch(); });
  if (/[?&]player\b/.test(location.search)) document.body.classList.add("player-mode");
  // ?player&ex=m:<people>:<scene> (the address while a piece plays) points at that piece;
  // browsers only let sound start on a click, so it waits there, marked, for one.
  const want = new URLSearchParams(location.search).get("ex"), wb = want && body.querySelector(`button[data-ex="${CSS.escape(want)}"]`);
  if (wb && document.body.classList.contains("player-mode")) {
    wb.classList.add("shared"); now.querySelector(".title").textContent = `▶ ${tr("press the marked button to play")}: ${wb.title}`;
    requestAnimationFrame(() => { wb.scrollIntoView({ block: "center" }); wb.focus({ preventScroll: true }); });
  }
}
renderPlayer();
