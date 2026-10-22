# Run: python3 world.py out.js — prints the EXAMPLES entries for the five-section world-music demos
# Generates the world-music arrangements with checked phrase lengths.
import json, re, sys
SEC = None  # (sig, {section index: bars})

def song(bpm, sig, sections):
    global SEC
    SEC = (sig, {i + 1: b for i, (n, b) in enumerate(sections)})
    secs = " ".join(f"{n}:{b}bars" for n, b in sections)
    return [f".            clock   {bpm} {sig}/4", f".            arrange@song {secs}"]

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
    # The phrase starts with the first section of its range and runs across it.
    span = sum(SEC[1][s] for s in range(lo, hi + 1))
    assert span % bars == 0, f"{name_kind}: {bars}-bar phrase doesn't fit §{gate} ({span} bars)"
    g = "" if grid == 8 else f" grid={grid}"
    return f".            {nk(name_kind):<13} {opts}{g} \"{phrase}\"{extra} ?song.{gate}"

def drums(name, kit, lanes, gate):
    steps = SEC[0] * 4
    for l in lanes.split("|"):
        assert len(l) % steps == 0 or steps % len(l) == 0, f"{name}: lane length {len(l)} vs bar {steps}"
    k = "" if kit == "rock" else f"kit={kit} "
    return f".            {nk(name):<13} {k}\"{lanes}\" ?song.{gate}"

def nk(t):
    """name=kind → kind@name (a name only when the node needs one)."""
    return re.sub(r"^([\w-]+)=([\w-]+)", r"\2@\1", t)

def other(text): return f".            {nk(text)}"

def up(tok):
    """One octave up for a 简谱 token (- and 0 stay)."""
    if tok in ("-", "0"): return tok
    return tok[:-1] if tok.endswith(",") else tok + "'"

def climb(phrase_bars):
    """A climax that rises instead of repeating: the phrase, then the phrase an octave up."""
    phrase, bars = phrase_bars
    return phrase + " " + " ".join(up(t) for t in phrase.split()), bars * 2

def tail(reverb="2.5s wet=0.3"):  # effects group: *> takes every line above
    return ["", f"*>           reverb  {reverb}", ">            speaker 0.5"]

EX = {}
def add(key, comment, head, body, rv="2.5s wet=0.3"):
    EX[key] = "\n".join(comment + head + [""] + body + tail(rv)) + "\n"

up_down7 = "1 2 3 4 5 6 7 1' 1' 7 6 5 4 3 2 1"
up_down5 = "1 2 3 5 6 1' 2' 3' 3' 2' 1' 6 5 3 2 1"
up_down_minor5 = "1 3 4 5 7 1' 3' 4' 4' 3' 1' 7 5 4 3 1"

# Every demo: §1 the scale once · §2 the tune's first half, sparse · §3 its
# second half with more instruments (the tune plays once) · §4 a 4-bar climax
# that climbs an octave · §5 a 4-bar lament in that culture's sad or rain mood.
def form(sig, tune="tune", climax="climax", lament="lament"):
    return [("scale", 2 if sig == 4 else 3), (tune, 4), (tune + "2", 4), (climax, 4), (lament, 4)]
L = lambda *bars: ph(4, *bars)   # lament lines move in quarter notes

# ── 日式 ──
h = song(84, 4, form(4, "sakura", "matsuri", "ame"))
add("japan", ["# 日式 · §1 the In (都節) scale · §2 さくらさくら on koto · §3 + shakuhachi and taiko",
              "# §4 matsuri: fast koto, full taiko · §5 雨 (ame): a slow falling koto and shakuhachi · then it loops"], h, [
  line("ladder=pluck", "in E", 8, ph(8, "1 2 4 5 6 1' 2' 4' 4' 2' 1' 6 5 4 2 1"), "1"),
  line("koto=pluck", "in E", 8, ph(8, "4 - 4 - 5 - - -", "4 - 4 - 5 - - -", "4 - 5 - 6 - 5 -", "4 - 5 4 2 - - -",
       "1 - 6, - 1 - 2 -", "1 - 1 6, 5, - - -", "4 - 5 - 6 - 5 -", "4 - 5 4 2 - - -"), "2-3"),
  line("shaku=flute", "in E oct=5", 8, ph(8, "1' - - - - - - -", "6 - - - - - - -", "5 - - - 4 - 2 -", "1 - - - - - - -"), "3"),
  drums("taiko=drums", "taiko", "x.......x.......|....x.......x...|x...x...x...x...", "3"),
  line("fast=pluck", "in E", 16, climb(ph(16, "1' 6 5 4 5 6 1' 2' 4' 2' 1' 6 5 6 5 4", "2 4 5 6 5 4 2 1 2 1 6, 5, 6, 1 2 4")), "4"),
  drums("matsuri=drums", "taiko", "x..xx..xx.x.x..x|..x...x...x..x.x|xxxxxxxxxxxxxxxx", "4"),
  line("ame=pluck", "in E", 4, L("6 - 5 -", "4 - 2 -", "1 - 6, -", "5, - - -"), "5", " adsr=3ms,2s,0,1.5s"),
  line("breath=flute", "in E oct=5", 4, L("5 - - 4", "2 - - -", "1 - - 6,", "5, - - -"), "5"),
])

# ── 清 · 茉莉花 / 京剧 ──
h = song(76, 4, form(4, "molihua", "jijifeng", "erquan"))
molihua = ph(8, "3 - 3 5 6 1' 1' 6", "5 - 5 6 5 - - -", "3 - 3 5 6 1' 1' 6", "5 - 5 6 5 - - -",
             "5 - 5 - 5 3 5 6", "6 - 5 - - - - -", "3 - 2 3 5 3 2 1", "1 2 1 - - - - -")
add("qing", ["# 清 · §1 the 宫 pentatonic · §2 茉莉花 on 二胡 · §3 + 笛子 an octave up and light 锣鼓",
             "# §4 京剧 急急风: fast 京胡 and full 锣鼓 · §5 a slow 二胡 lament in 羽调, in the mood of 二泉映月 · then it loops"], h, [
  line("ladder=pluck", "gong A", 8, ph(8, up_down5), "1"),
  line("erhu=strings", "gong A", 8, molihua, "2-3"),
  line("yueqin=pluck", "gong A", 8, ph(8, "6 - 3 - 5 - 2 -"), "2-3"),
  line("dizi=flute", "gong A oct=5", 8, ph(8, "5 - 5 6 5 - - -", "6 - 5 - - - - -", "3 - 2 3 5 3 2 1", "1 2 1 - - - - -"), "3"),
  drums("luogu=drums", "opera", "x...x...x...x...|x...............|........x.......", "3"),
  line("jinghu=strings", "gong A oct=5", 16, climb(ph(16, "6 5 6 1' 6 5 3 5 6 5 3 2 3 5 6 1'", "2' 1' 6 5 3 2 3 5 6 - 5 - 3 - 2 -")), "4"),
  drums("jijifeng=drums", "opera", "xxxxxxxxxxxxxxxx|x...x...x...x...|....x.......x...", "4"),
  line("lament=strings", "yu A", 4, L("5 - 4 3", "1 - 3 4", "3 - 1 7,", "1 - - -"), "5"),
  line("pluck", "yu A oct=3", 4, L("1 - - -", "- - - -", "5, - - -", "- - - -"), "5"),
])

# ── 唐: the five modes (五调) ──
# 宫 商 角 徵 羽 are the five notes (五音); each of the five modes (五调) makes a
# different one home. All five use the same pitches here (D E F# A B).
h = song(66, 4, [("宫", 1), ("商", 1), ("角", 1), ("徵", 1), ("羽", 1), ("court", 4), ("court2", 4), ("ambush", 4), ("guqin", 4)])
court = ph(8, "5 - 6 1' 2' - 1' 6", "5 - - - 4 5 6 5", "4 2 1 2 4 - 5 -", "6 5 4 2 1 - - -",
           "1 2 4 5 6 - 5 4", "2 - 4 5 2 1 6, -", "5, 6, 1 2 4 2 1 6,", "1 - - - - - - -")
add("tang", ["# 唐 · §1–5 the five modes 五调 on the same five notes (D E F# A B): 宫调 商调 角调 徵调 羽调, one bar each",
             "# §6 a court melody in 徵调 on 琵琶 over 古琴 · §7 + 编钟 and 箫 · §8 in the style of 十面埋伏 · §9 古琴 and 箫 in 羽调 · then it loops"], h, [
  line("pluck@gong", "gong D", 8, ph(8, "1 2 3 5 6 1' - -"), "1"),
  line("pluck@shang", "shang E", 8, ph(8, "1 2 4 5 7 1' - -"), "2"),
  line("pluck@jue", "jue F#", 8, ph(8, "1 3 4 6 7 1' - -"), "3"),
  line("pluck@zhi", "zhi A", 8, ph(8, "1 2 4 5 6 1' - -"), "4"),
  line("pluck@yu", "yu B", 8, ph(8, "1 3 4 5 7 1' - -"), "5"),
  line("pipa=pluck", "zhi A", 8, court, "6-7"),
  line("guqin=pluck", "zhi A oct=3", 4, ph(4, "1 - 5, -", "1 - 5, -"), "6-7", " adsr=5ms,1.5s,0,800ms"),
  line("bianzhong=bell", "zhi A", 4, ph(4, "1 - - -", "5 - - -", "6 - - -", "5 - - -"), "7"),
  line("xiao=flute", "zhi A oct=5", 8, ph(8, "5 - - - 4 - 2 -", "1 - - - - - - -"), "7"),
  line("ambush=pluck", "zhi A", 16, climb(ph(16, "5 5 5 5 6 6 6 6 1' 1' 1' 1' 2' 2' 1' 6", "5 5 5 5 4 4 4 4 2 2 2 2 1 2 4 5")), "8"),
  drums("war=drums", "taiko", "x.x.x.x.xxxxx.x.|....x..x....x..x|x.x.x.x.x.x.x.x.", "8"),
  line("qin=pluck", "yu B oct=3", 4, L("5 - - 4", "3 - 1 -", "7, - - -", "1 - - -"), "9", " adsr=5ms,2s,0,1.5s"),
  line("flute", "yu B oct=5", 4, L("1' - 7 5", "4 - - -", "3 - - -", "1 - - -"), "9"),
], "3s wet=0.35")

# ── 现代华语 ──
h = song(76, 4, form(4, "verse", "chorus", "ballad"))
tune = ph(8, "3 5 6 1' 6 5 3 2", "1 - 2 3 2 - - -", "3 5 6 1' 2' 1' 6 5", "6 - 5 3 5 - - -",
          "6 1' 6 5 3 2 3 5", "2 - 1 2 3 - - -", "5 3 2 1 6, 1 2 3", "1 - - - - - - -")
add("cpop", ["# 现代华语 (中国风) · §1 the 宫 pentatonic · §2 piano on the 4536251 progression, guzheng melody",
             "# §3 + drums, bass, dizi · §4 chorus: strings an octave up, busier drums · §5 a slow piano ballad in A minor · then it loops"], h, [
  line("ladder=piano", "gong C", 8, ph(8, up_down5), "1"),
  other("piano        \"F G Em Am Dm G C C\" arp ?song.2-3"),
  line("guzheng=pluck", "gong C oct=5", 8, tune, "2-3"),
  drums("drums", "rock", "x.....x...x.....|....x.......x...|x.x.x.x.x.x.x.x.", "3"),
  other("bass         \"Dm G C C\" ?song.3"),
  line("dizi=flute", "gong C oct=5", 8, ph(8, "0 0 0 0 0 0 0 0", "5 6 1' 6 5 - - -"), "3"),
  line("violins=strings", "gong C oct=5", 8, climb(ph(8, "6 1' 6 5 3 2 3 5", "5 3 2 1 6, 1 2 3")), "4"),
  other("chords=piano \"F G Em Am\" block ?song.4"),
  drums("chorus=drums", "rock", "x.....x...x.x...|....x.......x...|xxxxxxxxxxxxxxxx", "4"),
  other("ballad=piano \"Am F C G\" arp oct=3 ?song.5"),
  line("sing=strings", "minor A oct=5", 4, L("3 - 2 1", "1 - 7, 6,", "5, - 6, 7,", "1 - - -"), "5"),
], "2s wet=0.25")

# ── Javanese gamelan (slendro) ──
h = song(70, 4, form(4, "balungan", "irama", "sepi"))
add("gamelan", ["# Javanese gamelan in slendro (five roughly equal steps, not Western tuning) · §1 the scale on saron",
                "# §2 the balungan (core melody) · §3 + bonang, kendang, ketuk · §4 a faster irama · §5 sepi: slow saron and one gong, almost silent · then it loops"], h, [
  line("ladder=bell", "slendro D oct=4", 8, ph(8, up_down5), "1"),
  line("saron=bell", "slendro D oct=4", 4, ph(4, "2 3 2 1", "2 3 5 6", "5 3 2 1", "6, 5, 6, 1", "6 5 3 2", "3 2 1 6,", "5, 6, 1 2", "1 - - -"), "2-3"),
  line("bonang=marimba", "slendro D oct=5", 8, ph(8, "5 3 5 3 2 1 2 1", "6, 5, 6, 5, 6, 1 6, 1", "6 5 6 5 3 2 3 2", "1 6, 1 6, 1 - - -"), "3"),
  drums("kendang=drums", "gamelan", "x...x.x.x...x.x.|....x.......x...|x...............................................................", "3"),
  line("fast=marimba", "slendro D oct=5", 16, climb(ph(16, "2 3 2 3 2 1 2 1 2 3 2 3 5 6 5 6", "5 3 5 3 2 1 2 1 6, 5, 6, 5, 6, 1 6, 1")), "4"),
  drums("drive=drums", "gamelan", "x.x.x.x.x.x.x.x.|..x...x...x...x.|x...............................", "4"),
  line("sepi=bell", "slendro D oct=4", 4, L("5 - 3 -", "2 - - -", "1 - 6, -", "6, - - -"), "5"),
  drums("gong=drums", "gamelan", "................................................................|................................................................|x...............................................................", "5"),
])

# ── Indian (Hindustani): Yaman, then Megh for the monsoon ──
h = song(80, 4, [("aaroh", 2), ("alap", 4), ("gat", 4), ("jhala", 4), ("megh", 4)])
add("india", ["# Indian (Hindustani), raag Yaman on D over a tanpura drone · §1 aaroh / avroh · §2 a slow alap on sitar",
              "# §3 a gat with tabla in teental · §4 jhala: fast sitar strokes and tabla · §5 raag Megh, the monsoon raga, on bansuri · then it loops"], h, [
  other("tanpura=strings \"D\" drone oct=3 vol=0.5 ?song.1-5"),
  line("ladder=pluck", "yaman D", 8, ph(8, up_down7), "1"),
  line("alap=pluck", "yaman D", 4, ph(4, "1 - 2 3", "- - 2 1", "7, - 1 -", "- - - -"), "2"),
  line("gat=pluck", "yaman D", 8, ph(8, "3 4 5 - 4 3 2 1", "7, 1 2 3 2 - 1 -", "5 6 7 1' 7 6 5 4", "3 2 1 7, 1 - - -"), "3"),
  drums("tabla=drums", "tabla", "x...x...x.......|....x...x...x...|..x...x.......x.", "3"),
  line("jhala=pluck", "yaman D", 16, climb(ph(16, "1' 1 1' 1 7 1 6 1 5 1 6 1 7 1 1' 1", "2' 1 1' 1 7 1 6 1 5 1 4 1 3 1 2 1")), "4"),
  drums("fast=drums", "tabla", "x.x.x.x.x.x.x.x.|.x.x.x.x.x.x.x.x|..x...x...x...x.", "4"),
  line("bansuri=flute", "megh D oct=5", 4, L("1' - 7 5", "4 - 2 -", "1 - 2 4", "1 - - -"), "5"),
  line("sitar=pluck", "megh D", 4, L("1 - - -", "- - - -", "5, - - -", "- - - -"), "5"),
])

# ── Egyptian maqam Hijaz, then Saba ──
h = song(100, 4, form(4, "tune", "taqsim", "saba"))
add("egypt", ["# Egyptian maqam Hijaz on D · §1 the maqam · §2 an oud melody with darbuka maqsum · §3 + ney",
              "# §4 a fast taqsim run, saidi drums, strings up high · §5 maqam Saba, the saddest maqam: a slow ney over the drone · then it loops"], h, [
  other("drone=strings \"D\" drone oct=2 vol=0.5 ?song.1-5"),
  line("ladder=pluck", "hijaz D", 8, ph(8, up_down7), "1"),
  line("oud=pluck", "hijaz D", 8, ph(8, "5 - 6 5 4 3 2 3", "4 - - - 3 2 1 -", "1 2 3 4 5 - 4 3", "2 - 3 - 2 1 1 -",
       "5 6 7 1' 7 6 5 4", "3 - 4 5 4 3 2 -", "3 2 1 2 3 4 3 2", "1 - - - - - - -"), "2-3"),
  drums("darbuka=drums", "darbuka", "x.......x.......|..x...x.....x...|..........x...x.", "2-3"),
  line("ney=flute", "hijaz D oct=5", 8, ph(8, "1' - - - 7 - 6 -", "5 - - - - - - -", "4 - 5 - 6 - 5 -", "4 - 3 - 2 - 1 -"), "3"),
  line("taqsim=pluck", "hijaz D", 16, climb(ph(16, "1 2 3 4 5 6 7 1' 2' 1' 7 6 5 6 7 1'", "7 6 5 4 3 4 5 6 5 4 3 2 1 2 3 1")), "4"),
  drums("saidi=drums", "darbuka", "x..x..x.x..x..x.|...x.x...x.x.x.x|x.xxx.xxx.xxx.xx", "4"),
  line("saba=flute", "saba D oct=5", 4, L("3 - 2 1", "2 - 3 4", "3 - 2 -", "1 - - -"), "5"),
])

# ── West African (12-step bars) ──
h = song(110, 3, form(3, "kora", "dance", "harmattan"))
add("africa", ["# West African, in 12-step bars (12/8 feel) · §1 a pentatonic on kora · §2 kora ostinato, balafon, the bell pattern",
               "# §3 + djembe and dundun · §4 a djembe solo, fast kora · §5 a slow minor kora song, alone · then it loops"], h, [
  line("ladder=pluck", "penta F", 8, ph(8, up_down5, pad=1), "1"),
  line("kora=pluck", "penta F", 16, ph(16, "1 5, 1 3 5 3 1 5, 6, 1 3 2"), "2-3"),
  line("balafon=marimba", "penta F oct=4", 16, ph(16, "5 - 3 - 2 - 1 - 2 - 3 -", "5 - 6 - 5 - 3 - 2 - 1 -"), "2-3"),
  drums("bell=drums", "african", "............|............|x.x.xx.x.x.x", "2-4"),
  drums("drums", "african", "x.....x.....|..x..x..x..x|............", "3"),
  drums("solo=drums", "african", "x..x..x.x..x|xx.xxx.xx.xx|x.x.xx.x.x.x", "4"),
  line("fastkora=pluck", "penta F oct=5", 16, climb(ph(16, "1' 6 5 3 2 3 5 6 1' 2' 1' 6", "5 3 2 1 2 3 5 3 2 1 6, 1")), "4"),
  line("lament=pluck", "minorpenta D", 4, L("5 4 3", "1 - -", "7, 1 3", "1 - -"), "5"),
])

# ── 哥特 Gothic ──
h = song(60, 4, form(4, "diesirae", "toccata", "lament"))
add("gothic", ["# 哥特 Gothic in D Dorian · §1 the mode on the organ · §2 the Dies Irae chant · §3 + organ chords and a bell",
               "# §4 toccata: organ runs, full choir, timpani · §5 a lament over the falling bass D C B♭ A · then it loops"], h, [
  line("ladder=organ", "dorian D", 8, ph(8, up_down7), "1"),
  line("chant=choir", "dorian D", 4, ph(4, "3 2 3 1", "2 7, 1 1", "3 3 4 3", "2 1 7, 2", "3 2 1 -", "1 - - -", "3 2 3 1", "2 7, 1 -"), "2-3"),
  other("organ        \"Dm C Dm Am\" block oct=3 ?song.3"),
  line("bell", "dorian D oct=3", 4, ph(4, "1 - - -", "- - - -"), "3"),
  line("toccata=organ", "dorian D oct=4", 16, climb(ph(16, "5 4 5 3 4 2 3 1 2 7, 1 6, 7, 5, 6, 4,", "5, 3, 4, 2, 3, 1, 2, 7,, 1, 3, 5, 1 3 5 1' 5")), "4"),
  line("fullchoir=choir", "dorian D oct=4", 4, ph(4, "3 2 3 1", "2 7, 1 1", "3 3 4 3", "2 1 7, 2"), "4"),
  drums("timpani=drums", "taiko", "x...x...x...x.x.|................|................", "4"),
  line("bass=choir", "minor D oct=3", 4, L("1 - - -", "7, - - -", "6, - - -", "5, - - -"), "5"),
  other("organsoft=organ \"Dm C Bb A\" block oct=3 vol=0.5 ?song.5"),
  line("weep=strings", "minor D oct=5", 4, L("5 - 4 3", "2 - 3 1", "7, - 1 2", "1 - 7, -"), "5"),
], "5s wet=0.5")

# ── Celtic (12-step bars) ──
h = song(112, 3, form(3, "jig", "reel", "air"))
jig = ph(8, "1 2 3 5 3 2", "1 3 5 1' 7 5", "4 7 5 4 3 2", "1 - - 2 - -", "5 4 3 4 5 7", "7 1' 7 6 5 4", "3 5 3 2 1 7,", "1 - - - - -")
add("celtic", ["# Celtic (Irish) on a gapped six-note scale (D Dorian without the 6th, common in Irish tunes), jig time · §1 the mode on fiddle · §2 a jig on tin whistle over guitar",
               "# §3 + fiddle and bodhrán · §4 a reel: fast fiddle, driving bodhrán · §5 a slow air, a lament on whistle over a drone · then it loops"], h, [
  line("ladder=strings", "hexa D oct=4", 8, ph(8, "1 2 3 4 5 7 1' 7 5 4 3 2", "1 - - - - -"), "1"),
  other("guitar=pluck  \"Dm C Dm Am\" arp ?song.2-4"),
  line("whistle=flute", "hexa D oct=5", 8, jig, "2-3"),
  line("fiddle=strings", "hexa D oct=4", 8, ph(8, "5 4 3 4 5 7", "7 1' 7 5 4 3", "3 5 3 2 1 7,", "1 - - - - -"), "3"),
  drums("bodhran=drums", "celtic", "x..x..x..x..|.....x.....x|x.xx.xx.xx.x", "3"),
  line("reel=strings", "hexa D oct=5", 16, climb(ph(16, "1 2 3 1 2 3 5 3 2 1 2 3", "4 5 7 5 4 3 2 3 4 3 2 1")), "4"),
  drums("drive=drums", "celtic", "x..x.xx..x.x|..x..x..x..x|xxxxxxxxxxxx", "4"),
  line("air=flute", "aeolian D oct=5", 4, L("5 4 3", "1 - -", "7, 1 2", "1 - -"), "5"),
  other("pipes=strings \"D\" drone oct=3 vol=0.4 ?song.5"),
])

# ── Flamenco (12-step bars) ──
h = song(120, 3, form(3, "cadence", "bulerias", "solea"))
add("flamenco", ["# Flamenco in E Phrygian dominant, 12-step compás · §1 the scale on guitar · §2 the Andalusian cadence (Am G F E) with palmas",
                 "# §3 + cante (a sung line) and cajón · §4 bulerías: picado runs, dense percussion · §5 soleá: slow guitar and a falling cante · then it loops"], h, [
  line("ladder=pluck", "hijaz E", 8, ph(8, up_down7, pad=1), "1"),
  other("guitar=pluck  \"Am G F E\" block oct=3 ?song.2-4"),
  drums("palmas=drums", "flamenco", "............|............|x..x..x.x.x.", "2-4"),
  line("cante=strings", "hijaz E oct=4", 8, ph(8, "5 - 6 5 4 3", "2 - - 1 - -", "3 4 5 4 3 2", "1 - - - - -"), "3"),
  drums("cajon=drums", "flamenco", "x.....x.....|..x..x..x...|............", "3-4"),
  line("picado=pluck", "hijaz E oct=4", 16, climb(ph(16, "5 4 3 2 1 2 3 4 5 6 5 4", "3 2 1 7, 1 2 3 2 1 2 1 -")), "4"),
  other("solea=pluck   \"Am G F E\" arp oct=3 ?song.5"),
  line("quejio=strings", "hijaz E oct=4", 4, L("4 - 3", "2 - 1", "2 - 3", "1 - -"), "5"),
])

# ── Baroque Europe (Germany, c. 1700): Pachelbel's Canon ──
h = song(66, 4, form(4, "canon", "variation", "cello"))
add("baroque", ["# Baroque Europe (Germany, c. 1700), the age of violin and cello · §1 the D major scale · §2 Pachelbel's Canon: cello ground bass and violin · §3 + a second violin in canon",
                "# §4 the 16th-note variation with choir · §5 a cello lament in B minor · then it loops"], h, [
  line("ladder=strings", "major D oct=4", 8, ph(8, up_down7), "1"),
  line("cello=strings", "major D oct=2", 4, ph(4, "1 - 5, -", "6, - 3, -", "4, - 1 -", "4, - 5, -"), "2-4"),
  line("violin=strings", "major D oct=5", 4, ph(4, "3 - 2 -", "1 - 7, -", "6, - 5, -", "6, - 7, -"), "2-3"),
  line("violin2=strings", "major D oct=5", 4, ph(4, "6, - 5, -", "6, - 7, -", "3 - 2 -", "1 - 7, -"), "3"),
  line("variation=strings", "major D oct=5", 16, ph(16, "3 1 2 3 1 2 3 3, 4, 5, 6, 7, 1 2 1 7,", "1 6, 7, 1 1, 2, 3, 4, 3, 2, 3, 1 7, 1 6, 7,",
       "1 7, 6, 7, 5, 6, 7, 1 2 3 4 5 4 3 2 1", "7, 6, 5, 6, 7, 1 2 3 2 1 7, 6, 5, 4, 3, 2,"), "4"),
  other("pad=choir    \"D A Bm F#m G D G A\" block ?song.4"),
  line("lament=strings", "minor B oct=2", 4, L("5 - 4 3", "2 - 1 -", "7, - 6, 5,", "1 - - -"), "5"),
  line("high=strings", "minor B oct=5", 4, L("0 0 0 0", "3 - - -", "2 - 1 -", "1 - - -"), "5"),
], "3s wet=0.35")

# ── Hungarian Romani csárdás: the violin leads ──
h = song(72, 4, form(4, "lassu", "friss", "sirato"))
lassu = ph(8, "5 - 4 3 4 - 5 -", "6 - 5 4 3 - - -", "3 4 5 6 7 - 1' -", "7 6 5 4 3 - - -",
           "1 2 3 4 5 - 6 5", "4 - 3 2 1 - 7, -", "1 2 3 1 7, 6, 7, 1", "1 - - - - - - -")
add("csardas", ["# Hungarian Romani csárdás, in Hungarian minor on D (raised 4th and 7th) · §1 the scale on violin",
                "# §2 lassú, the slow sorrowful opening, on violin over cimbalom · §3 + bass · §4 friss: the wild fast dance · §5 a violin lament · then it loops"], h, [
  line("ladder=strings", "hungarian D oct=4", 8, ph(8, up_down7), "1"),
  line("violin=strings", "hungarian D oct=5", 8, lassu, "2-3"),
  other("cimbalom=pluck \"Dm A Dm A Gm A Dm Dm\" arp oct=4 ?song.2-3"),
  other("bass         \"Gm A Dm Dm\" ?song.3"),
  line("friss=strings", "hungarian D oct=5", 16, climb(ph(16, "5 4 5 6 5 4 3 4 5 6 7 1' 7 6 5 4", "3 2 3 4 3 2 1 2 3 4 5 6 5 4 3 2")), "4"),
  other("drive=pluck  \"Dm A Dm A\" arp oct=3 ?song.4"),
  other("pulse=bass   \"Dm A Dm A\" ?song.4"),
  line("sirato=strings", "hungarian D oct=5", 4, L("5 - 4 3", "4 - 3 2", "1 - 7, -", "1 - - -"), "5"),
  line("strings", "hungarian D oct=3", 4, L("1 - - -", "- - - -", "5, - - -", "- - - -"), "5"),
], "2s wet=0.3")

# ── Aztec / Maya ──
h = song(96, 4, form(4, "ritual", "frenzy", "night"))
add("aztec", ["# Aztec / Maya (Mesoamerica) · §1 a minor pentatonic on clay flute · §2 huehuetl, teponaztli and a flute call",
              "# §3 + a second flute and a slit-drum melody · §4 frenzy: shrieking flutes, fast drums · §5 a low ocarina over a slow heartbeat · then it loops"], h, [
  line("ladder=flute", "minorpenta A oct=5", 8, ph(8, up_down_minor5), "1"),
  drums("drums", "aztec", "x.......x.......|..x...x...x...x.|x.x.x.x.x.x.x.x.", "2-3"),
  line("call=flute", "minorpenta A oct=5", 8, ph(8, "5 - 3 - 1 - - -", "3 4 5 - 4 3 1 -"), "2-3"),
  line("slit=marimba", "minorpenta A oct=3", 8, ph(8, "1 - 5, - 1 - 3 -"), "3"),
  line("answer=flute", "minorpenta A oct=6", 8, ph(8, "0 0 0 0 0 0 0 0", "5 - 4 3 1 - - -"), "3"),
  line("shriek=flute", "minorpenta A oct=6", 16, climb(ph(16, "1' 7 5 4 5 7 1' 3' 1' 7 5 4 3 1 3 4", "5 4 3 1 7, 1 3 4 5 7 1' 7 5 4 3 1")), "4"),
  drums("frenzy=drums", "aztec", "x.x.x.xxx.x.x.xx|..x..x..x..x..xx|xxxxxxxxxxxxxxxx", "4"),
  line("ocarina=flute", "minorpenta A oct=4", 4, L("5 - 4 3", "1 - - -", "7, - 5, -", "1 - - -"), "5"),
  drums("heart=drums", "aztec", "x.......x.......|................|................", "5"),
])

# ── Andean ──
h = song(92, 4, form(4, "huayno", "fiesta", "yaravi"))
quena = ph(8, "5 - 4 3 1 - 3 4", "5 - 7 5 4 - - -", "5 - 4 3 1 3 4 3", "1 - - - - - - -")
add("andes", ["# Andean (Inca highlands) · §1 a minor pentatonic on quena · §2 a huayno: charango and quena",
              "# §3 + zampoña and bombo · §4 fiesta: fast charango, quena up high · §5 a yaraví, the Andes' sad slow song · then it loops"], h, [
  line("ladder=flute", "minorpenta E oct=5", 8, ph(8, up_down_minor5), "1"),
  other("charango=pluck \"Em G D Em\" arp oct=4 ?song.2-3"),
  line("quena=flute", "minorpenta E oct=5", 8, quena, "2-3"),
  line("zampona=flute", "minorpenta E oct=4", 8, ph(8, "0 0 0 0 5 - 4 3", "0 0 0 0 1 - - -"), "3"),
  drums("bombo=drums", "aztec", "x..x..x.x..x..x.|................|....x.......x...", "3-4"),
  line("strum=pluck", "minorpenta E", 16, climb(ph(16, "1 3 5 1 3 5 1 3 4 5 4 3 1 3 1 7,", "5 4 3 1 3 4 5 7 5 4 3 4 3 1 7, 1")), "4"),
  line("yaravi=flute", "minorpenta E oct=5", 4, L("5 - 4 3", "4 - 3 1", "7, - 1 3", "1 - - -"), "5"),
  other("sad=pluck    \"Em Am Em B\" block oct=3 vol=0.6 ?song.5"),
])

out = ",\n".join(f"  {k}: {json.dumps(v, ensure_ascii=False)}" for k, v in EX.items())
open(sys.argv[1], "w").write(out + ",\n")
print("ok", len(EX), "examples")
