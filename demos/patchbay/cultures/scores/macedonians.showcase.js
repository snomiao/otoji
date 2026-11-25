// The orthios nomos at the Macedonian court: the high, stirring aulos piece that, the story goes, made Alexander leap up for his weapons; salpinx signals and the army's paean. The nomos is lost; this is a reconstruction on the aulos after Stefan Hagel's reconstructed instruments.
SCORES["macedonians:showcase"] = {
  about: "a banquet in the palace at Pella: the aulete Timotheus plays the orthios nomos, long high calls climbing into running figures, faster and higher; the king leaps up, weapons clatter, the guests shout; outside the salpinx sounds and the soldiers sing the paean",
  heard: "a lamp-lit banqueting hall of stone and plaster, couches along the walls, guests talking and laughing until the aulos starts and the room goes quiet; at the climax shouts and the clash of arms; then the courtyard outside, a trumpet signal and many men singing",
  refs: [
    { title: "Stefan Hagel plays the Hellenistic aulos", who: "European Music Archaeology Project, reconstructed aulos", url: "https://www.youtube.com/watch?v=OcHWvl16mpg" },
  ],
  measured: "Uncertain: the orthios nomos is lost; ancient writers say it was high-pitched and stirring and in the 'orthios' rhythm of long notes; the anecdote (Timotheus playing before Alexander) is told by later authors. This is a new reconstruction: long high calls in the Hypolydian (C D E F♯ G A B), climbing and speeding up (the section glides from 76 to 104), over a held lower pipe. Measured on Hagel's reconstructed aulos: sustained notes of up to 8 s alternating with quick figures, steady pitch, a soft 170 ms attack, harmonic 0.96. Ours: rendered, the aulos sits at 1–4 kHz and the dynamic arc rises steadily to the end (ff); the court's alalai war cry and clashing arms; salpinx signal and the soldiers' paean (ἰὴ παιάν). Still differs: the engine's reed holds the climbing line less clearly than written (a test scale showed octave slips on some notes in its middle register and about 10 c flat); there is no second pipe beating against the first Revision: the salpinx signal is now ff (the engine's natural-horn bell, raw and wavering, bites harder at ff), as ancient writers describe the war trumpet as harsh and piercing; there is no recording, so this is not measured.",
  text: `
. clock        76 4/4
. arrange@song banquet:2bars orthios:8bars@~104 alarm:2bars paean:4bars@88
. scale@hypolydian 1 2 3 #4 5 6 7
. key          hypolydian C

. caption@nomos "ὄρθιος νόμος" ?song.2
. crowd@guests murmur "ka la po te mi no se ha ha" voices=20 voice=men vol=0.8 dyn="mf p 0 0" ?song.1-2
. reed@aulos   oct=5 grid=8 human=0.4 rubato=0.2 vol=0.9 dyn="mf mf f f f ff ff ff" "5 - - - - - - - 5 - 6 - 7 - 1' - 1' - - - - - - - 7 6 5 4 5 - - - 5 - - - 6 - 7 - 1' - 2' - 3' - - - 2' 1' 7 1' 2' - 1' - 7 - 5 - - - - - 1' - - - - - - - 1' 2' 3' 2' 1' - 7 - 1' - 5 - 1' - 5 - 3' - - - 2' - 1' - 5 - 6 - 7 - 1' - 2' - 3' - 4' - 5' - 5' - - - - - - - 0 0 0 0 0 0 0 0" ?song.2
. reed@aulos-drone oct=4 grid=8 human=0.2 vol=0.3 dyn="p mp mf" "5 - - - - - - - - - - - - - - -" ?song.2
. drums@weapons kit=clash vol=0.7 human=0.5 "X...x.x.X..x....|..x.....x.......|x.......x.x....." ?song.3
. crowd@uproar shout "a-LA-LAI" "x-x-x---x-x-x---" voices=24 voice=men vol=1 ?song.3
. brass@salpinx oct=4 grid=8 human=0.2 vol=0.65 dyn="ff" "1 - - - 5 - - - 1' - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.4
. chant@soldiers voice=men voices=12 oct=3 grid=8 human=0.6 vib=0.02 breath=0.2 bright=0.5 dyn="f" ipa="i eː pai aːn i eː pai aːn i eː pai aːn i" "1 - 1 - 3 - 4 - 5 - - - 4 - 3 - 1 - 1 - 3 - 4 - 3 - - - 1 - - -" ?song.4

*> space       hall size=0.8 wet=0.25
>  speaker     0.5
`,
};
