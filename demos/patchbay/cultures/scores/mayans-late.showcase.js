// Three Maya sounds of the highlands, after Folkways field recordings: the tun and long trumpets of the Rabinal Achí (1945), the chirimía and drum of a cofradía (Chuj, 1973), and a small marimba (Tz'utujil, 1969).
SCORES["mayans-late:showcase"] = {
  about: "the Xajoj Tun's long trumpets and tun slit drum; then the chirimía shawm and the drum that lead a saint's procession; then a small wooden marimba played by two men in steady eighths",
  heard: "a highland town at fiesta time, out of doors: the Rabinal Achí in the church plaza, a cofradía procession coming down the street with its shawm and drum and the smell of copal, and a marimba under a roof at the edge of the market, people talking around it",
  refs: [
    { title: "Rabinal Achí: Son del Quiché Achí / Son del Rabinal Achí", who: "Achi musicians of Rabinal, recorded by Henrietta Yurchenco, 1945 (Folkways)", url: "https://www.youtube.com/watch?v=lcypEPBtOCc" },
    { title: "Drum and Chirimía", who: "Chuj musicians from San Mateo Ixtatán (Music of Guatemala Vol. 2, Folkways 1973)", url: "https://www.youtube.com/watch?v=_dm56yMuds0" },
    { title: "Small Marimba", who: "Tz'utujil musicians (Music of Guatemala Vol. 1, Folkways 1969)", url: "https://www.youtube.com/watch?v=eh-0We3LiJc" },
  ],
  measured: "Rabinal 1945 (trumpet stem): rests on D♯, 0 150 510 680/750 910 cents, the two trumpets ~70 c apart on the fifth, tun about once every 2 s. Chuj chirimía: a narrow tune on B♭ with notes about 570, 900 and 1200 cents above it, held notes up to 5 s between quick turns, 99 in two, 1–2 kHz. Tz'utujil marimba: steady eighths at 96 in two, a non-tempered scale with two thirds (360 and 430 c), 250–500 Hz. Ours: each section at its measured tempo (60, 99, 96; rendered, the chirimía section measures 99.4 resting on B♭ with 590 and 920 c, the marimba 95.7 in two) with its own scale@ in cents, and the melodies rebuilt from each stem's note sequence. The Rabinal trumpets now use the natural-trumpet bell (bell=natural: buzz, a long scoop, a wandering pitch), as in the battle scene. Still differs: the shawm is smoother and less nasal than the Chuj player's; the marimba has no buzzing membranes on its resonators, and our marimba peaks at 250–500 Hz with a weaker upper octave",
  text: `
. clock        60 4/4
. arrange@song xajoj-tun:8bars@60 chirimia:13bars@99 marimba:12bars@96
. scale@trumpet-a 1 2:150 4:510 5:680 6:910
. scale@trumpet-b 1 2:150 4:510 5:750 6:910
. scale@shawm     1 4:570 6:900
. scale@tzutujil    1 2:190 3:360 4:430 5:710
. key          trumpet-a D#

. crowd@town   murmur "la ki xa ta wa ri ke cha" voices=12 voice=mixed vol=0.6 dyn="p"
. marimba@tun  oct=2 grid=16 human=0.3 vol=0.9 "1 - - - - - - - 2 - - - - - - -" ?song.1
. brass@trompeta bell=natural oct=5 grid=16 human=0.4 rubato=0.3 drift=6 dyn="mf f mf f mf f mp mf" "1, 1, 1, 1, - 5, - 6, 2 - 2 - - - 2 - - - 5, 5, 5, - 1 - - 1 - 1 - 2 - - - 2 - - 2 - - - - 6, - - - - - - - - - - - 0 - 1, - 5, 5, - 5, 6, - - 2 - 5, 5, - 5, - 1, - 5, - 5, 5, 1, - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.1
. brass@trompeta-2 bell=natural scale=trumpet-b oct=5 grid=16 human=0.6 rubato=0.4 drift=-8 vol=0.8 "0 1, 1, 1, 1, - 5, - 6, 2 - 2 - - - 2 - - - 5, 5, 5, - 1 - - 1 - 1 - 2 - - - 2 - - 2 - - - - 6, - - - - - - - - - - - 0 - 1, - 5, 5, - 5, 6, - - 2 - 5, 5, - 5, - 1, - 5, - 5, 5, 1, - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.1
. reed@chirimia scale=shawm key=A# oct=3 grid=8 human=0.5 rubato=0.2 vol=0.55 dyn="f" "1 - 6, 1 1 1 1 - - 1 1 - 6 6 - 6 - - - 1' 6 6 6 6 - - - - - - - - 6 4 - 6 6 4 6 - 1 1 - - - - 1 1 4 6 6 6 - - 1' 6 6 - - - - - - - - - 4 6 6 6 6 1 4 4 1' - 6 6 6 1' - - - - - - - - - - - - - - - - - - - - - - - -" ?song.2
. drums@tambor kit=african vol=0.45 "X.......X...x...|................|................" ?song.2
. marimba@k-ojom scale=tzutujil key=G# oct=3 grid=8 human=0.4 vol=1.1 "5 1' 4 5, 5, 5, 4 4 5 5 4 5 5 4 5 5 3 4 4 4 3 4 5 4 4 5 1' 1' 1' 1' 1' 1' 1' 1' 1' 1' 1' 4 5 5 5 4 4 4 5 4 5 5" ?song.3
. marimba@k-ojom-bass scale=tzutujil key=G# oct=2 grid=8 human=0.3 vol=0.9 "1 - 5, - 1 - 5, - 4, - 1 - 5, - 1 -" ?song.3

*> space       courtyard size=2 wet=0.2
>  eq          low=-3 mid=2 high=2
>  speaker     0.5
`,
};
