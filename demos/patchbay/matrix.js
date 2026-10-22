// Matrix: a civilization × a shared human activity → a patch.
// Every piece opens with the civilization's lead instrument alone for one bar,
// then each bar (4 beats) adds or changes one layer, from the culture's own
// instruments up to a full orchestra: climax, ebb, and it loops.
// Cultures live in cultures/*.js (CIVS, CULTURE_SCALES); this file composes.
"use strict";

const ACTIVITIES = {
  hunt:   { zh: "狩猎", glyph: "猎", en: "Hunt", about: "vs nature: a horn call, stalking, the chase", bpm: 112, mode: "scale", grid: 8,
    base: ["x-x-xx-0", "x-xxx-x-"], climb: true, prog: ["1", "1", "6,", "5,"], second: "third", horn: "call", timp: "pulse", perc: "calm", climax: "oct",
    adds: ["drone", "perc", "second", "low", "horns", "drive", "timp"] },
  battle: { zh: "战斗", glyph: "战", en: "Battle", about: "vs people: drums of war, fanfares, the clash", bpm: 132, mode: "dark", grid: 16,
    base: ["x-x-xxx-x-x-x---", "xxx-x-x-xx-xx---"], climb: true, prog: ["1", "1", "6,", "7,"], second: "third", horn: "fanfare", timp: "roll", perc: "march", climax: "oct",
    adds: ["perc", "ostinato", "horns", "second", "timp", "drive", "choir"] },
  gather: { zh: "采集", glyph: "采", en: "Gather", about: "together in the fields: call and answer, a light step", bpm: 100, mode: "bright", grid: 8,
    base: ["xxxx-x0-", "xx-xxx--"], climb: false, prog: ["1", "4", "5", "1"], second: "echo", horn: "long", timp: null, perc: "calm", climax: "oct",
    adds: ["second", "perc", "low", "harp", "pad", "horns", "choir"] },
  ritual: { zh: "祭祀", glyph: "祭", en: "Ritual", about: "speaking with the gods: drone, chant, bells", bpm: 66, mode: "scale", grid: 4,
    base: ["x-xx", "x-x-"], climb: false, prog: ["1", "1", "5,", "1"], second: "long", horn: "long", timp: "toll", perc: "heart", climax: "oct",
    adds: ["drone", "bell", "choir", "perc", "second", "horns", "timp"] },
  rain:   { zh: "聴雨", glyph: "雨", en: "Waiting", about: "listening to the rain: waiting for the world outside to change, then it does", bpm: 63, mode: "dark", grid: 8,
    base: ["x--0x-0-", "x-0-x---"], climb: false, prog: ["1", "6,", "4,", "5,"], second: "echo", horn: "long", timp: null, perc: "heart", climax: "bright",
    adds: ["harp", "drone", "second", "pad", "low", "perc", "choir"] },
  flood:  { zh: "水灾", glyph: "洪", en: "Flood", about: "the great flood: waves that rise, a struggle, the water recedes", bpm: 84, mode: "dark", grid: 8,
    base: ["x-xx-xx-", "x-x-xxx-"], climb: true, prog: ["1", "7,", "6,", "5,"], second: "third", horn: "long", timp: "roll", perc: "march", climax: "oct",
    adds: ["harp", "low", "perc", "pad", "timp", "horns", "choir"] },
  wind:   { zh: "风灾", glyph: "风", en: "Storm", about: "a great wind: the gale behind everything, swirling flutes, trembling strings", bpm: 92, mode: "dark", grid: 8,
    base: ["x---x-x-", "x-x-x---"], climb: true, prog: ["1", "2", "1", "7,"], second: "long", horn: "long", timp: "roll", perc: "calm", climax: "oct", wind: true,
    adds: ["trem", "low", "swirl", "perc", "horns", "timp", "choir"] },
  death:  { zh: "死亡", glyph: "死", en: "Death", about: "a lament: a tolling bell, a sigh, one cry of grief, silence", bpm: 54, mode: "dark", grid: 4,
    base: ["x--x", "x---"], climb: false, prog: ["1", "6,", "4,", "5,"], second: "long", horn: "long", timp: "toll", perc: "heart", climax: "oct",
    adds: ["drone", "bell", "low", "second", "choir", "pad", "horns"] },
};
const ACTIVITY_IDS = Object.keys(ACTIVITIES);

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
// Move notes from one scale to another by rank among the degrees each has,
// so a pentatonic tune keeps its shape in a five-note minor mode: in gong
// (1 2 3 5 6) → yu (1 b3 4 5 b7), 3 5 6 becomes 4 5 7.
function remap(notes, from, to) {
  if (from === to) return notes;
  const P = (s) => (SCALES[s] || SCALES.major).map((c, i) => (c === null ? null : i)).filter((x) => x !== null);
  const pf = P(from), pt = P(to);
  return notes.map((n) => {
    const o = Math.floor(n.i / 7), d = n.i - 7 * o;
    let k = pf.findIndex((x) => x >= d); if (k < 0) k = pf.length - 1;
    const r = k + o * pf.length, ot = Math.floor(r / pt.length);
    return { acc: n.acc, i: pt[r - ot * pt.length] + 7 * ot };
  });
}
const rest = (n) => Array(n).fill("0"), hold = (n) => Array(n).fill("-");
// A rhythm mask (x note, - hold, 0 rest) filled with notes in order.
function fill(mask, notes, from = 0) {
  let k = from; const out = [...mask].map((c) => (c === "x" ? jp.fmt(notes[k++ % notes.length]) : c));
  return { toks: out, next: k };
}
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

function compose(civ, actId) {
  const A = ACTIVITIES[actId];
  const scaleOf = (mode) => (mode === "dark" ? civ.dark : mode === "bright" ? civ.bright : null) || civ.scale;
  const scale = scaleOf(A.mode), key = civ.key, sc = `${scale} ${key}`;
  const gapped = (SCALES[scale] || []).includes(null);
  const bpm = Math.round(A.bpm * (civ.tempo || 1));
  const [ma, mb] = [civ.motifs[0], civ.motifs[1] || civ.motifs[0]].map((m) => remap(jp.notes(m), civ.scale, scale));
  const lead = role(civ.lead, "strings@lead"), second = role(civ.second, "pluck@second"), drone = role(civ.drone, "strings@drone oct=3");
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
  // Lead: bars 1–6 the theme (motif A, then B), 7–10 it climbs or rises an octave, 11–12 it slows and settles.
  const bar1 = fill(A.base[0], ma), bar2 = fill(A.base[1], mb);
  line(lead, `grid=${g}`, q([...bar1.toks, ...bar2.toks]), 1, 6);
  const hiIn = (target) => [0, 1, 2, 3].flatMap((k) => {
    const src = remap(k % 2 ? mb : ma, scale, target), shift = A.climb ? k : 7;
    return fill(A.base[k % 2], src.map((n) => jp.up(n, shift))).toks;
  });
  if (A.climax === "bright") {
    line(lead, `grid=${g}`, q(hiIn(scale)), 7, 8);
    line(lead, `grid=${g}`, q(hiIn(scaleOf("bright"))), 9, 10, `${scaleOf("bright")} ${key}`);
  } else line(lead, `grid=${g}`, q(hiIn(scale)), 7, 10);
  const tail = [...ma.slice(0, 5).map(jp.fmt), "1", "-", "-"];
  line(lead, "grid=4", q(tail), 11, 12);

  const prog = A.prog, roots = prog.map((t) => jp.parse(t));
  const layers = {
    drone: (a) => line(drone, "grid=8", q(["1+5", ...hold(7)]), a, 12),
    low: (a) => line(role(civ.low, "strings@cellos oct=2 vol=0.8"), "grid=8", q(perBar(prog, 8)), a, 11),
    ostinato: (a) => line(role(civ.low, "strings@cellos oct=2 vol=0.8"), "grid=16",
      q(roots.flatMap((r) => [r, r, r, r, r, r, jp.up(r, -3), r, r, r, r, r, jp.up(r, 2), r, jp.up(r, -3), r].map(jp.fmt))), a, 10),
    second: (a) => {
      if (A.second === "third") line(second, `grid=${g}`, q([...fill(A.base[0], ma.map((n) => jp.up(n, -2))).toks, ...fill(A.base[1], mb.map((n) => jp.up(n, -2))).toks]), a, 10);
      else if (A.second === "echo") line(second, `grid=${g}`, q([...rest(g), ...fill(A.base[0], ma).toks]), a, 10);
      else line(second, "grid=4", q(roots.flatMap((r) => [jp.fmt(jp.up(r, 2)), "-", jp.fmt(jp.up(r, 4)), "-"])), a, 10);
    },
    pad: (a) => line(role(null, "strings@violins vol=0.5"), "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped, 7)), 8)), a, 11),
    harp: (a) => line(role(civ.harp, "pluck@harp oct=4 vol=0.6"), "grid=16",
      q(roots.flatMap((r) => [0, 2, 4, 7, 9, 11, 14, 11, 9, 7, 4, 2, 0, 2, 4, 7].map((k) => jp.fmt(jp.up(r, gapped && k % 7 === 2 ? k + 1 : k))))), a, 11),
    choir: (a) => line(role(null, "choir@choir vol=0.55"), "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped)), 8)), a, 11),
    bell: (a) => line(role(civ.bell, "bell@bell vol=0.6"), "grid=4", q(["1", "-", "-", "-", "5,", "-", "-", "-"]), a, 11),
    horns: (a) => {
      const h = role(null, "brass@horns vol=0.7");
      if (A.horn === "call") line(h, "grid=8", q(["1", "-", "5", "-", "1'", "-", "-", "-", ...rest(4), "5", "-", "1", "-"]), a, 10);
      else if (A.horn === "fanfare") line(h, "grid=16", q(["1", "0", "1", "1", "5", "-", "-", "-", "1'", "-", "5", "-", "1", "-", "-", "-"]), a, 10);
      else line(h, "grid=8", q(perBar(prog.map((t) => chordOf(t, gapped)), 8)), a, 10);
    },
    timp: (a) => {
      const t = role(null, "timpani@timp vol=0.9");
      if (A.timp === "roll") line(t, "grid=16", q([..."1".repeat(12)].map(() => "1").concat(["5,", "5,", "5,", "1"])), a, 10);
      else if (A.timp === "toll") line(t, "grid=4", q(["1", "-", "-", "-"]), a, 11);
      else line(t, "grid=8", q(["1", "0", "0", "0", "5,", "0", "1", "0"]), a, 10);
    },
    perc: (a, until) => {
      const pat = A.perc === "heart" ? grooves.calm.split("|").map((l, i) => (i === 0 ? "x..x............" : ".".repeat(16))).join("|") : grooves[A.perc] || grooves.calm;
      drum(kit, kit, pat, a, until || 10);
    },
    drive: (a) => {
      drum(`${kit}Drive`, kit, grooves.drive, a, 10);
      drum("orch", "orch", "x.......x.......|....x.......x.xx|................", a, 10);
    },
    trem: (a) => line(role(null, "strings@tremolo vol=0.5"), "grid=16", q(roots.flatMap((r) => Array(16).fill(chordOf(jp.fmt(r), true)))), a, 11),
    swirl: (a) => line(role(civ.flute, "flute@swirl oct=5 vol=0.6"), "grid=16",
      q([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0, -1].map((k) => jp.fmt({ acc: "", i: k }))), a, 10),
  };
  // A culture without drums swaps them for another layer, so the form stays 12 bars.
  const adds = A.adds.map((k) => (k === "perc" && civ.noDrums ? ["pad", "choir", "harp", "low"].find((x) => !A.adds.includes(x)) : k));
  const drive = adds.indexOf("drive");
  adds.forEach((k, i) => (k === "perc" && drive > i ? layers.perc(i + 2, drive + 1) : layers[k](i + 2)));
  if (civ.extra) line(role(civ.extra), "grid=4", q(["1", "-", "-", "-"]), 9, 10);
  drum("crash", "orch", "................|................|x...............", 9, 9);
  if (A.wind) L.unshift(". wind 0.55 gust=0.15Hz");
  // Section names: what enters in that bar.
  const label = (k) => ({ second: second.name, perc: kit, drone: drone.name, horns: "horns", timp: "timpani", drive: "drive" })[k] || k;
  const secs = [lead.name, ...adds.map(label), "climax", "peak", "ebb", "end"].map((x) => `${x.replace(/[^\p{L}\p{N}_-]/gu, "")}:1bars`);
  const head = [
    `# ${civ.zh} ${civ.name} × ${A.zh} ${A.en} — ${A.about}`,
    `# ${scale} on ${key} · ${bpm} bpm · bar 1: ${lead.name} alone; each bar adds one layer: ${adds.map(label).join(", ")} · climax · ebb · it loops`,
    civ.note ? `# ${civ.note}` : null,
    `. clock ${bpm} 4/4`,
    `. arrange@song ${secs.join(" ")}`,
    ...[...new Set([scale, A.climax === "bright" ? scaleOf("bright") : scale])].map((n) => `. scale@${n} ${formatScaleDef(SCALES[n])}`),
    "",
  ].filter((x) => x !== null);
  const text = [...head, ...L, "", `*> reverb ${A.bpm < 70 ? "3.5s wet=0.38" : "2.5s wet=0.3"}`, "> speaker 0.5", ""].join("\n");
  try { return formatPatch(parsePatch(text.replace(/\n$/, ""))) + "\n"; } catch (e) { return text; }
}

// ── the left nav: region → civilization → one chip per activity ────────
const REGION_ORDER = ["East Asia", "South & Southeast Asia", "Steppe & Central Asia", "Middle East", "Africa", "Ancient Mediterranean & Near East",
  "Western Europe", "Northern & Central Europe", "Eastern Europe & Byzantium", "Americas"];
function civKey(civ, act) { return `m:${civ.id}:${act}`; }
function activitiesFor(civ) { return ACTIVITY_IDS.filter((a) => !(civ.skip || []).includes(a)); }
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
      nm.append(`${civ.zh} ${civ.name}`, Object.assign(document.createElement("span"), { className: "hint", textContent: `AoE ${civ.games.join("·")}` }));
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
  document.getElementById("tree").append(d);
}
renderMatrix();
