// Cheoyongmu (처용무): the masked dance of Cheoyong, who drove the plague spirit away with song and dance; heard here as the living court tradition plays it.
SCORES["koreans-early:plague"] = {
  about: "the dance of Cheoyong against the plague spirit: a slow court line on piri, daegeum and haegeum in the manner of the music that accompanies Cheoyongmu today, janggu and jwago marking the long beats, the dancers' men singing the changsa on held notes, the five masked dancers stepping",
  heard: "a moonlit night in Gyeongju during an epidemic: doors shut, sickness in the houses, almost nobody out; before a gate the masked dancers of the five directions move slowly in their red, blue, yellow, white and black robes, the musicians on mats beside them; the music is slow and grave rather than loud, a charm more than a show; the night is otherwise still",
  refs: [
    { title: "Cheoyongmu (처용무), National Gugak Center Saturday performance, 2016", who: "dancers and court musicians of the National Gugak Center (piri, daegeum, haegeum, janggu, jwago, changsa)", url: "https://www.youtube.com/watch?v=drS4Rq_E4eE" },
  ],
  measured: "a 150 s excerpt: the line moves among B D E G A (a five-note mode; A the most used step, phrases coming to rest on B), notes held 1–5 s, 0.75 onsets a second, vibrato ~5 cents on average with slow swells, a reed-and-flute band with the strongest band 0.5–2 kHz (2.6 kHz brightness), a hall with a long tail. Ours: G gong (G A B D E) with phrases resting on B and A, quarter = 40, melody written in the style of the accompaniment (not a transcription of Sujecheon or the dance suite), piri and daegeum in heterophony with slides into the long notes, haegeum, a men's changsa held on the main notes (now a sung chant voice on open vowels with held-note shading, shake=0.6, and slides between the notes, glide=0.3, for the court singers' nonghyeon; the sung text is not reproduced), janggu every beat group and jwago on the cycle's first beat, the dancers' steps; it is the living Joseon-era form of a dance first told of in 9th-century Silla, so the sound is later than the story. Rendered and measured: phrases end on B with the steps D E G A (310 510 800 1000 cents) as in the performance, notes of 2–5 s, 0.65 onsets a second against 0.75, brightness 2.1 kHz against 2.6 kHz, but almost no vibrato (1 cent against 5) and too much low drum (lowered). Still differs: the court winds' slow swells and drooping note-ends (nonghyeon), and the janggu's two different heads (the deep 'kung' and the sharp 'tta') are stood in for by the taiko kit",
  text: `
. clock        40 4/4
. arrange@song chum:12bars chum2:12bars
. key          gong G

. reed@piri    oct=4 grid=4 human=0.5 vol=0.7 dyn="mf mf f mf mf f mf mf f mf mp mp" "3~2 - - 3 5 - 6 - 3 - - - 2 - 1 2 3 - - - 6, - 1 - 2 - - 3 2~1 - - 3 - 5 6 5 - 3 - 2 - - - 3 - - - -" ?song.1-2
. flute@daegeum oct=5 grid=4 human=0.6 vol=0.45 dyn="mp mf" "(5)3 - - 3 (6)5 - 6 - 3 - - - (3)2 - 1 2 3 - - - 6, - 1 - (3)2 - - 3 2 - - - 3 - 5 6 (6)5 - 3 - 2 - - - 3 - - -" ?song.1-2
. strings@haegeum oct=4 grid=4 human=0.6 vol=0.45 "3 - - 3 5 - 6 - 3 - - - 2 - 1 2 3 - - - 6, - 1 - 2 - - 3 2 - - - 3 - 5 6 5 - 3 - 2 - - - 3 - - -" ?song.1-2
. chant@changsa voice=men voices=6 oct=3 grid=4 vol=0.6 vib=0.008 breath=0.15 glide=0.3 shake=0.6 dyn="p mp" ipa="a _ ʌ _ a _ ʌ _ a _ ʌ _" "3 - - - 5 - - - 3 - - - 2 - - - 3 - - - 6, - - - 2 - - - 2 - - - 3 - - - 5 - - - 2 - - - 3 - - -" ?song.2
. drums@janggu kit=taiko vol=0.35 "x.......x.......|....x.......x...|................" ?song.1-2
. drums@jwago  kit=taiko vol=0.4 "X...............................................................|................................................................|................................................................" ?song.1-2
. drums@chum   kit=taiko vol=0.12 "x...........x...|................|................" ?song.1-2

*> space       hall size=1.4 wet=0.3
>  speaker     0.5
`,
};
