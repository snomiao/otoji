// The magus's chant at a Persian sacrifice: no Achaemenid music survives, so the living Zoroastrian recitation of the
// Avesta stands in, after Mobed Mehraban Firouzgary (reciting tone, neighbour steps and pace measured with refs/analyse.py).
SCORES["achaemenids:showcase"] = {
  about: "a magus chants the Avesta at a sacrifice on a hilltop, as Herodotus describes the Persians' rites: the Ahuna Vairya and Ashem Vohu recited on one tone by the fire, a karna horn calling first",
  heard: "an open hilltop at dawn, no temple and no altar: the fire crackles in the wind, the magus with his mouth covered recites close to one note, a second priest with him, and the people stand back in silence",
  refs: [{ title: "Sorosh vāj (Khordeh Avesta)", who: "Mobed Mehraban Firouzgary, Zoroastrian priest of Iran", url: "https://www.youtube.com/watch?v=qu6x_j8sXuo" }],
  measured: "a reconstruction: Achaemenid chant is lost, and Avestan recitation as Iranian mobeds keep it is the nearest living tradition. Mobed Firouzgary: no beat at all (pulse clarity −0.08), about 2 syllables a second, almost all of it on a reciting tone near C♯3 (+20 cents) with neighbours a little above it (about 80, 190, 370 and 470 cents: microtonal steps, not a scale), range C3–F♯3, the phrase opening a step or two higher and settling back to the tone, little vibrato (≈6 cents), a warm dry voice (spectrum peak 250–500 Hz). Our magus recites the Ahuna Vairya (twice its first lines) and the Ashem Vohu in Avestan, the oldest Iranian prayers, on that tone and those steps; the words are the prayers, not the Sorosh vāj of the recording. Our render: tonic C♯, onsets 2 a second like his, the same 250–500 Hz peak and dark voice up to 2 kHz; above that the fire's crackle lifts us (brightness 1700 Hz against 1190), our pulse is still steadier than his (clarity 0.27 against −0.08) even with rubato, and his range reaches F♯3 where ours mostly stays C♯–E Revision: the chant line also carried its own key words (avesta C# tune=20), which made the engine sing it about four semitones high (render centred on F3/G#3); removed, so the line takes the scene's key and now sits on C#3 with D3 and D#3 above, as the mobed's own pitch histogram (C#3, D3, D#3). Measured note by note, the mobed reaches 22% of his notes from more than 20 c below (15% from above): the magus now scoops (45 c). A glide was tried and dropped: it made him arrive from above far more often than the mobed does.",
  text: `
. clock        120 4/4
. arrange@song karna:4bars yasna:20bars
. scale@avesta 1 2:80 3:190 4:370 5:470 6:700 7:1000
. key          avesta C# tune=20

. caption@title "𐎶𐎦𐎢𐏁 · yaθā ahū vairiiō" ?song.2
. fire@atar    0.15 crackle=0.3
. wind@kuh     0.15 gust=0.06Hz
. brass@karna  oct=3 grid=8 vol=0.5 dyn="mf p" "1 - - - - - - - 5, - - - 1 - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0" ?song.1
. chant@magu   scoop=45 voice=men voices=2 oct=3 grid=8 human=0.4 rubato=0.4 bright=0.3 vib=0.008 breath=0.12 dyn="mf mp mf mf" ipa="ja θaː a huː vaj rjoː a θaː ra tuʃ a ʃaːt tʃiːt ha tʃaː vaŋ heːuʃ daz daː ma naŋ hoː ʃjaw θa na naːm aŋ heːuʃ maz daːj xʃa θrəm tʃaː a hu raːj aː jim dri ɣu bjoː da dat vaːs taː rəm ja θaː a huː vaj rjoː a θaː ra tuʃ a ʃaːt tʃiːt ha tʃaː a ʃəm vo huː va hiʃ təm as tiː uʃ taː as tiː uʃ taː ah maːj hjat a ʃaːj va hiʃ taːj a ʃəm" "3 3 - 2 1 2 - 1 - - - 0 0 1 - 3 - 1 1 1 - 2 2 2 1 - - - 0 0 2 3 - 3 2 1 - 2 - 1 - - - 0 0 3 3 2 3 2 - 3 - 2 1 - - - 0 0 1 1 3 2 2 2 1 - - - 0 0 4 1 1 3 1 - 3 2 2 1 - - - 0 0 3 1 - 1 3 2 1 - - - 0 0 1 1 - 1 - 1 3 2 - 3 2 1 - - - 0 0 3 2 3 1 3 3 1 2 1 - - - 0 0 1 1 1 2 2 - 2 2 1 - - - 0 0 2 1 2 1 1 2 2 1 - - - 0 0 0 0 0" ?song.2

*> space       field size=1 wet=0.15
>  speaker     0.5
`,
};
