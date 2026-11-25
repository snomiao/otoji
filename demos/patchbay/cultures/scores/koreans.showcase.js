// Yeomillak (여민락), 'joy shared with the people': Sejong's court music, once sung to the Songs of the Dragons Flying to Heaven, now played by the full court ensemble.
SCORES["koreans:showcase"] = {
  about: "Yeomillak in the manner of its first section: a very slow line in pyeongjo on piri, daegeum and haegeum, the geomungo and gayageum plucking its main notes, the ajaeng beneath, janggu and jwago on the long rhythmic cycle and the bak to open and close",
  heard: "a royal banquet in the stone courtyard of the main palace hall: officials in rows on the ranked stones, the king on the raised terrace, the court ensemble seated on mats in the yard under an awning; the music is unhurried and stately, every note held and swelled; nobody talks while it plays",
  refs: [
    { title: "Yeomillak (與民樂), recorded by Robert Garfias", who: "court musicians of the Korean classical music institute (Garfias's field recording, archived by Seoul National University)", url: "https://www.youtube.com/watch?v=e_33okwA6pQ" },
    { title: "Yeomillak, Saturday performance 2015", who: "National Gugak Center court ensemble", url: "https://www.youtube.com/watch?v=XrM3enMLd1w" },
  ],
  measured: "Garfias recording (first 3 minutes): the line rests on E (a little below, -30 c on the recording), steps E F# A B C# (0 190 500 690 880 cents: pyeongjo, the sol-mode), notes held 1.5–5 s, only 0.5 onsets a second, vibrato ~4 cents on average but slow swells on held notes, a heavy low end from the janggu and jwago (the 0–250 Hz bands as strong as the winds), brightness 2.8 kHz. Ours: pyeongjo on E (1 2 4 5 6), quarter = 36 so the notes last 2–7 s, a melody written in the style of the first section (Yeomillak's own notes are not reproduced), the three winds in heterophony with slides, geomungo and gayageum on the main notes, ajaeng an octave down, the janggu and jwago marking the long cycle, bak at both ends. Rendered and measured: the same five pitches (E F# A B C#), notes of 2–13 s, 0.4 onsets a second against 0.5, vibrato 1.5 cents against 4, brightness 1.8 kHz against 2.8 kHz; the analyser hears our line centred on B (the long low B in the middle of the phrase) where the recording centres on E. Still differs: the slow swell and bend on each held wind note, the geomungo's struck-and-slapped stick sound (suldae) is only a pluck, and the janggu/jwago low end is lighter than on the record",
  text: `
. clock        36 4/4
. arrange@song bak:1bars il:12bars il2:12bars bak2:1bars
. scale@pyeongjo 1 2:190 4 5 6:880
. key          pyeongjo E

. drums@bak    kit=temple vol=1.2 "................|................|x.......x.......x..............." ?song.1
. reed@piri    oct=4 grid=4 human=0.5 vol=0.7 dyn="mf mf f mf mf f f mf mf mf mp mp" "1 - - 2 4~2 - 1 - 5, - - - 6, - 1 - 2 - - - 4 - 5 - 4~2 - - 1 2 - - - 5 - 6 - 5 - - 4 2 - 4 - 1 - - -" ?song.2-3
. flute@daegeum oct=5 grid=4 human=0.6 vol=0.45 dyn="mp mf" "(2)1 - - 2 4 - 1 - 5, - - - 6, - (2)1 - 2 - - - (5)4 - 5 - 4 - - 1 2 - - - (6)5 - 6 - 5 - - 4 2 - 4 - (2)1 - - -" ?song.2-3
. strings@haegeum oct=4 grid=4 human=0.6 vol=0.45 "1 - - 2 4 - 1 - 5, - - - 6, - 1 - 2 - - - 4 - 5 - 4 - - 1 2 - - - 5 - 6 - 5 - - 4 2 - 4 - 1 - - -" ?song.2-3
. strings@ajaeng oct=3 grid=4 human=0.5 vol=0.6 "1 - - - 4 - - - 5, - - - 6, - - - 2 - - - 4 - - - 4 - - - 2 - - - 5 - - - 5 - - - 2 - - - 1 - - -" ?song.2-3
. pluck@geomungo oct=2 grid=4 human=0.4 vol=1.2 "1 0 0 0 4 0 0 0 5, 0 0 0 6, 0 0 0 2 0 0 0 4 0 0 0 4 0 0 0 2 0 0 0 5 0 0 0 5 0 0 0 2 0 0 0 1 0 0 0" ?song.2-3
. pluck@gayageum oct=3 grid=4 human=0.4 vol=1.6 "0 0 1 0 0 0 1 0 0 0 5, 0 0 0 1 0 0 0 2 0 0 0 5 0 0 0 1 0 0 0 2 0 0 0 6 0 0 0 4 0 0 0 1 0 0 0 0 0" ?song.2-3
. drums@janggu kit=taiko vol=0.35 "x...............x...............|........x...............x.......|................................" ?song.2-3
. drums@jwago  kit=taiko vol=0.5 "X...............................................................|................................................................|................................................................" ?song.2-3
. drums@bak2   kit=temple vol=1.2 "................|................|x.......x.......x..............." ?song.4

*> space       courtyard size=2.6 wet=0.28
>  speaker     0.5
`,
};
