// Haudenosaunee social dances in the longhouse: a Ladies' (women's shuffle) dance and a Smoke Dance, after the Folkways recording Seneca Social Dance Music (Allegany, 1980). Social songs only; the sacred ceremonies, such as the Great Feather Dance, are not reproduced.
SCORES["haudenosaunee:showcase"] = {
  about: "a social dance evening: men singers with a water drum and cow-horn rattles sing a Ladies' Dance song, the women shuffling in a circle around them; then a fast Smoke Dance, the drum and rattles driving",
  heard: "inside a wooden longhouse at night, people on the benches along the walls, the singers seated on a bench in the middle; the women's feet shuffling on the plank floor, people talking softly between songs, a wood stove",
  refs: [
    { title: "7 Ladies' Dance Songs", who: "Allegany Singing Society (Seneca Social Dance Music, Folkways, recorded by Mary Riemer-Weller)", url: "https://www.youtube.com/watch?v=zriJOPDRI64" },
    { title: "Smoke Dance", who: "Avery and Fidelia Jimerson (Seneca Social Dance Music, Folkways)", url: "https://www.youtube.com/watch?v=7CjN4J09LJU" },
  ],
  measured: "Ladies' Dance songs (Allegany Singing Society): 112 in two, the water drum on every 8th and the rattles filling the 16ths (high band X.XxX.Xx), resting on E with F♯, G♯ and a D about 140 c under the tonic, the leader opening high and long, then quick repeated syllables on the tonic, the singers answering; voices 125 Hz–1 kHz. Smoke Dance: faster and driving, almost all on one pitch. Ours: rendered 112.3 in two with the same high-band groove (X.XxX.Xx), resting on E with 0 200 400 1060 c; the Smoke Dance at 124. Still differs: the syllables sung here are generic vocables, not the songs' own words or vocables, and the tunes are rebuilt from the measured contour rather than transcribed song by song; the water drum's ringing, slightly bent tone is only approximated by a tuned drum; our voices are darker (500 Hz–1 kHz 13 dB lower)",
  text: `
. clock        112 4/4
. arrange@song between:2bars ladies:11bars ladies2:11bars smoke:8bars@124
. scale@ladies 1 2 3 7:1060
. key          ladies E

. crowd@benches murmur "o ne ka ta wa ni he" voices=10 voice=mixed vol=1.2 dyn="mp" ?song.1
. timpani@water-drum oct=3 grid=8 human=0.3 vol=0.3 "1 1 1 1 1 1 1 1" ?song.2-4
. drums@horn-rattles kit=aztec vol=1.5 "................|................|x.xxx.xxx.xxx.xx" ?song.2-4
. drums@shuffle kit=celtic vol=0.8 "................|................|x...x.x.x...x.x." ?song.2-3
. chant@leader voice=men oct=3 grid=16 human=0.4 vib=0.015 breath=0.12 bright=0.5 dyn="f" ipa="he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he" "2' - - - - - - - - - - - - - - - - - - 2 - - - - - - - 7 - 2 - 2 - - - 2 - - - - - - - 2 - - - 7, - 7, - - 3 - - - 1 - 1 - 7, - - 7, 7, 1 1 2 - 2 - - - 2 - - - 1 - 3 - 3 - 1 - 7, - 1 1 1 1 - 1 - - - - - - - - - - - - - - - - - - 1 - - - 2 - - - 2 - - 1 - - - 3 - 3 - - 1 1 1 1 1 1 - 1 - 2 - - - - 1 3 - - 1 1 - - 1 - - - - - - - - - - - - - - - - - - - - - -" ?song.2-3
. chant@singers voice=men voices=5 oct=3 grid=16 human=0.5 vib=0.015 breath=0.12 bright=0.45 vol=0.7 ipa="he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he ja o he ja we he ja he" "2' - - - - - - - - - - - - - - - - - - 2 - - - - - - - 7 - 2 - 2 - - - 2 - - - - - - - 2 - - - 7, - 7, - - 3 - - - 1 - 1 - 7, - - 7, 7, 1 1 2 - 2 - - - 2 - - - 1 - 3 - 3 - 1 - 7, - 1 1 1 1 - 1 - - - - - - - - - - - - - - - - - - 1 - - - 2 - - - 2 - - 1 - - - 3 - 3 - - 1 1 1 1 1 1 - 1 - 2 - - - - 1 3 - - 1 1 - - 1 - - - - - - - - - - - - - - - - - - - - - -" ?song.3
. chant@smoke-singers voice=men voices=4 oct=3 grid=16 human=0.4 vib=0.01 breath=0.12 bright=0.5 ipa="we he ja he we he ja o we he ja he we he ja o we he ja he we he ja o we he ja he we he ja" "1 - 1 1 1 - 1 - 1 - 1 1 1 - - - 1 - 1 1 1 - 1 - 2 - 1 - 7, - - - 1 - 1 1 1 - 1 - 1 - 1 1 1 - - - 3 - 2 - 1 - 7, - 1 - - - - - - -" ?song.4

*> space       hall size=0.5 wet=0.2
>  speaker     0.5
`,
};
