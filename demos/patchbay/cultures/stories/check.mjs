// bun cultures/stories/check.mjs <culture file> <stories file>: every civ × activity has a story.
import { readFileSync } from "fs";
const [cf, sf] = process.argv.slice(2);
globalThis.CIVS = []; globalThis.CULTURE_SCALES = {}; globalThis.STORIES = {};
new Function(readFileSync(cf, "utf8"))(); new Function(readFileSync(sf, "utf8"))();
// The activities and the scenes a people never lived through, read from matrix.js.
const mx = readFileSync(new URL("../../matrix.js", import.meta.url), "utf8");
const ACTS = JSON.parse(/const ACTIVITY_IDS = (\[[^\]]*\])/.exec(mx)[1].replace(/\s+/g, " "));
const NEVER = new Function("return " + /const NEVER = (\{[^}]*\})/.exec(mx)[1])();
const never = (c, a) => (NEVER[a] || "").split(" ").includes(c.id);
let bad = 0, n = 0;
for (const c of CIVS) for (const a of ACTS) {
  if ((c.skip || []).includes(a) || never(c, a) || a === "showcase") continue; // 楽 shows the instruments; the people's intro stands in for a story
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
