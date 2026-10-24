// Taghribat Bani Hilal: rebuilt from Sayed el-Dawy's singing of the Hilali epic (the voice's tetrachord and the rababa's
// figure measured with refs/analyse.py on demucs stems of the ElWady Records recording).
SCORES["saracens:voyage"] = {
  about: "the Sira Hilaliyya, the epic of the Banu Hilal's long journey west, sung line by line by a poet to his own rababa, the way the Upper Egyptian poets still sing it night after night",
  heard: "a guest room off a village courtyard in Upper Egypt at night: men sit on benches along the walls, the poet sings the tale of Abu Zayd and al-Jaziya to the two-string rababa while a tar keeps a soft beat, and the listeners call out between his lines",
  refs: [{ title: "al-Zanati Khalifa wa Abu Zayd al-Hilali (Sirat Bani Hilal)", who: "Sayed el-Dawy, poet and rababa, Qus (ElWady Records)", url: "https://www.youtube.com/watch?v=HX3NLj9PSYQ" }],
  measured: "voice stem: tonic B♭ (+20 cents), A3–D4, nearly all of it inside one tetrachord: the tonic, a neutral 2nd about 150–160 cents up, a minor 3rd about 280–290 and the 4th (maqam bayati), syllabic recitation in even notes on a pulse of 0.51 s (117 a minute) with each line coming to rest on the tonic, vibrato ≈12 cents, one note in eight slides; the rababa (instrument stem) stays on the tonic and its two neighbours (145 and 265 cents) and fills between lines; a low frame drum (0–250 Hz) taps lightly. The words are the narrator's formula, the heroes' names, the epic's title and the traditional vocables yā layl yā ʿayn, not a transcription of el-Dawy's verses (the voice cannot say the pharyngeal ʿayn, so ʔ stands in). Our render: tonic B♭, range G3–D4, the same tetrachord (140, 280, 480 cents) and the 117 pulse; ours peaks at 250–500 Hz where the record (a close, nasal voice and a scratchy rababa) is strongest at 500–2000 Hz, and our pulse is much steadier (clarity 0.6 against 0.1)",
  text: `
. clock        117 4/4
. arrange@song lazma:2bars sira:8bars lazma2:2bars sira2:8bars
. scale@bayati 1 2:155 3:290 4:500 5:700 6:790 7:1000
. key          bayati Bb tune=20

. caption@title "تغريبة بني هلال" ?song.2
. crowd@dawwar murmur "ja sa la ma ha bi ba na we la" voices=10 vol=0.6 dyn="mp p" ?song.1
. crowd@sammiin shout "ja sa-LAAM" pattern="........................................x-x---.................................................................................." voices=6 vol=0.5 ?song.4
. chant@shaer  voice=men oct=3 grid=8 human=0.5 rubato=0.2 bright=0.6 vib=0.03 breath=0.1 dyn="f mf f mf" ipa="qaːl ir raː wi jaː leːl jaː ʔeːn _ _ ʔa bu zeːd il hi laː li sa laː ma _ wil ʒaː zja jaː leːl jaː ʔeːn _ _ _ ta ɣri bit ba ni hi laːl _ _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 3 3 2 3 4 3 2 2 1 - - - - 0 0 4 4 4 3 4 5 4 3 3 2 1 - - - 0 0 3 3 2 3 4 3 2 1 2 - 1 - - - 0 0 4 4 3 2 3 2 1 7, 1 - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 3 3 2 3 4 3 2 2 1 - - - - 0 0 4 4 4 3 4 5 4 3 3 2 1 - - - 0 0 3 3 2 3 4 3 2 1 2 - 1 - - - 0 0 4 4 3 2 3 2 1 7, 1 - - - - - 0 0" ?song.1-4
. strings@rababa oct=3 grid=8 human=0.5 vol=0.8 dyn="mf mp" "1 2 1 - 7, 1 2 3 2 1 2 3 2 1 7, 1" ?song.1-4
. drums@tar    kit=daf vol=0.35 human=0.5 "x.......x.x.....|....x.......x...|................" ?song.1-4

*> space       room size=1.1 wet=0.2
>  speaker     0.5
`,
};
