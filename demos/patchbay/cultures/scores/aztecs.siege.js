// The siege of Tenochtitlan, 1521: the great drum of the temple, conches, warriors' whistles and cries, then a song of sorrow on the clay flute. The music of the Mexica is lost; this is built from archaeological instruments as they sound today.
SCORES["aztecs:siege"] = {
  about: "the last nights of Tenochtitlan and Tlatelolco: the great skin drum on the temple pyramid and the teponaztli, conch shells calling, warriors' whistles and war cries, the city burning; then an icnocuīcatl, a song of sorrow, on a clay flute, with women keening",
  heard: "in the open, over the lake city at night: the temple drum carries for leagues, conches answer from the causeways, fighting in the streets comes and goes, fires crackle; at the end only a flute and the women's wailing among the ruins",
  refs: [
    { title: "Flute, Pentaphonic Scale, Mirliton (Aztec)", who: "an archaeological Mexica clay flute, from a recorded survey of pre-Columbian instruments", url: "https://www.youtube.com/watch?v=Bj43nWqK-J4" },
    { title: "Flute, Pentaphonic Scale, Mixquic (Aztec)", who: "the same survey, a flute from Mixquic", url: "https://www.youtube.com/watch?v=z9z_EFadsQ8" },
    { title: "Tlatzotzonaliztli: huēhuētl, teponāztli y ayoyotes", who: "Tulio Torres, playing reconstructed instruments", url: "https://www.youtube.com/watch?v=bwI3-V-YYKA" },
  ],
  measured: "What is uncertain: no Mexica melody survives, and the song of sorrow's words survive without music; the instruments are real (clay flutes from excavations, huēhuētl, teponāztli, ayoyotes, conch), how they were played together is not known. Measured: the pentaphonic Mexica flute rests on its lowest hole and uses steps of about 0 190 400 640 cents with a note 110 cents under the tonic, long breathy notes of 1–4 s with ~15–18 cents of vibrato and frequent bends (glide ratio 0.42), 500 Hz–2 kHz; the Mixquic flute is similar (0 240 540 910). The drum demonstration runs at 89 in two, the teponāztli's two tongues about 360 cents apart, energy flat from 0 to 500 Hz. Ours: the same cents (scale@clayflute, checked: the flute holds 630 for 640), drums at 89.1 in four with the teponāztli's two tones at 360 cents, the lament gliding to 60 and resting on F. Still differs: the engine flute has almost no vibrato and no mirliton buzz (the Aztec flutes' paper-thin membrane), so it sounds smoother and steadier than the clay; the drums' low end is heavier than the demonstration (our 250 Hz–1 kHz is 15 dB lower); the war cries are generic shouts, not Nahuatl",
  text: `
. clock        89 4/4
. arrange@song night:4bars drums:8bars battle:8bars lament:16bars@~60
. scale@clayflute 1 2:190 3:400 4:640 7:1090
. scale@twotongue 1 3:360
. key          clayflute F

. caption@title "icnocuīcatl · Tenōchtitlan, Tlatelōlco, 1521" ?song.4

. wind@lake    0.1 gust=0.06Hz
. drums@tlalpanhuehuetl kit=aztec vol=0.9 "X...............X.......x.......|................................|................................" ?song.1-3
. brass@tecciztli oct=4 grid=8 human=0.3 vol=0.6 dyn="mp mf" "0 0 0 0 1 - - - - - - - - 0 0 0 1 - - - - - - - - - 1~7, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 - - - - - - - 1~7, - - - 0 0 0 0" ?song.1-3
. drums@huehuetl kit=aztec vol=0.8 "X.....x.X...x...|................|..x...x...x...x." ?song.2-3
. marimba@teponaztli scale=twotongue oct=3 grid=8 human=0.3 vol=1.5 "3 0 1 1 3 0 1 0 3 0 1 1 3 1 3 0" ?song.2-3
. drums@ayoyotes kit=aztec vol=1.4 "................|................|x.x.x.x.x.x.x.x." ?song.3
. flute@whistles oct=6 grid=8 human=0.6 vol=0.45 "0 0 4f - 0 0 0 0 0 0 0 0 4f - 2f - 0 0 0 0 0 0 0 0 0 4f 4f - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4f - 0 0 4f - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.3
. crowd@warriors shout "i-YA-YA AU" "x-x-x---........................x---............................" voices=30 voice=men vol=1.5 dyn="mf f" ?song.3
. drums@macuahuitl kit=hide vol=0.5 "x.....x...x.......x.....x...x...|..x.......x...........x.....x...|................................" ?song.3
. drums@cannon kit=guns vol=0.35 "................................................................................................................................X...............................................................................................................................|................|................" ?song.3
. fire@city    0.3 crackle=0.4 ?song.3-4
. flute@tlapitzalli oct=5 grid=8 human=0.5 vol=0.9 dyn="mp mf mp p" "1 - - - - - - - 1 - - - 2 - - - 3 - - - 4 - - - - - 3 - - - 2~1 - 1 - - - - - - - - - - - 3 - 4 - 3 - - - 4 - 3 - - - 2 - 3~1 - 1 - - - - - - - 2 - 3 - 2 - 3 - 2 - - - 4 - - - - - - - 2 - - - 7, - - - - - - - 4 - 3 - 2~1 - - - 1 - - - - - - - - - - - - - - - - -" ?song.4
. drums@huehuetl-slow kit=aztec vol=0.3 "X...............|................|................" ?song.4
. chant@women  voice=women voices=5 oct=4 grid=8 human=0.6 vib=0.03 breath=0.3 vol=0.6 ipa="ɑ i ɑ o i ɑ o ɑ i o ɑ" "0 0 0 0 0 0 0 0 4 - - - 3~2 - - - 1 - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 - - 3 - - 2~1 - 1 - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 - - - 4~3 - - - 2 - - - 1 - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.4

*> space       valley size=1.4 wet=0.25
>  speaker     0.5
`,
};
