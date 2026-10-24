// 霓裳中序第一: the one strain of the Rainbow Skirt suite that survives, as Jiang Kui (姜夔) set it in 1186 from an old
// musician's score; the line taken from a qin–xiao–voice performance of his 白石道人歌曲 notation, the band after the
// 唐代礼乐复原组 reconstruction on Tang instruments. Measured with refs/analyse.py (voice on a demucs stem).
{
  // The strain in 简谱, one token an eighth (♩ = 60), 25 bars. Pitches as sung (gong on C, the final on 2, shang mode 商调);
  // the long notes are where the singer breathes at the ends of the poem's lines.
  const tune = "(5)6 5 3 - 4 - (5)6 - - - 3 - (4)5 - 6 3 - 2 - - - 6 - 4 - 6 5 - - - 4 - 3 - 5 - 4 3 - - 4 - - - - 2' - - - (1')2' 3 - 4 - 3 - 5 - 3 2' - 3 - 5 3' - 2' - - - 6 2' - - - - 3 - 5 - 6 - 2' - 6 - - 5 - 7 - 2' 1' 5 6 - 5 - 6 2' - - 6 7 - 2' - - - (1')2' - (5)2' - - - - - 7 - - 6 (7)2' - 3' (4')3' - 2' - - - - - 3 5 - 6 3 - (7)6 5 4 - - (7)6 - - 7 - - 6 5 - 3 5 - - - 1' 2' - - - 1' 2' 4 - 7 6 - 5 - 4 - 7 - 6 5 - - - (6)5 6 7 (2')7 3 - 5 - - 6 - 2 - - - - - - - -";
  const toks = tune.split(" ");
  // bar a..b (1-based, inclusive) of the strain; a slice that starts on a hold starts on the held note's rest instead
  const bars = (a, b) => { const s = toks.slice((a - 1) * 8, b * 8); if (s[0] === "-") s[0] = "0"; return s.join(" "); };
  const oct = (s) => s.replace(/(^|[ (+])([1-7])(?=[' )+ -]|$)/g, "$1$2'");   // the same line an octave up
  SCORES["chinese-middle:showcase"] = {
    about: "The Tang court instruments one by one, each taking up the next phrase of the Rainbow Skirt middle strain (霓裳中序第一) as Jiang Kui preserved it, then the whole band with fangxiang, jiegu and clapper",
    heard: "a palace hall at night: the four-string pipa begins alone, the zheng, the konghou harp, the transverse flute, the panpipes and the sheng each carry the strain a little further, slow and free in time, with the hall answering; then all play together, the bronze slabs of the fangxiang ringing the main notes, the jiegu ticking, the clapper closing each phrase",
    refs: [
      { title: "姜夔 霓裳中序第一 (琴 簫 歌, from the 白石道人歌曲 notation)", who: "邱文苑, voice with qin and xiao", url: "https://www.youtube.com/watch?v=ozm0CwxMLaY" },
      { title: "管弦《霓裳羽衣曲》中序第一 (Tang instruments, score decipherment by 刘涛)", who: "唐代礼乐复原组", url: "https://www.youtube.com/watch?v=k1kB0uRXwnQ" },
    ],
    measured: "voice stem (first verse, sung low): long notes and line ends on D with C as gong, pitch set C D E F G A Bb with the E about 30 cents flat (a neutral third), tuned as a whole ~50 cents above A440 C; range D3–D#4, vibrato ~19 cents, glides on one note in three, free rhythm (pulse clarity 0.13): we set the sung line to eighths at ♩ = 60, which keeps its long-short shape but not its breathing. Reconstruction ensemble: also free in time, 1.3 kHz centroid, a big drum under 125 Hz, bright jingling percussion above 4 kHz. What the Song notation's rhythm really was is uncertain, and so is how much of the Tang strain Jiang Kui kept. Render (solo half): rests on D, the same seven pitches as the singer within ~10–20 cents (the neutral third included), ♩ = 60, the solos played with some free time (rubato) and the ensemble steady; darker than the voice-led reference (0.8 kHz centroid against 1.3) since no one sings, and the winds do not slide between notes as the singer does",
    text: `
. clock        60 4/4
. arrange@song pipa:4bars zheng:4bars konghou:4bars hengdi:4bars paixiao:4bars sheng:4bars together:25bars
. scale@shang  1 2 3:370 4 5 6 b7
. key          shang C

. caption@c1   "霓裳中序第一 · 姜夔" ?song.1-6
. caption@c2   "亭皋正望極，亂落江蓮歸未得 / 多病卻無氣力" ?song.7
. pluck@pipa     rubato=0.35 oct=3 grid=8 human=0.5 dyn="mf" "${bars(1, 4)}" ?song.1
. pluck@zheng    rubato=0.35 oct=4 grid=8 human=0.5 vol=1.8 dyn="mf" "${bars(5, 8)}" ?song.2
. pluck@konghou  rubato=0.35 oct=4 grid=8 human=0.5 vol=2 dyn="mf" "${bars(9, 12)}" ?song.3
. flute@hengdi   rubato=0.35 oct=4 grid=8 human=0.5 vol=0.4 dyn="mf" "${oct(bars(13, 16))}" ?song.4
. flute@paixiao  rubato=0.35 oct=4 grid=8 human=0.5 vol=0.45 dyn="mf" "${bars(17, 20)}" ?song.5
. organ@sheng    rubato=0.35 oct=4 grid=8 vol=1 dyn="mp" "${bars(21, 24)}" ?song.6
. pluck@pipa2    oct=3 grid=8 human=0.5 vol=0.9 dyn="mf mf mp mf f mf" "${tune}" ?song.7
. pluck@zheng2   oct=4 grid=8 human=0.5 vol=1.2 "${tune}" ?song.7
. pluck@konghou2 oct=4 grid=8 human=0.5 vol=0.6 "${tune}" ?song.7
. flute@hengdi2  oct=4 grid=8 human=0.5 vol=0.2 "${oct(tune)}" ?song.7
. flute@paixiao2 oct=4 grid=8 human=0.5 vol=0.2 "${tune}" ?song.7
. organ@sheng2   oct=4 grid=8 vol=0.5 "${tune}" ?song.7
. pluck@ruan     oct=3 grid=8 human=0.4 vol=1.3 "${tune.replace(/\([^)]*\)/g, "")}" ?song.7
. bell@fangxiang oct=4 grid=4 vol=0.8 "2 - 6 - 3 - 4 - 2' - 5 - 2' - 6 - 2' - 5 - 3 - 2 - 6 - 1' - 5 - 2 -" ?song.7
. drums@jiegu    kit=zhangu vol=1 "................|..x...x...x.x.x.|................" ?song.7
. drums@paiban   kit=opera vol=2 "x...............................................................|................................................................|................................................................" ?song.7
. drums@dagu     kit=zhangu vol=0.15 "X...............................|................................|................................" ?song.7

*> space       hall size=1.2
>  speaker     0.5
`,
  };
}
