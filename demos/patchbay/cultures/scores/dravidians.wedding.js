// Kettimelam at the tying of the thali: rebuilt from mangala isai nadaswaram-and-thavil recordings (raga Madhyamavati, the auspicious closing raga), with T. N. Rajarathinam Pillai's 1943 concert for the nadaswaram's voice.
SCORES["dravidians:wedding"] = {
  about: "Kettimelam, the burst of nadaswaram and thavil at the moment the thali is tied: the mangala isai before it, the priest's mangalyam mantra, the call, the roar, and the music settling again",
  heard: "a wedding pandal of palm leaf and bamboo before the house, packed with relatives talking; two nadaswaram players and their thavil drummers stand at the side with the ottu drone and the talam; the priest chants, calls 'kettimelam!', the drums roar so no ill word can be heard, women raise the kulavai and rice is thrown",
  refs: [
    { title: "Getti Melam", who: "Mambalam M. K. S. Siva (nadaswaram troupe)", url: "https://www.youtube.com/watch?v=_wy-qxJDArE" },
    { title: "Ketti Melam, mangala isai", who: "nadaswaram and thavil (Vijay Musicals)", url: "https://www.youtube.com/watch?v=9ZLJiXSmnSw" },
    { title: "Nadaswaram concert, 1943", who: "T. N. Rajarathinam Pillai", url: "https://www.youtube.com/watch?v=m24O_qcF8c8" },
  ],
  measured: "Getti Melam (mix, then demucs stems): the nadaswaram's Sa sits about 55 cents above D4 (45 under D#), and the pitch classes are Sa, Ri 200, Ma 510, Pa 710 and kaisiki ni 1030, i.e. Madhyamavati, the auspicious closing raga; the nadaswaram mostly plays around the upper Sa (median 614 Hz) in fast repeated figures; the thavil strokes come evenly every 0.185 s (about 5.4 a second, triplet groups on a beat near 103-108), so the kettimelam runs at 81 bpm in sixteenths grouped in threes, swelling to 100; the mix is bright (centroid 2.4-3 kHz, the 2-4 kHz band loudest) and nearly flat in level (range 10 dB). Ours: same scale, the roll in threes, two nadaswarams over the ottu on the new double-reed model; written in D because the reed model sounds about 25 cents sharp (the render's Sa lands ~25 cents above D, ~30 under the record); centroid 2.0 kHz, 1-2 kHz loudest, level range 13 dB. Still different: the darbuka kit stands in for the thavil (no thimble crack, no stick on the thoppi, so the low band is too strong), the kulavai ululation is faint, and there is no nadaswaram gamaka beyond slides.",
  text: `
. clock        60 6/4
. arrange@song mangala:2bars mantra:2bars ketti:2bars@81 ketti2:2bars@~100 mangalam:2bars@56
. scale@madhyamavati 1 2:200 4:510 5:710 7:1030
. key          madhyamavati D

. caption@c1   "மாங்கல்யம் தந்துநாநேந மம ஜீவந ஹேதுநா" ?song.2
. caption@c2   "கெட்டிமேளம்! கெட்டிமேளம்!" ?song.3-4
. reed@ottu       oct=4 grid=8 vol=0.07 "1 - - - - - - - - - - -" ?song.1-5
. crowd@uravinar  murmur "a ma na le va ka ko tu na ri" voices=14 voice=mixed vol=0.7 dyn="mf mp p p mf f f f mf mp" ?song.1-5
. reed@nadaswaram oct=4 grid=8 vol=0.55 human=0.5 dyn="mf f" "5 - 7~1' 1' - 7 5 4 2~4 - 5 - 4 2 1 - 7, 1 2 4 5 - - -" ?song.1
. reed@nadaswaram2 oct=4 grid=8 human=0.6 vol=0.4 "5 - 7 1' - 7 5 4 2 - 5 - 4 2~1 1 - 7, 1 2 4 5 - - -" ?song.1
. drums@thavil    kit=darbuka vol=0.8 "X.......x.......x.x.....|....x.......x.......x...|..x...x.x.x...x...x.x.xx" ?song.1
. chant@purohit   rubato=0.3 voice=men oct=3 grid=16 human=0.5 vib=0.006 breath=0.15 ipa="maːŋ gal jaŋ tan tu naː ne na ma ma dʒiː va na he tu naː kaɳ ʈe bad naː mi su bʰa ge tvaŋ dʒiː va ʃa ra daʃ ʃa tam" "1 1 2 - 1 1 7, 1 1 - - 0 1 2 2 - 1 1 2 1 1 - - 0 2 2 4 - 2 1 1 7, 1 - - 0 1 1 2 1 7, 1 1 1 - - - -" ?song.2
. crowd@purohit-call shout "KET-ti-ME-lam KET-ti-ME-lam" "x-x-x-x-x-x-x-x-........" voices=3 vol=2 ?song.3
. drums@thavil-ketti kit=darbuka vol=1.0 "X..x..x..X..x..x..X..x.x|..x..x..x..x..x..x..x.xx|xxXxxXxxXxxXxxXxxXxxXxxX" ?song.3-4
. drums@talam     kit=daf vol=1.4 "........................|........................|x..x..x..x..x..x..x..x.." ?song.3-4
. reed@nadaswaram-ketti  oct=4 grid=16 vol=0.55 human=0.4 dyn="f ff" "1' 7 1' 7 1' 7 1' 7 5 7 1' - 1' 7 1' 7 2' 1' 7 1' 5 7 1' - 2' 1' 2' 1' 4' 2' 1' 7 1' 7 5 4 5 7 1' 7 5 4 2 4 5 7 1' -" ?song.3-4
. reed@nadaswaram2-ketti oct=4 grid=16 human=0.5 vol=0.4 dyn="f ff" "1' 7 1' 7 1' 7 1' 7 5 7 1' - 1' 7 1' 7 2' 1' 7 1' 5 7 1' - 2' 1' 2' 1' 4' 2' 1' 7 1' 7 5 4 5 7 1' 7 5 4 2 4 5 7 1' -" ?song.3-4
. crowd@kulavai   ululate voice=women voices=10 vol=2 dyn="f ff mf p" ?song.3-4
. crowd@vazhthu   shout "o-HO" "x-x-............x-x-...." voices=20 voice=mixed vol=1.5 ?song.4
. reed@nadaswaram-mangalam oct=4 grid=8 vol=0.55 human=0.5 dyn="mf mp" "1' 7 5 4 2 - 4 2 1 - - - 7, 1 2 - 1 - - - - - - -" ?song.5
. drums@thavil-mangalam kit=darbuka vol=0.8 "X.......x.......X.......|....x.......x...........|..x.x.......x.x........." ?song.5

*> space       pavilion size=1.5
>  speaker     0.5
`,
};
