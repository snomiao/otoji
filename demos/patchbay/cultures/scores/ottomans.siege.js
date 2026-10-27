// Plevne Marşı: rebuilt from Hafız Aşir Efendi's 1903 record, the oldest recording of the song (tonic, makam in cents,
// pace and the tune's lines taken from the demucs voice stem with refs/analyse.py and a pyin transcription).
SCORES["ottomans:siege"] = {
  about: "Plevne Marşı, the folk lament for the soldiers who held Plevna through 1877, sung slowly by one voice in makam hicaz on E while the others take up the second and fourth lines",
  heard: "a trench in the redoubts on a December night: one man with a hafız's voice sings it slow and ornamented, a saz under it, the men around him join the answering lines; cold wind over the open ground and far guns now and then",
  refs: [{ title: "Plevne Marşı (1903 record)", who: "Hafız Aşir Efendi", url: "https://www.youtube.com/watch?v=HdKrFBohBYs" }],
  measured: "voice stem: tonic E (−10 cents), range E3–E5; it opens high on E5 and falls through F, C, A, G♯ to E4, then circles E4 with D♯ below and F above (the hicaz with a raised 7th, zirgüleli hicaz: about 0, 110, 390, 500, 700, 810, 1090 cents) and goes down to a low cadence with G natural (290) on E3; a weak pulse with a cell of about 0.43 s (we write eighths at 70 a minute), vibrato ≈10 cents, slides on one note in ten; the record is nearly all voice (the instrument stem is faint), spectrum peak 500–1000 Hz. The four lines follow the pyin transcription of the record's first verse, smoothed (octave slips corrected); the chorus, saz, wind and guns are the scene around it. Our render measures the same: tonic E, range E3–E5, degrees 0, 100, 390, 490, 690, 790, 1090, vibrato 12 cents; it is heavier below 250 Hz (the guns, wind and saz, against a record of voice alone), the hafız's voice now glides and scoops (glide=0.2, scoop=50), shakes on long notes (shake=0.2), presses a little (press=0.3) and turns round a few notes (5t): pyin on his stem against our voice alone gives gliding 29% against 28% of voiced time, scoops 0.41 against 0.50 a second (120 cents both), held-note shake ±20 against ±26 cents, and slow joins 39% against 64%. Still differs: his fast melismatic runs (several notes inside one syllable) are only hinted at by the turns, his nasal ring is not there (the record peaks at 500-1000 Hz, ours spreads to 1-4 kHz)",
  text: `
. clock        70 2/4
. arrange@song gece:4bars kita:20bars kita2:20bars son:4bars
. scale@hicaz  1 2:110 3:390 4:500 5:700 6:810 7:1090
. key          hicaz E

. caption@l1   "Tuna nehri akmam diyor, etrafımı yakmam diyor, / şanı büyük Osman Paşa Plevne'den çıkmam diyor" ?song.2-3
. wind@ayaz    0.3 gust=0.08Hz
. drums@top    kit=guns vol=0.35 "X......................................................................x........................................................|........................................x.......................x..............................x................................"
. chant@hafiz  voice=men bright=0.6 rubato=0.3 oct=4 grid=8 human=0.6 vib=0.02 breath=0.08 glide=0.2 scoop=50 shake=0.2 press=0.3 dyn="mf f mf mf f mf mp mf" ipa="tu na _ neh ri ak mam di jor e tɾa fɯ mɯ _ _ jak mam _ di _ jor ʃa nɯ by _ jyk _ os man _ pa _ ʃa plev ne _ den _ tʃɯk mam di _ _ jor aː _ _ _ _ _ _ _" "1't - - 2' 1' - 6 - 4t - 3 4 3t - 1 - 7, 1 - - 2t - 7, 6, 7, 1 2 1 6, 7, 1 - 6 1't - - 2' 1' 6 7 1' - 2' 1' 6 7 1' - 2 1 6, 7, 1 7, 6, 5,t - - 5, 6, 5, - - - 6, 5, 4, b3, 4, b3, 2, 1, - - - - - - - -" ?song.2-3
. chant@askerler voice=men voices=8 oct=4 grid=8 human=0.6 vib=0.02 breath=0.15 vol=0.6 glide=0.3 scoop=60 dyn="mf" ipa="e tɾa fɯ mɯ _ _ jak mam _ di _ jor plev ne _ den _ tʃɯk mam di _ _ jor" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7, 1 - - 2 - 7, 6, 7, 1 2 1 6, 7, 1 - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2 1 6, 7, 1 7, 6, 5, - - 5, 6, 5, - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.3
. pluck@saz    oct=3 grid=8 human=0.5 vol=1.1 dyn="mp p" "1' - - 2' 1' - 6 - 4 - 3 4 3 - 1 - 7, 1 - - 2 - 7, 6, 7, 1 2 1 6, 7, 1 - 6 1' - - 2' 1' 6 7 1' - 2' 1' 6 7 1' - 2 1 6, 7, 1 7, 6, 5, - - 5, 6, 5, - - - 6, 5, 4, b3, 4, b3, 2, 1, - - - - - - - -" ?song.2-3
. pluck@saz-son oct=3 grid=4 human=0.5 vol=0.5 dyn="p pp" "1 - - - 5, - - - 1 - - - - - - -" ?song.4

*> space       field size=1.2 wet=0.2
>  speaker     0.5
`,
};
