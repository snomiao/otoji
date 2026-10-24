// Physical models for the Patchbay, after the STK (Cook & Scavone) designs:
// plucked strings (extended Karplus-Strong) and bowed strings (two-sided
// waveguide with a bow friction table). One node per instrument line; notes
// arrive as messages { t, f, dur, peak } and start sample-accurately at t.
// Consecutive notes on a bowed string glide (legato) instead of re-attacking.

// A fractional delay line with linear interpolation.
class Delay {
  constructor(max) { this.buf = new Float32Array(max); this.w = 0; this.len = 2; }
  setLen(n) { this.len = Math.max(2, Math.min(this.buf.length - 2, n)); }
  read() {
    const r = this.w - this.len, i = Math.floor(r), frac = r - i, n = this.buf.length;
    const a = this.buf[((i % n) + n) % n], b = this.buf[(((i + 1) % n) + n) % n];
    return a + (b - a) * frac;
  }
  write(x) { this.buf[this.w % this.buf.length] = x; this.w++; }
  // a bore at rest holds a whisper of noise, as a real one does, so a wind speaks at once instead of
  // growing its tone out of nothing over a second
  stir(a) { let e = 0; for (const x of this.buf) e += x * x; if (e < 1e-6) for (let i = 0; i < this.buf.length; i++) this.buf[i] = (Math.random() * 2 - 1) * a; }
}
// One-pole lowpass.
class OnePole { constructor(c) { this.c = c; this.y = 0; } tick(x) { this.y += this.c * (x - this.y); return this.y; } }
// A resonant bandpass (body formant).
class Reso {
  constructor(f, q, sr) { const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q); const a0 = 1 + al;
    this.b0 = al / a0; this.b2 = -al / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - al) / a0; this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  tick(x) { const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

// Plucked string: a noise burst shaped by the pluck position circulates in a
// delay loop; each pass loses a little of its highs. A body adds formants
// (unless ext: the Patchbay then plays the line through a full body response);
// buzz (jawari / a sitar's flat bridge) clips the string against the bridge.
class Pluck {
  constructor(sr, p) {
    this.sr = sr; this.p = p; this.d = new Delay(Math.ceil(sr / 20) + 4); this.lp = new OnePole(0.5);
    this.body = (p.body || [[180, 2], [420, 3]]).map(([f, q]) => new Reso(f, q, sr)); this.on = false;
  }
  // tech: "knock" (tap the body: only the body rings), "harmonic" (touch the
  // string's middle: the octave, bell-like), "mute" (damped by the palm), bend
  // (slide the pitch by a ratio over 150 ms).
  start(f, peak, dur, tech, bend) {
    this.knock = 0; this.bendStep = 1; this.bendLeft = 0;
    if (tech === "knock") { this.on = true; this.amp = peak; this.knock = Math.floor(this.sr * 0.004); this.left = Math.floor(this.sr * 0.6); this.silent = true; return; }
    this.silent = false;
    if (tech === "harmonic") f *= 2;
    if (bend && bend !== 1) { this.bendLeft = Math.floor(this.sr * 0.15); this.bendStep = Math.pow(1 / bend, 1 / this.bendLeft); }
    const sr = this.sr, p = { ...this.p, ...(tech === "harmonic" ? { pos: 0.5, bright: 0.9, t60: 2 } : tech === "mute" ? { t60: 0.25, bright: 0.2 } : {}) }, n = sr / f;
    this.d.setLen(n - 0.5); this.amp = peak; this.left = Math.floor(sr * Math.max(dur, 0.2) + sr * (p.ring || 1.5)); this.on = true; this.damp = 0;
    // Each sample passes the loop once per period, so the loop gain sets the ring
    // time; it is corrected for the mild lowpass's own loss at the fundamental.
    this.lp.c = Math.min(0.98, 0.72 + 0.26 * (p.bright || 0.5)); this.lp.y = 0;
    const w = 2 * Math.PI * f / sr, c = this.lp.c, lpGain = c / Math.hypot(1 - (1 - c) * Math.cos(w), (1 - c) * Math.sin(w));
    this.g = Math.min(0.99995, Math.pow(0.001, 1 / ((p.t60 || 2.5) * f)) / lpGain);
    const pos = p.pos || 0.18, len = Math.max(2, Math.round(n)), cut = Math.max(1, Math.round(pos * len)), raw = new Float32Array(len);
    let s = 0; for (let i = 0; i < len; i++) { s += (Math.random() * 2 - 1); raw[i] = s * 0.25; s *= 0.6; }
    for (let i = 0; i < len; i++) this.d.write(raw[i] - (i >= cut ? raw[i - cut] : 0)); // pluck-position comb
    this.stopAt = Math.floor(sr * dur); this.t = 0;
  }
  tick() {
    if (!this.on) return 0;
    if (this.silent) { // a tap on the body: a short noise burst through the body formants only
      const x = this.knock > 0 ? (Math.random() * 2 - 1) * (this.knock-- / (this.sr * 0.004)) : 0;
      let o = 0; if (this.p.ext) o = x * 1.5; else for (const b of this.body) o += b.tick(x) * 2.5; // ext: the line's body rings it
      if (--this.left <= 0) this.on = false;
      return o * this.amp;
    }
    if (this.bendLeft > 0) { this.d.setLen(this.d.len * this.bendStep); this.bendLeft--; }
    let y = this.d.read();
    if (this.p.buzz) { const th = 0.12; if (y > th) y = th + (y - th) * 0.3; else if (y < -th) y = -th + (y + th) * 0.3; }
    let fb = this.lp.tick(y) * this.g;
    if (this.t > this.stopAt && this.p.mute) fb *= 0.995; // damped by the hand after the note
    this.d.write(fb); this.t++;
    let o = y; if (!this.p.ext) for (const b of this.body) o += b.tick(y) * (this.p.bodyMix || 0.6);
    if (--this.left <= 0) this.on = false;
    return o * this.amp;
  }
}

// Bowed string (STK Bowed): the bow drives the string through a friction table;
// the string is split at the bow into a neck side and a bridge side.
class Bowed {
  constructor(sr, p) {
    this.sr = sr; this.p = p; this.neck = new Delay(Math.ceil(sr / 30) + 4); this.bridge = new Delay(Math.ceil(sr / 30) + 4);
    this.lp = new OnePole(0.75); this.body = (p.body || [[500, 2], [1400, 3], [3000, 4]]).map(([f, q]) => new Reso(f, q, sr));
    this.f = 220; this.target = 220; this.vel = 0; this.velTarget = 0; this.on = false; this.vib = 0;
  }
  freq(f) {
    const base = this.sr / f, beta = this.p.beta || 0.127;
    this.neck.setLen(base * (1 - beta)); this.bridge.setLen(base * beta);
  }
  // tech "spiccato": a short stroke that starts at full bow speed (bounced bow).
  start(f, peak, dur, legato, tech) {
    this.target = f; if (!legato || !this.on) { this.f = f; this.freq(f); this.vib = 0; this.vibOn = 0; }
    this.peak = peak; this.velTarget = this.p.pressure || 0.25; this.on = true; this.release = Math.floor(this.sr * dur); this.t = 0;
    if (tech === "spiccato") { this.vel = this.velTarget * 1.3; this.vibOn = 0; }
    this.glide = legato ? Math.pow(f / this.f, 1 / (this.sr * (this.p.glide || 0.07))) : 1;
  }
  tick() {
    if (!this.on) return 0;
    const sr = this.sr;
    if (this.glide !== 1) { this.f *= this.glide; if ((this.glide > 1 && this.f >= this.target) || (this.glide < 1 && this.f <= this.target)) { this.f = this.target; this.glide = 1; } }
    // vibrato that starts a little after the bow and deepens
    this.vibOn = Math.min(1, this.vibOn + 1 / (sr * 0.35)); this.vib += 2 * Math.PI * (this.p.vibRate || 5.5) / sr;
    this.freq(this.f * (1 + Math.sin(this.vib) * (this.p.vibDepth || 0.006) * this.vibOn));
    const want = this.t < this.release ? this.velTarget : 0;
    this.vel += (want - this.vel) * (this.t < this.release ? 0.002 : 0.0006);
    const bridgeRefl = -this.lp.tick(this.bridge.read()) * 0.995, nutRefl = -this.neck.read();
    const dv = this.vel - (bridgeRefl + nutRefl);
    let slope = 5 - 4 * (this.p.force || 0.6), tbl = Math.pow(Math.abs(dv * slope + 0.001) + 0.75, -4); if (tbl > 1) tbl = 1;
    const nv = dv * tbl;
    this.neck.write(bridgeRefl + nv); this.bridge.write(nutRefl + nv);
    const s = this.bridge.read(); let o = s * 0.2; if (this.p.ext) o = s; else for (const b of this.body) o += b.tick(s);
    this.t++; if (this.t > this.release && this.vel < 0.0005) this.on = false;
    return o * this.peak * 0.6;
  }
}

// A DC blocker.
class DCBlock { constructor() { this.x = 0; this.y = 0; } tick(x) { const y = x - this.x + 0.995 * this.y; this.x = x; this.y = y; return y; } }
// Shared wind breath: a pressure envelope with noise and vibrato.
class Breath {
  constructor(sr, p) { this.sr = sr; this.p = p; this.lvl = 0; this.vib = 0; }
  tick(target, rate) { this.lvl += (target - this.lvl) * rate; this.vib += 2 * Math.PI * (this.p.vibRate || 5) / this.sr;
    return this.lvl * (1 + (Math.random() * 2 - 1) * (this.p.noise ?? 0.12) + Math.sin(this.vib) * (this.p.vibDepth ?? 0.03)); }
}
// Flute (STK Flute): the breath jet strikes the edge; a cubic jet table drives the bore.
class Flute {
  constructor(sr, p) { this.sr = sr; this.p = p; this.bore = new Delay(Math.ceil(sr / 40) + 4); this.jet = new Delay(Math.ceil(sr / 40) + 4); this.lp = new OnePole(0.6); this.dc = new DCBlock(); this.breath = new Breath(sr, p); this.on = false; }
  start(f, peak, dur, legato) { this.bore.stir(0.02); const jr = this.p.jetRatio || 0.32, bore = (this.sr / f) / (1 + jr); this.bore.setLen(bore + 0.1); this.jet.setLen(bore * jr); /* the jet is inside the loop */ this.peak = peak; this.release = Math.floor(this.sr * dur); this.t = 0; this.on = true; }
  tick() {
    if (!this.on) return 0;
    const b = this.breath.tick(this.t < this.release ? (this.p.pressure || 0.9) : 0, this.t < this.release ? 0.004 : 0.002);
    const temp = this.dc.tick(-this.lp.tick(this.bore.read()));
    let pd = b - 0.5 * temp; this.jet.write(pd); pd = this.jet.read();
    let jt = pd * (pd * pd - 1); jt = Math.max(-1, Math.min(1, jt));
    const out = jt + 0.5 * temp; this.bore.write(out);
    this.t++; if (this.t > this.release + this.sr * 0.5) this.on = false;
    return out * 0.3 * this.peak * 2;
  }
}
// Reed (after STK Clarinet): the reed is a pressure valve at the end of a bore, which holds its register
// steadily. A cylinder (clarinet-like) sounds the odd harmonics; a cone (double reeds: shawm, suona, zurna,
// oboe) sounds all of them, so for a cone the same loop's output is shaped to give the even ones and
// the nasal edge of a double reed. (A bore folded at the reed, as in STK Saxofony, jumps register.)
class Reed {
  constructor(sr, p) { this.sr = sr; this.p = p; this.bore = new Delay(Math.ceil(sr / 40) + 4); this.lp = new OnePole(p.bright || 0.5); this.dc = new DCBlock(); this.dc2 = new DCBlock(); this.breath = new Breath(sr, { noise: 0.08, vibDepth: 0.02, ...p }); this.edge = new OnePole(0.5); this.on = false; }
  start(f, peak, dur) { this.bore.stir(0.02); this.bore.setLen(this.sr / f * 0.5 - 1); this.peak = peak; this.release = Math.floor(this.sr * dur); this.t = 0; this.on = true; }
  tick() {
    if (!this.on) return 0;
    const b = this.breath.tick(this.t < this.release ? (this.p.pressure || 0.8) : 0, this.t < this.release ? 0.006 : 0.003);
    const refl = -0.95 * this.lp.tick(this.bore.read());
    const pd = refl - b; let reed = 0.7 - 0.3 * pd; reed = Math.max(-1, Math.min(1, reed));
    let out = b + pd * reed; this.bore.write(out);
    out = this.dc.tick(out);
    if (this.p.conical) { // rectify part of the wave (even harmonics), then lift the edge above the lowest partials
      const shaped = out + 1.6 * Math.abs(out) - 0.4 * out * out * out, hi = shaped - this.edge.tick(shaped);
      out = this.dc2.tick(shaped * 1.1 + hi * 1.8); // (a double reed is loud: a little above the clarinet)
    }
    this.t++; if (this.t > this.release + this.sr * 0.4) this.on = false;
    return out * 0.6 * this.peak * 2;
  }
}
// Brass (STK Brass): buzzing lips (a resonant filter tuned to the note) against the bore.
class Brass {
  constructor(sr, p) { this.sr = sr; this.p = p; this.bore = new Delay(Math.ceil(sr / 20) + 8); this.dc = new DCBlock(); this.breath = new Breath(sr, { noise: 0.02, vibDepth: 0.01, ...p }); this.on = false; }
  start(f, peak, dur) {
    const sr = this.sr; this.bore.setLen(sr / f * 2 + 3); this.bore.stir(0.02);
    const w = 2 * Math.PI * f / sr, r = 0.997; this.a1 = -2 * r * Math.cos(w); this.a2 = r * r; this.y1 = this.y2 = 0; this.g = 0.03;
    this.peak = peak; this.release = Math.floor(sr * dur); this.t = 0; this.on = true;
  }
  tick() {
    if (!this.on) return 0;
    const mouth = this.breath.tick(this.t < this.release ? (this.p.pressure || 0.9) : 0, this.t < this.release ? 0.004 : 0.002) * 0.3;
    const bore = this.bore.read();
    let dp = mouth - bore; const y = this.g * dp - this.a1 * this.y1 - this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; dp = y * y; if (dp > 1) dp = 1;
    const out = dp * mouth + (1 - dp) * bore; this.bore.write(this.dc.tick(out) * 0.995);
    this.t++; if (this.t > this.release + this.sr * 0.4) this.on = false;
    return out * 0.8 * this.peak * 2;
  }
}
const WINDS = { flute: Flute, reed: Reed, brass: Brass };

class PM extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const o = opts.processorOptions || {};
    this.model = o.model; this.p = o.params || {}; this.voices = []; this.queue = (o.events || []).slice().sort((a, b) => a.t - b.t); this.alive = true;
    this.port.onmessage = (e) => { if (e.data === "stop") this.alive = false; else this.queue.push(e.data); };
  }
  voiceFor(ev) {
    if (this.model === "bowed") { // one bow per chord voice: contiguous notes glide (legato)
      const k = Math.min(3, ev.idx || 0); let v = this.voices[k]; if (!v) this.voices[k] = v = new Bowed(sampleRate, this.p);
      const legato = v.on && v.t >= v.release - sampleRate * 0.03 && v.t <= v.release + sampleRate * 0.06;
      v.start(ev.f, ev.peak, ev.dur, ev.tech === "spiccato" ? false : legato || (v.on && ev.legato), ev.tech); return;
    }
    if (WINDS[this.model]) { // one voice per chord note; a held line re-tongues each note
      const k = Math.min(3, ev.idx || 0); let v = this.voices[k]; if (!v) this.voices[k] = v = new WINDS[this.model](sampleRate, this.p);
      v.start(ev.tech === "overblow" ? ev.f * 2 : ev.f, ev.peak, ev.dur); return;
    }
    let v = this.voices.find((x) => x && !x.on); if (!v) { if (this.voices.length < 8) this.voices.push(v = new Pluck(sampleRate, this.p)); else v = this.voices[0]; }
    v.start(ev.f, ev.peak, ev.dur, ev.tech, ev.bend);
  }
  process(_, outputs) {
    const out = outputs[0][0], n = out.length;
    for (let i = 0; i < n; i++) {
      const now = (currentFrame + i) / sampleRate;
      while (this.queue.length && this.queue[0].t <= now) this.voiceFor(this.queue.shift());
      let s = 0; for (const v of this.voices) if (v && v.on) s += v.tick();
      out[i] = Math.tanh(s * 1.2) * 0.85;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    if (this.queue.length > 1) this.queue.sort((a, b) => a.t - b.t);
    return this.alive;
  }
}
registerProcessor("pm", PM);
