// Chopin's Marche funèbre (Piano Sonata No. 2, 1837–1839; public domain) as a Polish town hears it: played by the local brass band walking at the head of a funeral procession, the bass drum on the slow beats, the parish bell tolling, the mourners following on foot. The notes are Chopin's (theme, inner voice and the ostinato), laid out for band.
SCORES["poles:death"] = {
  about: "Marsz żałobny, the funeral march from Chopin's B-flat minor sonata, played by a brass band leading a funeral procession through a small town to the churchyard, the bell tolling",
  heard: "a narrow street of a Polish market town on a grey day: the orkiestra dęta (cornets, alto horns, trombones, a tuba and a bass drum with its beater muffled) walks slowly in front of the coffin, playing the march at walking pace; behind come the family and the townspeople, talking low; the parish church bell tolls from up the street; the sound is open air, bouncing off the house fronts",
  refs: [
    { title: "Marche funèbre (Piano Sonata No. 2), recorded 1933", who: "Alfred Cortot, piano", url: "https://www.youtube.com/watch?v=wkFsZ5QgebI" },
    { title: "Marsz żałobny \"Lekki odpoczynek\"", who: "Orkiestra Dęta OSP Sejny (a village fire-brigade band) at a funeral", url: "https://www.youtube.com/watch?v=qLyyGGGLQY4" },
    { title: "Chopin, Sonata Op. 35, 3rd movement (score in MIDI)", who: "piano-midi.de (Bernd Krüger), via Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Chopin_-_Funeral_March.mid" },
  ],
  measured: "Cortot's record: B-flat minor (heard a little sharp), the pulse slow and heavy (~55 to the quarter) with the dotted figure of the theme, a dull 78 top (brightness ~980 Hz) and a long hall tail; the Sejny band: brightness ~1490 Hz, energy at 250–2000 Hz, the band almost dry in the open air (rt60 ~1.7 s), dynamics steady (range 9 dB), vibrato ~5 c. Ours: Chopin's first eight bars from the score (theme on cornets an octave up, the inner F–G♭ on alto horns, the B♭/G♭ ostinato on trombones and tuba), 56 bpm, bass drum on 1 and 3, a bell every two bars, mourners murmuring, a street space; it differs in that a real band swells and drags a little on the dotted notes and its cornets have vibrato and a brassy edge our brass voice lacks. Our render measured: most-used note B♭, range F3–E5 for the upper band, brightness ~1260 Hz (the Sejny band 1490) with the energy at 250–1000 Hz, after trimming the tuba and drum that first swamped the low end; no vibrato at all where the band has ~5 c",
  text: `
. clock        56 4/4
. arrange@song dzwon:2bars marsz:8bars marsz2:8bars
. key          minor Bb

. caption@c1   "Marsz żałobny" ?song.2
. bell@dzwon   oct=3 grid=4 vol=0.5 "1 - - - - - - -" ?song.1-3
. crowd@zalobnicy murmur "ja-ka ma-ma bo-ze mo-ja pa-ni ve-ne po-ko-ju" voices=16 voice=mixed vol=0.6 dyn="mp p" ?song.1-3
. brass@kornety oct=4 grid=16 human=0.4 vol=1.2 dyn="mf mf f f f f mf mf mp mp mf mf f f mf mp" "1 - - - 1 - - 1 1 - - - 6, - - - 1 - - - 1 - - 1 1 - - - 6, - - - 1 - - - 1 - - 1 1 - - - 3 - - 2 2 - - 1 1 - - 1 1 - - - 6, - - - 3 - - - 3 - - 3 3 - - - 5 - - 4 5 - - 3 3 - - 3 3 - - - 6, - - - 1' - 7 - 7 - - 5 5 - - - 3 - - - 1' - 7 - 7 - - 5 5 - - - 3 - - -" ?song.2-3
. brass@altowki oct=3 grid=16 human=0.4 vol=0.5 dyn="mf mf f f f f mf mf mp mp mf mf f f mf mp" "5, - - - 6, - - 1 5, - - - 6, - - - 5, - - - 6, - - 1 5, - - - 6, - - - 5, - - - 6, - - 1 5, - - - 6, - - 2 5, - - 1 6, - - 1 5, - - - 6, - - - 5, - - - 6, - - 3 5, - - - 6, - - 2 5, - - 1 6, - - 1 5, - - - 6, - - - 1 - 7 - 1 - - 5 1 - - - 1 - - - 1 - 7 - 1 - - 5 1 - - - 1 - - -" ?song.2-3
. brass@puzony oct=2 grid=16 human=0.3 vol=0.45 dyn="mf mf f f f f mf mf mp mp mf mf f f mf mp" "5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - - 5,+1 - - - 6,+3 - - -" ?song.2-3
. brass@tuba   oct=2 grid=16 human=0.3 vol=0.35 "1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - - 1, - - - 3, - - -" ?song.2-3
. drums@beben  kit=orch vol=0.3 "x.......x.......|................|................" ?song.2-3

*> space       courtyard size=2.2 wet=0.25
>  eq          low=-6 mid=2 high=3
>  speaker     0.5
`,
};
