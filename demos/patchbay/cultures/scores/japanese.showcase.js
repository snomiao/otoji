// Rokudan no shirabe (六段の調), Yatsuhashi Kengyō's koto piece: a blind master plays it alone, then again with a shakuhachi, as Edo households heard it.
SCORES["japanese:showcase"] = {
  about: "Rokudan no shirabe on the koto in hira-jōshi: the slow opening of the first dan ('ten — ton — shan'), the koto alone, then again faster with a shakuhachi following it heterophonically, the way the piece speeds up from dan to dan (jo-ha-kyū)",
  heard: "a tatami room of a merchant's house in Edo, the shōji closed; a blind kengyō kneels at the koto, a few guests sit very still; the koto's long decays fill the small room; in the second part a komusō-trained shakuhachi player joins, as Rokudan was played in sankyoku ensembles",
  refs: [
    { title: "Rokudan, slow practice recording (六段 独奏 D壱 ゆっくり)", who: "Koto Sangen part-practice channel, Ikuta-school koto in hira-jōshi on D", url: "https://www.youtube.com/watch?v=zSYHaQMfGUo" },
    { title: "Rokudan (part 1)", who: "Miyagi Michio, koto (historic recording)", url: "https://www.youtube.com/watch?v=_SMIuRcJDOU" },
    { title: "Rokudan for shakuhachi and koto (78 rpm)", who: "Yoshida Seifū (shakuhachi) with koto", url: "https://www.youtube.com/watch?v=gySqhl82Uj0" },
  ],
  measured: "slow practice recording: hira-jōshi on D, the steps measured at 90 490 690 790 cents (Eb G A Bb, the koto tuned a shade low), with 990 and 1190 cents only as pressed notes (oshide raising a string); the opening notes read as Eb' (held ~4.5 s), A, then G with its octave (the 'shan' chord), G' A' G' Eb' …, about one note a second, almost no vibrato (2 cents), attack 70 ms, decay 0.6 s, 1.3 kHz; Miyagi's recording: the same tuning a tone lower (C), about 2 onsets a second in the faster dans, decay 0.4 s. Ours: hira-jōshi on D (1 b2 4 5 b6); the first eight bars follow the opening as measured from the slow recording (a rough transcription of the public-domain piece), the next eight continue in its manner; the koto section at 60, the second section gliding from 66 to 92 as the dans accelerate, the shakuhachi doubling the koto's notes an octave up with graces and holding through its rests. Rendered and measured (the koto section): steps 100 500 700 800 cents over D against the koto's 90 490 690 790, brightness 1.2 kHz against 1.3 kHz, attack 70 ms as on the record, decay 0.44 s against 0.6 s, 1.5 onsets a second against 0.9 for the slow practice (Miyagi plays about 2). Still differs: the koto's pressed-string bends (oshide, ato-oshi) and the scratched and tremolo strokes of the later dans; only the opening phrases are taken from the recording",
  text: `
. clock        60 4/4
. arrange@song shodan:16bars nidan:16bars@~92
. scale@hira   1 b2 4 5 b6
. key          hira D

. pluck@koto   oct=4 grid=4 human=0.4 vol=1.6 dyn="mf mf f mf mf mf mf mp mf mf f mf mf mf mp p" "2' - - - 5 - - 4+4' - - 4' 5' - (4')2' - 4' 5' 2 - - 2' - (6)5 - 4 - 6' - 5' 4' 5' - 2' 4' 5' 2' 2 - - - 5 - 4 4' - 2' - - - 1' 6 5 - 4+4' - - - - - - - - - -" ?song.1-2
. flute@shakuhachi oct=4 grid=4 human=0.6 rubato=0.2 vol=0.45 dyn="mp mf mf mp" "(1')2' - - - 5 - - 4 - - 4 5 - (4)2' - 4 5 2 - - 2' - (6)5 - 4 - 6 - 5 4 5 - 2' 4 5 2' 2 - - - 5 - 4 4 - 2' - - - 1' 6 5 - 4 - - - - - - - - - -" ?song.2
. crowd@kyaku  murmur "ma a ken gyo u sa ma no o ko to" voices=4 vol=0.3 dyn="p pp" ?song.1

*> space       room size=1.2
>  speaker     0.5
`,
};
