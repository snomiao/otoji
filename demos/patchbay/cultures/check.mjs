// Checks culture files: bun cultures/check.mjs [file.js …] (default: all).
// Validates every CIVS entry against the instruments, kits and scales of src.html.
import { readFileSync, readdirSync } from "fs";
const dir = new URL(".", import.meta.url).pathname, src = readFileSync(dir + "../src.html", "utf8");
const lit = (start) => { const i = src.indexOf(start) + start.length - 1; let d = 0, j = i; for (; j < src.length; j++) { if (src[j] === "{") d++; if (src[j] === "}" && !--d) break; } return new Function("return " + src.slice(i, j + 1))(); };
const SCALES = { ...lit("const SCALES = {"), ...lit("Object.assign(SCALES, {") };
const KITS = { ...lit("const KITS = {"), ...lit("Object.assign(KITS, {"), orch: ["gran", "side", "crash"] };
const KINDS = ["piano", "bass", "strings", "pluck", "flute", "organ", "choir", "bell", "marimba", "brass", "timpani"];
const ACTS = ["hunt", "battle", "gather", "ritual", "rain", "flood", "wind", "fire", "thunder", "birth", "death"];
const REGIONS = ["East Asia", "South & Southeast Asia", "Steppe & Central Asia", "Middle East", "Africa", "Ancient Mediterranean & Near East",
  "Western Europe", "Northern & Central Europe", "Eastern Europe & Byzantium", "Americas"];
globalThis.window = globalThis; globalThis.CIVS = []; globalThis.CULTURE_SCALES = {};
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => dir + f);
const scaleFile = {};
for (const f of files) {
  const before = new Map(Object.entries(CULTURE_SCALES));
  // A file that redefines another file's scale would silently replace it.
  globalThis.CULTURE_SCALES = new Proxy(CULTURE_SCALES, { set(o, k, v) { if (before.has(k) || scaleFile[k]) console.log(`✗ CULTURE_SCALES.${String(k)} defined in ${scaleFile[k] || "an earlier file"} and again in ${f.split("/").pop()}`), process.exitCode = 1; scaleFile[k] = f.split("/").pop(); o[k] = v; return true; } });
  new Function(readFileSync(f, "utf8"))();
  globalThis.CULTURE_SCALES = { ...CULTURE_SCALES };
}
let bad = 0; const err = (c, m) => { bad++; console.log(`✗ ${c.id || "?"}: ${m}`); };
for (const [k, v] of Object.entries(CULTURE_SCALES)) {
  if (SCALES[k]) console.log(`✗ CULTURE_SCALES.${k} shadows a built-in scale`), bad++;
  if (!Array.isArray(v.cents) || v.cents.length !== 7 || v.cents[0] !== 0 || !v.doc) console.log(`✗ CULTURE_SCALES.${k}: { cents: [0, …7 slots, null = absent], doc: "…" }`), bad++;
  SCALES[k] = v.cents;
}
const ids = new Set(), tok = /^([#b]?)([1-7])(['’,]*)$/, lane = /^[xX.]{16}$/, spec = /^([a-z]+)@([A-Za-z][\w-]*)( (oct=[1-7]|vol=[0-2](\.\d+)?|adsr=\S+))*$/;
for (const c of CIVS) {
  if (!/^[a-z][a-z0-9-]*$/.test(c.id || "")) err(c, "id: lowercase-kebab");
  if (ids.has(c.id)) err(c, "duplicate id"); ids.add(c.id);
  for (const k of ["name", "zh", "region", "key", "scale", "lead", "second", "kit", "note"]) if (!c[k]) err(c, `missing ${k}`);
  if (!REGIONS.includes(c.region)) err(c, `region is one of: ${REGIONS.join(" | ")}`);
  if (!Array.isArray(c.games) || !c.games.length || c.games.some((g) => ![1, 2, 3, 4].includes(g))) err(c, "games: e.g. [2, 4]");
  if (!/^[A-G][#b]?$/.test(c.key || "")) err(c, "key: like D or Bb");
  for (const k of ["scale", "dark", "bright"]) if (c[k] && !SCALES[c[k]]) err(c, `${k}: unknown scale ${c[k]}`);
  for (const k of ["lead", "second", "drone", "low", "harp", "bell", "flute", "extra"]) if (c[k] !== undefined) {
    const m = spec.exec(c[k]); if (!m) err(c, `${k}: "kind@name" plus optional oct=N vol=N adsr=…, got ${c[k]}`); else if (!KINDS.includes(m[1])) err(c, `${k}: kind is one of ${KINDS.join(", ")}`);
  }
  if (!KITS[c.kit]) err(c, `kit is one of ${Object.keys(KITS).join(", ")}`);
  for (const [g, p] of Object.entries(c.grooves || {})) {
    if (!["calm", "march", "drive"].includes(g)) err(c, `grooves: calm, march, drive`);
    const ls = p.split("|"); if (ls.length !== 3 || !ls.every((l) => lane.test(l))) err(c, `grooves.${g}: 3 lanes of 16 x/X/. joined by |`);
  }
  if (!Array.isArray(c.motifs) || c.motifs.length !== 2) err(c, "motifs: two strings");
  else for (const m of c.motifs) { const t = m.trim().split(/\s+/); if (t.length !== 8 || !t.every((x) => tok.test(x) || x === "-")) err(c, `motif "${m}": 8 tokens (eighth notes) of 1–7 with ' , # b, or -`); if (!tok.test(t[0])) err(c, `motif "${m}" starts with a note`); }
  if (c.skip && !c.skip.every((s) => ACTS.includes(s))) err(c, `skip: some of ${ACTS.join(", ")}`);
  if (c.tempo !== undefined && !(c.tempo >= 0.8 && c.tempo <= 1.2)) err(c, "tempo: 0.8–1.2");
}
console.log(`${CIVS.length} civilizations, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
