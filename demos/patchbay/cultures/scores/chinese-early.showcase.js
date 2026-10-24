// The instruments of Marquis Yi's tomb (曾侯乙, c. 433 BC), one by one and then together. Pitch and timbre from the 1986
// recording made on the original bells before they were sealed away; the line follows the qin-and-bells 幽兰 on that record.
{
  // 幽兰 (碣石调幽兰, the oldest qin piece kept in tablature, 6th c.) as the 1986 qin-and-bells arrangement opens it, simplified:
  // one token a quarter, the yu mode on A with 2 and 4 (A B C D E G), the whole set ~40 cents under A440 as the bells are.
  const Y = ["4 - 4 - 7, - - - 1 - 2 1 5, - - -", "1 2 3 - 3' - 4 5 3 - 5 - 7 7 7 -", "2' - 7 - - - 4 5 5 - 3 3 3 - 4 4",
    "3 - - - 4 5 7 - 7 - - - 1' - 2' -", "7 1' 7 1' 5 5 5 - 4 - - - 1 - - -"];
  const all = Y.join(" ");
  // A Zeng bell sounds two notes a minor third apart, struck on its face (隧) or its side (鼓): some strokes ring both.
  const bell = (s) => s.replace(/(^| )1( |$)/g, "$11+3$2").replace(/(^| )5,( |$)/g, "$15,+7,$2");
  SCORES["chinese-early:showcase"] = {
    about: "The orchestra buried with Marquis Yi of Zeng, instrument by instrument: bronze bells, stone chimes, qin, se, sheng, panpipes, chi flute and xun each take a phrase of the old qin tune Youlan, then all play with the big drum; the Shao music Confucius heard is lost, so the tune here is the oldest one the instruments can honestly carry",
    heard: "a great wooden ancestral hall with a stone floor: each bronze bell rings long and dies slowly with its two tones, the stones answer drier and higher, the strings are close and quiet, the winds breathy; when all play, the jiangu drum on its pole marks the long phrases",
    refs: [
      { title: "曾侯乙编钟原件孤版录音 (1986, Hubei Provincial Museum; tracks 竹枝词 for bells and chimes, 幽兰 for qin and bells)", who: "China Record Corporation and the Hubei Provincial Museum, on the original bells", url: "https://www.youtube.com/watch?v=3NjZW8cJxQw" },
      { title: "Concert of the Eight Tones (Imperial Bells of China)", who: "Hubei Song and Dance Ensemble, on reproductions of the tomb's instruments", url: "https://www.youtube.com/watch?v=e9HKRbN1Sn0" },
    ],
    measured: "original bells with chimes: everything sits ~40 cents under A440 (we tune the whole scale down by that), phrases end on A; the bells' tail is long (decay ~0.7 s per stroke in the mix, the hall several seconds), bright partials around 1–4 kHz with a gap at 250–500 Hz. Qin with bells (幽兰): notes move in the yu mode A C D E G with B (the line's order of notes followed here, its free rhythm set to quarters at ♩ = 60, its slides and harmonics left out), the qin strong under 125 Hz. Shao itself is lost and the 1986 pieces are modern arrangements: what is old here is the instruments, their tuning and the tune Youlan, not the arrangement. Render of the bell solo: the notes land on the bells' flat tuning (within ~10 cents), bands within ~3 dB of the original bells from 0 to 250 Hz and above 1 kHz, brightness 1.9 kHz against 1.6; the real bells' hollow at 250–500 Hz (their partials skip it) is missing in ours, and our bell is one tone per stroke where a Zeng bell's face and side strokes are separate notes (we write the two as a chord)",
    text: `
. clock        60 4/4
. arrange@song bianzhong:4bars bianqing:4bars qin:4bars se:4bars sheng:4bars paixiao:4bars chi:4bars xun:4bars together:20bars
. scale@zeng   1:-40 2:160 3:260 4:460 5:660 6:860 7:960
. key          zeng A

. caption@c0   "曾侯乙墓 · 幽蘭" ?song.1-8
. bell@bianzhong  oct=3 grid=4 "${bell(Y[0])}" ?song.1
. bell@bianqing   oct=5 grid=4 vol=0.7 "${Y[1]}" ?song.2
. pluck@qin       oct=3 grid=4 vol=2 "${Y[2]}" ?song.3
. pluck@se        oct=3 grid=4 vol=1.4 "${Y[3]}" ?song.4
. organ@sheng     oct=4 grid=4 vol=0.8 "${Y[4]}" ?song.5
. flute@paixiao   oct=5 grid=4 vol=0.35 "${Y[0]}" ?song.6
. flute@chi       oct=5 grid=4 vol=0.35 "${Y[1]}" ?song.7
. flute@xun       oct=4 grid=4 vol=0.4 "${Y[2]}" ?song.8
. bell@bianzhong2 oct=3 grid=4 vol=0.9 "${bell(all)}" ?song.9
. bell@bianqing2  oct=5 grid=4 vol=0.6 "${all}" ?song.9
. pluck@qin2      oct=3 grid=4 vol=2 "${all}" ?song.9
. pluck@se2       oct=3 grid=4 vol=1.8 "${all}" ?song.9
. organ@sheng2    oct=4 grid=4 vol=0.35 "${all}" ?song.9
. flute@paixiao2  oct=5 grid=4 vol=0.2 "${all}" ?song.9
. flute@chi2      oct=5 grid=4 vol=0.15 "${all}" ?song.9
. drums@jiangu    kit=zhangu vol=0.4 "X...............................................................|................................................................|................................................................" ?song.9

*> space       ancestral size=1.3
>  speaker     0.5
`,
  };
}
