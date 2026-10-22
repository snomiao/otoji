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
// delay loop; each pass loses a little of its highs. A body adds formants;
// buzz (jawari / a sitar's flat bridge) clips the string against the bridge.
class Pluck {
  constructor(sr, p) {
    this.sr = sr; this.p = p; this.d = new Delay(Math.ceil(sr / 20) + 4); this.lp = new OnePole(0.5);
    this.body = (p.body || [[180, 2], [420, 3]]).map(([f, q]) => new Reso(f, q, sr)); this.on = false;
  }
  start(f, peak, dur) {
    const sr = this.sr, p = this.p, n = sr / f;
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
    let y = this.d.read();
    if (this.p.buzz) { const th = 0.12; if (y > th) y = th + (y - th) * 0.3; else if (y < -th) y = -th + (y + th) * 0.3; }
    let fb = this.lp.tick(y) * this.g;
    if (this.t > this.stopAt && this.p.mute) fb *= 0.995; // damped by the hand after the note
    this.d.write(fb); this.t++;
    let o = y; for (const b of this.body) o += b.tick(y) * (this.p.bodyMix || 0.6);
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
  start(f, peak, dur, legato) {
    this.target = f; if (!legato || !this.on) { this.f = f; this.freq(f); this.vib = 0; this.vibOn = 0; }
    this.peak = peak; this.velTarget = this.p.pressure || 0.25; this.on = true; this.release = Math.floor(this.sr * dur); this.t = 0;
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
    const s = this.bridge.read(); let o = s * 0.2; for (const b of this.body) o += b.tick(s);
    this.t++; if (this.t > this.release && this.vel < 0.0005) this.on = false;
    return o * this.peak * 0.6;
  }
}

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
      v.start(ev.f, ev.peak, ev.dur, legato || (v.on && ev.legato)); return;
    }
    let v = this.voices.find((x) => x && !x.on); if (!v) { if (this.voices.length < 8) this.voices.push(v = new Pluck(sampleRate, this.p)); else v = this.voices[0]; }
    v.start(ev.f, ev.peak, ev.dur);
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
