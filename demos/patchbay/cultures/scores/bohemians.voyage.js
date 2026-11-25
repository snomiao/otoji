// Vltava, the river theme of Smetana's tone poem (1874; public domain), as an orchestra of its own day played it: the two flutes of the springs, then the broad E-minor tune on the violins over the rippling strings, harp and plucked basses, in a 19th-century concert hall.
SCORES["bohemians:voyage"] = {
  about: "Vltava: the river rises in two springs (two flutes rippling against each other), gathers into a stream, and the great E-minor theme rolls out on the violins over the strings' running water",
  heard: "the first performance of Vltava in the Žofín hall on an island in the river at Prague, April 1875, by the orchestra of the Provisional Theatre: gut-strung violins without much vibrato, wooden flutes, a harp, the basses plucking; a full, attentive hall of townspeople, the wooden room warm and resonant; the composer, already deaf, in the audience",
  refs: [
    { title: "Má vlast (first complete recording), Vltava", who: "Czech Philharmonic, Václav Talich, 1929", url: "https://www.youtube.com/watch?v=eeaMqPa2Ps8" },
    { title: "Vltava, main theme (sample)", who: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Vltava-main-theme-2.ogg" },
  ],
  measured: "the Commons theme sample, note by note: B3 pickup, E4 F#4 G4 A4, B4, C5 C5, B4 …, A4, G4 A4 G4, F#4, E4, the dotted quarter ~0.93 s (6/8 at ~64 dotted quarters a minute), 12-tone; Talich's 1929 record (the start of Vltava): brightness ~1350 Hz, the energy at 125–1000 Hz, a quiet opening rising by ~15 dB when the theme comes in, vibrato ~4 c, a long hall tail. Ours: the theme as Smetana wrote it (E F# G A | B B | C C | B | A A | G G | F# F# | E), twice; the rippling accompaniment and the opening flutes are written in the style of his figures over his harmony (Em Em Am Em B7 Em B Em), not copied note for note; 6/8 at 97 to the quarter; a hall. It differs in that our strings are a handful of synthetic bows, not thirty players, so the theme is thinner and the water less dense. Our render, tracked: E4 F#4 G4 A4 B4, C5, B4 B4, A4, G4, F#4, E4 with dotted quarters of ~0.93 s like the sample; brightness 1440 Hz (Talich 1350) after cutting the highs, energy at 250–2000 Hz; the springs come in ~6 dB under the theme where Talich's are ~15 dB under, and our bass end (below 250 Hz) is 10 dB thinner than his orchestra's",
  text: `
. clock        97 6/8
. arrange@song prameny:4bars reka:8bars reka2:8bars
. key          minor E

. caption@c1   "Vltava" ?song.2
. crowd@sal    murmur "ta-ko to-je pa-ne ma-ji ho-di-ne" voices=10 voice=mixed vol=0.35 dyn="p pp 0" ?song.1
. flute@fletna1 oct=5 grid=16 human=0.3 vol=0.3 dyn="p mp mp mf" "5 3 1 3 5 1' 5 3 1 3 5 3 5 3 1 3 5 1' 5 3 1 3 5 3 6 4 1 4 6 1' 6 4 1 4 6 4 5 3 1 3 5 1' 5 3 1 3 5 3" ?song.1
. flute@fletna2 oct=5 grid=16 human=0.3 vol=0.25 dyn="p mp mp mf" "0 0 0 0 0 0 5 3 1 3 5 1' 5 3 1 3 5 3 0 0 0 0 0 0 0 0 0 0 0 0 6 4 1 4 6 1' 5 3 1 3 5 3 1 - - - - -" ?song.1
. strings@housle oct=4 grid=16 human=0.4 vol=0.9 dyn="mf f f mf mf f f mf mf mf f f f f mf mp" "1 - - - 2 - 3 - - - 4 - 5 - - - - - 5 - - - - - 6 - - - - - 6 - - - - - 5 - - - - - - - - - - - 4 - - - - - 4 - - - - - 3 - - - - - 3 - - - - - 2 - - - - - 2 - - - - - 1 - - - - - - - - - 5, -" ?song.2-3
. strings@housle2 oct=5 grid=16 human=0.4 vol=0.4 "1 - - - 2 - 3 - - - 4 - 5 - - - - - 5 - - - - - 6 - - - - - 6 - - - - - 5 - - - - - - - - - - - 4 - - - - - 4 - - - - - 3 - - - - - 3 - - - - - 2 - - - - - 2 - - - - - 1 - - - - - - - - - 5, -" ?song.3
. strings@violy oct=3 grid=16 human=0.3 vol=0.4 dyn="mp" "1 3 5 1' 5 3 1 3 5 1' 5 3 1 3 5 1' 5 3 1 3 5 1' 5 3 6, 1 3 6 3 1 6, 1 3 6 3 1 1 3 5 1' 5 3 1 3 5 1' 5 3 5, #7, 2 4 2 #7, 5, #7, 2 4 2 #7, 1 3 5 1' 5 3 1 3 5 1' 5 3 5, #7, 2 5 2 #7, 5, #7, 2 5 2 #7, 1 3 5 1' 5 3 1 3 5 1' 5 3" ?song.2-3
. flute@flety  oct=5 grid=16 human=0.3 vol=0.25 "1 3 5 1' 5 3 1 3 5 1' 5 3 1 3 5 1' 5 3 1 3 5 1' 5 3 6, 1 3 6 3 1 6, 1 3 6 3 1 1 3 5 1' 5 3 1 3 5 1' 5 3 5, #7, 2 4 2 #7, 5, #7, 2 4 2 #7, 1 3 5 1' 5 3 1 3 5 1' 5 3 5, #7, 2 5 2 #7, 5, #7, 2 5 2 #7, 1 3 5 1' 5 3 1 3 5 1' 5 3" ?song.3
. pluck@harfa  oct=3 grid=16 human=0.3 vol=0.5 "1+3+5/ - - - - - 0 0 0 0 0 0 1+3+5/ - - - - - 0 0 0 0 0 0 6,+1+3/ - - - - - 0 0 0 0 0 0 1+3+5/ - - - - - 0 0 0 0 0 0 5,+#7,+2+4/ - - - - - 0 0 0 0 0 0 1+3+5/ - - - - - 0 0 0 0 0 0 5,+#7,+2/ - - - - - 0 0 0 0 0 0 1+3+5/ - - - - - 0 0 0 0 0 0" ?song.2-3
. strings@basy oct=2 grid=16 human=0.3 vol=0.6 tech=pizz "1 - - - - - 0 0 0 0 0 0 1 - - - - - 0 0 0 0 0 0 4 - - - - - 0 0 0 0 0 0 1 - - - - - 0 0 0 0 0 0 5, - - - - - 0 0 0 0 0 0 1 - - - - - 0 0 0 0 0 0 5, - - - - - 0 0 0 0 0 0 1 - - - - - 0 0 0 0 0 0" ?song.2-3

*> space       hall size=1.1 wet=0.32
>  eq          low=2 mid=0 high=-7
>  speaker     0.5
`,
};
