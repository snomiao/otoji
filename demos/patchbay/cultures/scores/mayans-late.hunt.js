// Baile del Venado (Dance of the Deer): a son on chirimía and drum, after the 1945 field recording of K'iche' musicians (Folkways, Music of the Maya-Quiches of Guatemala).
SCORES["mayans-late:hunt"] = {
  about: "a son for the Dance of the Deer: the chirimía shawm circles its tonic with a note a quarter-tone above and the leading tone below, breaks off into high calls, while a drum keeps a three-beat step for the deer dancers, the hunters and their dogs",
  heard: "out in the plaza at a patron-saint fiesta: dancers in deer masks and pelts, hunters and old men with whips stalk them in a ring; people stand around, children laugh at the clowning, somebody calls out; copal smoke and the church wall behind",
  refs: [
    { title: "Baile del Venado (Deer Dance): Sones para el Baile del Venado", who: "A. Sicaltos and F. Alvarado, recorded by Henrietta Yurchenco, 1945 (Folkways)", url: "https://www.youtube.com/watch?v=FpVqxpXUqOQ" },
  ],
  measured: "1945 record, demucs 'other' stem: the shawm circles C with a neighbour about 60 cents above (a quarter-tone wobble, not a semitone), B 110 c and A 290 c below, and leaps up to high calls on about E, F♯, G♯ two octaves up (430, 590, 780 c); quick tonguings of 0.2–0.4 s around long notes of 0.7–2.2 s; about 110 in three; 1–2 kHz. Ours: scale@venado holds those cents, the son is rebuilt note by note from the stem's sequence (15 bars of 3/4 at 110), a drum in three under it, the fiesta crowd around. Render: about 112 (the record measures 112), rests on C, the +60 c neighbour and the low 830–1100 c notes all come through, harmonic 0.93. Still differs: ours peaks at 500 Hz–1 kHz and the record at 1–2 kHz (the real shawm is brighter and more nasal, with a wider vibrato); the deer dancers' rattles and the clowns' voices are not modelled",
  text: `
. clock        110 3/4
. arrange@song son:15bars son2:15bars
. scale@venado 1 2:60 3:430 4:590 5:780 6:910 7:1090
. key          venado C

. crowd@fiesta murmur "la ki xa ta wa ri ke cha ha ha" voices=14 voice=mixed vol=0.6 dyn="p mp p"
. crowd@calls  shout "e-YA" "................................................x---............................................................................................." voices=3 voice=men vol=0.9
. reed@chirimia oct=4 grid=8 human=0.5 rubato=0.25 drift=5 vol=0.45 dyn="f" "1 - - 1 1 - 2 6, 1 1 1 2 1 - - 7, 1 2 - - 1 1 - 1 1 6, 3'' - - - - - - - 3'' 2'' 1'' 1 - - - - 1 - 7, 7, 1 3'' - - - - - - - 1'' 1 - - 7, 1'' 5' - 4' - 5' 6, 5' - - 1'' 4' - 2 6, 1 2 - - 1 2 6, 7, 1 - - - - - -"
. drums@tambor kit=african vol=0.45 "X.......x...|....x.......|............"

*> space       courtyard size=2 wet=0.2
>  speaker     0.5
`,
};
