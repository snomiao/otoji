// ?instruments — every instrument the matrix uses: its shape, where it comes
// from, how it is played, and ways to play it here (click, keys, its tune).
"use strict";

const FAMILY_ORDER = ["plucked", "bowed", "struck-string", "flute", "reed", "free-reed", "bagpipe", "brass", "drum", "idiophone", "voice"];
const FAMILY_LABEL = { plucked: "Plucked strings", bowed: "Bowed strings", "struck-string": "Struck strings", flute: "Flutes", reed: "Reeds",
  "free-reed": "Free reeds", bagpipe: "Bagpipes", brass: "Horns & trumpets", drum: "Drums", idiophone: "Bells, gongs & rattles", voice: "Voices" };
const INST_OCT = { bass: 2, strings: 4, pluck: 4, flute: 5, organ: 3, choir: 4, bell: 4, piano: 4, marimba: 4, brass: 3, timpani: 2, throat: 5, reed: 4, jawharp: 4, hurdygurdy: 4, bagpipe: 4 };

// ── sound: one note of an instrument, on its physical model when it has one ──
let auditionOut = null; const auditionPm = new Map();
// Stop everything playing here: fade the bus out, drop it and its physical models.
function stopAudition() {
  if (!auditionOut || !ctx) return;
  const bus = auditionOut, pms = [...auditionPm.values()];
  bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05); auditionOut = null; auditionPm.clear();
  setTimeout(() => { for (const n of pms) { n.port.postMessage("stop"); n.disconnect(); } bus.disconnect(); }, 300);
}
function auditionNote(entry, f, dur = 0.7, at = 0, key = "C") {
  ensureAudio(); if (ctx.state !== "running") ctx.resume();
  if (!auditionOut) { auditionOut = ctx.createGain(); auditionOut.connect(master); }
  master.gain.setTargetAtTime(volume(), ctx.currentTime, 0.02);
  const t = ctx.currentTime + 0.03 + at;
  if (entry.kind.startsWith("kit:")) { kitHit(auditionOut, entry.kind.split(":")[2], t, false); return; }
  const spec = pmReady && pmFor(entry.kind, entry.aliases[0]);
  if (spec) {
    let n = auditionPm.get(entry.id);
    if (!n) { n = new AudioWorkletNode(ctx, "pm", { numberOfInputs: 0, outputChannelCount: [1], processorOptions: spec }); n.connect(auditionOut); auditionPm.set(entry.id, n); }
    n.port.postMessage({ t, f, dur, peak: 0.35, idx: 0 });
    return;
  }
  const inst = INSTRUMENTS[entry.kind]; if (inst) inst.play(auditionOut, t, f, dur, inst.adsr, 0.22, { key });
}
// A playing technique (entry.techniques[].play), heard on this instrument.
const TECHNIQUES = ["normal", "knock", "harmonic", "mute", "tremolo", "slide", "pizz", "strum", "flutter", "overblow", "roll", "gliss", "spiccato", "col-legno"];
function auditionTechnique(entry, play, f, key) {
  ensureAudio(); if (ctx.state !== "running") ctx.resume();
  if (!auditionOut) { auditionOut = ctx.createGain(); auditionOut.connect(master); }
  master.gain.setTargetAtTime(volume(), ctx.currentTime, 0.02);
  const pmNote = (spec, ev) => {
    const k = `${entry.id}:${spec.model}`; let n = auditionPm.get(k);
    if (!n) { n = new AudioWorkletNode(ctx, "pm", { numberOfInputs: 0, outputChannelCount: [1], processorOptions: spec }); n.connect(auditionOut); auditionPm.set(k, n); }
    n.port.postMessage({ peak: 0.35, idx: 0, dur: 0.7, ...ev, t: ctx.currentTime + 0.03 + (ev.at || 0) });
  };
  const name = entry.aliases[0], str = ["pluck", "strings", "hurdygurdy"].includes(entry.kind);
  const pluckSpec = pmReady && pmFor("pluck", name), bowSpec = pmReady && entry.kind === "strings" && pmFor("strings", name);
  switch (play) {
    case "knock": if (pluckSpec && str) return pmNote(pluckSpec, { f, tech: "knock" }); return kitHit(auditionOut, "rim", ctx.currentTime + 0.03, false);
    case "harmonic": if (pluckSpec && str) return pmNote(pluckSpec, { f, tech: "harmonic", dur: 1.5 }); return auditionNote(entry, f * 2, 0.8, 0, key);
    case "mute": if (pluckSpec && str) return pmNote(pluckSpec, { f, tech: "mute" }); return auditionNote(entry, f, 0.12, 0, key);
    case "pizz": if (pluckSpec) return pmNote(pluckSpec, { f, dur: 0.3 }); return auditionNote(entry, f, 0.15, 0, key);
    case "slide": if (bowSpec) { pmNote(bowSpec, { f, dur: 0.5 }); return pmNote(bowSpec, { f: f * 1.25, dur: 0.6, at: 0.48, legato: true }); }
      if (pluckSpec && str) return pmNote(pluckSpec, { f, bend: 1.25, dur: 1 }); auditionNote(entry, f, 0.3, 0, key); return auditionNote(entry, f * 1.12, 0.3, 0.25, key);
    case "spiccato": // short bounced bow strokes
      if (bowSpec) { for (let i = 0; i < 6; i++) pmNote(bowSpec, { f, dur: 0.06, tech: "spiccato", at: i * 0.13, idx: i % 2 }); return; }
      for (let i = 0; i < 6; i++) auditionNote(entry, f, 0.06, i * 0.13, key); return;
    case "col-legno": // the wood of the bow strikes the string: a knock and a damped tick
      for (let i = 0; i < 4; i++) { if (pluckSpec) { pmNote(pluckSpec, { f, tech: "knock", at: i * 0.18 }); pmNote(pluckSpec, { f, tech: "mute", dur: 0.05, peak: 0.2, at: i * 0.18 }); } else auditionNote(entry, f, 0.05, i * 0.18, key); }
      return;
    case "gliss": { const hs = homeScale(entry); [...hs.notes, ...hs.notes.map((x) => x * 2)].forEach((x, i) => auditionNote(entry, x, 0.5, i * 0.035, key)); return; }
    case "tremolo": for (let i = 0; i < 10; i++) auditionNote(entry, f, 0.07, i * 0.07, key); return;
    case "strum": [1, 1.26, 1.5, 2].forEach((m, i) => auditionNote(entry, f * m, 1.2, i * 0.03, key)); return;
    case "flutter": for (let i = 0; i < 14; i++) auditionNote(entry, f, 0.035, i * 0.045, key); return;
    case "overblow": auditionNote(entry, f, 0.35, 0, key); return auditionNote(entry, f * 2, 0.5, 0.33, key);
    case "roll": for (let i = 0; i < 16; i++) auditionNote(entry, f, 0.05, i * 0.05, key); return;
    default: return auditionNote(entry, f, 0.8, 0, key);
  }
}
// The 8 notes of the instrument's home scale (its first people's), 1 to 1'.
function homeScale(entry) {
  const civ = CIVS.find((c) => c.id === entry.peoples[0]) || { scale: "major", key: "C" };
  const sc = SCALES[civ.scale] || SCALES.major, base = keyMidi(civ.key, INST_OCT[entry.kind] ?? 4);
  const degs = sc.map((c, i) => (c === null ? null : base + c / 100)).filter((x) => x !== null);
  return { civ, notes: [...degs, base + 12].map(midiHz), names: sc.map((c, i) => (c === null ? null : String(i + 1))).filter(Boolean).concat(["1'"]) };
}
// The people's own tune (its two motifs) on this instrument.
function playTune(entry) {
  stopAudition(); // one tune at a time
  const { civ } = homeScale(entry), sc = SCALES[civ.scale] || SCALES.major, base = keyMidi(civ.key, INST_OCT[entry.kind] ?? 4);
  const toks = `${civ.motifs?.[0] || "1 2 3 5"} ${civ.motifs?.[1] || ""}`.trim().split(/\s+/), step = 60 / 92 / 2;
  toks.forEach((tk, i) => {
    if (tk === "-" || tk === "0") return;
    const n = parsePhrase(tk)[0]; let hold = 1; while (toks[i + hold] === "-") hold++;
    const m = base + (degreeCents(sc, n.deg) + n.acc + 1200 * n.oct) / 100;
    auditionNote(entry, midiHz(m), step * hold * 0.95, step * i, civ.key);
  });
}

// ── a demo patch for an instrument, written from its data (no network, no model) ──
const TECH_LETTER = { knock: "x", harmonic: "h", mute: "m", pizz: "p", spiccato: "s", "col-legno": "c", tremolo: "r", overblow: "o", flutter: "f", roll: "r" };
function demoPatch(entry) {
  const civ = CIVS.find((c) => c.id === entry.peoples[0]) || CIVS[0], sc = civ.scale, key = civ.key;
  const motif = `${civ.motifs?.[0] || "1 2 3 5 6 5 3 2"} ${civ.motifs?.[1] || "1 2 3 5 3 2 1 -"}`.trim().split(/\s+/);
  const notes = motif.map((t, i) => [t, i]).filter(([t]) => /^[#b]?[1-7]/.test(t));
  // the tune again, each technique on the next note in turn
  const techs = (entry.techniques || []).map((t) => t.play).filter((p) => p && p !== "normal");
  const withTech = motif.slice(); let k = 0;
  for (const [t, i] of notes) {
    if (!techs.length) break; const p = techs[k++ % techs.length];
    if (p === "slide") { const nxt = notes.find(([, j]) => j > i); withTech[i] = nxt ? `${t}~${nxt[0]}` : t; }
    else if (p === "strum") { const d = Number(t.replace(/\D/g, "")) || 1; withTech[i] = `${t}+${((d + 1) % 7) + 1}+${((d + 3) % 7) + 1}/`; }
    else if (p === "gliss") withTech[i] = `${t}~${t.replace(/^([#b]?[1-7])/, "$1'")}`;
    else if (TECH_LETTER[p]) withTech[i] = t + TECH_LETTER[p];
  }
  const name = entry.aliases[0] === sc ? `${entry.aliases[0]}-${entry.family}` : entry.aliases[0], esc = (x) => (x || "").replace(/"""/g, "”””");
  const lines = [`# ${entry.name}${entry.native ? ` (${entry.native})` : ""} — ${civLabel(civ)}`,
    `# bars 1–2 the tune · bars 3–4 its techniques: ${(entry.techniques || []).map((t) => t.name).join(", ") || "—"} · bars 5–6 with a drone`,
    '"""', ...[entry.sound, entry.origin, entry.usage].filter(Boolean).map(esc), '"""',
    ". clock 84 4/4", ". arrange@song tune:2bars techniques:2bars together:2bars",
    `. scale@${sc} ${formatScaleDef(SCALES[sc])}`, ""];
  if (entry.kind.startsWith("kit:")) {
    const [, kit] = entry.kind.split(":");
    lines.push(`. drums@${name} kit=${kit} "${(civ.grooves && civ.grooves.calm) || "x...x...x...x...|....x.......x...|..x...x...x...x."}"`);
  } else {
    lines.push(`. ${entry.kind}@${name} ${sc} ${key} grid=8 "${motif.join(" ")}" ?song.1`,
      `. ${entry.kind}@${name}-techniques ${sc} ${key} grid=8 "${withTech.join(" ")}" ?song.2`,
      `. ${entry.kind}@${name}-again ${sc} ${key} grid=8 "${motif.join(" ")}" ?song.3`);
    const partner = (entry.partners || []).map((p) => INSTRUMENT_CATALOG.find((x) => x.id === p)).find((x) => x && !x.kind.startsWith("kit:"));
    lines.push(partner ? `. ${partner.kind}@${partner.aliases[0]}-drone ${sc} ${key} oct=3 grid=8 "1+5 - - - - - - -" ?song.3` : `. strings@drone ${sc} ${key} oct=3 grid=8 "1+5 - - - - - - -" ?song.3`);
  }
  lines.push("", "*> reverb 2s wet=0.25", "> speaker 0.5", "");
  const text = lines.join("\n");
  try { return formatPatch(parsePatch(text.replace(/\n$/, ""))) + "\n"; } catch (e) { return text; }
}
// Open a patch in the editor view of this page.
function openInEditor(text) {
  stopAudition(); document.body.classList.remove("instruments-mode", "player-mode");
  const u = new URL(location.href); u.searchParams.delete("instruments"); u.searchParams.delete("player"); history.pushState(null, "", u);
  ui.setText(text); applyText(text); window.scrollTo(0, 0);
}

// ── page ─────────────────────────────────────────────────────────────────
function renderInstruments() {
  const root = document.createElement("section"); root.id = "instruments"; root.setAttribute("aria-label", "Instruments");
  const list = INSTRUMENT_CATALOG.slice().sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.name.localeCompare(b.name));
  root.innerHTML = `<header><h1>${tr("otoji · instruments of the world's peoples")}</h1>
    <a class="to-player" href="?player&lang=${LANG}">${tr("▶ the player")}</a> <a class="to-player" href="?lang=${LANG}">${tr("✎ the editor")}</a>
    <input type="search" class="find" placeholder="${tr("find: an instrument, a people, a technique, a material…")}" aria-label="${tr("find")}">
    <label class="grouping">${tr("group by")} <select class="group"><option value="type">${tr("type of instrument")}</option><option value="region">${tr("region and people")}</option></select></label>
    <button type="button" class="stop">${tr("■ Stop")}</button>
    <span class="legend">${list.length} ${tr("instruments")} · ${tr("click a shape to hear it · keys A S D F G H J K play the scale of the last one you touched · ♪ plays its people's tune · Esc or ■ stops")}</span></header>
    <nav class="fams"></nav><div class="cards"></div>`;
  document.body.append(root);
  const cards = root.querySelector(".cards"), fams = root.querySelector(".fams"), byId = new Map(list.map((e) => [e.id, e]));
  let last = null;
  const civName = (id) => { const c = CIVS.find((x) => x.id === id); return c ? civLabel(c) : id; };
  // One card per instrument (a fresh element each time it is shown).
  const makeCard = (e, where) => {
    const art = document.createElement("article"); art.className = "inst"; art.id = `inst-${e.id}${where ? "-" + where : ""}`; art.tabIndex = -1;
    // the search box looks through every field, techniques included (Ctrl+F also finds text inside the folded sections)
    art.dataset.find = [e.name, e.native, e.zh, ...(e.aliases || []), ...e.peoples.map(civName),
      ...["sound", "range", "tuning", "acoustics", "materials", "making", "usage", "role", "players", "skills", "scenes", "repertoire", "notation", "meaning", "origin", "finds", "history", "variants", "today", "hs"].map((k) => e[k] || ""),
      ...(e.techniques || []).flatMap((t) => [t.name, t.native || "", t.how || ""])].join(" ").toLowerCase();
    const icon = document.createElement("button"); icon.type = "button"; icon.className = "icon"; icon.title = tr("play a note"); icon.setAttribute("aria-label", `${tr("play")} ${e.name}`);
    icon.innerHTML = e.svg; // shapes only: checked by cultures/instruments/check.mjs
    const hs = homeScale(e);
    icon.addEventListener("click", () => { last = e; auditionNote(e, hs.notes[0], 0.9, 0, hs.civ.key); });
    const head = document.createElement("div"); head.className = "head";
    head.append(Object.assign(document.createElement("h3"), { textContent: `${e.name}` }),
      Object.assign(document.createElement("span"), { className: "native", textContent: `${e.native}${e.zh && e.zh !== e.native ? " · " + e.zh : ""}` }));
    const ppl = document.createElement("div"); ppl.className = "peoples";
    for (const p of e.peoples) ppl.append(Object.assign(document.createElement("span"), { className: "chip", textContent: civName(p) }));
    const keys = document.createElement("div"); keys.className = "keys";
    hs.notes.forEach((f, i) => { const k = document.createElement("button"); k.type = "button"; k.textContent = hs.names[i]; k.title = "ASDFGHJK"[i] || ""; k.addEventListener("click", () => { last = e; auditionNote(e, f, 0.7, 0, hs.civ.key); }); keys.append(k); });
    const tune = Object.assign(document.createElement("button"), { type: "button", className: "tune", textContent: `♪ ${tr("its tune")}`, title: civName(hs.civ.id) });
    tune.addEventListener("click", () => { last = e; playTune(e); }); keys.append(tune);
    const demo = Object.assign(document.createElement("button"), { type: "button", className: "tune", textContent: `✎ ${tr("demo")}`, title: tr("open a demo of this instrument in the editor") });
    demo.addEventListener("click", () => openInEditor(demoPatch(e))); keys.append(demo);
    let techRow = null;
    if (e.techniques && e.techniques.length) {
      const tq = document.createElement("div"); tq.className = "techs";
      tq.append(Object.assign(document.createElement("span"), { className: "lbl", textContent: tr("techniques") }));
      for (const t of e.techniques) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = t.native ? `${t.name} ${t.native}` : t.name; b.title = tr(t.how || "");
        b.addEventListener("click", () => { last = e; auditionTechnique(e, TECHNIQUES.includes(t.play) ? t.play : "normal", hs.notes[0], hs.civ.key); });
        tq.append(b);
      }
      techRow = tq;
    }
    const det = document.createElement("dl");
    // Always shown: what it sounds like and its range. The rest folds into four sections.
    const field = (dl, k, label) => { if (!e[k]) return; dl.append(Object.assign(document.createElement("dt"), { textContent: tr(label) }), Object.assign(document.createElement("dd"), { textContent: tr(e[k]) })); };
    const chips = (dl, ids, label) => {
      if (!ids || !ids.length) return; const dd = document.createElement("dd");
      for (const p of ids) { const pe = byId.get(p); dd.append(pe ? Object.assign(document.createElement("a"), { href: `#inst-${p}`, className: "chip", textContent: pe.name }) : Object.assign(document.createElement("span"), { className: "chip", textContent: p })); }
      dl.append(Object.assign(document.createElement("dt"), { textContent: tr(label) }), dd);
    };
    field(det, "sound", "Sound"); field(det, "range", "Range");
    const GROUPS = [
      ["Construction", [["acoustics", "How the sound is made"], ["materials", "Materials"], ["making", "How it is made"]]],
      ["Playing", [["usage", "How it is played"], ["role", "Role in the ensemble"], ["players", "Who plays it"], ["tuning", "Tuning"], ["skills", "Advanced techniques"]], ["partners", "Plays with"]],
      ["Context", [["scenes", "Where it is heard"], ["repertoire", "Repertoire"], ["notation", "Notation"], ["meaning", "Meaning"]]],
      ["History", [["origin", "Origin"], ["finds", "Earliest evidence"], ["history", "History"], ["variants", "Variants"], ["today", "Today"], ["hs", "Hornbostel–Sachs"]], ["relatives", "Relatives"]],
    ];
    const more = [];
    for (const [title, fields, chipField] of GROUPS) {
      const dl = document.createElement("dl"); for (const [k, label] of fields) field(dl, k, label);
      if (chipField) chips(dl, e[chipField[0]], chipField[1]);
      if (!dl.children.length) continue;
      const d = document.createElement("details"); d.className = "more";
      d.append(Object.assign(document.createElement("summary"), { textContent: tr(title) }), dl); more.push(d);
    }
    if (e.uncertain) head.append(Object.assign(document.createElement("span"), { className: "info", textContent: " ⓘ", title: tr(e.uncertain), tabIndex: 0, role: "note" }));
    art.append(icon, head, ppl, keys, ...(techRow ? [techRow] : []), det, ...more);
    art.addEventListener("pointerenter", () => { last = e; });
    return art;
  };
  // Sections fold; by type (Hornbostel–Sachs) or by region → people.
  const CLASSES = [["Strings (chordophones)", ["plucked", "bowed", "struck-string"]], ["Winds (aerophones)", ["flute", "reed", "free-reed", "bagpipe", "brass"]],
    ["Drums (membranophones)", ["drum"]], ["Bells, gongs & rattles (idiophones)", ["idiophone"]], ["Voices", ["voice"]]];
  const section = (title, n, id, open = true) => { const d = document.createElement("details"); d.open = open; d.id = id; d.className = "sec";
    d.append(Object.assign(document.createElement("summary"), { textContent: `${title} (${n})` })); const g = document.createElement("div"); g.className = "grid"; d.append(g); return [d, g]; };
  const render = (mode) => {
    cards.replaceChildren(); fams.replaceChildren();
    if (mode === "type") {
      for (const [cls, fs] of CLASSES) {
        const inCls = list.filter((e) => fs.includes(e.family)); if (!inCls.length) continue;
        const [top] = section(tr(cls), inCls.length, `cls-${fs[0]}`); top.classList.add("top"); top.querySelector(".grid").remove();
        for (const fam of fs) {
          const items = list.filter((e) => e.family === fam); if (!items.length) continue;
          const [d, g] = section(tr(FAMILY_LABEL[fam]), items.length, `fam-${fam}`);
          for (const e of items) g.append(makeCard(e));
          top.append(d);
          fams.append(Object.assign(document.createElement("a"), { href: `#fam-${fam}`, textContent: `${tr(FAMILY_LABEL[fam])} (${items.length})` }));
        }
        cards.append(top);
      }
    } else {
      const regions = [...new Set([...REGION_ORDER, ...CIVS.map((c) => c.region)])].filter((r) => CIVS.some((c) => c.region === r));
      for (const reg of regions) {
        const civs = CIVS.filter((c) => c.region === reg && list.some((e) => e.peoples.includes(c.id))); if (!civs.length) continue;
        const ids = new Set(list.filter((e) => e.peoples.some((p) => civs.some((c) => c.id === p))).map((e) => e.id));
        const [top] = section(tr(reg), ids.size, `reg-${reg.replace(/\W+/g, "-")}`); top.classList.add("top"); top.querySelector(".grid").remove();
        for (const civ of civs) {
          const items = list.filter((e) => e.peoples.includes(civ.id));
          const [d, g] = section(civLabel(civ), items.length, `civ-${civ.id}`, false);
          for (const e of items) g.append(makeCard(e, civ.id));
          top.append(d);
        }
        cards.append(top);
        fams.append(Object.assign(document.createElement("a"), { href: `#reg-${reg.replace(/\W+/g, "-")}`, textContent: `${tr(reg)} (${ids.size})` }));
      }
    }
    filter();
  };
  const filter = () => {
    const q = root.querySelector(".find").value.trim().toLowerCase();
    for (const a of cards.querySelectorAll("article")) a.hidden = !!q && !a.dataset.find.includes(q);
    for (const d of cards.querySelectorAll("details")) { const any = !q || d.querySelector("article:not([hidden])"); d.hidden = !any; if (q && any) d.open = true; }
  };
  let mode = "type"; try { mode = localStorage.getItem("otoji-inst-group") || "type"; } catch (err) { /* storage unavailable */ }
  const sw = root.querySelector(".group");
  sw.value = mode; sw.addEventListener("change", () => { mode = sw.value; try { localStorage.setItem("otoji-inst-group", mode); } catch (err) { /* storage unavailable */ } render(mode); });
  render(mode);
  // References, at the end: what was consulted, and what the data itself names.
  const refs = document.createElement("section"); refs.className = "refs"; refs.id = "references";
  const REFS = [
    ["Classification", [
      ["E. M. von Hornbostel & C. Sachs, “Systematik der Musikinstrumente”, Zeitschrift für Ethnologie 46 (1914) — the type groups on this page", null]]],
    ["Sound synthesis (consulted for the physical models)", [
      ["K. Karplus & A. Strong, “Digital Synthesis of Plucked-String and Drum Timbres”, Computer Music Journal 7/2 (1983)", null],
      ["Ben Lynn, “The Karplus-Strong Algorithm”", "https://crypto.stanford.edu/~blynn/sound/karplusstrong.html"],
      ["Barry Truax, “Waveguide Resonators” (SFU)", "https://www.sfu.ca/~truax/reson.html"],
      ["Csound manual, pluck opcode", "https://csound.com/manual/opcodes/pluck/"],
      ["guzheng-sound (Karplus-Strong guzheng on npm)", "https://libraries.io/npm/guzheng-sound"],
      ["P. Cook & G. Scavone, The Synthesis ToolKit (STK): Bowed, Flute, Clarinet, Brass models", "https://ccrma.stanford.edu/software/stk/"],
      ["faustwasm (Faust to WebAssembly / AudioWorklet)", "https://github.com/Fr0stbyteR/faustwasm"],
      ["Versilian Community Sample Library (CC0), considered for samples", "https://versilian-studios.com/vcsl/"]]],
    ["Voices (crowd node)", [
      ["KlattSyn — Klatt formant synthesizer", "https://www.source-code.biz/klattSyn"],
      ["“Walla” (crowd murmur in film sound)", "https://en.wikipedia.org/wiki/Walla"],
      ["Cycling '74 forum: synthesizing crowd noise", "https://cycling74.com/forums/synthesizing-crowd-noise"]]],
  ];
  const named = new Map(); // sources named by the pieces and well-known tunes
  for (const tbl of [PIECES, FAMOUS]) for (const [k, v] of Object.entries(tbl)) if (v && v.source && v.source !== "lost") {
    const key = v.source.trim(); if (!named.has(key)) named.set(key, []); named.get(key).push(v.title);
  }
  refs.innerHTML = `<h2>${tr("References")}</h2>`;
  for (const [head, items] of REFS) {
    refs.append(Object.assign(document.createElement("h3"), { textContent: tr(head) }));
    const ul = document.createElement("ul");
    for (const [text, url] of items) { const li = document.createElement("li"); if (url) li.append(Object.assign(document.createElement("a"), { href: url, textContent: text, rel: "noopener", target: "_blank" })); else li.textContent = text; ul.append(li); }
    refs.append(ul);
  }
  refs.append(Object.assign(document.createElement("h3"), { textContent: tr("Sources named for the pieces and melodies") }));
  const ul2 = document.createElement("ul");
  for (const [src, titles] of [...named].sort((a, b) => a[0].localeCompare(b[0]))) ul2.append(Object.assign(document.createElement("li"), { textContent: `${src} — ${[...new Set(titles)].join(", ")}` }));
  refs.append(ul2);
  refs.append(Object.assign(document.createElement("p"), { className: "caveat", textContent: tr("The instrument descriptions, histories and stories were written by an AI model from general knowledge, not from individually cited sources; native-script spellings marked uncertain are flagged with ⓘ. Treat them as a starting point and check them before relying on them.") }));
  root.append(refs);
  root.querySelector(".stop").addEventListener("click", stopAudition);
  root.querySelector(".find").addEventListener("input", filter);
  // A S D F G H J K play the scale of the last instrument touched.
  document.addEventListener("keydown", (ev) => {
    if (!document.body.classList.contains("instruments-mode")) return;
    if (ev.key === "Escape") { stopAudition(); return; }
    if (ev.target.matches("input, textarea") || ev.repeat || !last) return;
    const i = "asdfghjk".indexOf(ev.key.toLowerCase()); if (i < 0) return;
    const hs = homeScale(last); if (hs.notes[i]) auditionNote(last, hs.notes[i], 0.7, 0, hs.civ.key);
  });
}
renderInstruments();
if (/[?&]instruments\b/.test(location.search)) document.body.classList.add("instruments-mode");
