// The Lament for Ur (c. 2000 BCE) as a gala priest's lament in the storm, with the lyre and the kettle drum. Its music is lost; the mode and singing follow Peter Pringle's reconstructed Sumerian laments on a replica of the Lyre of Ur.
SCORES["sumerians:wind"] = {
  about: "Enlil's storm over Ur: the wind howls, the lilis kettle drum and the balag beat slowly, and a lament singer, then a choir of women for Ningal, wail the refrain alas, my city, alas, my house to a lyre",
  heard: "in the open court before the ruined temple of Nanna, the storm still blowing: a single gala singer, close and loud, a lyre player beside him, the drum's strokes rolling under the wind; later the women's voices answer from further off",
  refs: [
    { title: "Lament for Gilgamesh, the Gold Lyre of Ur", who: "Peter Pringle, voice and a replica of the lyre of Ur, sung in Sumerian", url: "https://www.youtube.com/watch?v=dDRD3c-WAec" },
    { title: "Hurrian Hymn no. 6 (c. 1400 BCE)", who: "Michael Levy, reconstructed lyre (the nearest notated music of the region)", url: "https://www.youtube.com/watch?v=64aouN2oohM" },
  ],
  measured: "Uncertain: no Sumerian melody survives; the Lament for Ur's words do (ETCSL), the sung words here are only lament refrain words (a, alas; uru₂-ĝu₁₀, my city; e₂-ĝu₁₀, my house; a-še-er, sighing), not a quotation. The instruments are real (lyres like the ones excavated at Ur, the lilis kettle drum and the balag of the gala lamenters); the mode follows Pringle's reconstruction rather than evidence. Measured in Pringle's lament: resting on C with a lowered second (80 c) and notes about 390, 480, 680, 780, 990 c, very long held notes (3–5 s) with ~12 c vibrato and slides (glides 0.17), half a note a second, C3–B4, 125–500 Hz. Ours: scale@lament with those cents; the melody rebuilt from his note sequence; rendered: most used note F as in the reference, ~14 c vibrato, 0.9 notes a second, 250–500 Hz peak, the same cents within 30 c. Still differs: the singer's slides between notes are smoother and wider in the reference; the lyre is the engine's generic harp string, not the bull-headed lyre's box",
  text: `
. clock        60 4/4
. arrange@song storm:4bars lament:11bars ningal:11bars
. scale@lament 1 2:80 3:390 4:480 5:680 6:780 7:990
. key          lament C

. caption@urim "𒋀𒀊𒆠 · 𒀭𒊩𒌆𒃲" ?song.2-3
. wind@storm   0.55 gust=0.15Hz
. timpani@lilis oct=2 grid=8 human=0.4 vol=0.8 "1 - - - - - - - 0 0 0 0 1 - 1 -" 
. pluck@lyre-of-ur oct=3 grid=8 human=0.5 rubato=0.3 vol=1.4 "1+5 - - - 4 - 3 - 1+5 - - - 2 - 1 -" ?song.2-3
. chant@gala   voice=men oct=3 grid=8 human=0.5 rubato=0.4 vib=0.03 breath=0.2 bright=0.35 dyn="f mf f f mf f mf mf f mf mp" ipa="a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a" "4 - - - - - - 3 4 4 - 3 4 3 - - 2 4 - - - - - - - 3 3 - - - 2 2 1 2 - - - - - - - - - 0 - 1 1 1 2 1 7, - 7 6 7 6 5 6, - - - 6, 5, - 6, - 4, 5, - - 5, - 5, - - - - 3, 4, - - - 0 - - - 0 0" ?song.2-3
. chant@women  voice=women voices=8 oct=4 grid=8 human=0.6 rubato=0.4 vib=0.035 breath=0.3 vol=0.55 dyn="mp" ipa="a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a a u ɾu ŋu a e ŋu a ʃe eɾ ŋu a" "4 - - - - - - 3 4 4 - 3 4 3 - - 2 4 - - - - - - - 3 3 - - - 2 2 1 2 - - - - - - - - - 0 - 1 1 1 2 1 7, - 7 6 7 6 5 6, - - - 6, 5, - 6, - 4, 5, - - 5, - 5, - - - - 3, 4, - - - 0 - - - 0 0" ?song.3

*> space       courtyard size=1.6 wet=0.25
>  speaker     0.5
`,
};
