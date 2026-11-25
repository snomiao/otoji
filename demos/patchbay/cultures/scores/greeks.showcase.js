// The Seikilos epitaph (Tralles, 1st c. CE), the oldest complete notated song: the melody as read from the stele's notation in modern scholarship, sung with a lyre, after the reconstructions of Ensemble Kérylos and Michael Levy.
SCORES["greeks:showcase"] = {
  about: "Ὅσον ζῇς φαίνου, the skolion carved on Seikilos' gravestone: first played on the lyre, then sung with the lyre following the voice note for note, then sung again with the aulos joining",
  heard: "a small room at a banquet or by the grave in the open air of Asia Minor: one singer and one lyre, quiet and close, the guests silent; the aulos added in the last verse",
  refs: [
    { title: "Épitaphe de Seikilos", who: "Ensemble Kérylos (dir. Annie Bélis), Geneviève Bousquet, voice — Musique de l'Antiquité grecque", url: "https://www.youtube.com/watch?v=ycFQw_1gdFQ" },
    { title: "Song of Seikilos — complete ancient Greek melody", who: "Michael Levy, reconstructed lyre", url: "https://www.youtube.com/watch?v=-r9gdO8EyNA" },
  ],
  measured: "What is certain and what is not: the pitches and the long/short rhythm signs are on the stone (here as read by Pöhlmann and West; the scale is the Iastian tonos, which sounds like E Dorian, a range of an octave E–E'); the tempo, ornament, pitch standard and accompaniment are guesses, and performers differ. Levy's lyre (the clearest line to measure): about 68 to the beat (0.88 s units, long notes of 2–3 units), the tune A E' E' C♯' D' E' | D' D' A D' E' C♯' B B B A | … ending on the low E, resting pitch E −20 c; Kérylos: the soprano with ~17 c vibrato and slides (glide ratio 0.3), lyre underneath, transposed to C♯. Ours: E Dorian, 12 beats a line in 3/4 at 72; rendered, the lyre plays exactly that note sequence (A E' E' C♯' D' E' D' D' A …) at about 0.94 s a beat, the voice measures ~12 c of vibrato, 250 Hz–1 kHz like the lyre recording. Still differs: the engine's lyre is a generic harp string, without the tortoise-shell box's knock and buzz; the syllable rhythm of the restored Greek pronunciation is only approximated",
  text: `
. clock        72 3/4
. arrange@song lyre:16bars sung:16bars aulos:16bars
. scale@iastian 1 2 b3 4 5 6 b7
. key          iastian E

. caption@l1   "Ὅσον ζῇς φαίνου, μηδὲν ὅλως σὺ λυποῦ· / πρὸς ὀλίγον ἐστὶ τὸ ζῆν, τὸ τέλος ὁ χρόνος ἀπαιτεῖ." ?song.2-3
. pluck@lyra   oct=4 grid=4 human=0.5 rubato=0.3 vol=1.7 dyn="mf mp" "4 1'+1 - 1'+1 - - 6 7 1'+1 - - - 7 - 7 4 7 - 1' 6 5 5 5 4 6 1' 6 6+1 - 4 5 3 6 5 5+1 - 4 6 4 4 2 1 1 2 3 1 - -"
. chant@singer voice=women oct=4 grid=4 human=0.5 rubato=0.3 vib=0.035 breath=0.12 bright=0.35 vol=0.7 dyn="mf mf mp mf" ipa="ho son zdɛːs pʰai _ nuː mɛː dɛn _ ho lɔːs _ sy ly puː _ prɔs o li ɡon es _ ti to zdɛːn _ to te los ho kʰro nos a pai _ tɛː" "4 1' - 1' - - 6 7 1' - - - 7 - 7 4 7 - 1' 6 5 5 5 4 6 1' 6 6 - 4 5 3 6 5 5 - 4 6 4 4 2 1 1 2 3 1 - -" ?song.2-3
. reed@aulos   oct=4 grid=4 human=0.4 rubato=0.3 vol=0.4 dyn="mp" "4 1' - 1' - - 6 7 1' - - - 7 - 7 4 7 - 1' 6 5 5 5 4 6 1' 6 6 - 4 5 3 6 5 5 - 4 6 4 4 2 1 1 2 3 1 - -" ?song.3

*> space       room size=1.4 wet=0.25
>  speaker     0.5
`,
};
