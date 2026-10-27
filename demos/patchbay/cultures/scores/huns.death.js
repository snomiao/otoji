// The strava of Attila: Hunnic music is lost, so the nearest living steppe traditions stand in: the riding song
// (ezengileer) and kargyraa of Tuva from Smithsonian Folkways' "Tuva: Voices from the Center of Asia" (1990), and the
// Kyrgyz funeral lament koshok (UNESCO ICHCAP); pulse, drone, glides and lament steps measured with refs/analyse.py.
SCORES["huns:death"] = {
  about: "the strava, the funeral song the best horsemen sang riding in circles round Attila's silk tent on the plain: a men's lament with sliding cries over a throat-sung drone and the gallop of the horses",
  heard: "the open plain at night, a silk tent in the middle with the body: the riders circle it at a gallop, singing his deeds; their voices come and go as they pass, the drone of a throat singer stays, and the wind carries everything far",
  refs: [
    { title: "Ezengileer (stirrup song); Steppe kargiraa", who: "Tuvan singers, Tuva: Voices from the Center of Asia (Smithsonian Folkways, 1990)", url: "https://www.youtube.com/watch?v=XwSkfv6ljS0" },
    { title: "Steppe kargiraa", who: "Tuva: Voices from the Center of Asia (Smithsonian Folkways, 1990)", url: "https://www.youtube.com/watch?v=ZxH4hpXpmrA" },
    { title: "Koshok, traditional Kyrgyz lamentation", who: "UNESCO ICHCAP documentary recording", url: "https://www.youtube.com/watch?v=n5rB9W3amx0" },
  ],
  measured: "a reconstruction: only Jordanes' Latin paraphrase of the words survives (shown as the caption; the riders sing cries, not words). Ezengileer: a drone on B♭2 with a riding pulse of 0.27 and 0.57 s (the gait, about 105 beats a minute in threes), bright (peak 2–4 kHz). Steppe kargiraa: slow onsets (185 ms), the whistled melody high above the drone. Koshok: wide vibrato (≈19 cents), one note in five glides, phrases falling from the 5th to the tonic through microtonal steps (about 160, 320, 470–560, 720, 820–880, 1000 cents). We keep the drone on B♭, the riders' gallop at 105, falling lament phrases with slides and that vibrato, on those steps. Our render: tonic B♭ with the drone A2–B♭2, the gallop at 103 a minute, vibrato 12 cents (the koshok's is 19), spectrum peak 250–1000 Hz like the lament; the Tuvan riding song's 2–4 kHz overtone brightness is missing (−12 dB), since our throat voice whistles softer than a real sygyt. The riders now slide like the koshok (glide=0.5, scoop=100, press=0.5 for the strained open throat): pyin on the koshok gives 42% of voiced time in a glide (0.18 s smoothed slope over 300 cents a second) and held notes shaking ±21 cents; our riders alone give 40% and ±23 cents. Still differs: the lament's band profile is darker than our pressed riders (her 1–2 kHz is −14 dB, ours −7), and every one of our joins is slow where about a third of hers are quick steps",
  text: `
. clock        105 4/4
. arrange@song kurgan:2bars strava:16bars tun:2bars
. scale@koshok 1 2:160 3:320 4:520 5:720 6:860 7:1000
. key          koshok Bb

. caption@l1   "Praecipuus Hunnorum rex Attila … fortissimarum gentium dominus" ?song.2
. wind@tala    0.3 gust=0.07Hz
. drums@atlar  kit=horses vol=0.5 "X.xxX.xxX.xxX.xx|........................................................................................................................x.......|................................................................................................................................" ?song.2
. drums@atlar-walk kit=horses vol=0.3 "x.......x.......x.......x......." ?song.1-3
. throat@kargyraa oct=3 vol=1.4 dyn="mp mf" "1 - - - 5 - 6 - 5 - 3 - 2 - 1 - 1 - - - 3 - 5 - 6 - 5 - 3 - 1 -" ?song.1-3
. chant@strava voice=men voices=8 vol=0.45 oct=3 grid=8 human=0.6 rubato=0.3 bright=0.5 vib=0.045 breath=0.15 press=0.5 glide=0.5 scoop=100 dyn="f ff f mf f ff f mp" ipa="aj _ o _ ej a _ o aj _ o _ ej a _ o aj _ o _ ej a _ o aj _ o _ ej a _ o aj _ o _ ej a _ o aj _ o _ ej a _ o aj _ o _ ej a" "5' - (6')5' 4'~3' 1' - - - 3' - 2' 1' 7 - 5 - 1' - - 7 5 - 4 - 3 - 1 - - - 0 0 1' - 3' - 5' - - - 6'~5' 4' 3' - 1' - - - 7 - 5 - 4~3 - 1 - 1 - - - 0 0 0 0 5' - (6')5' 4'~3' 1' - - - 3' - 2' 1' 7 - 5 - 1' - - 7 5 - 4 - 3 - 1 - - - 0 0 1' - 3' - 5' - - - 6'~5' 4' 3' - 1' - - - 7 - 5 - 4~3 - 1 - 1 - - - 0 0 0 0" ?song.2

*> space       field size=1.5 wet=0.2
>  speaker     0.5
`,
};
