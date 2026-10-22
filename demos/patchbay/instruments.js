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

// ── page ─────────────────────────────────────────────────────────────────
function renderInstruments() {
  const root = document.createElement("section"); root.id = "instruments"; root.setAttribute("aria-label", "Instruments");
  const list = INSTRUMENT_CATALOG.slice().sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.name.localeCompare(b.name));
  root.innerHTML = `<header><h1>${tr("otoji · instruments of the world's peoples")}</h1>
    <a class="to-player" href="?player&lang=${LANG}">${tr("▶ the player")}</a> <a class="to-player" href="?lang=${LANG}">${tr("✎ the editor")}</a>
    <input type="search" class="find" placeholder="${tr("find an instrument or a people…")}" aria-label="${tr("find")}">
    <button type="button" class="stop">${tr("■ Stop")}</button>
    <span class="legend">${list.length} ${tr("instruments")} · ${tr("click a shape to hear it · keys A S D F G H J K play the scale of the last one you touched · ♪ plays its people's tune · Esc or ■ stops")}</span></header>
    <nav class="fams"></nav><div class="cards"></div>`;
  document.body.append(root);
  const cards = root.querySelector(".cards"), fams = root.querySelector(".fams"), byId = new Map(list.map((e) => [e.id, e]));
  let last = null;
  const civName = (id) => { const c = CIVS.find((x) => x.id === id); return c ? civLabel(c) : id; };
  for (const fam of FAMILY_ORDER.filter((f) => list.some((e) => e.family === f))) {
    fams.append(Object.assign(document.createElement("a"), { href: `#fam-${fam}`, textContent: `${tr(FAMILY_LABEL[fam])} (${list.filter((e) => e.family === fam).length})` }));
    cards.append(Object.assign(document.createElement("h2"), { id: `fam-${fam}`, textContent: tr(FAMILY_LABEL[fam]) }));
    for (const e of list.filter((x) => x.family === fam)) {
      const art = document.createElement("article"); art.className = "inst"; art.id = `inst-${e.id}`; art.tabIndex = -1;
      art.dataset.find = [e.name, e.native, e.zh, ...(e.aliases || []), ...e.peoples.map(civName)].join(" ").toLowerCase();
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
      const det = document.createElement("dl");
      for (const [k, label] of [["origin", "Origin"], ["history", "History"], ["materials", "Materials"], ["usage", "How it is played"], ["skills", "Advanced techniques"], ["scenes", "Where it is heard"]]) {
        if (!e[k]) continue; det.append(Object.assign(document.createElement("dt"), { textContent: tr(label) }), Object.assign(document.createElement("dd"), { textContent: tr(e[k]) }));
      }
      if (e.partners && e.partners.length) {
        const dd = document.createElement("dd");
        for (const p of e.partners) { const pe = byId.get(p); dd.append(pe ? Object.assign(document.createElement("a"), { href: `#inst-${p}`, className: "chip", textContent: pe.name }) : Object.assign(document.createElement("span"), { className: "chip", textContent: p })); }
        det.append(Object.assign(document.createElement("dt"), { textContent: tr("Plays with") }), dd);
      }
      art.append(icon, head, ppl, keys, det);
      art.addEventListener("pointerenter", () => { last = e; });
      cards.append(art);
    }
  }
  root.querySelector(".stop").addEventListener("click", stopAudition);
  root.querySelector(".find").addEventListener("input", (ev) => {
    const q = ev.target.value.trim().toLowerCase();
    for (const a of cards.querySelectorAll("article")) a.hidden = !!q && !a.dataset.find.includes(q);
  });
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
