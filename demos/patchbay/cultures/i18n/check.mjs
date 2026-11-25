// bun cultures/i18n/check.mjs <lang> <stories file name>: every English story has a translation.
import { readFileSync } from "fs";
const [lang, name] = process.argv.slice(2), dir = new URL("..", import.meta.url).pathname;
globalThis.STORIES = {}; globalThis.I18N = { [lang]: { stories: {}, text: {} } };
new Function(readFileSync(`${dir}stories/${name}.js`, "utf8"))();
new Function(readFileSync(`${dir}i18n/${lang}/${name}.js`, "utf8"))();
const en = STORIES, tx = I18N[lang].stories; let bad = 0;
for (const k of Object.keys(en)) {
  const t = tx[k];
  if (!t) { bad++; if (bad <= 20) console.log(`✗ missing ${k}`); continue; }
  if (lang.startsWith("zh") && !/[一-鿿]/.test(t)) { bad++; console.log(`✗ ${k}: not Chinese`); }
  if (t.includes('"""')) { bad++; console.log(`✗ ${k}: no """ inside`); }
  if (/^\s*Imagined:/.test(en[k]) !== /^\s*想象[:：]/.test(t) && lang === "zh-CN") { bad++; console.log(`✗ ${k}: start with 想象： exactly when the English starts with Imagined:`); }
}
for (const k of Object.keys(tx)) if (!(k in en)) { bad++; console.log(`✗ extra key ${k}`); }
console.log(`${Object.keys(en).length} stories, ${Object.keys(tx).length} translated, ${bad} problem(s)`); process.exit(bad ? 1 : 0);
