# Run: python3 world.py out.js — prints the EXAMPLES entries for the five-section world-music demos
# Generates the world-music arrangements with checked phrase lengths.
import json, sys
SEC = None  # (sig, {section index: bars})

def song(bpm, sig, sections):
    global SEC
    SEC = (sig, {i + 1: b for i, (n, b) in enumerate(sections)})
    secs = " ".join(f"{n}:{b}bars" for n, b in sections)
    return [f".            clock   {bpm} {sig}/4", f".            song=arrange {secs}"]

def tpb(grid):  # tokens per bar
    sig = SEC[0]; return sig * grid // 4

def ph(grid, *bars, pad=None):
    toks = " ".join(bars).split()
    t = tpb(grid)
    if pad:
        while len(toks) % (pad * t): toks.append("-")
    assert len(toks) % t == 0, f"phrase not whole bars ({len(toks)} tokens, {t}/bar): {' '.join(toks)}"
    return " ".join(toks), len(toks) // t

def line(name_kind, opts, grid, phrase_bars, gate, extra=""):
    phrase, bars = phrase_bars
    lo, hi = (int(x) for x in (gate.split("-") + [gate])[:2]) if "-" in gate else (int(gate), int(gate))
    for s in range(lo, hi + 1):
        assert SEC[1][s] % bars == 0, f"{name_kind}: {bars}-bar phrase doesn't divide §{s} ({SEC[1][s]} bars)"
    g = "" if grid == 8 else f" grid={grid}"
    return f".            {name_kind:<13} {opts}{g} phrase=\"{phrase}\"{extra} ?song.{gate}"

def drums(name, kit, lanes, gate):
    steps = SEC[0] * 4
    for l in lanes.split("|"):
        assert len(l) % steps == 0 or steps % len(l) == 0, f"{name}: lane length {len(l)} vs bar {steps}"
    k = "" if kit == "rock" else f"kit={kit} "
    return f".            {name:<13} {k}\"{lanes}\" ?song.{gate}"

def other(text): return f".            {text}"

def tail(reverb="2.5s wet=0.3"):
    return ["", f"*>           reverb  {reverb}", ">            speaker 0.5"]

EX = {}
def add(key, comment, head, body, rv="2.5s wet=0.3"):
    EX[key] = "\n".join(comment + head + [""] + body + tail(rv)) + "\n"

up_down7 = "1 2 3 4 5 6 7 1' 1' 7 6 5 4 3 2 1"
up_down5 = "1 2 3 5 6 1' 2' 3' 3' 2' 1' 6 5 3 2 1"
up_down_minor5 = "1 3 4 5 7 1' 3' 4' 4' 3' 1' 7 5 4 3 1"

# ── 日式 ──
h = song(84, 4, [("scale", 4), ("sakura", 8), ("sakura2", 8), ("matsuri", 8), ("rain", 8)])
add("japan", ["# 日式 · §1 the In (都節) scale · §2 さくらさくら on koto · §3 + shakuhachi and taiko",
              "# §4 matsuri: fast koto, shakuhachi up high, full taiko · §5 rain and a temple bell · then it loops"], h, [
  line("ladder=pluck", "in E", 8, ph(8, "1 2 4 5 6 1' 2' 4' 4' 2' 1' 6 5 4 2 1"), "1"),
  line("koto=pluck", "in E", 8, ph(8, "4 - 4 - 5 - - -", "4 - 4 - 5 - - -", "4 - 5 - 6 - 5 -", "4 - 5 4 2 - - -",
       "1 - 6, - 1 - 2 -", "1 - 1 6, 5, - - -", "4 - 5 - 6 - 5 -", "4 - 5 4 2 - - -"), "2-3"),
  line("shaku=flute", "in E oct=5", 8, ph(8, "1' - - - - - - -", "6 - - - - - - -", "5 - - - 4 - 2 -", "1 - - - - - - -"), "3"),
  drums("taiko=drums", "taiko", "x.......x.......|....x.......x...|x...x...x...x...", "3"),
  line("fast=pluck", "in E", 16, ph(16, "1' 6 5 4 5 6 1' 2' 4' 2' 1' 6 5 6 5 4", "2 4 5 6 5 4 2 1 2 1 6, 5, 6, 1 2 4"), "4"),
  line("high=flute", "in E oct=6", 8, ph(8, "4 - - 5 4 2 1 -", "6, - - - - - - -"), "4"),
  drums("matsuri=drums", "taiko", "x..xx..xx.x.x..x|..x...x...x..x.x|xxxxxxxxxxxxxxxx", "4"),
  line("bell", "in E oct=3", 4, ph(4, "1 - - -", "- - - -", "5, - - -", "- - - -"), "5"),
  line("drip=pluck", "in E", 8, ph(8, "0 0 0 0 6 - - -", "0 0 0 0 0 0 0 0", "0 0 5 - - - 0 0", "0 0 0 0 0 0 0 0"), "5"),
  other("rain         0.5 ?song.5"),
])

# ── 清 · 茉莉花 / 京剧 ──
h = song(76, 4, [("scale", 4), ("molihua", 8), ("molihua2", 8), ("jijifeng", 8), ("rain", 8)])
molihua = ph(8, "3 - 3 5 6 1' 1' 6", "5 - 5 6 5 - - -", "3 - 3 5 6 1' 1' 6", "5 - 5 6 5 - - -",
             "5 - 5 - 5 3 5 6", "6 - 5 - - - - -", "3 - 2 3 5 3 2 1", "1 2 1 - - - - -")
add("qing", ["# 清 · §1 the 宫 pentatonic · §2 茉莉花 on 二胡 · §3 + 笛子 an octave up, 月琴, light 锣鼓",
             "# §4 京剧 急急风: fast 京胡 and full 锣鼓 · §5 rain, a slow 二胡 line · then it loops"], h, [
  line("ladder=pluck", "gong A", 8, ph(8, up_down5), "1"),
  line("erhu=strings", "gong A", 8, molihua, "2-3"),
  line("dizi=flute", "gong A oct=5", 8, molihua, "3"),
  line("yueqin=pluck", "gong A", 8, ph(8, "6 - 3 - 5 - 2 -"), "2-3"),
  drums("luogu=drums", "opera", "x...x...x...x...|x...............|........x.......", "3"),
  line("jinghu=strings", "gong A oct=5", 16, ph(16, "6 5 6 1' 6 5 3 5 6 5 3 2 3 5 6 1'", "2' 1' 6 5 3 2 3 5 6 - 5 - 3 - 2 -"), "4"),
  drums("jijifeng=drums", "opera", "xxxxxxxxxxxxxxxx|x...x...x...x...|....x.......x...", "4"),
  line("slow=strings", "gong A", 4, ph(4, "3 - 2 -", "1 - - -", "6, - - -", "5, - - -"), "5"),
  other("rain         0.5 ?song.5"),
])

# ── 唐 ──
h = song(66, 4, [("scale", 4), ("court", 8), ("court2", 8), ("ambush", 8), ("rain", 8)])
add("tang", ["# 唐 · §1 the 燕乐 scale · §2 a court melody on 琵琶 over 古琴 · §3 + 编钟 and 箫",
             "# §4 in the style of 十面埋伏: fast 琵琶 tremolo and war drums · §5 rain, 古琴 harmonics · then it loops"], h, [
  line("ladder=pluck", "yanyue D", 8, ph(8, up_down7), "1"),
  line("pipa=pluck", "yanyue D", 8, ph(8, "5 - 6 1' 2' - 1' 6", "5 - - - 3 5 6 5", "3 2 1 2 3 - 5 -", "6 5 3 2 1 - - -",
       "1 2 3 5 6 - 5 3", "2 - 3 5 2 1 6, -", "5, 6, 1 2 3 2 1 6,", "1 - - - - - - -"), "2-3"),
  line("guqin=pluck", "yanyue D oct=3", 4, ph(4, "1 - 5, -", "1 - 5, -"), "2-3", " adsr=5ms,1.5s,0,800ms"),
  line("bianzhong=bell", "yanyue D", 4, ph(4, "1 - - -", "5 - - -", "6 - - -", "5 - - -"), "3"),
  line("xiao=flute", "yanyue D oct=5", 8, ph(8, "5 - - - 3 - 2 -", "1 - - - - - - -"), "3"),
  line("ambush=pluck", "yanyue D", 16, ph(16, "5 5 5 5 6 6 6 6 1' 1' 1' 1' 2' 2' 1' 6", "5 5 5 5 3 3 3 3 2 2 2 2 1 2 3 5"), "4"),
  drums("war=drums", "taiko", "x.x.x.x.xxxxx.x.|....x..x....x..x|x.x.x.x.x.x.x.x.", "4"),
  line("drone=strings", "yanyue D oct=2", 8, ph(8, "1 - - - - - - -"), "4"),
  line("harmonic=bell", "yanyue D oct=5", 8, ph(8, "0 0 0 0 5 - - -", "0 0 0 0 0 0 0 0", "0 0 0 0 3 - - -", "0 0 0 0 0 0 0 0"), "5"),
  other("rain         0.5 ?song.5"),
], "3s wet=0.35")

# ── Egyptian maqam Hijaz ──
h = song(100, 4, [("scale", 4), ("tune", 8), ("tune2", 8), ("climax", 8), ("night", 8)])
add("egypt", ["# Egyptian maqam Hijaz on D · §1 the maqam · §2 an oud melody with darbuka maqsum · §3 + ney and strings",
              "# §4 a fast taqsim run, saidi drums, strings up high · §5 a Nile night: slow ney over the drone · then it loops"], h, [
  other("drone=strings \"D\" drone oct=2 vol=0.5 ?song.1-5"),
  line("ladder=pluck", "hijaz D", 8, ph(8, up_down7), "1"),
  line("oud=pluck", "hijaz D", 8, ph(8, "5 - 6 5 4 3 2 3", "4 - - - 3 2 1 -", "1 2 3 4 5 - 4 3", "2 - 3 - 2 1 1 -",
       "5 6 7 1' 7 6 5 4", "3 - 4 5 4 3 2 -", "3 2 1 2 3 4 3 2", "1 - - - - - - -"), "2-3"),
  drums("darbuka=drums", "darbuka", "x.......x.......|..x...x.....x...|..........x...x.", "2-3"),
  line("ney=flute", "hijaz D oct=5", 8, ph(8, "1' - - - 7 - 6 -", "5 - - - - - - -", "4 - 5 - 6 - 5 -", "4 - 3 - 2 - 1 -"), "3"),
  line("taqsim=pluck", "hijaz D", 16, ph(16, "1 2 3 4 5 6 7 1' 2' 1' 7 6 5 6 7 1'", "7 6 5 4 3 4 5 6 5 4 3 2 1 2 3 1"), "4"),
  drums("saidi=drums", "darbuka", "x..x..x.x..x..x.|...x.x...x.x.x.x|x.xxx.xxx.xxx.xx", "4"),
  line("violins=strings", "hijaz D oct=5", 8, ph(8, "5 - - - 3 - - -", "2 - 1 - 7, - - -"), "4"),
  line("night=flute", "hijaz D oct=5", 4, ph(4, "5 - - -", "3 - 2 -", "1 - - -", "- - - -"), "5"),
])

# ── 哥特 Gothic ──
h = song(60, 4, [("scale", 4), ("diesirae", 8), ("diesirae2", 8), ("toccata", 8), ("rain", 8)])
dies = ph(4, "3 2 3 1", "2 7, 1 1", "3 3 4 3", "2 1 7, 2", "3 2 1 -", "1 - - -", "3 2 3 1", "2 7, 1 -")
add("gothic", ["# 哥特 Gothic in D Dorian · §1 the mode on the organ · §2 the Dies Irae chant · §3 + organ chords and a bell",
               "# §4 toccata: organ runs, full choir, bells and timpani · §5 rain, a choir hum and a distant bell · then it loops"], h, [
  line("ladder=organ", "dorian D", 8, ph(8, up_down7), "1"),
  line("chant=choir", "dorian D", 4, dies, "2-3"),
  other("organ        \"Dm C Dm Am Dm F C Dm\" block oct=3 ?song.3-4"),
  line("bell", "dorian D oct=3", 4, ph(4, "1 - - -", "- - - -"), "3-4"),
  line("toccata=organ", "dorian D oct=4", 16, ph(16, "5' 4' 5' 3' 4' 2' 3' 1' 2' 7 1' 6 7 5 6 4", "5 3 4 2 3 1 2 7, 1 3 5 1' 3' 5' 1'' 5'"), "4"),
  line("fullchoir=choir", "dorian D oct=4", 4, dies, "4"),
  drums("timpani=drums", "taiko", "x...x...x...x.x.|................|................", "4"),
  line("hum=choir", "dorian D oct=3", 4, ph(4, "1 - - -", "- - - -", "7, - - -", "- - - -"), "5"),
  line("distant=bell", "dorian D oct=2", 4, ph(4, "1 - - -", "- - - -", "- - - -", "- - - -"), "5"),
  other("rain         0.6 ?song.5"),
], "5s wet=0.5")

# ── 现代华语 ──
h = song(76, 4, [("scale", 4), ("verse", 8), ("verse2", 8), ("chorus", 8), ("rain", 8)])
tune = ph(8, "3 5 6 1' 6 5 3 2", "1 - 2 3 2 - - -", "3 5 6 1' 2' 1' 6 5", "6 - 5 3 5 - - -",
          "6 1' 6 5 3 2 3 5", "2 - 1 2 3 - - -", "5 3 2 1 6, 1 2 3", "1 - - - - - - -")
add("cpop", ["# 现代华语 (中国风) · §1 the 宫 pentatonic · §2 piano on the 4536251 progression, guzheng melody",
             "# §3 + drums, bass, dizi · §4 chorus: strings up an octave, busier drums, choir pad · §5 rain and a lone piano · then it loops"], h, [
  line("ladder=piano", "gong C", 8, ph(8, up_down5), "1"),
  other("piano        \"F G Em Am Dm G C C\" arp ?song.2-4"),
  line("guzheng=pluck", "gong C oct=5", 8, tune, "2-3"),
  drums("drums", "rock", "x.....x...x.....|....x.......x...|x.x.x.x.x.x.x.x.", "3"),
  other("bass         \"F G Em Am Dm G C C\" ?song.3-4"),
  line("dizi=flute", "gong C oct=5", 8, ph(8, "0 0 0 0 0 0 0 0", "5 6 1' 6 5 - - -"), "3"),
  line("violins=strings", "gong C oct=5", 8, tune, "4"),
  drums("chorus=drums", "rock", "x.....x...x.x...|....x.......x...|xxxxxxxxxxxxxxxx", "4"),
  other("pad=choir    \"F G Em Am Dm G C C\" block ?song.4"),
  line("lone=piano", "gong C oct=5", 8, ph(8, "0 0 0 0 0 0 0 0", "1' - - - 6 - - -", "5 - - - 3 - - -", "2 - - - 1 - - -"), "5"),
  other("rain         0.5 ?song.5"),
], "2s wet=0.25")

# ── 提琴: Pachelbel's Canon ──
h = song(66, 4, [("scale", 4), ("canon", 8), ("canon2", 8), ("variation", 8), ("rain", 8)])
add("strings", ["# 提琴 · §1 the D major scale · §2 Pachelbel's Canon: cello ground bass and violin · §3 + a second violin in canon",
                "# §4 the fast 16th-note variation with choir · §5 rain and a solo cello · then it loops"], h, [
  line("ladder=strings", "major D oct=4", 8, ph(8, up_down7), "1"),
  line("cello=strings", "major D oct=2", 4, ph(4, "1 - 5, -", "6, - 3, -", "4, - 1 -", "4, - 5, -"), "2-4"),
  line("violin=strings", "major D oct=5", 4, ph(4, "3 - 2 -", "1 - 7, -", "6, - 5, -", "6, - 7, -"), "2-3"),
  line("violin2=strings", "major D oct=5", 4, ph(4, "6, - 5, -", "6, - 7, -", "3 - 2 -", "1 - 7, -"), "3"),
  line("variation=strings", "major D oct=5", 16, ph(16, "3 1 2 3 1 2 3 3, 4, 5, 6, 7, 1 2 1 7,", "1 6, 7, 1 1, 2, 3, 4, 3, 2, 3, 1 7, 1 6, 7,",
       "1 7, 6, 7, 5, 6, 7, 1 2 3 4 5 4 3 2 1", "7, 6, 5, 6, 7, 1 2 3 2 1 7, 6, 5, 4, 3, 2,"), "4"),
  other("pad=choir    \"D A Bm F#m G D G A\" block ?song.4"),
  line("solo=strings", "major D oct=3", 4, ph(4, "1 - - -", "6, - - -", "4, - - -", "5, - - -"), "5"),
  other("rain         0.5 ?song.5"),
], "3s wet=0.35")

# ── Aztec / Maya ──
h = song(96, 4, [("scale", 4), ("ritual", 8), ("ritual2", 8), ("frenzy", 8), ("rain", 8)])
add("aztec", ["# Aztec / Maya (Mesoamerica) · §1 a minor pentatonic on clay flute · §2 huehuetl, teponaztli and a flute call",
              "# §3 + a second flute and a slit-drum melody · §4 frenzy: shrieking flutes, fast drums · §5 jungle rain at night · then it loops"], h, [
  line("ladder=flute", "minorpenta A oct=5", 8, ph(8, up_down_minor5), "1"),
  drums("drums", "aztec", "x.......x.......|..x...x...x...x.|x.x.x.x.x.x.x.x.", "2-3"),
  line("call=flute", "minorpenta A oct=5", 8, ph(8, "5 - 3 - 1 - - -", "3 4 5 - 4 3 1 -"), "2-3"),
  line("slit=marimba", "minorpenta A oct=3", 8, ph(8, "1 - 5, - 1 - 3 -"), "3"),
  line("answer=flute", "minorpenta A oct=6", 8, ph(8, "0 0 0 0 0 0 0 0", "5 - 4 3 1 - - -"), "3"),
  line("shriek=flute", "minorpenta A oct=6", 16, ph(16, "1' 7 5 4 5 7 1' 3' 1' 7 5 4 3 1 3 4"), "4"),
  line("bars=marimba", "minorpenta A oct=4", 16, ph(16, "1 3 4 5 4 3 1 3 5 7 5 4 3 1 7, 1"), "4"),
  drums("frenzy=drums", "aztec", "x.x.x.xxx.x.x.xx|..x..x..x..x..xx|xxxxxxxxxxxxxxxx", "4"),
  line("night=flute", "minorpenta A oct=5", 4, ph(4, "5 - - -", "4 - 3 -", "1 - - -", "- - - -"), "5"),
  other("rain         0.6 ?song.5"),
])

# ── Andean ──
h = song(92, 4, [("scale", 4), ("huayno", 8), ("huayno2", 8), ("fiesta", 8), ("rain", 8)])
quena = ph(8, "5 - 4 3 1 - 3 4", "5 - 7 5 4 - - -", "5 - 4 3 1 3 4 3", "1 - - - - - - -")
add("andes", ["# Andean (Inca highlands) · §1 a minor pentatonic on quena · §2 a huayno: charango and quena",
              "# §3 + zampoña echo and bombo · §4 fiesta: fast charango, quena up high · §5 rain in the mountains · then it loops"], h, [
  line("ladder=flute", "minorpenta E oct=5", 8, ph(8, up_down_minor5), "1"),
  other("charango=pluck \"Em G D Em\" arp oct=4 ?song.2-3"),
  line("quena=flute", "minorpenta E oct=5", 8, quena, "2-3"),
  line("zampona=flute", "minorpenta E oct=4", 8, ph(8, "0 0 0 0 5 - 4 3", "0 0 0 0 1 - - -"), "3"),
  drums("bombo=drums", "aztec", "x..x..x.x..x..x.|................|....x.......x...", "3-4"),
  line("strum=pluck", "minorpenta E", 16, ph(16, "1 3 5 1 3 5 1 3 4 5 4 3 1 3 1 7,"), "4"),
  line("high=flute", "minorpenta E oct=6", 8, quena, "4"),
  line("slow=flute", "minorpenta E oct=5", 4, ph(4, "5 - - -", "3 - 1 -", "7, - - -", "- - - -"), "5"),
  other("rain         0.6 ?song.5"),
])

# ── West African (12-step bars) ──
h = song(110, 3, [("scale", 4), ("kora", 8), ("village", 8), ("dance", 8), ("rain", 8)])
add("africa", ["# West African, in 12-step bars (12/8 feel) · §1 a pentatonic on kora · §2 kora ostinato, balafon and the bell pattern",
               "# §3 + djembe and dundun · §4 dance: a djembe solo, fast kora and balafon · §5 rain on the village · then it loops"], h, [
  line("ladder=pluck", "penta F", 8, ph(8, up_down5, pad=4), "1"),
  line("kora=pluck", "penta F", 16, ph(16, "1 5, 1 3 5 3 1 5, 6, 1 3 2"), "2-3"),
  line("balafon=marimba", "penta F oct=4", 16, ph(16, "5 - 3 - 2 - 1 - 2 - 3 -", "5 - 6 - 5 - 3 - 2 - 1 -"), "2-3"),
  drums("bell=drums", "african", "............|............|x.x.xx.x.x.x", "2-4"),
  drums("drums", "african", "x.....x.....|..x..x..x..x|............", "3"),
  drums("solo=drums", "african", "x..x..x.x..x|xx.xxx.xx.xx|x.x.xx.x.x.x", "4"),
  line("fastkora=pluck", "penta F oct=5", 16, ph(16, "1' 6 5 3 2 3 5 6 1' 2' 1' 6", "5 3 2 1 2 3 5 3 2 1 6, 1"), "4"),
  line("slow=pluck", "penta F", 8, ph(8, "1 - - 5, - -", "6, - - - - -"), "5"),
  other("rain         0.5 ?song.5"),
])

# ── Indian (Hindustani, raag Yaman) ──
h = song(80, 4, [("aaroh", 4), ("alap", 8), ("gat", 8), ("jhala", 8), ("monsoon", 8)])
add("india", ["# Indian (Hindustani), raag Yaman on D with a tanpura drone · §1 aaroh / avroh (up and down)",
              "# §2 a slow alap on sitar · §3 a gat with tabla in teental · §4 jhala: fast sitar strokes, fast tabla · §5 monsoon rain and bansuri · then it loops"], h, [
  other("tanpura=strings \"D\" drone oct=3 vol=0.5 ?song.1-5"),
  line("ladder=pluck", "yaman D", 8, ph(8, up_down7), "1"),
  line("alap=pluck", "yaman D", 4, ph(4, "1 - 2 3", "- - 2 1", "7, - 1 -", "- - - -"), "2"),
  line("gat=pluck", "yaman D", 8, ph(8, "3 4 5 - 4 3 2 1", "7, 1 2 3 2 - 1 -", "5 6 7 1' 7 6 5 4", "3 2 1 7, 1 - - -"), "3"),
  drums("tabla=drums", "tabla", "x...x...x.......|....x...x...x...|..x...x.......x.", "3"),
  line("jhala=pluck", "yaman D", 16, ph(16, "1' 1 1' 1 7 1 6 1 5 1 6 1 7 1 1' 1", "2' 1 1' 1 7 1 6 1 5 1 4 1 3 1 2 1"), "4"),
  drums("fast=drums", "tabla", "x.x.x.x.x.x.x.x.|.x.x.x.x.x.x.x.x|..x...x...x...x.", "4"),
  line("bansuri=flute", "yaman D oct=5", 4, ph(4, "5 - - -", "4 - 3 -", "2 - 1 -", "- - - -"), "5"),
  other("rain         0.7 ?song.5"),
])

# ── Javanese gamelan (slendro) ──
h = song(70, 4, [("scale", 4), ("balungan", 8), ("bonang", 8), ("irama", 8), ("rain", 8)])
balungan = ph(4, "2 3 2 1", "2 3 5 6", "5 3 2 1", "6, 5, 6, 1")
add("gamelan", ["# Javanese gamelan in slendro (five roughly equal steps, not Western tuning) · §1 the slendro scale on saron",
                "# §2 the balungan (core melody) with the gong closing each phrase · §3 + bonang, kendang and ketuk · §4 a faster irama · §5 rain · then it loops"], h, [
  line("ladder=bell", "slendro D oct=4", 8, ph(8, up_down5), "1"),
  line("saron=bell", "slendro D oct=4", 4, balungan, "2-3"),
  drums("gong=drums", "gamelan", "................................|................................|x...............................", "2-4"),
  line("bonang=marimba", "slendro D oct=5", 8, ph(8, "2 3 2 3 2 1 2 1", "2 3 2 3 5 6 5 6", "5 3 5 3 2 1 2 1", "6, 5, 6, 5, 6, 1 6, 1"), "3"),
  drums("kendang=drums", "gamelan", "x...x.x.x...x.x.|....x.......x...|................", "3"),
  line("fast=marimba", "slendro D oct=5", 16, ph(16, "2 3 2 3 2 1 2 1 2 3 2 3 5 6 5 6", "5 3 5 3 2 1 2 1 6, 5, 6, 5, 6, 1 6, 1"), "4"),
  line("saronfast=bell", "slendro D oct=4", 8, balungan, "4"),
  drums("drive=drums", "gamelan", "x.x.x.x.x.x.x.x.|..x...x...x...x.|................", "4"),
  line("drops=bell", "slendro D oct=5", 4, ph(4, "1 - - -", "- - - -", "6, - - -", "- - - -"), "5"),
  other("rain         0.6 ?song.5"),
])

# ── Celtic (jig, 12-step bars) ──
h = song(112, 3, [("scale", 4), ("jig", 8), ("jig2", 8), ("reel", 8), ("rain", 8)])
jig = ph(8, "1 2 3 5 3 2", "1 3 5 1' 6 5", "4 6 5 4 3 2", "1 - - 2 - -", "5 4 3 4 5 6", "7 1' 7 6 5 4", "3 5 3 2 1 7,", "1 - - - - -")
add("celtic", ["# Celtic (Irish) in D Dorian, jig time · §1 the mode on fiddle · §2 a jig on tin whistle over guitar",
               "# §3 + fiddle harmony and bodhrán · §4 a reel: fast fiddle and driving bodhrán · §5 rain on the moor, a slow air · then it loops"], h, [
  line("ladder=strings", "dorian D oct=4", 8, ph(8, up_down7, pad=4), "1"),
  other("guitar=pluck  \"Dm C Dm Am\" arp ?song.2-4"),
  line("whistle=flute", "dorian D oct=5", 8, jig, "2-3"),
  line("fiddle=strings", "dorian D oct=4", 8, jig, "3"),
  drums("bodhran=drums", "celtic", "x..x..x..x..|.....x.....x|x.xx.xx.xx.x", "3"),
  line("reel=strings", "dorian D oct=5", 16, ph(16, "1 2 3 1 2 3 5 3 2 1 2 3", "4 5 6 5 4 3 2 3 4 3 2 1"), "4"),
  drums("drive=drums", "celtic", "x..x.xx..x.x|..x..x..x..x|xxxxxxxxxxxx", "4"),
  line("air=flute", "dorian D oct=5", 4, ph(4, "5 - -", "3 - 2", "1 - -", "- - -"), "5"),
  other("rain         0.6 ?song.5"),
])

# ── Flamenco ──
h = song(120, 3, [("scale", 4), ("cadence", 8), ("cante", 8), ("bulerias", 8), ("rain", 8)])
add("flamenco", ["# Flamenco in E Phrygian dominant, 12-step compás · §1 the scale on guitar · §2 the Andalusian cadence (Am G F E) with palmas",
                 "# §3 + cante (a sung line) and cajón · §4 bulerías: picado runs and dense percussion · §5 rain, a slow guitar · then it loops"], h, [
  line("ladder=pluck", "hijaz E", 8, ph(8, up_down7, pad=4), "1"),
  other("guitar=pluck  \"Am G F E\" block oct=3 ?song.2-4"),
  drums("palmas=drums", "flamenco", "............|............|x..x..x.x.x.", "2-4"),
  line("cante=strings", "hijaz E oct=4", 8, ph(8, "5 - 6 5 4 3", "2 - - 1 - -", "3 4 5 4 3 2", "1 - - - - -"), "3"),
  drums("cajon=drums", "flamenco", "x.....x.....|..x..x..x...|............", "3-4"),
  line("picado=pluck", "hijaz E oct=4", 16, ph(16, "5 4 3 2 1 2 3 4 5 6 5 4", "3 2 1 7, 1 2 3 2 1 2 1 -"), "4"),
  line("slow=pluck", "hijaz E", 8, ph(8, "1 - 3 - 5 -", "4 - 3 - 2 -", "1 - - - - -", "- - - - - -"), "5"),
  other("rain         0.6 ?song.5"),
])

out = ",\n".join(f"  {k}: {json.dumps(v, ensure_ascii=False)}" for k, v in EX.items())
open(sys.argv[1], "w").write(out + ",\n")
print("ok", len(EX), "examples")
