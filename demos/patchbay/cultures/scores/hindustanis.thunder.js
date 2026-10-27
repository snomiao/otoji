// Megh (the Malhar of the clouds) in dhrupad: alap, nom-tom, jor and a chautaal composition, rebuilt from the Dagar Brothers' (Sr.) Raag Megh and the been of Z. M. Dagar.
SCORES["hindustanis:thunder"] = {
  about: "Raga Megh, the monsoon raga of the Malhar family, sung in dhrupad as the first storm breaks: alap and nom-tom to the tanpura, then a chautaal composition with pakhawaj",
  heard: "an open-sided baradari pavilion of a haveli in the first monsoon night: clouds rolling, thunder far off then near, rain beginning as the singer reaches the jor and pouring once the pakhawaj enters; a been player opens, the dhrupadiya answers with nom-tom syllables",
  refs: [
    { title: "Raag Megh, Dagarvani dhrupad (alap, jor, composition)", who: "Dagar Brothers Sr. (N. Moinuddin and N. Aminuddin Dagar)", url: "https://www.youtube.com/watch?v=dc_nLHZ6rqA" },
    { title: "Todi, Megh Malhar, Miyan Malhar (rudra veena), live 1975", who: "Z. M. Dagar", url: "https://www.youtube.com/watch?v=8YeSWzaHDhU" },
  ],
  measured: "Dagar Brothers' Megh (mix and demucs voice stem, alap at 5-12 min and the composition from 26 min): Sa at D# (+5 to +15 cents), Re 205-210, Ma 505, Pa 700, komal ni 1010-1030 (it rises to ~1060-1090 as it slides into Sa in fast phrases); no ga or dha, Re is approached from Ma by a slide; voice D#2-F#4, vibrato and andolan 15-21 cents, 15-30% of notes glide; the alap has no pulse (clarity 0.02), the composition's pakhawaj sits near 72 matras a minute. Ours: that scale in cents (it comes back from our render within 5-15 cents: Re 210, Ma 510, Pa 700, ni 1020), alap without pakhawaj at 40-44, jor at 60, a chautaal theka at 72, dugun and a tihai landing on sam; the voice now slides (meend) and scoops into notes (glide=0.6, scoop=60) and its held notes widen (shake=0.15): pyin on the voice stem against ours alone (alap and nom-tom) gives held-note shake ±13 against ±22 cents, joins slower than 80 ms 71% against 75%, gliding 42% of voiced time against 19% ; andolan (5g, a slow wide swing) is now on the alap's Re and komal ni, the bandish's upper Sa and the closing Sa, which raises gliding to 23% (the record's andolan and gamak still move the pitch far more often than these few marked notes); the render's centroid 2.6 kHz (rain and thunder) against 1.0-1.5 kHz; the rudra veena has no jawari buzz and no long meend on one stroke, the pakhawaj is the tabla kit (no tuned dha, no atta on the left head), and the nom-tom syllables are approximations.",
  text: `
. clock        72 12/4
. arrange@song alap:1bars@40 nomtom:2bars@44 jor:1bars@60 bandish:3bars@72 dugun:1bars@~104 tihai:1bars@104 sam:1bars@50
. scale@megh   1 2:205 4:505 5 7:1020
. key          megh D#

. caption@c1   "मेघ · आलाप" ?song.1-2
. caption@c2   "उमड़ घुमड़ घन गरजत आए / चहुँ दिसि दामिनि" ?song.4-5
. wind@clouds  0.18 gust=0.07Hz ?song.1-2
. rain@first   0.12 drops=0.2 ?song.2-3
. rain@monsoon 0.3 drops=0.45 ?song.4-7
. drums@megh-garjan kit=sky vol=0.9 "X.....................................................................x.........................................................................|....................................................................................................x..........................................." ?song.1-7
. pluck@tanpura   oct=2 grid=4 vol=0.9 adsr=5ms,2.5s,0.35,2.5s human=0.3 "5 1' 1' 1" ?song.1-3
. pluck@tanpura2  oct=2 grid=4 vol=0.9 adsr=5ms,2.5s,0.35,2.5s human=0.3 "5 - 1' - 1' - 1 -" ?song.4-7
. pluck@rudra-veena  rubato=0.6 oct=3 grid=4 vol=2 human=0.6 dyn="mf f" "1 - - 7,~1 - - 5, - 7, - (2)1 -" ?song.1
. pluck@been-kharaj  oct=2 grid=4 vol=1.2 human=0.5 "1 - - - - - - - - - - -" ?song.1
. chant@dhrupadiya   rubato=0.5 voice=men oct=3 grid=4 human=0.6 vib=0.018 breath=0.12 glide=0.6 scoop=60 shake=0.15 dyn="mp mf" ipa="aː ɾe nə taː naː ɾi taː nə nʊm taː naː ɾi nə nʊm" "1 - 1~2 - 4~2 - 1 - 7,~1 - 1 - 2g 4 5 - 7g 5 4~2 - 2~1 - 1 -" ?song.2
. pluck@been-answer  oct=3 grid=4 vol=1.4 human=0.6 "0 - - - - - - - - - 1 - 0 - - - - - - - - - 2~1 -" ?song.2
. chant@dhrupadiya-jor voice=men oct=3 grid=8 human=0.5 vib=0.018 breath=0.1 glide=0.6 scoop=60 shake=0.15 dyn="mf" ipa="nə nə ɾi naː tə nə ɾi naː tə nʊm tə naː ɾi nə ɾi naː tə nʊm" "1 1 2 - 4~2 1 7, 1 2 4 5 - 4 5 7 - 5 4 2~1 - 7, 1 - -" ?song.3
. chant@dhrupad      voice=men oct=3 grid=4 human=0.5 vib=0.018 breath=0.1 glide=0.6 scoop=60 shake=0.15 dyn="mf f mf" ipa="u mə ɖə ɡʰu mə ɖə ɡʰə nə ɡə ɾə dʒə tə aː _ je _ tʃə hũ di si daː mi ni _ _" "5, 7,~1 1 - 2 - 4~2 - 1 - 7, 1 2 4 5 - 7~1' - 5 4 2 - 1 - 4 5 7 1'g - 7~5 5 4 2~1 - 1 -" ?song.4
. chant@dhrupad-dugun voice=men oct=3 grid=8 human=0.5 vib=0.018 breath=0.1 glide=0.6 scoop=60 shake=0.15 dyn="f" ipa="u mə ɖə ɡʰu mə ɖə ɡʰə nə ɡə ɾə dʒə tə aː _ je _" "5, 7, 1 - 2 - 4~2 - 1 - 7, 1 2 4 5 - 7 - 5 4 2 - 1 -" ?song.5
. chant@dhrupad-tihai voice=men oct=3 grid=8 human=0.4 vib=0.018 breath=0.1 glide=0.6 scoop=60 shake=0.15 dyn="f" ipa="dʒə tə aː je dʒə tə aː je dʒə tə aː" "0 0 4~2 - 1 - 7, - 1 - 4~2 - 1 - 7, - 1 - 4~2 - 1 - 7, -" ?song.6
. chant@dhrupad-sam  voice=men oct=3 grid=4 human=0.4 vib=0.018 breath=0.12 glide=0.6 scoop=60 shake=0.15 dyn="f p" ipa="je _" "1g - - - - - - - - - - -" ?song.7
. drums@pakhawaj     kit=tabla vol=0.8 "X...x...............x...................x.......|........x...x...x.x.....x...x...x.x...x...x.x.x.|........x...............x...........x.......x..." ?song.4-7

*> space       pavilion size=1.2
>  speaker     0.5
`,
};
