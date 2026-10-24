// 秦王破陣樂: rebuilt from the 古樂尋蹤 (HGofACH) reconstructions of the Tang score kept in Japan
// (pipa solo for the line, the ensemble for the band, tempo and timbre), measured with refs/analyse.py.
{
  // The line, from the pipa reconstruction (三五要錄 pipa score): 1 = E, the Tang 燕乐 scale with its flat seventh.
  // One token an eighth; the refrain (P1, P2) comes round again after the middle strain (P3).
  const P1 = "2 - 2 - 2 - 3 - 4 - 5 4 2 - 4 2 1, - 1 - - - - -";
  const P2 = "6 5 3 - 4 - 5, - 5 - 3 - 5 - 4 3 2, 1, 1 - - - - -";
  const P3 = "5 4 6 7 1' 7 6 5 6 5 3 4 5, - 5 - 2 1 2 1 3 4 5, - 5 1 6, - 6 5 3 - 5 - 4 3 4 - 6 - 2 1 1 2 4 3 2 1 1, - 1 - 2 1 6, - 6 - 1 6, 1 - - -";
  const tune = [P1, P2, P3, P1, P2].join(" ");                 // 20 bars of 4/4
  const rest = (n) => Array(n).fill("0").join(" ");
  // The soldiers sing the refrain (the Tang words; Middle Chinese, roughly after Baxter–Sagart: uncertain).
  const sung = [P1, P2, rest(64), P1, P2].join(" ");
  const words = "dʑuw _ lwit zi ŋʉan ɕuw _ sjaŋ tsjaŋ tʰaw ban dʑin ɦɛm ka _ pʰa ɖin ŋak _ gjoŋ ɕaŋ tʰaj bjaŋ ɲin _";
  // Heterophony as in the reconstruction: the zheng plucks the line's main notes in octaves,
  // the bili (篳篥) and hengdi (横笛) hold and bend through it, the sheng clusters on its tones.
  const zheng = tune.replace(/(^| )([1-7])( -)/g, "$1$2+$2'$3");
  const bili = tune.replace(/(^| )2 - 2 - 2 -/g, "$1(3)2 - - - 2 -");
  const sheng = tune.replace(/(^| )([1-7])([',]*)(?= -)/g, "$1$2$3+5");
  SCORES["chinese-middle:triumph"] = {
    about: "The Prince of Qin Breaks the Ranks (秦王破陣樂): first as the Tang court band plays it from the score Japan kept, slow and stately; then as the soldiers sang it marching into Chang'an, twice as fast, with the war drums and the crowd",
    heard: "before the palace gate of Chang'an: in the hall court the band of pipa, zheng, sheng, bili and transverse flute plays the piece at the stately pace the surviving scores suggest, a big drum marking the bars and the clapper (拍板) the phrases; then the army comes in through the streets, men singing the refrain in unison over the war drums and cymbals, hooves, the crowd cheering along the road",
    refs: [
      { title: "【唐五弦琵琶】秦王破陣樂 (reconstruction from the Tang tablature)", who: "古樂尋蹤 HGofACH", url: "https://www.youtube.com/watch?v=fjzdukmnSq0" },
      { title: "【復原唐樂合奏】秦王破陣樂 (reconstructed Tang ensemble, from the 三五要錄 pipa and 仁智要錄 zheng scores)", who: "古樂尋蹤 HGofACH", url: "https://www.youtube.com/watch?v=hwnnDVy-cdM" },
    ],
    measured: "pipa reconstruction: phrases come to rest on E (tuned ~10–30 cents flat), pitch set E F# G# A B C# D (燕乐: major with a flat seventh), ~78 beats a minute in twos, the refrain (F# F# F# G# A B A F# A F# E…) returns after the middle strain; ensemble: ~68 beats a minute, steady even pulse, bright (2 kHz centroid) and full from 125 Hz to 2 kHz, little dynamic change (9 dB), long hall tail. The fast march tempo is Picken's argument that Tang tempi were far faster than gagaku's today, not a recording: that half is our guess, as are the Middle Chinese words and the drum patterns. Our pitch sits on E in 12-tone, not the reconstruction's slightly flat tuning. Render of the court half measured (after the engine's real double reed for the bili): same seven-note set and resting tone as the reference, band levels within ~3–5 dB of the ensemble from 125 Hz to 8 kHz, brightness 1.7 kHz against 2.0; ours is evener in level and its winds do not bend between notes the way bili and sheng do",
    text: `
. clock        66 4/4
. arrange@song court:20bars march:20bars@126
. key          yanyue E

. caption@c1   "秦王破陣樂" ?song.1
. caption@c2   "受律辭元首，相將討叛臣 / 咸歌破陣樂，共賞太平人" ?song.2
. pluck@pipa   oct=3 grid=8 human=0.4 vol=1 dyn="mf mf mp mf f" "${tune}" ?song.1-2
. pluck@zheng  oct=4 grid=8 human=0.4 vol=1 dyn="mp" "${zheng}" ?song.1-2
. reed@bili    oct=4 grid=8 human=0.5 vol=0.25 dyn="mp mf mp" "${bili}" ?song.1-2
. flute@hengdi oct=5 grid=8 human=0.5 vol=0.2 dyn="p mp" "${tune}" ?song.1-2
. organ@sheng  oct=4 grid=8 vol=0.6 dyn="p" "${sheng}" ?song.1
. drums@dagu   kit=zhangu vol=0.06 "X...............|................|................" ?song.1
. drums@paiban kit=opera vol=1.5 "x...............................|................................|................................" ?song.1
. chant@soldiers voice=men voices=12 oct=3 grid=8 human=0.6 vib=0.01 breath=0.15 dyn="f f ff f" ipa="${words}" "${sung}" ?song.2
. drums@zhangu kit=zhangu vol=0.35 "X...x...X...x...|....x.......x.x.|..x.......x....." ?song.2
. drums@jiegu  kit=zhangu vol=1.2 "................|x.x.xxx.x.x.xxxx|................" ?song.2
. drums@hooves kit=horses vol=0.35 "x..x..x.x..x..x.|................|................" ?song.2
. crowd@street shout "HO hei HO hei ya" voices=30 vol=1.2 dyn="mp mf mp p" ?song.2

*> space       courtyard size=1.6
>  speaker     0.5
`,
  };
}
