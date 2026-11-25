// A choral song of Euripides' Orestes (408 BCE) in the enharmonic genus with the aulos, in the manner of the reconstructions of the Vienna papyrus (Armand D'Angour; Barnaby Brown on the Pydna aulos).
SCORES["athenians:showcase"] = {
  about: "the first stasimon of Orestes, κατολοφύρομαι: the chorus laments Orestes' madness in dochmiac rhythm on the enharmonic scale, with quarter-tone steps, led by a single aulos that preludes alone and then plays with the voices",
  heard: "the theatre of Dionysus on the slope of the Acropolis in daylight: thousands on the stone seats, quiet; the chorus of fifteen sings in unison as it dances in the orchestra, the aulete beside them, the sound open to the sky with the hillside behind",
  refs: [
    { title: "Orestes chorus sung (Dec 2016)", who: "Armand D'Angour (University of Oxford), reconstruction from the Vienna papyrus", url: "https://www.youtube.com/watch?v=hbhV7TmZAmo" },
    { title: "The Euripides Orestes Chorus", who: "European Music Archaeology Project, with a reconstruction of the Pydna aulos (Barnaby Brown)", url: "https://www.youtube.com/watch?v=_c2Ho9NvWY8" },
  ],
  measured: "Uncertain: the Vienna papyrus (c. 200 BCE) keeps only parts of seven lines, with gaps, plus instrumental notes; whether its music is Euripides' own is debated; this score does not copy the papyrus note by note but writes the opening words in its idiom: dochmiac rhythm (short-long-long-short-long, resolved into shorts on κατολοφύρομαι) and the enharmonic genus, lines coming to rest on the mese. Measured: the EMAP performance (voice and Pydna aulos) uses about 0, 90 | 520, 690, 770 cents over F♯ — two pykna a fourth apart with a quarter-tone filling — at about 1.5 notes a second, 250 Hz–2 kHz; D'Angour sings with a 60-cent step (700/760). Ours: scale@enharmonic (E, E+50, F, A, B, B+50, C); rendered it measures 30, 120 | 520, 730, 830 c, phrases resting on A, 1.85 notes a second, the same 250 Hz–2 kHz shape. Still differs: the aulos is the engine's double reed (one tone; the real instrument's two pipes beat against each other and the reed is louder and buzzier); the quarter-tones are heard more cleanly than a sung chorus would place them",
  text: `
. clock        84 4/4
. arrange@song anakrousis:4bars stasimon:8bars antistrophe:8bars
. scale@enharmonic 1 2:50 3:100 4:500 5:700 6:750 7:800
. key          enharmonic E

. caption@text "κατολοφύρομαι, κατολοφύρομαι· ματέρος αἷμα σᾶς, ὅ σ' ἀναβακχεύει· / ὁ μέγας ὄλβος οὐ μόνιμος ἐν βροτοῖς" ?song.2-3
. crowd@theatre murmur "ka la po te mi no se" voices=20 voice=men vol=0.5 dyn="p pp" ?song.1
. reed@aulos   oct=4 grid=8 human=0.4 rubato=0.3 vol=0.6 dyn="mf" "4 - - - 3 2 1 - 4 - - - 5 6 7 - 6 - 5 - 4 - - - 1 2 3 - 4 - - -" ?song.1
. reed@aulos-tune oct=4 grid=8 human=0.4 rubato=0.15 vol=0.45 dyn="mf" "6 7 6 5 4 - 4 - 1' 7 6 5 6 - 5 - 4 5 - 6 - 5 4 - 3 4 - 2 - 1 4 - 5 7 - 6 - 5 4 - 4 6 - 7 - 6 5 - 6 - 5 - 3 - 4 - 0 0 0 0 0 0 0 0" ?song.2-3
. reed@aulos-second-pipe oct=4 grid=8 human=0.3 vol=0.22 "4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - -" ?song.2-3
. chant@chorus voice=men voices=12 oct=3 grid=8 human=0.5 rubato=0.15 vib=0.015 breath=0.12 bright=0.4 dyn="mf f mf mf f f mf mp" ipa="ka to lo pʰy ro mai ka to lo pʰy ro mai ma te ros hai ma sɑːs hos a na bak kʰeu ei ho me ɡas ol bos uː mo ni mos en bro tois" "6 7 6 5 4 - 4 - 1' 7 6 5 6 - 5 - 4 5 - 6 - 5 4 - 3 4 - 2 - 1 4 - 5 7 - 6 - 5 4 - 4 6 - 7 - 6 5 - 6 - 5 - 3 - 4 - 0 0 0 0 0 0 0 0" ?song.2-3

*> space       theatre size=2.5 wet=0.15
>  speaker     0.5
`,
};
