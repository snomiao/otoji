// 大風歌: Liu Bang's three lines at the homecoming feast in Pei (195 BC), sung to his own zhu (筑), then by the 120 boys.
// The tune is lost; the zhu is heard after Hao Jingchun's reconstructed Pei zhu (沛筑), measured with refs/analyse.py.
{
  // Our own setting (the Han tune is lost), in the yu mode on E (E G A B D) that the Pei zhu performance uses; ♩ = 72, eighths.
  const L1 = "5 - 5 - 7 - 1' - - - 7 - 5 - 5 - - - - - - - - -";         // 大風起兮雲飛揚
  const L2 = "4 - 5 - 7 - 5 - 4 - - - 3 - 4 - 1 - - - - - - -";         // 威加海內兮歸故鄉
  const L3 = "1' - 7 - 5 - 7 - 1' - - - 7 - 5 - 4 3 1 - - - - -";       // 安得猛士兮守四方
  const song = [L1, L2, L3].join(" ");
  const words = "ta fəŋ tɕʰi ɕi yn fei iaŋ wei tɕia xai nei ɕi kuei ku ɕiaŋ an tɤ məŋ ʂɨ ɕi ʂou sɨ faŋ _ _";
  // the zhu is struck with a bamboo stick: it doubles the voice an octave down and strikes the tonic between the lines
  const zhu = song.replace(/(^| )- - - - - -( |$)/g, "$11, - 5, - 1, -$2");
  SCORES["chinese-early:wind"] = {
    about: "Song of the Great Wind (大風歌): Liu Bang, home in Pei after the war, strikes the zhu himself at the feast and sings his three lines; then the hundred and twenty boys sing them back, and the whole town joins with drums",
    heard: "the feast for the elders of Pei in the hall court, wine going round, old friends talking loud; the emperor takes the zhu and strikes it with a bamboo stick, singing alone, heroic and sad; the boys' chorus answers in unison, high and bright, and then everyone sings while the drums beat and he gets up to dance",
    refs: [
      { title: "沛筑演奏《大风歌》 (the reconstructed Pei zhu)", who: "Pei zhu players, after Hao Jingchun's reconstruction", url: "https://www.youtube.com/watch?v=MtaYURn2dyM" },
      { title: "Reconstructed zhu 筑 (struck zither) from Xuzhou (CCTV segment)", who: "郝敬春 Hao Jingchun, Pei County", url: "https://www.youtube.com/watch?v=MkoNaFHyYwI" },
    ],
    measured: "Pei zhu performance: rests on E, the notes E G A B D (yu pentatonic, a little F#), ~2.5 struck notes a second, hard attacks with a ~0.6 s ring, warm and full under 250 Hz with a 1.5 kHz centroid. Everything about the song itself is lost: the melody is ours, written in that mode and pace; the words are in Mandarin, not Han-period Chinese; the zhu is a plucked zither voice with a hard attack, not a struck string. Render: the same five pitches (E G A B D), brightness 1.36 kHz against the Pei zhu's 1.55, ~1.6 notes a second at ♩ = 72; the reference's strong sub-125 Hz comes partly from its gala accompaniment, ours is ~15 dB lighter there",
    text: `
. clock        72 4/4
. arrange@song feast:2bars liubang:9bars boys:9bars all:9bars
. key          yu E

. caption@c1   "大風起兮雲飛揚 / 威加海內兮歸故鄉 / 安得猛士兮守四方" ?song.2-4
. crowd@elders   murmur "ha ya lai he jiu ma" voices=16 vol=2 dyn="mf mf" ?song.1
. crowd@elders2  murmur "ha ya" voices=6 vol=1.2 dyn="p" ?song.2-3
. pluck@zhu      oct=2 grid=8 human=0.4 vol=2 adsr=2ms,500ms,0.2,400ms dyn="mf f mf f mf" "0 0 0 0 0 0 0 0 1, - 5, - 1, - - - ${zhu} ${zhu} ${zhu}" ?song.1-4
. chant@liubang  voice=men oct=3 grid=8 human=0.5 vib=0.02 breath=0.12 dyn="f f mf f f ff mf f f" ipa="${words}" "${song}" ?song.2
. chant@boys     voice=boy voices=12 oct=4 grid=8 human=0.4 vib=0.01 breath=0.1 dyn="f" ipa="${words}" "${song}" ?song.3-4
. chant@townsmen voice=men voices=10 oct=3 grid=8 human=0.6 vib=0.015 breath=0.15 dyn="mf f f" ipa="${words}" "${song}" ?song.4
. drums@gu       kit=zhangu vol=0.5 "X.......x.......|................|................" ?song.4
. crowd@cheer    shout "HAO a" voices=24 vol=0.6 pattern="${".".repeat(40)}x-x-----" ?song.4

*> space       courtyard size=1.3
>  speaker     0.5
`,
  };
}
