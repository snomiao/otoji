// bun cultures/i18n/dump-instruments.mjs <region> [from] [to]: prints the translatable
// fields of catalog entries from..to-1 (by position in the file) as JSON.
import { readFileSync } from "fs";
const [region, from = 0, to = 1e9] = process.argv.slice(2), dir = new URL("..", import.meta.url).pathname;
globalThis.INSTRUMENT_CATALOG = []; new Function(readFileSync(`${dir}instruments/${region}.js`, "utf8"))();
const FIELDS = ["sound", "range", "tuning", "acoustics", "materials", "making", "usage", "role", "players", "skills", "scenes", "repertoire", "notation", "meaning", "origin", "finds", "history", "variants", "today", "uncertain"];
const out = INSTRUMENT_CATALOG.slice(+from, +to).map((e, i) => {
  const o = { "#": +from + i, id: e.id, name: e.name, native: e.native, zh: e.zh };
  for (const k of FIELDS) if (e[k]) o[k] = e[k];
  if (e.techniques) o.techniques = e.techniques.map((t) => ({ name: t.name, ...(t.native ? { native: t.native } : {}), how: t.how }));
  return o;
});
console.log(JSON.stringify(out, null, 1));
