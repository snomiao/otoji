// The Birth of Vahagn, the ancient song whose words Movses Khorenatsi preserved: sung to its own text in the manner of
// Armenian monodic chant with a held drone, after Lusine Zakaryan's recording of medieval sharakans (mode, tonic, ornament
// and pace measured with refs/analyse.py), and accompanied by a bowed bambir as Khorenatsi heard the bards of Goghtn sing it.
SCORES["armenians:birth"] = {
  about: "Vahagni tsnunde, the Birth of Vahagn: heaven and earth and the purple sea in labour, a red reed burning, and a boy running out of the flame with hair of fire and eyes like suns, chanted over a drone",
  heard: "a winter evening at a feast in Goghtn: an old gusan sings the ancient words to his bowed bambir while two others hold the drone under him, and the hall listens to a song older than anyone can say",
  refs: [{ title: "Armenian Medieval Spiritual Music (sharakans)", who: "Lusine Zakaryan (1995)", url: "https://www.youtube.com/watch?v=G4x6mUEJhoM" }],
  measured: "a reconstruction: the ancient tune is lost, only the words survive (in Khorenatsi's History), so the nearest living Armenian monody stands in. Zakaryan's sharakans: the line rests on a final a little flat of C♯ and hovers on the step above it (≈165–180 cents, the most-used pitch), with the 3rd and 4th about 370 and 480 cents up (a narrow, non-tempered tetrachord); each note held long with slow onsets (160 ms), wide vibrato (≈17 cents) and slides on one note in four; a long church tail (rt60 ≈ 10 s). Our gusan recites the seven lines of the text on that tetrachord, rising to the 4th and 5th at 'flame' and 'suns' and closing each line 2 → 1, over a drone on the final; the text is Classical Armenian in IPA. Our render: final C♯, the voice C♯4–F4 resting mostly on the step above the final and the 3rd (180 and 370 cents, as hers), the drone's long tail in the hall; our vibrato is 9 cents against her 17 and our notes are shorter and more syllabic than her long melismatic ones, and a man's voice an octave under hers",
  text: `
. clock        66 4/4
. arrange@song erg:18bars
. scale@dzayn  1 2:175 3:370 4:480 5:700 6:850 7:990
. key          dzayn C# tune=-30

. caption@l1   "Երկնէր երկին, երկնէր երկիր, երկնէր և ծովն ծիրանի" ?song.1
. chant@gusan  voice=men vol=0.7 oct=4 grid=8 human=0.5 rubato=0.3 bright=0.5 vib=0.04 breath=0.1 dyn="mf mf f mf f f ff mf" ipa="jer knɛr jer kin jer knɛr jer kir jer knɛr jev tsovn tsi ra ni jerkn i tso vun u nɛr jev zkar mrikn je ɣeg nik ənd je ɣe gan pʰoɣ tsux je la nɛr ənd je ɣe gan pʰoɣ botsʰ je la nɛr jev i bo tsʰojn va zɛr xar tjaʃ pa ta ne kik na hur her u nɛr a pa tʰɛ botsʰ u nɛr mo rus jev atʃʰ kunkʰn ɛin a _ re ga kunkʰ" "2 3 1 3 - 3 3 2 2 - 3 - 2 1 3 3 - 2 1 - - - - 0 0 2 - 3 1 3 3 - 2 3 - 2 2 3 2 1 - - - 0 0 2 3 2 - 2 3 - 2 2 2 - 1 - - - - 0 0 2 2 4 2 (3)4 - 3 3 2 1 - - - - 0 0 2 2 - 2 - 1 3 3 3 - 3 3 1 - 2 1 - - - - 0 0 2 3 2 - 2 3 2 - (3)4 - 3 - 3 - 3 3 2 - 1 - - - - 0 0 3 2 3 3 (4)5 - 4 2 2 - 1 - - - 0 0 0 0" ?song.1
. chant@dam    voice=men voices=2 oct=3 grid=8 human=0.3 vol=0.3 vib=0.006 breath=0.12 ipa="o _ o _" "1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - - 1 - - - - - - -" ?song.1
. strings@bambir oct=3 grid=8 human=0.5 vol=0.45 dyn="mp" "1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 - 1 - 5, - 1 - 2 - 1 - - - 7, - 1 -" ?song.1

*> space       hall size=1.2 wet=0.3
>  speaker     0.5
`,
};
