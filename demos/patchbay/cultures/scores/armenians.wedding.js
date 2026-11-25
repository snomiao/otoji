// Kochari: rebuilt from the Melodiya record "Folk Tunes of Armenia" (1983), zurna players Yeghish Markaryan and Artashes
// Babayan with dhol (mode in cents, tempo and the dhol's 3+3+2 measured with refs/analyse.py on demucs stems).
SCORES["armenians:wedding"] = {
  about: "Kochari քոչարի, the linked-arm line dance of Armenian weddings, on two zurnas (one holding the dam drone) and dhol, getting faster as the dancers stamp",
  heard: "the wedding yard at night after the lavash and the broken plates: the zurna players and the dhol stand in the middle, the guests link little fingers in a long line, stamp and shout, and the tune speeds up until the line breaks into laughter",
  refs: [{ title: "Kochari (Folk Tunes of Armenia, Melodiya C30-19151, 1983)", who: "Yeghish Markaryan and Artashes Babayan, zurna, with dhol", url: "https://www.youtube.com/watch?v=IXFRHjmQwTc" }],
  measured: "tonic E♭ (about 45 cents sharp of D♯4), the zurna between F♯4 and G♯5, spending most time on the 7th and the tonic; pitch peaks above the tonic at about 100, 320, 510, 690, 770 and 1020 cents (a low 2nd, minor 3rd and 7th: a phrygian/kurdi colour, not equal-tempered); the dhol's onsets repeat every 0.987 s, a 2/4 bar of 16ths at 122 a minute, grouped 3+3+2 (autocorrelation peaks at 0.37 and 0.24 s); the zurna's spectrum peaks at 2–4 kHz (brightness 3700 Hz), the dhol's at 0–250 Hz; a second zurna holds the tonic. The tune is written in the record's idiom and mode, not transcribed. Our render: the 0.987 s bar with its 3+3+2 accents, and the mode's degrees as measured on the record (10, 110, 340, 540, 690, 1020 cents above the tonic against its 15, 110, 335, 525, 705, 1035); our zurna peaks at 1–2 kHz where the record's blares at 2–4 kHz (brightness 2400 Hz against 3700), and the players' circular-breathed tone has more edge and grit",
  text: `
. clock        122 2/4
. arrange@song dam:2bars par:16bars par2:16bars@~136
. scale@kochari 1 2:100 3:320 4:510 5:690 6:770 7:1020
. key          kochari Eb tune=45

. caption@title "Քոչարի · Kochari" ?song.2
. crowd@harsaniq murmur "ha ja so ne ka ri ba ma" voices=12 vol=0.7 dyn="mp" ?song.1-3
. crowd@paroghner shout "HEI ha" pattern="................................................x---x---........................................................................" voices=10 vol=0.6 ?song.2-3
. reed@zurna   oct=4 grid=16 human=0.3 vol=1.0 dyn="f f ff" "1' - - - 2' 1' 7 1' 2' - 4' - 2' 1' 2' - 1' - 7 - 5 - 7 1' 2' 1' 7 - 1' - - - 1' - - - 2' 1' 7 1' 2' - 4' - 2' 1' 2' - 1' - 7 - 5 - 7 1' 2' 1' 7 - 1' - - - 4' - 3' 2' 3' - 4' - 3' 2' 1' 2' 3' - 2' 1' 2' - 1' 7 1' - 7 5 7 1' 2' 7 1' - - - 4' - 3' 2' 3' - 4' - 3' 2' 1' 2' 3' - 2' 1' 2' - 1' 7 1' - 7 5 7 1' 2' 7 1' - - -" ?song.2-3
. reed@dam-zurna oct=4 grid=8 human=0.2 vol=0.3 dyn="mf" "1 - - - - - - - - - - - - - - -" ?song.1-3
. drums@dhol   kit=darbuka vol=0.5 human=0.3 "X..X....|......x.|.xx.xx.x" ?song.1-3
. drums@votker kit=african vol=0.25 "X.......X.......|................|................" ?song.2-3

*> eq          low=-4 high=6
>  space       courtyard size=1.2 wet=0.2
>  speaker     0.5
`,
};
