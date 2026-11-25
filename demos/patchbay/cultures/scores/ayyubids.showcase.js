// Hurrian hymn h.6 (to Nikkal): after Richard Dumbrill's reading of the Ugarit tablet, sung with a lyre (the voice's line
// transcribed with pyin from the demucs voice stem of his recording; tonic and pace measured with refs/analyse.py).
SCORES["ayyubids:showcase"] = {
  about: "the Hurrian hymn to Nikkal from Ugarit (tablet h.6, about 1400 BCE), the oldest melody known, sung by a woman over the dyads of a lyre",
  heard: "the courtyard of a temple at Ugarit in the evening: a singer stands before the goddess's shrine with a lyre player, the stone walls throw the song back, a few people have come with offerings and stand quiet",
  refs: [
    { title: "H6 Hurrian song (new version)", who: "Richard Dumbrill (reading of the tablet), voice and lyre", url: "https://www.youtube.com/watch?v=gynhfxQ1IO4" },
    { title: "Hurrian Hymn no. 6 for solo lyre", who: "Michael Levy, reconstructed lyre", url: "https://www.youtube.com/watch?v=DBhB9gRnIHE" },
  ],
  measured: "a scholarly reconstruction (the tablet gives the lyre's dyads in Babylonian string names; readings differ: Kilmer, West, Dumbrill). Dumbrill's recording: tonic C♯ (phrases end there), the voice C♯4–C♯5 with wide vibrato (≈15 cents) and many slides (one note in four); a slow, loose pulse of about 0.45 s per note; it circles G♯ and G (its most-used pitch is 625 cents up) with a chromatic falling figure A–G♯–G–E–D♯ and climbs by G♯–A♯–B to a long C♯5. Our voice line is the pyin transcription of his first two minutes, cleaned to semitones; the lyre plays fifths and fourths on the tonic and 5th (the tablet's dyads), not his accompaniment; the words are vowels and the goddess's name, since the Hurrian text is only partly understood. Our render: tonic C♯, range D4–D5 (his C♯4–C♯5), vibrato 15 cents like his, the same loose pulse (clarity 0.08 against 0.09); 1–2 kHz is 12 dB weaker than in his recording (brightness 1650 Hz against 1890) and the lyre is a plucked harp model, softer than his gut strings",
  text: `
. clock        67 4/4
. arrange@song hymn:20bars
. key          major C#

. caption@title "Hurrian hymn to Nikkal · Ugarit, c. 1400 BCE" ?song.1
. chant@qadishtu voice=women oct=4 grid=8 human=0.5 rubato=0.3 bright=0.4 vib=0.035 breath=0.12 dyn="mp mf mf f mf mp" ipa="nik kal a e a _ e a i a _ e a _ o a _ e a e a _ e a i a _ e a _ o a _ e a e a _ e a i a _ e a _ o a _ e a e a _ e a i a _ e a _ o a _ e a e a _ e a i a _ e a _ o a _ e a e a _ e a i a _ e a" "b6 5 #4 b3 2 - - - - b3 #4 b6 5 #4 2 - - - - #4 5 6 - b7 1' - - - - - - - - 6 - 1' - - 5 6 7 #4 5 6 - - b3 #4 5 - - b3 3 #4 - - - - 5 - - 1' 7 b6 5 4 3 4 5 - - 3 2 4 - - b7 b6 5 4 3 7 1' 2' - - b7 7 1' - - - 5 6 7 #4 5 6 - - 3 4 b6 - - - - 2 3 4 b7 b6 5 3 - 4 b6 6 - 4 - - b6 - 4 b6 6 - 4 b6 - - 4 b6 6 - 4 - b6 - #4 b3 4 - - - - - #4 5 b3 - 1 - - - - - - -" ?song.1
. pluck@kinnor oct=3 grid=8 human=0.4 vol=1.6 dyn="mp" "1+5 - - - - - - - 1+5 - - - 5,+2 - - - 4,+1 - - - - - - - 5,+1 - - - - - - -" ?song.1
. crowd@sanctuary murmur "na ki la ba sha ru" voices=4 vol=0.3 dyn="pp" ?song.1

*> space       courtyard size=1.3 wet=0.3
>  speaker     0.5
`,
};
