// Ba-Yu war dance (巴渝舞): lost; rebuilt from the nearest living tradition, the Tujia (土家族) daliuzi (打溜子) gong-and-cymbal
// band of the Wuling hills, whose people trace themselves to the Ba, with the Ba bronze chunyu (錞于) and drums added.
{
  // Interlocking cymbals as in daliuzi: the lead pair (头钹) and the second pair (二钹) fill each other's gaps,
  // the big gong (大锣) on the bar, the small gong (马锣) chattering on the off-beats. 16 steps a bar of 4/4.
  const toubo = "................................|................................|x...x.x...x.x...x.x...x.x...x...";
  const erbo  = "................................|................................|..x.....x.....x.....x.....x...x.";
  SCORES["shu:showcase"] = {
    about: "The instruments of a Ba war dance one by one, bronze chunyu, war drum, cymbals, gongs and panpipes, then all together as the dancers stamp and shout: the Ba-Yu dance itself is lost, so its drumming is rebuilt from the interlocking cymbals of the Tujia daliuzi bands of today",
    heard: "a valley clearing in the hills east of the Sichuan basin: the tiger-topped chunyu is struck and hangs in the air, the war drum answers from across the slope, then the two pairs of cymbals start their interlocking chatter with the gongs, and the dancers come in with shields, stamping and shouting together, the valley throwing everything back",
    refs: [
      { title: "Daliuzi 打溜子: Man Fangche 慢纺车 (impromptu outdoor performance)", who: "a four-man Tujia band, Xiangxi, Hunan (field video)", url: "https://www.youtube.com/watch?v=SoxxnE_ECAU" },
      { title: "Daliuzi 打溜子: Gu Shu Pan Gen 古树盘根 (with suona)", who: "a Tujia five-man liuzi band, Yongshun, Hunan (festival video)", url: "https://www.youtube.com/watch?v=dmF4fHCaNpA" },
    ],
    measured: "outdoor daliuzi: ~129 beats a minute in four, 3.4 onsets a second, a dense, almost level wall of cymbal and gong (3 dB dynamic range), energy mostly above 500 Hz and peaking 4–8 kHz (centroid 4.2 kHz), a short open-air tail; the two cymbal pairs alternate on the eighths, the gong marks the bar. Ours follows that tempo, the interlocking and the gong placement. The Ba-Yu dance's own music, and whether the chunyu was played this way, are unknown; the Tujia link to the ancient Ba is a tradition, not a certainty; the panpipe tune is ours. Render of the dance: 129 a minute, 4.9 onsets a second (the band alone 3.4; ours adds the dancers' stamps and shouts), brightness 4.3 kHz against 4.2, a level wall (4 dB range); but our cymbals are a thinner noise (4–8 kHz ~8 dB under the 1–2 kHz band where the real ones peak there) and our gongs lack the real gongs' body at 500–1000 Hz; the drum, chunyu and stamping add low end the band does not have",
    text: `
. clock        129 4/4
. arrange@song chunyu:2bars gu:2bars bo:2bars luo:2bars paixiao:2bars dance:16bars
. key          gong D

. caption@c1   "巴渝舞" ?song.6
. bell@chunyu    oct=2 grid=4 vol=1.2 "1 - - - 1 - 1 -" ?song.1
. drums@zhangu   kit=zhangu vol=0.45 "X...x...X..xX...|....x.......x...|................" ?song.2
. drums@toubo    kit=opera vol=2 "................|................|x...x.x...x.x..." ?song.3
. drums@erbo     kit=opera vol=1.8 "................|................|..x.....x.....x." ?song.3
. drums@daluo    kit=opera vol=0.9 "................|x.......x.......|................" ?song.4
. drums@maluo    kit=temple vol=0.5 "................|..x...x...x.x.x.|................" ?song.4
. flute@paixiao  oct=5 grid=8 vol=0.5 "5 6 1' 6 5 3 2 3 5 - 3 2 1 - - -" ?song.5
. bell@chunyu2   oct=2 grid=4 vol=0.5 "1 - - - - - - - 1 - - - - - - -" ?song.6
. drums@gu       kit=zhangu vol=0.12 "X...x...X..xX...|....x.......x...|................" ?song.6
. drums@toubo2   kit=opera vol=2 "${toubo}" ?song.6
. drums@erbo2    kit=opera vol=1.8 "${erbo}" ?song.6
. drums@daluo2   kit=opera vol=1.8 "................|x...............|................" ?song.6
. drums@maluo2   kit=temple vol=0.4 "................|..x...x...x.x.x.|................" ?song.6
. drums@stamp    kit=work vol=0.6 "x...x...x...x...|................|................" ?song.6
. crowd@dancers  shout "HEI ya HO ya" pattern="x-x-x---x-x-x---" voices=30 vol=1.8 dyn="mf f mf f" ?song.6
. flute@paixiao2 oct=5 grid=8 vol=0.3 "5 6 1' 6 5 3 2 3 5 - 3 2 1 - - -" ?song.6

*> space       valley size=1
>  speaker     0.5
`,
  };
}
