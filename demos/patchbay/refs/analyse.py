# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "soundfile", "scipy"]
# ///
"""Measure a reference recording so a piece can be rebuilt from it (and our render compared with it).

  uv run refs/analyse.py <file.wav> [--tonic D] [--json out.json]

Prints, and optionally saves as JSON:
  tempo and pulse clarity, the meter, a groove (16 steps a bar, low/mid/high bands),
  the tonic and the scale actually used (in cents, so microtones show), the melody as notes,
  ornament (vibrato, glides), timbre (brightness, noisiness, attack, decay, band profile),
  dynamics over the piece, and the space (noise floor, an estimate of the reverb time).
These are rough measurements, not a transcription: read them next to the recording.
"""
import argparse, json, sys
import numpy as np, librosa, scipy.signal as sg

NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
ap = argparse.ArgumentParser()
ap.add_argument("wav"); ap.add_argument("--tonic"); ap.add_argument("--json"); ap.add_argument("--notes", type=int, default=64)
a = ap.parse_args()
y, sr = librosa.load(a.wav, sr=22050, mono=True)
hop = 512
out = {"file": a.wav, "seconds": round(len(y) / sr, 1)}

# ── dynamics ──
rms = librosa.feature.rms(y=y, hop_length=hop)[0]; db = 20 * np.log10(rms + 1e-9)
seg = np.array_split(db, 8)
out["dynamics"] = {"range_db": round(float(np.percentile(db, 95) - np.percentile(db, 10)), 1),
                   "arc_db": [round(float(np.percentile(s, 80) - np.percentile(db, 95)), 1) for s in seg]}

# ── rhythm ──
yh, yp = librosa.effects.hpss(y)
onv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beats = librosa.beat.beat_track(onset_envelope=onv, sr=sr, hop_length=hop)
tempo = float(np.atleast_1d(tempo)[0])
ac = librosa.autocorrelate(onv - onv.mean(), max_size=len(onv) // 2); ac /= ac[0] + 1e-9
bp = 60 / tempo * sr / hop  # frames a beat
def acat(k): i = int(round(k * bp)); return float(ac[i]) if i < len(ac) else 0.0
clarity = acat(1)
meter = max((2, 3, 4), key=lambda m: acat(m) + (0.02 if m == 4 else 0))
onsets = librosa.onset.onset_detect(onset_envelope=onv, sr=sr, hop_length=hop)
out["rhythm"] = {"tempo": round(tempo, 1), "pulse_clarity": round(clarity, 2), "meter_beats": meter,
                 "onsets_per_sec": round(len(onsets) / out["seconds"], 2),
                 "note": "pulse_clarity < 0.2: free rhythm (no steady beat)"}

# groove: percussive onset strength in three bands at 4 steps a beat, folded over bars
S = np.abs(librosa.stft(yp, hop_length=hop)); fr = librosa.fft_frequencies(sr=sr)
bands = {"low": fr < 200, "mid": (fr >= 200) & (fr < 2000), "high": fr >= 2000}
if len(beats) > 8 and clarity >= 0.15:
    lanes = {}
    steps = meter * 4
    for name, m in bands.items():
        env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[m]), sr=sr, hop_length=hop)
        grid = np.zeros(steps); n = 0
        for b in range(0, len(beats) - meter, meter):
            for k in range(meter):
                t0, t1 = beats[b + k], beats[b + k + 1]
                for s in range(4):
                    f = int(round(t0 + (t1 - t0) * s / 4))
                    if f < len(env): grid[k * 4 + s] += env[max(0, f - 1):f + 2].max()
            n += 1
        grid /= max(grid.max(), 1e-9)
        lanes[name] = "".join("X" if v > 0.8 else "x" if v > 0.5 else "." for v in grid)
    out["groove"] = {**lanes, "note": "bars of %d beats, 4 steps a beat; X strong, x medium" % meter}

# ── pitch ──
f0, vflag, vprob = librosa.pyin(yh, fmin=65, fmax=1400, sr=sr, hop_length=hop, frame_length=2048)
ok = vflag & (vprob > 0.3)
cents = 1200 * np.log2(f0[ok] / 440.0) + 5700  # cents above C0 … C4 = 4800
out["pitch"] = {"voiced_fraction": round(float(ok.mean()), 2)}
if ok.sum() > 50:
    pc = np.mod(cents, 1200)
    h, _ = np.histogram(pc, bins=120, range=(0, 1200)); h = np.convolve(np.r_[h[-3:], h, h[:3]], np.ones(5) / 5, "same")[3:-3]
    # the tonic: where the music comes to rest. Long notes before a silence (phrase ends), most of all the last one.
    vt = np.where(ok)[0]; gaps = np.diff(vt) > int(0.25 * sr / hop)
    ends = [vt[i] for i in np.where(gaps)[0]] + [vt[-1]]
    endpc = np.zeros(120)
    for j, e in enumerate(ends):
        w = c_end = np.nanmedian(1200 * np.log2(f0[max(0, e - 8):e + 1][ok[max(0, e - 8):e + 1]] / 440.0) + 5700) if ok[max(0, e - 8):e + 1].any() else np.nan
        if not np.isnan(c_end): endpc[int(np.mod(c_end, 1200) // 10) % 120] += 3 if j == len(ends) - 1 else 1
    endpc = np.convolve(np.r_[endpc[-3:], endpc, endpc[:3]], np.ones(5), "same")[3:-3]
    most_used = int(np.argmax(h)) * 10
    if a.tonic:
        tonic = NAMES.index(a.tonic) * 100
    else:
        score = endpc / max(endpc.max(), 1e-9) + 0.15 * h / max(h.max(), 1e-9)
        tonic = int(np.argmax(score)) * 10
        near = [(tonic // 10 + d) % 120 for d in range(-4, 5)]  # settle on the pitch actually sung or played there
        tonic = max(near, key=lambda i: h[i]) * 10
    out["pitch"]["most_used"] = NAMES[int(round(most_used / 100)) % 12]
    out["pitch"]["phrase_final"] = NAMES[int(round(int(np.argmax(endpc)) * 10 / 100)) % 12]
    rel = np.mod(pc - tonic + 25, 1200) - 25
    hr, edges = np.histogram(np.mod(pc - tonic, 1200), bins=120, range=(0, 1200))
    hr = np.convolve(np.r_[hr[-2:], hr, hr[:2]], [1, 2, 3, 2, 1], "same")[2:-2]
    peaks, pr = sg.find_peaks(np.r_[hr[-10:], hr, hr[:10]], height=hr.max() * 0.06, distance=6)  # (wrapped: the tonic sits at the edge)
    peaks = sorted({(p - 10) % 120 for p in peaks})
    steps = sorted({int(p * 10) % 1200 for p in peaks})
    weights = {int(p * 10): round(float(hr[p] / hr.max()), 2) for p in peaks}
    ref_c = np.median(cents)
    out["pitch"].update({"tonic": NAMES[int(round(tonic / 100)) % 12], "tonic_cents_off": int(tonic - round(tonic / 100) * 100),
                         "range": [NAMES[int(np.percentile(cents, 3) // 100) % 12] + str(int(np.percentile(cents, 3) // 1200)),
                                   NAMES[int(np.percentile(cents, 97) // 100) % 12] + str(int(np.percentile(cents, 97) // 1200))],
                         "scale_cents": steps, "scale_weight": weights,
                         "note": "scale_cents: steps above the tonic as used (12-TET = multiples of 100)"})
    # notes: steady stretches of the pitch track
    t = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop)
    c_all = np.where(ok, 1200 * np.log2(np.nan_to_num(f0, nan=1) / 440.0) + 5700, np.nan)
    c_med = sg.medfilt(np.nan_to_num(c_all, nan=0), 5); c_med[~ok] = np.nan
    notes, start = [], None
    for i in range(len(c_med) + 1):
        v = c_med[i] if i < len(c_med) else np.nan
        if start is not None and (np.isnan(v) or abs(v - np.nanmedian(c_med[start:i])) > 70):
            if t[i - 1] - t[start] >= 0.07:
                seg_c = c_med[start:i]; notes.append((t[start], t[i - 1] - t[start], float(np.nanmedian(seg_c)), float(np.nanstd(seg_c)), float(seg_c[-1] - seg_c[0])))
            start = None
        if start is None and not np.isnan(v): start = i
    beat_s = 60 / tempo
    def degree(c):  # nearest used scale step → 简谱-like label with octave marks, relative to the tonic octave nearest the median
        base = tonic + 1200 * np.floor((ref_c - tonic) / 1200)
        d = c - base; o = int(np.floor((d + 25) / 1200)); r = d - o * 1200
        st = min(steps or [0], key=lambda s: min(abs(r - s), abs(r - s - 1200)))
        if abs(r - st - 1200) < abs(r - st): o += 1
        return f"{st}" + ("'" * o if o > 0 else "," * -o)
    out["melody"] = {"notes": [{"t": round(n[0], 2), "beats": round(n[1] / beat_s, 2), "step": degree(n[2]),
                                "pitch": NAMES[int(round(n[2] / 100)) % 12] + str(int(round(n[2] / 100)) // 12)} for n in notes[:a.notes]],
                     "note_count": len(notes),
                     "vibrato_cents": round(float(np.median([n[3] for n in notes])), 1) if notes else None,
                     "glide_fraction": round(float(np.mean([abs(n[4]) > 60 for n in notes])), 2) if notes else None,
                     "note": "step = cents above the tonic (a scale_cents value); ' and , = octave up and down"}

# ── timbre ──
cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop)[0]
flat = librosa.feature.spectral_flatness(y=y, hop_length=hop)[0]
loud = db > np.percentile(db, 50)
Sf = np.abs(librosa.stft(y, hop_length=hop)) ** 2
edges = [0, 125, 250, 500, 1000, 2000, 4000, 8000, 11025]
prof = [float(Sf[(fr >= lo) & (fr < hi)][:, loud].sum()) for lo, hi in zip(edges, edges[1:])]
prof = 10 * np.log10(np.array(prof) / max(prof) + 1e-12)
# attack and decay around onsets
atk, dec = [], []
for o in onsets:
    w = rms[max(0, o - 4):o + 40]
    if len(w) < 20: continue
    pk = int(np.argmax(w[:12])); lo = w[0]; hi = w[pk]
    if hi < 2 * lo + 1e-6: continue
    i10 = np.argmax(w[:pk + 1] >= lo + 0.1 * (hi - lo)); i90 = np.argmax(w[:pk + 1] >= lo + 0.9 * (hi - lo))
    atk.append((i90 - i10) * hop / sr)
    tail = 20 * np.log10(w[pk:] / hi + 1e-9); below = np.where(tail < -12)[0]
    if len(below): dec.append(below[0] * hop / sr)
out["timbre"] = {"brightness_hz": int(np.median(cent[loud])), "noisiness": round(float(np.median(flat[loud])), 3),
                 "harmonic_share": round(float((yh ** 2).sum() / ((y ** 2).sum() + 1e-12)), 2),
                 "attack_ms": int(1000 * np.median(atk)) if atk else None, "decay12db_ms": int(1000 * np.median(dec)) if dec else None,
                 "bands_db": {f"{lo}-{hi}": round(float(v), 1) for lo, hi, v in zip(edges, edges[1:], prof)}}

# ── space ──
floor = float(np.percentile(db, 5)); top = float(np.percentile(db, 95))
# decay after the loudest moments that are followed by a drop: a rough reverb time
slopes = []
for p in sg.find_peaks(db, prominence=10, distance=20)[0]:
    tail = db[p:p + int(1.5 * sr / hop)]
    if len(tail) < 10: continue
    k = np.arange(len(tail)) * hop / sr; m = tail > tail[0] - 30
    if m.sum() > 6:
        s = np.polyfit(k[m], tail[m], 1)[0]
        if s < -5: slopes.append(-60 / s)
out["space"] = {"noise_floor_db": round(floor - top, 1), "rt60_estimate_s": round(float(np.median(slopes)), 2) if slopes else None,
                "note": "noise floor relative to the loud parts; rt60 from decays after strong peaks (rough; tape hiss and crowds raise the floor)"}

txt = json.dumps(out, ensure_ascii=False, indent=1)
if a.json: open(a.json, "w").write(txt)
r = out["rhythm"]; p = out["pitch"]; tm = out["timbre"]
print(f"{out['seconds']}s · tempo {r['tempo']} (clarity {r['pulse_clarity']}) · meter {r['meter_beats']} · {r['onsets_per_sec']} onsets/s")
if "groove" in out: print("groove  low  " + out["groove"]["low"] + "\n        mid  " + out["groove"]["mid"] + "\n        high " + out["groove"]["high"])
if "tonic" in p: print(f"tonic {p['tonic']} ({p['tonic_cents_off']:+d}c; phrases end on {p['phrase_final']}, most used {p['most_used']}) · range {p['range'][0]}–{p['range'][1]} · scale {p['scale_cents']}")
if "melody" in out:
    m = out["melody"]; print(f"melody: {m['note_count']} notes · vibrato {m['vibrato_cents']}c · glides {m['glide_fraction']}")
    print("  " + " ".join(f"{n['step']}/{n['beats']}" for n in m["notes"][:48]))
print(f"timbre: brightness {tm['brightness_hz']} Hz · noisiness {tm['noisiness']} · harmonic {tm['harmonic_share']} · attack {tm['attack_ms']} ms · decay {tm['decay12db_ms']} ms")
print("  bands " + " ".join(f"{k}:{v}" for k, v in tm["bands_db"].items()))
print(f"dynamics: range {out['dynamics']['range_db']} dB · arc {out['dynamics']['arc_db']}")
print(f"space: floor {out['space']['noise_floor_db']} dB · rt60≈{out['space']['rt60_estimate_s']} s")
