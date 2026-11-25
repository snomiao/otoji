// A wedding dance in Jalisco: a son on violins, vihuela, guitarra de golpe and harp in sesquiáltera, while the guests run in a chain under the couple's raised arms, after the first mariachi recordings, Cuarteto Coculense (1908–09). The game song La víbora de la mar itself is not reproduced.
SCORES["mexicans:wedding"] = {
  about: "the wedding party's chain game: the couple stand on chairs holding hands up, the guests run under in a long line, the last ones pulled off laughing, to a fast son that swings between two and three; then a zapateado on the wooden platform",
  heard: "an open patio at night, strings of lights, the band at one side: guests laughing, shouting and cheering as the chain runs, stamping feet on the tarima, a grito now and then",
  refs: [
    { title: "El Arriero (1908–09)", who: "Cuarteto Coculense (Mexico's Pioneer Mariachis Vol. 4: The Very First Mariachi Recordings)", url: "https://www.youtube.com/watch?v=szBdMmwAYKU" },
  ],
  measured: "Cuarteto Coculense, 1908–09: 136 in three with every 8th strummed (sesquiáltera: the accents swing between two and three), resting on F, violin and voices over vihuela and guitar, 250 Hz–2 kHz, 12 dB of dynamics, quick 8th-note tunes. Ours: rendered 136 in three, resting on F, 500 Hz–2 kHz peak; the violins play a newly written son in that style (two violins a third apart), the strumming alternates 6/8 and 3/4 bar by bar, the guests' chain game, gritos and a zapateado on the tarima. Still differs: the 1908 violins are thin and scratchy with sliding shifts, ours are smooth; the strums lack the guitarra de golpe's percussive slap; La víbora de la mar's own tune and words are not used",
  text: `
. clock        136 3/4
. arrange@song vibora:16bars vibora2:16bars zapateado:8bars
. key          major F

. crowd@guests murmur "ha ha ja ri a la bi bo ra" voices=24 voice=mixed vol=0.8 dyn="mf f mf"
. crowd@gritos shout "a-JA-JAI" "..........................................................................................x-x---..........................................................................................................................x-x-x---..........." voices=3 voice=men vol=1 ?song.1-2
. crowd@cheer  shout "E-E" "................................................................................................................................................................................x---............" voices=20 voice=mixed vol=0.8 ?song.2
. strings@violin oct=5 grid=8 human=0.5 vol=0.8 dyn="f" "3 4 5 - 5 - 6 5 4 - 3 - 2 3 4 - 4 - 5 4 3 - 2 - 3 4 5 - 1' - 7 6 5 - 4 - 3 - 2 - 7, - 1 - - - 0 0 5 - 5 6 5 4 3 - 3 4 3 2 4 - 4 5 4 3 2 - 2 3 2 7, 5 - 5 6 5 4 3 - 3 4 5 - 4 3 2 - 7, - 1 - - - 0 0" ?song.1-2
. strings@violin-2 oct=5 grid=8 human=0.5 vol=0.6 "1 2 3 - 3 - 4 3 2 - 1 - 7, 1 2 - 2 - 3 2 1 - 7, - 1 2 3 - 6 - 5 4 3 - 2 - 1 - 7, - 5, - 6, - - - 0 0 3 - 3 4 3 2 1 - 1 2 1 7, 2 - 2 3 2 1 7, - 7, 1 7, 5, 3 - 3 4 3 2 1 - 1 2 3 - 2 1 7, - 5, - 6, - - - 0 0" ?song.1-2
. pluck@vihuela oct=4 grid=8 human=0.5 vol=0.7 "1+3+5/ - - 1+3+5/ - - 1+4+6/ - 1+4+6/ - 1+4+6/ - 7,+2+5/ - - 7,+2+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - - 1+3+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - - 7,+2+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - - 1+3+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - - 7,+2+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - - 1+3+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - - 7,+2+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ -"
. pluck@guitarra-de-golpe oct=3 grid=8 human=0.5 vol=0.6 "1+3+5/ - - 1+3+5/ - - 1+4+6/ - 1+4+6/ - 1+4+6/ - 7,+2+5/ - - 7,+2+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - - 1+3+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - - 7,+2+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - - 1+3+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - - 7,+2+5/ - - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - - 1+3+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - - 7,+2+5/ - - 1+3+5/ - 1+3+5/ - 1+3+5/ -"
. pluck@arpa oct=2 grid=8 human=0.4 vol=0.45 "1 - - 5, - - 4, - - 1 - - 5, - - 2 - - 5, - - 2 - - 1 - - 5, - - 5, - - 2 - - 5, - - 2 - - 1 - - 5, - - 1 - - 5, - - 1 - - 5, - - 5, - - 2 - - 5, - - 2 - - 1 - - 5, - - 1 - - 5, - - 5, - - 2 - - 1 - - 5, - -"
. drums@tarima kit=flamenco vol=0.8 "X.x.x.X.x.x.|..x..x..x..x|............" ?song.3

*> space       courtyard size=1.3 wet=0.18
>  speaker     0.5
`,
};
