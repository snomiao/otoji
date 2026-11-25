// 苦寒行: Cao Cao's song of the winter march over the Taihang (206), sung by a soldier on the road. The Wei tune (瑟调 of the
// qingshang repertoire) is lost; the line follows the old-style-verse chanting tune (古體詩吟誦調), measured with refs/analyse.py.
{
  // Gong pentatonic on F# (F# G# A# C# D#) with the B the reciter touches; one token an eighth, ♩ = 72.
  const P = "6 - 5 - 5~6 - 2 - 1 - - - - - - -";          // a line falling home
  const Q = "6 - 6 - 1' 1' 6 5 4 3 2 - - - - -";        // a line rising, then running down
  const R = "2 - 4 5 6~5 - 3 2~1 - - - - - - -";          // the answering line, home to 1
  const tune = [P, R, Q, R, P, R, Q, R].join(" ");       // four couplets, 16 bars
  const words = [
    "pei ʂaŋ tʰai xaŋ ʂan", "tɕian tsai _ xɤ wei _ wei",          // 北上太行山，艱哉何巍巍
    "iaŋ tʂʰaŋ pan _ tɕie _ _ _ tɕʰy", "tʂʰɤ lun _ wei tʂɨ _ tsʰuei", // 羊腸坂詰屈，車輪為之摧
    "ʂu mu xɤ ɕiau sɤ", "pei fəŋ _ ʂəŋ tʂəŋ _ pei",             // 樹木何蕭瑟，北風聲正悲
    "ɕyŋ pʰi tuei _ wo _ _ _ tsun", "xu pau _ tɕia lu _ tʰi",     // 熊羆對我蹲，虎豹夾路啼
  ].join(" ");
  SCORES["wei:winter"] = {
    about: "Bitter Cold (苦寒行): on the frozen road through the Taihang mountains a soldier sings Cao Cao's song of the north wind, the bears and tigers by the road and the men with no wood and no shelter, and the men near him hum along",
    heard: "a mountain road in deep winter: the north wind howling down the gorge, the column trudging, a drum keeping a slow step, now and then a horse; one tired voice sings, slow and sliding, the valley sending it back, and the men around him join in low on the line ends",
    refs: [
      { title: "樂府詩吟誦《龜雖壽》(曹操, from the same 步出夏門行 cycle) in the 古體詩吟誦調", who: "邱鳳娟, chanted recitation (吟诵)", url: "https://www.youtube.com/watch?v=Dnko71qeJVg" },
    ],
    measured: "recitation in the old-style-verse tune: home on F#, pitch set F# G# A# B C# D# (gong pentatonic with the 4th as a passing note), F3–E4, a wide vibrato (~19 cents) and a slide on one note in five, ~143 eighths a minute, energy 125–500 Hz (1.5 kHz centroid). We use that scale, pace, range and sliding, with two falling-and-rising line tunes of our own built from its contour, in Mandarin. No recording of 苦寒行 being chanted was found, so a poem of the same cycle stands in; the qingshang tune Cao Cao's court used is lost. Render: range F3–D#4 (reciter F3–E4), brightness 1.50 kHz against 1.47, vibrato ~14 cents and glides on one note in seven against 19 cents and one in five, pace ~136 eighths with rubato against ~143; the howling wind and the valley make ours wetter than the dry studio reference, on purpose. Voice gestures (pyin on the recitation): slides of ~0.2 s between notes; the soldier now glides (glide=0.3, transit 0.18 s) and leans into notes from below (scoop=25), the column glides less",
    text: `
. clock        72 4/4
. arrange@song road:2bars song:16bars hum:16bars
. key          gong F#

. caption@c1   "北上太行山，艱哉何巍巍！羊腸坂詰屈，車輪為之摧。 / 樹木何蕭瑟，北風聲正悲。熊羆對我蹲，虎豹夾路啼。" ?song.2-3
. wind@beifeng  0.6 gust=0.15Hz
. drums@step    kit=zhangu vol=0.12 "x.......x.......|................|................" ?song.1-3
. drums@horse   kit=horses vol=0.8 "................................................................|................................................................................................................................x...............................|................................................................" ?song.1-3
. chant@soldier voice=men oct=3 grid=8 human=0.6 rubato=0.3 scoop=25 glide=0.3 vib=0.03 breath=0.2 dyn="mp mf mf mp mf mf mp mp mp mf mf mp mf mf mp p" ipa="${words}" "${tune}" ?song.2-3
. chant@column  voice=men voices=8 oct=3 grid=8 human=0.7 glide=0.2 vib=0.015 breath=0.3 vol=0.5 dyn="p mp" ipa="${words}" "${tune}" ?song.3

*> space       valley size=1.3
>  speaker      0.5
`,
  };
}
