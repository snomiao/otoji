// bun cultures/instruments/check.mjs [file.js…] — validates catalog entries and
// reports instruments used in cultures/<region>.js that no entry covers.
// usage: check.mjs instruments/<region>.js cultures/<region>.js
import { readFileSync, readdirSync } from "fs";
const dir = new URL("..", import.meta.url).pathname;
globalThis.window = globalThis; globalThis.CIVS = []; globalThis.CULTURE_SCALES = {}; globalThis.INSTRUMENT_CATALOG = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) new Function(readFileSync(dir + f, "utf8"))();
const [catFile, cultFile] = process.argv.slice(2);
const others = readdirSync(dir + "instruments").filter((f) => f.endsWith(".js") && dir + "instruments/" + f !== catFile && !catFile.endsWith("/" + f));
for (const f of others) new Function(readFileSync(dir + "instruments/" + f, "utf8"))();
const before = INSTRUMENT_CATALOG.length;
new Function(readFileSync(catFile, "utf8"))();
const mine = INSTRUMENT_CATALOG.slice(before), ids = new Map(INSTRUMENT_CATALOG.slice(0, before).map((e) => [e.id, "another file"]));
const FAM = ["plucked", "bowed", "struck-string", "flute", "reed", "brass", "free-reed", "bagpipe", "drum", "idiophone", "voice"];
const KINDS = ["strings", "pluck", "flute", "reed", "brass", "bagpipe", "throat", "jawharp", "hurdygurdy", "organ", "bell", "marimba", "timpani", "choir", "piano", "bass"];
const civIds = new Set(CIVS.map((c) => c.id)); let bad = 0; const err = (e, m) => { bad++; console.log(`✗ ${e.id || "?"}: ${m}`); };
for (const e of mine) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(e.id || "")) err(e, "id: lowercase-kebab");
  if (ids.has(e.id)) err(e, `duplicate id (also in ${ids.get(e.id)})`); ids.set(e.id, "this file");
  for (const k of ["name", "native", "zh", "origin", "history", "materials", "usage", "skills", "scenes"]) if (!e[k]) err(e, `missing ${k}`);
  if (!FAM.includes(e.family)) err(e, `family is one of ${FAM.join(", ")}`);
  if (!KINDS.includes(e.kind) && !/^kit:[a-z]+:[a-z]+$/.test(e.kind || "")) err(e, `kind is a synth kind (${KINDS.join(", ")}) or kit:<kit>:<lane> for drums`);
  if (!Array.isArray(e.peoples) || !e.peoples.length || e.peoples.some((p) => !civIds.has(p))) err(e, "peoples: civ ids from cultures/*.js");
  if (!Array.isArray(e.aliases) || !e.aliases.length) err(e, "aliases: the node names it covers");
  const svg = e.svg || "";
  if (!/^<svg[^>]*viewBox="0 0 64 64"[^>]*>[\s\S]*<\/svg>$/.test(svg)) err(e, 'svg: one <svg viewBox="0 0 64 64">…</svg>');
  if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject|xlink:href|href=|<image|<use/i.test(svg)) err(e, "svg: shapes only (no script, handlers, links, images or <use>)");
  for (const k of ["origin", "history", "materials", "usage", "skills", "scenes"]) if (e[k] && e[k].split(/\s+/).length > 90) err(e, `${k}: keep it to 1–3 sentences`);
}
if (cultFile) { // coverage: instrument names used in the culture file
  globalThis.CIVS = []; new Function(readFileSync(cultFile, "utf8"))();
  const covered = new Set(INSTRUMENT_CATALOG.flatMap((e) => e.aliases || []));
  const missing = new Set();
  for (const c of CIVS) for (const k of ["lead", "second", "drone", "low", "harp", "flute", "bell", "horns", "pad", "timp", "trem", "extra"]) {
    const v = c[k]; if (!v) continue; const [kind, name] = v.split(" ")[0].split("@"); if (kind === "choir") continue;
    if (!covered.has(name)) missing.add(name);
  }
  if (missing.size) { bad += missing.size; console.log(`✗ not in any entry's aliases: ${[...missing].join(" ")}`); }
}
console.log(`${mine.length} entries, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
