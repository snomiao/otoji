// 觀滄海: Cao Cao's verses at Jieshi (207), sung by the army on the way home by the sea. The Han–Wei tune is lost; the line
// follows the traditional chanted recitation (吟诵) of the poem in Qian Shaowu's (錢紹武) recitation tune, measured with refs/analyse.py.
{
  // On E with the Tang-and-later seven-note scale the reciter uses (E F# G# A B C# D, 燕乐). One token an eighth, ♩ = 58.
  const A = "7 - 4 - 1' - - - 3' - - - 2' - - -", B = "1' - 5 - 6 1' 4 - 3 - - - - - - -";     // odd couplets
  const A2 = "5 - 6 - 1' - - - 7 - 3' - - - - -", B2 = "3' - 2' 1' 5 - - - 4 - 3 - 1 - - -";  // even couplets
  const odd = `${A} ${B}`, even = `${A2} ${B2}`;
  const c = [
    "toŋ lin tɕie ʂɨ _ i kuan tsʰaŋ _ xai _",          // 東臨碣石，以觀滄海
    "ʂuei xɤ tan tan _ ʂan tau _ suŋ _ _ tʂɨ",         // 水何澹澹，山島竦峙
    "ʂu mu tsʰuŋ ʂəŋ _ pai tsʰau fəŋ _ mau _",         // 樹木叢生，百草豐茂
    "tɕʰiou fəŋ ɕiau sɤ _ xuŋ po _ yŋ _ _ tɕʰi",       // 秋風蕭瑟，洪波湧起
    "ʐɨ ye tʂɨ ɕiŋ _ ʐuo tʂʰu tɕʰi _ tʂuŋ _",          // 日月之行，若出其中
    "ɕiŋ xan tsʰan lan _ ʐuo tʂʰu _ tɕʰi _ _ li",      // 星漢燦爛，若出其裏
    "ɕiŋ ʂən tʂɨ tsai _ kɤ i yŋ _ tʂɨ _",              // 幸甚至哉，歌以詠志
  ];
  SCORES["wei:triumph"] = {
    about: "Viewing the Blue Sea (觀滄海): on the march home from White Wolf Mountain, by the Bohai at Jieshi, one soldier chants Cao Cao's verses over the surf, and then the whole column takes them up with the drums and reed pipes of the army band",
    heard: "a headland above the sea in autumn: the wind off the water, waves breaking below, a horn sounding the halt; a man's voice chanting slowly, free in time, then the soldiers singing together in unison while the drums of the army band (鼓吹) keep the step and the jia reed pipes double the tune",
    refs: [
      { title: "古詩吟誦《觀滄海》(曹操), 錢紹武先生吟誦調", who: "盛榮芳, chanted recitation (吟诵)", url: "https://www.youtube.com/watch?v=XaE-s29WiSw" },
    ],
    measured: "recitation: comes home to E (tuned ~30 cents flat), uses E F# G# A B C# D with a G natural now and then, G3–G#4, vibrato ~14 cents, one note in six slides, slow and free (pulse clarity 0.14; long notes of 1–4 s at line ends), bright voice (2.1 kHz centroid, strong 250 Hz–4 kHz). Our line keeps that resting tone, scale, range and the shape of its two recurring line-tunes, set to eighths at ♩ = 58 with rubato; words in Mandarin. The Han–Wei yuefu melody is lost; the army band and the soldiers' singing are our setting. Render of the solo: home on E, range G3–G#4 exactly as the reciter, vibrato ~12 cents; darker than him (1.3 kHz centroid against 2.1 at bright=0.45, so we raised the voice's ring to 0.7) with the sea adding low rumble under 250 Hz",
    text: `
. clock        58 4/4
. arrange@song sea:2bars cao:16bars army:12bars
. key          yanyue E

. caption@c1   "東臨碣石，以觀滄海。水何澹澹，山島竦峙。 / 樹木叢生，百草豐茂。秋風蕭瑟，洪波湧起。" ?song.2
. caption@c2   "日月之行，若出其中；星漢燦爛，若出其裏。 / 幸甚至哉，歌以詠志。" ?song.3
. water@sea     0.45 lap=0.7 splash=0.15
. wind@autumn   0.3 gust=0.09Hz
. brass@jiao    oct=3 grid=4 vol=0.5 dyn="mf mp" "1 - - - 5, - 1 -" ?song.1
. chant@soldier voice=men oct=3 grid=8 human=0.5 rubato=0.35 vib=0.025 breath=0.12 bright=0.7 dyn="mf mf f mf mf f mf mf f mf mf f mf mf f mf" ipa="${c.slice(0, 4).join(" ")}" "${[odd, even, odd, even].join(" ")}" ?song.2
. chant@army    voice=men voices=12 oct=3 grid=8 human=0.6 vib=0.015 breath=0.15 dyn="f" ipa="${c.slice(4).join(" ")}" "${[odd, even, odd].join(" ")}" ?song.3
. reed@jia      oct=4 grid=8 vol=0.3 dyn="mf" "${[odd, even, odd].join(" ")}" ?song.3
. drums@gu      kit=zhangu vol=0.35 "X.......x.......|....x.......x...|................" ?song.3

*> space       field size=1.2
>  speaker      0.5
`,
  };
}
