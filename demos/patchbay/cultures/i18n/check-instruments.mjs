// bun cultures/i18n/check-instruments.mjs <lang> <region>: every catalog entry in
// cultures/instruments/<region>.js has its text fields translated in
// cultures/i18n/<lang>/instruments/<region>.js (and <region>-2.js; techniques index-aligned).
import { readFileSync, readdirSync } from "fs";
const [lang, region] = process.argv.slice(2), dir = new URL("..", import.meta.url).pathname;
globalThis.INSTRUMENT_CATALOG = []; globalThis.I18N = { [lang]: { instruments: {} } };
new Function(readFileSync(`${dir}instruments/${region}.js`, "utf8"))();
for (const f of readdirSync(`${dir}i18n/${lang}/instruments`).filter((f) => f === `${region}.js` || f === `${region}-2.js`)) new Function(readFileSync(`${dir}i18n/${lang}/instruments/${f}`, "utf8"))();
const FIELDS = ["sound", "range", "tuning", "acoustics", "materials", "making", "usage", "role", "players", "skills", "scenes", "repertoire", "notation", "meaning", "origin", "finds", "history", "variants", "today", "uncertain"];
const tx = I18N[lang].instruments, zh = lang.startsWith("zh"), ids = new Set(INSTRUMENT_CATALOG.map((e) => e.id)); let bad = 0, done = 0;
const err = (id, m) => { bad++; if (bad <= 40) console.log(`✗ ${id}: ${m}`); };
const isZh = (s) => !zh || /[一-鿿]/.test(s);
for (const e of INSTRUMENT_CATALOG) {
  const t = tx[e.id]; if (!t) { err(e.id, "missing"); continue; } done++;
  for (const k of FIELDS) { if (e[k] && !t[k]) err(e.id, `missing ${k}`); if (!e[k] && t[k]) err(e.id, `extra ${k}`); if (t[k] && !isZh(t[k])) err(e.id, `${k} not translated`); }
  for (const k of Object.keys(t)) if (!FIELDS.includes(k) && k !== "techniques") err(e.id, `unknown field ${k}`);
  const te = e.techniques || [], tt = t.techniques || [];
  if (te.length !== tt.length) err(e.id, `techniques: ${te.length} in English, ${tt.length} translated (keep the order)`);
  else tt.forEach((x, i) => { if (!x.name || !x.how) err(e.id, `techniques[${i}] needs name and how`); else if (!isZh(x.how)) err(e.id, `techniques[${i}].how not translated`); });
}
for (const k of Object.keys(tx)) if (!ids.has(k)) err(k, "no such entry");
console.log(`${INSTRUMENT_CATALOG.length} entries, ${done} translated, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
