// Kesariya balam, padharo mhare des: the Marwari welcome song in Maand, rebuilt from Allah Jilai Bai of Bikaner (her long opening cry and refrain measured on demucs stems).
SCORES["gurjaras:triumph"] = {
  about: "Kesariya balam, the Maand song of welcome: a woman's long cry over the kamaicha, then the refrain 'saffron beloved, come to my land' with dholak and khartal, the women of the village singing it with her",
  heard: "the edge of a Marwar village at dusk, in the open sand: hooves of the returning riders coming closer, women with brass pots on their heads, a Manganiyar kamaicha player and a dholak and khartal; the women answer the singer, the men call 'khamma ghani' as they dismount",
  refs: [
    { title: "Kesariya Balam", who: "Allah Jilai Bai (Maand singer of Bikaner)", url: "https://www.youtube.com/watch?v=ADFHGaZLxLo" },
  ],
  measured: "Allah Jilai Bai (voice stem, first 150 s): Sa on A# (within 10 cents), the Maand scale Re 190, ga 390, Ma 480, Pa 690, dha 900, ni 1090 with komal ni 990 on the way down; the opening cry climbs Pa dha dha Pa to a long upper Re (3.4 s) and its ga, falls through ni dha Pa Ma ga, and the refrain goes Ma Pa Sa ni Re Re dha ni(b) dha Pa ... ga, Sa Re Re Ma Pa dha ni Pa; voice C#4-B4, vibrato ~9 cents; the dholak pulse is 96 a minute (clarity 0.42) with eighth-note keherwa strokes. Ours: tempo 95.7 and the same scale come back from the render (within 10-20 cents), the cry and the refrain follow the measured contour, the women's chorus doubles it the second time. Still different: the record is bright (centroid 2.5 kHz, 1-2 kHz loudest) where our formant voice and kamaicha stay darker (1.74 kHz) even with the voices' ring (bright=0.7) raised; the singer's fast taans and the kamaicha's sympathetic-string shimmer are missing; the horses, wind and crowd are the scene, not the record.",
  text: `
. clock        96 4/4
. arrange@song aagman:2bars alap:4bars@60 geet:4bars@96 geet2:4bars ant:2bars@80
. scale@maand  1 2:190 3:390 4:480 5:690 6:900 7:1090
. key          maand A#

. caption@c1   "केसरिया बालम आवो नी, पधारो म्हारे देस" ?song.2-4
. wind@thar    0.12 gust=0.05Hz
. drums@ghoda  kit=horses vol=0.6 "x...x...x...x...|................|................" dyn="p mp" ?song.1
. strings@kamaicha oct=3 grid=8 vol=0.7 human=0.5 "1 - - - 5, - - - 1 - - - 5 - 1 -" ?song.1
. chant@gayika rubato=0.5 bright=0.7 voice=women oct=3 grid=8 human=0.7 vib=0.02 breath=0.1 dyn="f f mf mf" ipa="keː _ _ _ sə ɾi jaː baː _ ləm aː _ _ voː niː _ _ _ _ _" "5 6 6 6 5 5 - 2' - - - - - - 3' 2' - - - - 7 1' 6 6 2' - 7 6 5 4 5 3" ?song.2
. strings@kamaicha-alap oct=3 grid=8 vol=0.6 human=0.6 "5 - 6 - 5 - - 2' - - - - - - 3' 2' - - - - 7 1' 6 - 2' - 7 6 5 4 5 3" ?song.2
. chant@gayika-geet bright=0.7 voice=women oct=3 grid=8 human=0.6 vib=0.02 breath=0.1 dyn="f mf f mf" ipa="keː sə ɾi _ jaː baː _ ləm aː _ voː niː _ _ _ _ pə dɦaː ɾoː _ mɦaː ɾeː deːs _ _ _" "4 5 1' 7 2' 2' 6 b7 6 5 6 b7 6 5 4 3 3 - 1 2 2 4 - 5 6 7 5 - 5 - - -" ?song.3-4
. chant@lugaiyan bright=0.6 voice=women voices=6 oct=3 grid=8 human=0.7 vib=0.015 breath=0.15 vol=0.6 dyn="mf f" ipa="keː sə ɾi _ jaː baː _ ləm aː _ voː niː _ _ _ _ pə dɦaː ɾoː _ mɦaː ɾeː deːs _ _ _" "4 5 1' 7 2' 2' 6 b7 6 5 6 b7 6 5 4 3 3 - 1 2 2 4 - 5 6 7 5 - 5 - - -" ?song.4
. strings@kamaicha-geet oct=3 grid=8 vol=0.6 human=0.5 "4 5 1' 7 2' 2' 6 b7 6 5 6 b7 6 5 4 3 3 - 1 2 2 4 - 5 6 7 5 - 5 3 2 1" ?song.3-4
. drums@dholak kit=tabla vol=0.7 "X...........x...|....x.x.x.....x.|..x.......x....." ?song.3-5
. drums@khartal kit=temple vol=1.5 "................|................|x..xx.x.x..xx.x." ?song.3-4
. crowd@swagat shout "KHAM-ma GHA-ni" "x-x-x-x-........" voices=10 voice=men vol=1.6 ?song.4
. crowd@gaon   murmur voices=12 voice=mixed vol=1.2 dyn="p mp" ?song.4-5
. strings@kamaicha-ant oct=3 grid=8 vol=0.7 human=0.6 dyn="mf p" "6 5 4 3 2 - 3 - 1 - - - - - - -" ?song.5
. chant@gayika-ant bright=0.7 voice=women oct=3 grid=8 human=0.6 vib=0.02 breath=0.12 dyn="mf p" ipa="pə dɦaː ɾoː _ mɦaː ɾeː deːs _" "6 5 4 3 2 - 3 - 1 - - - - - - -" ?song.5

*> space       field size=1.2
>  speaker     0.5
`,
};
