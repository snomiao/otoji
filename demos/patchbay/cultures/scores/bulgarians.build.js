// The ballad of Master Manol: rebuilt from Stayka Gyokova's Balkanton record "Да се провали майстор Манол" (her voice separated with demucs; tonic, intervals, ornament and phrase lengths measured with refs/analyse.py).
SCORES["bulgarians:build"] = {
  about: "the ballad of Master Manol, whose walls fell every night until his young wife was built into them, sung slowly in the Thracian manner while the masons work",
  heard: "on the building site by the river below the mountain: masons' hammers and chisels on stone, now and then a heave as a block is set; a woman sings the ballad in free time, long-held and trembling, a kaval plays with her an octave up and answers each line, a gadulka holds the drone; the gorge throws the sound back",
  refs: [
    { title: "Да се провали майстор Манол", who: "Stayka Gyokova (Thracian singer), Balkanton 1971, with a folk-instrument orchestra", url: "https://www.youtube.com/watch?v=grJyoqF0kCA" },
    { title: "Да се повали майстор Манол (another transfer)", who: "Stayka Gyokova", url: "https://www.youtube.com/watch?v=3eRXqNcUt04" },
  ],
  measured: "voice stem (7.8 min): tonic E (-25c), lines end on E or on the D below; steady-pitch peaks at -225 (b7 below), 0, 135-165 (a low second, between F and F#), 280 (b3), 505, 685, 985 and the octave, with cries up to the second above it (1405); free rhythm (pulse clarity 0.15 on the band), held notes of 2-8 s, and the Thracian trembling ornament: one pitch pulsed in 0.13-0.15 s beats; the band (other stem) plays the second at 190, a plain F#, so voice and kaval disagree by ~30-50 cents, kept here with a scale for each. Ours follows the scale per voice and kaval, the range (B3 to F#5), the long holds and the pulsed second, and the kaval answering between lines. Now the voice joins notes with long slides (glide=0.7) and a scoop, sings in a pressed chest voice (press=0.6), catches in the throat on four held notes (a ʔ re-attack of the same vowel), and the pulsed second is the tremolo 5r (seven pulses a second, her 0.13-0.15 s beats): her stem against our voice alone gives held-note shake ±11 against ±13 cents, gliding 12% against 17% of voiced time, and the same band profile (500-1000 Hz −2.5 against −2.9 dB, 2-4 kHz −7.7 against −6.5). Still differs: her trembling also moves the pitch (pyin counts about two quick pitch flicks a second, ours none), the meter is felt in eighths at 66 where she sings freely, the 1971 orchestra (tambura, gadulka, kaval, bass) is reduced to drone and kaval, and the words follow the ballad's common formula (by day they build, by night it falls) rather than her text",
  text: `
. clock        66 4/4
. arrange@song кавал:4bars майсторе:4bars отговор1:2bars денем:4bars отговор2:2bars нощем:4bars отговор3:2bars маноле:4bars край:2bars
. scale@glas   1 2:160 3:285 4:505 5:700 6:880 7:990
. scale@kavalski 1 2:190 3:300 4:500 5:700 6:890 7:1000
. key          glas E

. caption@c1   "Ой, майсторе Маноле," ?song.2
. caption@c2   "що зидате денем," ?song.4
. caption@c3   "нощем се разваля," ?song.6
. caption@c4   "Маноле, леле, майсторе!" ?song.8
. water@reka   level=0.18 lap=0.1 splash=0.02
. drums@zidari kit=work vol=0.55 "x.....x.......x....x.....x........x......x.....x.......x...x...|..x.x......x.x.......x.x.x.........x.x......x.x.x.......x.x....|......................................x........................." ?song.1-9
. strings@gadulka "E" drone oct=3 vol=0.22 ?song.1-9
. flute@kaval  scale=kavalski key=E oct=5 grid=8 human=0.7 vol=0.45 dyn="mf mf mf mf pp pp pp pp mf mf pp pp pp pp mf mf p p p p mf mf pp pp pp pp mp mp" "5, - 7, 1 - - 2 1 2 - 4 - 5 - - 4 2 - 1 2 1 - 7, - 1 - - - - - 0 0 5, - 7, - 1 - - - 2 2 2 2 1 - 7, - 1 2 2 - 1 - 1 7, 1 - - - - - 0 0 5 4 5 - 4 2 1 - 2 - 1 7, 1 - 0 0 1 2 4 - - 3 2 2 2 - 1 - 2 1 2 1 7, 1 - - - - - - - - - - - - 0 0 1' - 7 5 4 - 5 4 2 1 2 - 1 - 0 0 5 - 6 5 1' - - - 7 6 5 - 4 5 4 2 2 2 1 - 1 - - - - - - - - - 0 0 4 5 4 2 2 1 7, - 5, 7, 1 - - - 0 0 5, 7, 1 - 2 - 2' - - 1' 7 5 4 2 2 2 1 7, - 1 - - - - - - - - - - 0 0 1 - 2 1 7, - 1 - - - - - 0 0 0 0" ?song.1-9
. chant@pevitsa voice=women voices=1 oct=4 grid=8 human=0.8 vib=0.01 press=0.6 bright=0.5 glide=0.7 scoop=50 breath=0.12 dyn="mf mf mf mp mp mp mf mf mf mf mp mp mp f f f mf mp mp mp mf f f mf mf" ipa="ɔj _ maj stɔ rɛ _ ma _ nɔ _ lɛ _ ʔɛ ʃtɔ _ zi _ da tɛ dɛ _ nɛm _ ʔɛ _ nɔʃ _ _ tɛm sɛ _ _ raz _ ʔa _ va _ _ ʎa ma _ nɔ _ lɛ _ lɛ _ ʔɛ _ maj _ _ stɔ rɛ" "5, - 7, - 1 - - - 2r - - - 1 - 7, - 1 2 2 - 1 - 1 7, 1 - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 2 4 - - 3 2r - - - 1 - 2 1 2 1 7, 1 - - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 - 6 5 1' - - - 7 6 5 - 4 5 4 2 2 2 1 - 1 - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 1 - 2 - 2' - - 1' 7 5 4 2 2 2 1 7, - 1 - - - - - - - - - - 0 0" ?song.2-8

*> space       valley size=0.8 wet=0.25
>  speaker     0.5
`,
};
