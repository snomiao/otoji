// 鹿鳴 from the 風雅十二詩譜 that Zhu Xi printed in his 儀禮經傳通解: the eight sounds (八音) of ritual music one by one,
// then together under the sung ode. Rebuilt from Zhao Yue's (赵越) yayue reconstruction (voice on a demucs stem).
{
  // One note to a syllable (一字一音), as the Song lülü notation writes it; gong on D, with the 变徵 (#4) of the old scale.
  // Transcribed by ear-and-machine from the reconstruction's first stanza: the line is approximate.
  const lines = ["1' 6 #4 3", "6 2 1 4", "5 5 7 6", "5 6 1' 5", "5 #4 5 5", "6 3 3 7", "1' 6 6 5", "3 6 2' 1'"];
  const ode = lines.join(" ");
  const two = (i) => `${lines[i]} ${lines[i + 1]}`;
  const words = "jou jou lu miŋ ʂɨ je tʂɨ pʰiŋ wo jou tɕia pin ku sɤ tʂʰwei ʂəŋ tʂʰwei ʂəŋ ku xwaŋ tʂʰəŋ kʰwaŋ ʂɨ tɕiaŋ ʐən tʂɨ xau wo ʂɨ wo tʂou xaŋ";
  // 金声玉振: the bell sounds the first note of each line, the stone chime answers on its last
  const bells = lines.map((l) => `${l.split(" ")[0]} 0 0 0`).join(" ");
  const stones = lines.map((l) => `0 0 0 ${l.split(" ")[3]}`).join(" ");
  SCORES["zhu-xis-legacy:showcase"] = {
    about: "The Deer Cry (鹿鳴), first of the twelve Book of Songs tunes Zhu Xi preserved (風雅十二詩譜), played through the eight sounds of ritual music one at a time, metal, stone, silk, bamboo, gourd and earth, then sung with them all, a bell opening each line and a stone chime closing it",
    heard: "an academy hall of the Song literati, wooden and high-roofed, at a rite of the village wine-drinking (鄉飲酒禮) where the ode was sung to welcome guests: very slow, one note a syllable; the wooden zhu (柷) begins, a bell and a stone chime frame each line, qin and se, panpipes, sheng, xun and chi double the singers, a drum beats softly between the lines, and the tiger-shaped yu (敔) is scraped at the end",
    refs: [
      { title: "Lu Ming 鹿鸣, Confucian ritual song from the Feng Ya Shi'er Shi Pu", who: "Zhao Yue 赵越 and the Yayue Training Institute, China Conservatory of Music (bayin instruments)", url: "https://www.youtube.com/watch?v=yQ4KkaFlA4U" },
    ],
    measured: "mix: gong on D, the line comes to rest on D; pitch set D E F# G G# A B C# (the old scale with both 4 and #4); ~1.5 sung onsets a second with syllables 1–2 s long, so one note to a syllable at about ♩ = 44; bright metal and stone (centroid 1.5 kHz), a full low end from the drum and qin, a long hall tail. Our line is transcribed from a noisy pitch track of the voice stem, so single notes may be wrong; the reconstruction sings in modern Mandarin, as we do. The real rite's instrumentation and tempo are themselves reconstructions",
    text: `
. clock        44 4/4
. arrange@song zhu:1bars bianzhong:2bars bianqing:2bars qin:2bars se:2bars paixiao:2bars sheng:2bars xun:2bars chi:2bars ode:8bars yu:1bars
. key          major D

. caption@c0   "鹿鳴 · 風雅十二詩譜" ?song.1-9
. caption@c1   "呦呦鹿鳴，食野之苹 / 我有嘉賓，鼓瑟吹笙 / 吹笙鼓簧，承筐是將 / 人之好我，示我周行" ?song.10
. drums@zhu      kit=temple vol=2 "................|................|x...x...x......." ?song.1
. bell@bianzhong  oct=4 grid=4 "${two(0)}" ?song.2
. bell@bianqing   oct=5 grid=4 vol=0.7 "${two(2)}" ?song.3
. pluck@guqin     oct=3 grid=4 "${two(4)}" ?song.4
. pluck@se        oct=3 grid=4 vol=1.6 "${two(6)}" ?song.5
. flute@paixiao   oct=5 grid=4 vol=0.35 "${two(0)}" ?song.6
. organ@sheng     oct=4 grid=4 vol=0.6 "${two(2)}" ?song.7
. flute@xun       oct=4 grid=4 vol=0.4 "${two(4)}" ?song.8
. flute@chi       oct=5 grid=4 vol=0.35 "${two(6)}" ?song.9
. chant@singers   voice=men voices=8 oct=3 grid=4 human=0.3 vib=0.008 breath=0.1 dyn="mf" ipa="${words}" "${ode}" ?song.10
. bell@bianzhong2 oct=4 grid=4 vol=0.9 "${bells}" ?song.10
. bell@bianqing2  oct=5 grid=4 vol=0.6 "${stones}" ?song.10
. pluck@guqin2    oct=3 grid=4 vol=1.4 "${ode}" ?song.10
. pluck@se2       oct=3 grid=4 vol=1.2 "${ode}" ?song.10
. flute@paixiao2  oct=5 grid=4 vol=0.25 "${ode}" ?song.10
. organ@sheng2    oct=4 grid=4 vol=0.3 "${ode}" ?song.10
. flute@xun2      oct=4 grid=4 vol=0.2 "${ode}" ?song.10
. drums@bofu      kit=zhangu vol=0.3 "........x...x...|................|................" ?song.10
. drums@yu        kit=temple vol=2 "................|................|x.x.x..........." ?song.11
. bell@last       oct=4 grid=4 "1' - - -" ?song.11

*> space       ancestral size=1.1
>  speaker     0.5
`,
  };
}
