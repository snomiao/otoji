// A sung voice on CHIMERA's vocal tract (chimera/chimera.wasm, MIT, jamesondh/chimera-vocal-synth):
// lungs, vocal folds and a branched airway simulated in Rust; this processor only times its notes.
// The main thread plans each note into gestures (planNoteOn / planMelisma / planNoteOff on its own
// instance of the module); the messages carry them with the context time they belong to:
//   { type: "on", at, tag, gs, melisma }  a syllable (or, melisma, the held vowel moving on) from `at`
//   { type: "off", at, tag, gs }          the note ends at `at`: its coda and breath-out, unless a note follows on
//   { type: "body", female, child }       "stop"
// Gesture records: layout version 1, 272 bytes (crates/chimera-wasm/src/lib.rs; after src/wasm/wire.ts).
const KEYS = ["jaw", "tbX", "tbY", "ttX", "ttY", "ttCurl", "root", "lipAp", "lipProt", "lipWidth", "labiodental", "velum", "larynx", "epilarynx", "ventricular", "lateral", "dorsum",
  "abduction", "closure", "breath", "f0", "vibrato"];
const KEY_INDEX = Object.fromEntries(KEYS.map((k, i) => [k, i]));
const SOURCE = ["f0", "glide", "pressure", "breathiness", "tension", "fry", "roughness", "vibratoDepth", "vibratoRate", "drift", "voiced", "brightness"];
const RECORD = 272, MAX = 4000;

class Tract extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.x = new WebAssembly.Instance(options.processorOptions.module, {}).exports;
    this.h = this.x.engine_new(sampleRate);
    const b = options.processorOptions.body || { female: 0, child: 0 };
    if (b.female || b.child) this.x.engine_set_body(this.h, b.female, b.child);
    const src = options.processorOptions.source; // the voice's character: f0 glide pressure breathiness tension fry roughness vibratoDepth vibratoRate drift voiced brightness
    if (src) { const v = new Float64Array(this.x.memory.buffer, this.x.engine_values(this.h), 32).fill(NaN); SOURCE.forEach((k, i) => { if (src[k] !== undefined) v[i] = src[k]; }); this.x.engine_set_source(this.h); }
    this.queue = []; this.sounding = null; this.lastOn = -1; this.tails = []; this.alive = true; this.idle = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m === "stop") { this.alive = false; return; }
      if (m.type === "body") { this.x.engine_set_body(this.h, m.female, m.child); return; }
      this.queue.push(m); this.queue.sort((a, b) => a.at - b.at); this.idle = 0;
    };
  }
  schedule(gs, lead) {
    const x = this.x, buf = x.memory.buffer, at = x.engine_records(this.h), n = Math.min(gs.length, MAX);
    const dv = new DataView(buf, at, n * RECORD), bytes = new Uint8Array(buf, at, n * RECORD);
    for (let i = 0; i < n; i++) {
      const g = gs[i], o = i * RECORD;
      [g.t0, g.t1, g.rampIn, g.rampOut, g.strength, g.speed ?? NaN, g.releaseHold ?? NaN, g.tag ?? NaN].forEach((v, j) => dv.setFloat64(o + j * 8, v, true));
      for (let k = 0; k < KEYS.length; k++) dv.setFloat64(o + 64 + k * 8, NaN, true);
      for (const [k, v] of Object.entries(g.targets)) if (KEY_INDEX[k] !== undefined && v !== undefined && v !== null) dv.setFloat64(o + 64 + KEY_INDEX[k] * 8, v, true);
      bytes[o + 240] = 255; // no label: nothing here draws them
    }
    x.engine_schedule(this.h, n, Math.max(0, lead), 0);
  }
  run(m) {
    const x = this.x, h = this.h, lead = m.at - currentTime;
    if (m.type === "on") {
      this.lastOn = m.at;
      if (m.melisma && this.sounding !== null) { x.engine_release(h, this.sounding + 1); this.schedule(m.gs.map((g) => ({ ...g, tag: this.sounding + 1 })), lead); return; }
      for (const t of this.tails) x.engine_release(h, t + 1); // an ending's breath-out must not open the folds on this onset
      this.tails = [];
      if (this.sounding !== null) { x.engine_release(h, this.sounding); x.engine_release(h, this.sounding + 1); }
      this.schedule(m.gs, lead); this.sounding = m.tag;
    } else if (m.type === "off") {
      if (this.sounding !== m.tag) return; // a later note took over
      if (this.lastOn > m.at - 0.06 || this.queue.some((q) => q.type === "on" && q.at <= m.at + 0.04)) return; // sung on: the next note (or the vowel's melisma) carries it
      x.engine_release(h, m.tag); x.engine_release(h, m.tag + 1); this.sounding = null;
      if (m.gs.length) { this.schedule(m.gs, lead); this.tails.push(m.tag + 2); }
    }
  }
  process(_, outputs) {
    const out = outputs[0][0];
    if (!this.alive) return false;
    const until = currentTime + out.length / sampleRate;
    while (this.queue.length && this.queue[0].at < until) this.run(this.queue.shift());
    const p = this.x.engine_render(this.h, out.length);
    out.set(new Float32Array(this.x.memory.buffer, p, out.length));
    return true;
  }
}
registerProcessor("tract", Tract);
