// bun cultures/stories/check.mjs <culture file> <stories file>: every civ × activity has a story.
import { readFileSync } from "fs";
const [cf, sf] = process.argv.slice(2);
globalThis.CIVS = []; globalThis.CULTURE_SCALES = {}; globalThis.STORIES = {};
new Function(readFileSync(cf, "utf8"))(); new Function(readFileSync(sf, "utf8"))();
const ACTS = ["hunt", "battle", "gather", "ritual", "rain", "flood", "wind", "fire", "thunder", "birth", "death"];
let bad = 0, n = 0;
for (const c of CIVS) for (const a of ACTS) {
  if ((c.skip || []).includes(a)) continue;
  const s = STORIES[`${c.id}:${a}`]; n++;
  if (!s) { console.log(`✗ missing ${c.id}:${a}`); bad++; continue; }
  const words = s.trim().split(/\s+/).length;
  if (words < 40 || words > 130) { console.log(`✗ ${c.id}:${a}: ${words} words (40–130)`); bad++; }
  if (/age of empires|aoe\b/i.test(s)) { console.log(`✗ ${c.id}:${a}: no game references`); bad++; }
  if (s.includes('"""')) { console.log(`✗ ${c.id}:${a}: no """ inside`); bad++; }
}
const extra = Object.keys(STORIES).filter((k) => { const [id, a] = k.split(":"); return !CIVS.some((c) => c.id === id) || !ACTS.includes(a); });
for (const k of extra) { console.log(`✗ unknown key ${k}`); bad++; }
console.log(`${n} stories expected, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
