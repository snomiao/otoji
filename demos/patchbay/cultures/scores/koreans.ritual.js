// Jongmyo Jeryeak (종묘제례악): the royal ancestral rite music, slow and grave, bronze bells and stone chimes under the piri's line.
SCORES["koreans:ritual"] = {
  about: "music of the Jongmyo royal ancestral rite in the manner of Botaepyeong: the bak clapper opens, piri, daegeum, haegeum and ajaeng play one slow line together with its swells and falling ends, pyeonjong and pyeongyeong mark every note, jeolgo and janggu the phrases, men's voices hold the akjang",
  heard: "outdoors at dawn on the broad stone terrace before the long shrine hall of Jongmyo in Hanyang: the court musicians in red robes on the upper and lower terraces, the officiants moving slowly with the offerings, the dancers in rows; no one speaks, only the music and the steps on stone; the sound spreads across the stone yard and the hall's long wooden front throws it back",
  refs: [
    { title: "Jongmyo Jeryeak, Botaepyeong: Huimun, Gimyeong, Gwiin (종묘제례악 보태평 중 희문, 기명, 귀인)", who: "court musicians, Gugak Broadcasting (National Gugak Center tradition)", url: "https://www.youtube.com/watch?v=wwbakPVo3p0" },
  ],
  measured: "Botaepyeong excerpt (5 minutes): the line rests on D, steps D F G A C (0 320 510 700 1020 cents: a five-note mode, the fourth step a little wide), notes held 1–5 s, only 0.7 onsets a second, little vibrato on average (~4 cents: the swells and falling ends are slow), a bright reed-led band (2.8 kHz, strongest 0.5–4 kHz), a long outdoor tail with a noisy floor. Ours: the same mode on D at a slow 48, a melody written in the style of the court line (Jongmyo's own notes are not reproduced), piri leading with slides into held notes and falling ends, daegeum and haegeum in heterophony, ajaeng an octave below, every main note struck on pyeonjong and pyeongyeong, bak at the start and the end, jeolgo every phrase; the akjang text is not sung (a held men's choir instead), since we could not confirm its words. Rendered and measured: steps 330 520 710 1030 over D against the court band's 320 510 700 1020, notes held 2–9 s, 0.5 onsets a second against 0.7, vibrato 4 cents as measured; darker (1.8 kHz against 2.8 kHz). Still differs: the piri's characteristic wide swell-and-drop on each held note (nonghyeon) and the stone chimes' dry clink",
  text: `
. clock        48 4/4
. arrange@song bak:1bars akgok:16bars akgok2:16bars bak2:1bars
. scale@botaepyeong 1 b3:320 4:510 5 b7:1020
. key          botaepyeong D

. drums@bak    kit=temple vol=1.2 "................|................|x.......x.......x..............." ?song.1
. reed@piri    oct=4 grid=4 human=0.5 vol=0.7 dyn="mf mf f mf mf mf f mf mf mf f mf mf mf mp mp" "5~4 - - 4 3 - 4 - 5 - - - 1' - 7 5~4 4 - - 3 1 - 3 4 5 - - - 4 - 3~1 - 1 - - - 3 - 4 - 5 - 4 3 1 - - - 7, - 1 - 3 - 1 - 1~7, - - - - - - -" ?song.2-3
. flute@daegeum oct=5 grid=4 human=0.6 vol=0.5 dyn="mp mf" "(7)5 - - 4 3 - (5)4 - 5 - - - 1' - 7 5 4 - - 3 1 - (4)3 4 5 - - - 4 - 3 - 1 - - - 3 - (5)4 - 5 - 4 3 1 - - - 7, - 1 - 3 - 1 - 1 - - - - - - -" ?song.2-3
. strings@haegeum oct=4 grid=4 human=0.6 vol=0.5 dyn="mp" "5 - - 4 3 - 4 - 5 - - - 1' - 7 5 4 - - 3 1 - 3 4 5 - - - 4 - 3 - 1 - - - 3 - 4 - 5 - 4 3 1 - - - 7, - 1 - 3 - 1 - 1 - - - - - - -" ?song.2-3
. strings@ajaeng oct=3 grid=4 human=0.5 vol=0.6 dyn="mp" "5 - - - 3 - - - 5 - - - 1' - - - 4 - - - 1 - - - 5 - - - 4 - - - 1 - - - 3 - - - 5 - - - 1 - - - 7, - - - 3 - - - 1 - - - - - - -" ?song.2-3
. bell@pyeonjong oct=4 grid=4 vol=0.6 "5 0 0 4 3 0 4 0 5 0 0 0 1' 0 7 5 4 0 0 3 1 0 3 4 5 0 0 0 4 0 3 0 1 0 0 0 3 0 4 0 5 0 4 3 1 0 0 0 7, 0 1 0 3 0 1 0 1 0 0 0 0 0 0 0" ?song.2-3
. bell@pyeongyeong oct=5 grid=4 vol=0.35 "5 0 0 0 3 0 0 0 5 0 0 0 1' 0 0 0 4 0 0 0 1 0 0 0 5 0 0 0 4 0 0 0 1 0 0 0 3 0 0 0 5 0 0 0 1 0 0 0 7, 0 0 0 3 0 0 0 1 0 0 0 0 0 0 0" ?song.2-3
. drums@jeolgo kit=taiko vol=0.7 "X...............................................................|................................................................|................................................x..............." ?song.2-3
. choir@akjang oct=3 grid=4 vol=0.9 dyn="p mp" "5 - - - - - - - 1' - - - 5 - - - 4 - - - 1 - - - 5 - - - 4 - - - 1 - - - - - - - 5 - - - 1 - - - 7, - - - - - - - 1 - - - - - - -" ?song.3
. drums@bak2   kit=temple vol=1.2 "................|................|x.......x.......x..............." ?song.4

*> space       courtyard size=2.4 wet=0.3
>  speaker     0.5
`,
};
