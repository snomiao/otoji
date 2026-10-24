// The Tupinambá men's chorus Jean de Léry heard in 1557 (Heu, heuraure, heura … oueh), danced in a great house with mbaraká rattles. Léry printed the words with notes; the tune here is not copied from his print but built from the singing of today's Tupinambá (Olivença, Bahia) as recorded at a gathering, the nearest living voice.
SCORES["tupi:festival"] = {
  about: "night in a great house of the Tupinambá: the men dance in a ring, stamping and bent forward, singing Heu, heuraure, heura, heura, heura, oueh in chorus, answered by a leader; the shamans shake mbaraká rattles; cauim is passed round",
  heard: "inside a long thatched house at night, a fire burning, the walls of palm absorbing the sound; the men's ring stamping on the earth floor, rattles hissing on every beat; women and children outside listening through the wall",
  refs: [
    { title: "Cantos do povo Tupinambá (Luta pela Vida, Brasília)", who: "Tupinambá singers of Olivença, Bahia, with maracás (recorded at a gathering)", url: "https://www.youtube.com/watch?v=zIZpx9Wp4PI" },
  ],
  measured: "Uncertain: Léry printed this chorus (1578/1585) with notes, but how far his notation reflects what he heard is debated, and the Tupinambá of the coast of 1557 are not the same community as today's; the tune here is not his, it is modelled on the living Tupinambá singing. Measured in the Olivença singers: 123 in two, the maracás on every 8th (low band solid), voices high (C4–A5), the tune narrow around F with a whole tone above, the E below and a third above, ~10 c vibrato, 500 Hz–1 kHz. Ours: rendered 123 in two, resting on F with 0 200 410 1090 c, ~11 c vibrato, the men an octave above where a formant voice sounds natural; the vocables are Léry's own (Heu, heuraure, heura … oueh). Still differs: the rattles are a generic shaker, not the mbaraká's seeds in a gourd; the dancers' stamping and breathing in the ring are thinner than a real house full of men",
  text: `
. clock        123 4/4
. arrange@song fire:2bars ring:8bars ring2:8bars
. key          major F

. caption@leri "Heu, heuraure, heura, heura, heura, heura, heura, oueh" ?song.2-3
. fire@hearth  0.25 crackle=0.5
. drums@mbaraka kit=aztec vol=2 human=0.4 "................|................|x.x.x.x.x.x.x.x." ?song.1-3
. drums@stamping kit=celtic vol=0.4 human=0.5 "X...x...X...x...|................|................" ?song.2-3
. chant@leader voice=men oct=4 grid=8 human=0.5 rubato=0.1 vib=0.03 breath=0.2 bright=0.5 dyn="f" ipa="ɛu ɛu ɾa u ɾe ɛu ɾa ɛu ɾa ɛu ɾa ɛu ɾa ɛu ɾa we" "1 - 1 - 2 1 7, 1 1 - - - 3 - 2 - 1 - 2 - 1 - 2 - 1 - 7, - 1 - - - 3 - 3 - 2 1 2 1 3 - - - 2 - 1 - 2 - 1 - 2 - 1 - 1 - 7, - 1 - - -" ?song.2-3
. chant@men    voice=men voices=12 oct=4 grid=8 human=0.6 vib=0.03 breath=0.25 bright=0.45 vol=0.8 dyn="mf f" ipa="ɛu ɛu ɾa u ɾe ɛu ɾa ɛu ɾa ɛu ɾa ɛu ɾa ɛu ɾa we" "1 - 1 - 2 1 7, 1 1 - - - 3 - 2 - 1 - 2 - 1 - 2 - 1 - 7, - 1 - - - 3 - 3 - 2 1 2 1 3 - - - 2 - 1 - 2 - 1 - 2 - 1 - 1 - 7, - 1 - - -" ?song.3
. crowd@women-outside murmur "a ka ra i we pe" voices=8 voice=women vol=1 dyn="p"

*> space       room size=1.6 wet=0.18
>  speaker     0.5
`,
};
