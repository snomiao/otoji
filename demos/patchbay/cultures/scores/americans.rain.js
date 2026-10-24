// Rain at last over a Dust Bowl family's camp, with a guitar tune in the Carter Family style the migrants played, after the Todd–Sonkin field recordings in the FSA camps (1940). Guthrie's own song is still in copyright and is not reproduced.
SCORES["americans:rain"] = {
  about: "after the dry years, rain: it starts on the canvas of a tent and the tin roof of a camp cabin, a man picks an old-time tune on the guitar in the Carter style, melody on the bass strings and brush strums between, and the family talks low and glad",
  heard: "inside a tent in a government camp at dusk: rain drumming on the canvas, then harder, water running off; the guitar close, people on cots and crates talking softly, a child laughing",
  refs: [
    { title: "The Wildwood Flower (Arvin FSA Camp, 1 August 1940)", who: "Zelmer Ward, guitar; recorded by Charles Todd and Robert Sonkin (Library of Congress, Voices from the Dust Bowl)", url: "https://www.youtube.com/watch?v=MUI0yZFALuc" },
  ],
  measured: "The Arvin camp Wildwood Flower (learned from a Carter Family record): about 123 in two, the melody picked on the low strings with brush strokes between (groove XxXxXxXx in the low band), resting on B, plain major scale, no vibrato (a guitar), 250 Hz–2 kHz, a small room. Ours: rendered 123, resting on B, the melody on the guitar's bass strings and brush chords on the off-8ths; the tune is newly written in that style (Guthrie's song is not used, and the Wildwood Flower itself is not copied); rain on canvas over everything, growing heavier. Still differs: our guitar's thumb notes lack the steel strings' twang and the brush strokes are thinner; the rain fills 4–8 kHz where the recording has only room hiss",
  text: `
. clock        123 4/4
. arrange@song dry:2bars tune:8bars tune2:8bars tune3:8bars
. key          major B

. rain@canvas  0.35 drops=0.5
. rain@harder  0.4 drops=0.3 ?song.3-4
. crowd@family murmur "wel nau hir it kams ja la" voices=5 voice=mixed vol=0.6 dyn="p mp"
. pluck@guitar oct=3 grid=8 human=0.4 vol=1.2 dyn="mf" "5, - 1 - 1 2 3 - 5 - 3 - 2 - 1 - 6, - 1 - 1 2 3 - 2 - - - 0 0 0 0 5, - 1 - 1 2 3 - 5 - 6 - 5 - 3 - 2 - 3 - 2 - 1 - 1 - - - 0 0 0 0" ?song.2-4
. pluck@guitar-brush oct=4 grid=8 human=0.5 vol=0.45 "0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+4+6 0 1+4+6 0 1+4+6 0 1+4+6 0 7,+2+5 0 7,+2+5 0 7,+2+5 0 7,+2+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+4+6 0 1+4+6 0 1+4+6 0 1+4+6 0 7,+2+5 0 7,+2+5 0 7,+2+5 0 7,+2+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5" ?song.2-4

*> space       room size=0.8 wet=0.15
>  speaker     0.5
`,
};
