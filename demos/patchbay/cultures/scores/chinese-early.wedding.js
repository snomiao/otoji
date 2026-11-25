// 鳳求凰: the qin song as the Ming handbook 西麓堂琴統 (1549) keeps it, sung to the qin at a feast. Line, tonic and pace
// from Fushimi Muka's (伏見无家) qin with Wang Tianyi (王天藝) singing (voice on a demucs stem); qin timbre after Chen Changlin.
{
  // 简谱 in the yu mode (羽调) on D#: 1 3 4 5 7 = D# F# G# A# C#. One token an eighth at ♩ = 61, as sung (~2 s a syllable).
  const L1 = "1 - 1 3 1 1 - - 4 - - 5 4 3 1 - - - 7, - 1 5 5, - - 3 1 1 - - - -";
  const L2 = "4 5 4 - 4 - 1 - 1 - 1 1 - - 3 - 4 4 3 1 - - 5 3 - 1 - 1 - 3 1 1 - - - - - - - -";
  const L3 = "7, - 7, - 5, - 4 - 5, - - 4 - 5 4 4 - - 3 1 - 1 - - - - - - - - - -";   // the qin alone between couplets
  const rest = (s) => s.split(" ").map(() => "0").join(" ");
  const sung = [L1, L2, rest(L3)].join(" ");
  const verse = [L1, L2, L3].join(" ");
  // A syllable starts each group of notes; _ carries its vowel through the melisma.
  const w1 = "fəŋ _ _ _ ɕi fəŋ _ _ _ ɕi kuei _ ku _ ɕiaŋ _ _ au _ _ iou sɨ xai _ _ tɕʰiou _ _ _ _ tɕʰi _ xuaŋ _ _ _ _";
  const w2 = "iou _ ian _ _ ʂu _ ny _ _ tsai _ kuei _ faŋ _ _ ʂɨ _ _ ər ʐən ɕia _ _ tu _ _ _ _ wo _ tʂʰaŋ _ _ _ _";
  // the qin's interlude in harmonics (泛音) the second time
  const qin = `${verse} ${L1} ${L2} ${L3.replace(/(^| )([1-7])(,?)(?= )/g, "$1$2$3h")}`;
  SCORES["chinese-early:wedding"] = {
    about: "The Phoenix Seeks His Mate (鳳求凰), the qin song said to be Sima Xiangru's, sung to the qin at Zhuo Wangsun's feast in Linqiong while Zhuo Wenjun listens behind a screen: the melody as a Ming qin handbook keeps it, since the Han tune is lost",
    heard: "a lamp-lit hall of a rich house at night, guests at their wine talking low until the poet tunes the qin; then he sings, close and quiet, one or two notes to a word, the qin following the voice in unison and playing alone between the couplets, the second time in harmonics; the room is small and warm",
    refs: [
      { title: "鳳求凰 『西麓堂琴統』 (qin and voice)", who: "伏見无家 Fushimi Muka, qin; 王天藝 Wang Tianyi, voice", url: "https://www.youtube.com/watch?v=derMIlZ0cJ8" },
      { title: "凤求凰 (西麓堂琴统, 陈长林打谱)", who: "陈长林 Chen Changlin, Min school qin", url: "https://www.youtube.com/watch?v=eFU0DflUVuk" },
    ],
    measured: "voice stem: rests on D#, sings only D# F# G# A# C# (the yu pentatonic, 12-tone within ~10 cents), F#3–D5, slow: about one syllable every two seconds with melismas of two to five notes; the qin (both recordings) is dark (0.85–1.05 kHz centroid) and strong under 250 Hz, with a long room tail. The Han melody is lost: this is the 1549 handbook's tune; we set the first couplet's notes as sung and reuse them for the second couplet, where the handbook goes on with new music. Render: rests on D#, the same five notes, brightness 0.97 kHz (refs 0.85–1.05), 125–500 Hz strong as in the refs; but our qin is ~14 dB weaker under 125 Hz than the real one even played an octave down, and it has no sliding stopped notes (吟猱, 上下), which are half the qin's sound",
    text: `
. clock        61 4/4
. arrange@song feast:4bars verse1:13bars verse2:13bars
. key          yu D#

. caption@c1   "鳳兮鳳兮歸故鄉，遨遊四海求其凰" ?song.2
. caption@c2   "有豔淑女在閨房，室邇人遐毒我腸" ?song.3
. crowd@guests murmur "ni ha shi lai ya ho" voices=8 vol=2 dyn="mp mp p 0" ?song.1
. crowd@guests2 murmur "ha ya" voices=3 vol=1 dyn="p" ?song.2-3
. pluck@qin    oct=2 grid=8 human=0.5 vol=1.6 dyn="mp mf mp mp mf mp p" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1, - 5, - 1 - - - ${qin}" ?song.1-3
. chant@xiangru voice=men oct=3 grid=8 human=0.4 vib=0.015 breath=0.1 dyn="mp mf mp mf mp" ipa="${w1} ${w2}" "${sung} ${sung}" ?song.2-3

*> space       room size=1.6
>  speaker     0.5
`,
  };
}
