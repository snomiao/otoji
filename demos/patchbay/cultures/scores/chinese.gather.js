// 茉莉花 / 鲜花调: rebuilt from Wang Wanqing's (王万青) Yangzhou qingqu record of Xian Hua Diao, the old song Jasmine Flower grew from
// (singer's tonic, scale, range and pace measured with refs/analyse.py on demucs stems).
{
  // The tune in 简谱 on G gong (宫), one token an eighth in 2/4; phrases rest on 5 (D), as the record does.
  const A = "3 3 5 6 1' 1' 6 5 5 - 6 - 5 - - -";            // 好一朵茉莉花
  const B = "5 5 5 - 5 3 5 6 6 5 6 5 - - - -";              // 满园花草香也香不过它
  const C = "3 2 3 5 3 2 1 - 1 2 1 - - - - -";              // 奴有心采一朵戴
  const D = "3 - 2 1 6, 1 2 - 3 1 2 1 6, 5, - -";           // 又怕看花的人儿骂
  const E = "5, - 6, 1 2 3 1 2 1 6, 5, - - - - -";          // the band's tail after the words
  const verse = [A, A, B, C, D, E].join(" ");                // 24 bars of 2/4
  const sung = [A, A, B, C, D, "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0"].join(" ");
  const all = [A, A, verse, verse].join(" ");                // intro (the band plays the opening), then two verses
  // The pipa, sanxian and erhu each ornament the same line their own way (支声 heterophony):
  // the pipa rolls (轮指) its long notes, the erhu slides into them, the sanxian plays plain and low.
  const pipa = all.replace(/(^| )([1-7][',]*) - - -/g, "$1$2r - - -").replace(/(^| )5 - (?!-)/g, "$1(6)5 - ");
  const erhu = all.replace(/(^| )5 - /g, "$16~5 - ").replace(/(^| )1 - /g, "$12~1 - ");
  const lyrics1 = "xau i tuo _ mo li _ _ xua _ _ xau i tuo _ mo li _ _ xua _ _ man yan xua tsʰau ɕiaŋ ie ɕiaŋ pu kuo tʰa _ nu iou ɕin _ tsʰai i tuo tai _ _ iou pʰa kʰan xua _ tə ʐən _ ər _ ma _";
  const lyrics2 = "xau i tuo _ tɕin in xua _ _ xau i tuo _ tɕin in xua _ _ tɕin in xua kʰai lai xau pi kou kou ia _ nu iou ɕin _ tsʰai i tuo tai _ _ kʰan xua tə ʐən _ ər iau tɕiaŋ nu _ ma _";
  SCORES["chinese:gather"] = {
    about: "Jasmine Flower (茉莉花) as its older Yangzhou form, the Fresh Flower Tune (鲜花调), was sung in Jiangnan teahouses: a man singing to his own pipa, a small silk-string band following him",
    heard: "an upstairs teahouse in Yangzhou on a spring afternoon: tea bowls, a few regulars chatting until the singer starts; he sings in Yangzhou speech to his own pipa, sanxian, erhu and a yangqin follow the tune each in his own way (heterophony), a hardwood clapper (檀板) marks the bar and someone taps a saucer with chopsticks (敲碟子)",
    refs: [
      { title: "Xian Hua Diao 鲜花调 (Yangzhou qingqu, historic recording c. 1962)", who: "Wang Wanqing 王万青 (1899–1967), voice and pipa, with ensemble", url: "https://www.youtube.com/watch?v=baVB3MdJo9k" },
      { title: "茉莉花 (扬州清曲)", who: "Yangzhou qingqu singers, dialect performance", url: "https://www.youtube.com/watch?v=0clQppYdclc" },
    ],
    measured: "mix and voice stem: phrases rest on D, pitch set D E G A B (G-gong pentatonic resting on its 5th, within ~20 cents of 12-tone), male voice F#3–A#4, vibrato ~13 cents, about 1 note in 6 glides; ~152 eighths a minute (76 quarters, 2/4); the band stem is brighter (2 kHz centroid) and also rests on G/D; the percussion stem is thin high ticks (clapper and saucer), not drums; a dry small room. Ours: same key, scale, tempo and instruments; the traditional 六合 words in Mandarin IPA, not Yangzhou dialect; the singer's sliding Yangzhou ornaments are only partly given by the voice's glides and the erhu's slides. Render measured: tonic D, same five-note set, tempo ~144 (record ~152), brightness 1350 Hz (record 1380); ours still has ~7 dB more at 125–250 Hz and ~7 dB less at 1–2 kHz than the record (its singer's nasal, forward tone). Voice gestures (pyin on the singer's stem): Wang Wanqing joins his notes with slides (median transit 0.23 s, most over 0.12 s); ours now glides between notes (glide=0.45, transit 0.21 s) and leans into notes from below (scoop=50), which gives more of the Yangzhou sliding; his nasal, forward tone at 1–2 kHz is still missing",
    text: `
. clock        76 2/4
. arrange@song intro:8bars verse1:24bars verse2:24bars
. key          gong G

. caption@c1   "好一朵茉莉花，好一朵茉莉花 / 满园花草香也香不过它" ?song.2
. caption@c2   "好一朵金银花，好一朵金银花 / 奴有心采一朵戴，看花的人儿要将奴骂" ?song.3
. crowd@chaguan  murmur "ni hao tsa lai la ho i kou ma" voices=7 vol=1.2 dyn="mp p p p" ?song.1
. crowd@chaguan2 murmur "hao ia tsa a" voices=4 vol=0.7 dyn="p" ?song.2-3
. chant@wang   voice=men oct=3 grid=8 human=0.5 scoop=50 glide=0.45 vib=0.02 breath=0.12 dyn="mf mf mp mf f mf mp" ipa="${lyrics1} ${lyrics2}" "${sung} ${sung}" ?song.2-3
. pluck@pipa   oct=4 grid=8 human=0.5 vol=1.3 dyn="mf mp mp mf" "${pipa}" ?song.1-3
. pluck@sanxian oct=3 grid=8 human=0.4 vol=0.7 dyn="mp" "${all}" ?song.1-3
. strings@erhu oct=4 grid=8 human=0.5 vol=0.45 dyn="mp p p mp" "${erhu}" ?song.1-3
. pluck@yangqin oct=4 grid=8 human=0.4 vol=0.8 dyn="p" "${all}" ?song.1-3
. drums@tanban kit=opera vol=0.9 "x.......x.......|................|................" ?song.1-3
. drums@diezi  kit=temple vol=0.18 "................|....x.......x.x.|................" ?song.2-3

*> space       room size=1.4
>  speaker     0.5
`,
  };
}
