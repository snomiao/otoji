// A boatman's bhatiali on the long reaches of the delta, the river of Chand Sadagar's fleet: written in the style of Abbasuddin Ahmed's 78 rpm bhatiali records (scale, contour, tempo and ornament measured), with our own words in the old formulas.
SCORES["bengalis:voyage"] = {
  about: "a bhatiali, the boatman's song of the downstream river: a long cry over the water, then lines that sink slowly to the low note, with the bansi flute and the dotara answering",
  heard: "on a wooden boat drifting down a wide river in the delta at evening: the water against the hull, the timbers creaking, wind in the reeds of the char; the boatman sings for himself and the far bank, a companion plays the bansi and plucks the dotara",
  refs: [
    { title: "O praner majhi (bhatiali), 78 rpm", who: "Abbasuddin Ahmed", url: "https://www.youtube.com/watch?v=JGTsS5mVmiQ" },
    { title: "Are o bhatiyal ganger naiya, 78 rpm", who: "Abbasuddin Ahmed", url: "https://www.youtube.com/watch?v=n4J8kfnxQm8" },
  ],
  measured: "Abbasuddin's 'O praner majhi' (voice stem): phrases come to rest on a Sa about 50 cents above E (written E); the scale is Sa, a low Re 170, komal ga 290, Ma 490, Pa 700, komal dha 800, komal ni 990, and the lines run ni, Sa ga ga Re Sa, then Sa ga Ma Pa Pa Ma ga Re and fall to the low ni before closing on Sa; voice D3-E4, light vibrato (~8 cents), the accompaniment pulses at about 129 eighths a minute (the clock is 64 with eighths). Ours: the same scale in cents, the same contour (high call falling to Sa, then the low-ni cadence), the eighth pulse on the dotara, and the measured scale comes back from our render within 10-20 cents. Still different: our verse is sparser (1.4 onsets a second against 2.9-4.4), the voice has no throat ornament (the quick kampan on held notes), and the river, boat and reeds are our addition: the record is a studio 78.",
  text: `
. clock        64 4/4
. arrange@song nodi:2bars dak:2bars gan:4bars dak2:2bars bhati:2bars
. scale@bhatiali 1 2:170 3:290 4:490 5:700 6:800 7:990
. key          bhatiali E

. caption@c1   "ও মাঝি রে" ?song.2
. caption@c2   "কোন ঘাটে লাগাইবা নাও / আমার বাড়ি দূর রে" ?song.3
. water@nodi   0.45 lap=0.5 splash=0.06
. boat@nouka   0.3 creak=0.35
. reeds@char   0.2 gust=0.06Hz
. flute@bansi  rubato=0.4 oct=5 grid=8 human=0.6 vol=0.7 dyn="mp mf" "5 - - - 6~5 - 4 - 3 - - - 2~1 - 1 -" ?song.1
. chant@majhi  rubato=0.5 voice=men oct=3 grid=8 human=0.7 vib=0.02 breath=0.14 dyn="f mf" ipa="o _ _ maː dʒʰi _ re" "1' - - - - - 7 6 5 - - - 4 3 2~1 -" ?song.2
. chant@majhi-gan rubato=0.25 voice=men oct=3 grid=8 human=0.7 vib=0.02 breath=0.12 dyn="mf mf mp p" ipa="kon gʰaː ʈe laː gai baː naːo _ aː maːr baː ɾi dur _ re o maː dʒʰi re _ _ o _ re" "7, 1 3~2 3 2 1 2 1 1 - 3 4 5 5 4~3 3 2 7, 7, - 1 2~1 1 7, 7, - - - 1 - - -" ?song.3
. flute@bansi-uttar oct=5 grid=8 human=0.6 vol=0.6 "0 0 0 0 0 0 5 4 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 2 3 2 1 -" ?song.3
. pluck@dotara oct=3 grid=8 human=0.5 vol=0.9 dyn="mp" "1 - 5, - 1 - 5, 1" ?song.2-4
. chant@majhi-dak2 rubato=0.5 voice=men oct=3 grid=8 human=0.7 vib=0.02 breath=0.14 dyn="f mp" ipa="o _ _ maː dʒʰi _ re" "1' - - - - - 7 6 5 - - - 4 3 2~1 -" ?song.4
. flute@bansi-bhati oct=5 grid=8 human=0.6 vol=0.6 dyn="mp p" "3 - 2 - 1 - 7, - 1 - - - - - - -" ?song.5

*> space       river size=1.4
>  speaker     0.5
`,
};
