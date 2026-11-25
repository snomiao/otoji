// Elia lrde ელია ლრდე: rebuilt from traditional Svan singers recorded by Frank Scherbaum's team (chords, cadence and the
// Svan tuning measured with refs/analyse.py and a multi-pitch view of the recording).
SCORES["georgians:thunder"] = {
  about: "Elia lrde ელია ლრდე, the Svan hymn to Elijah, master of lightning, sung by men in three voices in a slow round while thunder rolls over the valley",
  heard: "high in Svaneti during a storm: men link arms in a slow circle and sing to Elijah in three voices, close chords of fifth and octave; rain comes in on the wind and the thunder answers from the peaks",
  refs: [
    { title: "Elia lrde (Svan cult song), with a computational analysis of the Svan tuning", who: "traditional Svan singers, recorded by Frank Scherbaum, Nana Mzhavanadze et al. (2016)", url: "https://www.youtube.com/watch?v=iz_rAmfDPcQ" },
    { title: "Elia lrde, Svan cult-ritual song", who: "Nanina group (Voices of the Ancestors)", url: "https://www.youtube.com/watch?v=lDGYg5rQGiQ" },
  ],
  measured: "no steady beat, a chord every 1 to 3 s, about 63 s; three men's voices in homophony: the bass holds the home note (F3 region) and steps below it, the middle a fifth above (sometimes the fourth, 1–4–8 against 1–5–8), the top the octave; every phrase climbs back home by step from below, 6 → 7 → 1 (the measured roots sit 360, 180 and 510 cents under home); scale above home about 0, 190, 350, 500, 700, 840, 1020 cents (neutral 3rd and 6th, Svan, not 12-tone); vibrato ≈10 cents, attacks slow (150 ms), spectrum peak 500–1000 Hz. Ours follows the chord path, voicing and tuning (checked with pyin on a bass line alone: F3, D3 +40, Eb3 +20 as written) and the 63 s length (24 bars at 90); the storm (wind, rain, thunder) is ours, from the story. With bright=0.8 our 2–4 kHz is right (−7 dB against −17 with the rain in it); what differs: our voices still peak at 250–500 Hz (their fundamentals) where the singers peak at 500–1000 Hz, and the rain lifts our brightness to 2200 Hz against 1220; the singers slide into each chord, ours step",
  text: `
. clock        90 4/4
. arrange@song storm:2bars elia:24bars
. scale@lrde   1 2:190 3:350 4:500 5:700 6:840 7:1020
. key          lrde F tune=40

. caption@title "ელია ლრდე · Elia lrde" ?song.2
. wind@mta     0.25 gust=0.1Hz
. rain@tsvima  0.3 drops=0.25
. drums@ghrubeli kit=sky vol=0.7 "X...............................................x...............|..............................x.................................|................................................................"
. chant@kvemo  voice=men bright=0.8 voices=5 oct=3 grid=4 human=0.4 vib=0.005 breath=0.14 vol=0.55 dyn="mf f mf f f mf" ipa="e li a lər de" "1 - - 1 - - 6, - 7, - 1 - 5, - - 4, - - 1 - - 1 - 1 1 - - 1 - - 6, - 7, - 1 - 1 - - 1 - - 1 - 1 - 1 - 6, - - 6, 7, - 1 - - - 1 - 1 - - 1 - - 6, - 7, - 1 - 1 - - 1 - - 1 - 1 - 1 - 6, - - 6, 7, - 1 - - - 1 -" ?song.2
. chant@shua   voice=men bright=0.8 voices=4 oct=3 grid=4 human=0.4 vib=0.005 breath=0.14 vol=0.7 dyn="mf f mf f f mf" ipa="e li a lər de" "5 - - 4 - - 3 - 4 - 5 - 2 - - 1 - - 5 - - 4 - 5 5 - - 4 - - 3 - 4 - 5 - 5 - - 4 - - 5 - 4 - 5 - 3 - - 3 4 - 5 - - - 5 - 5 - - 4 - - 3 - 4 - 5 - 5 - - 4 - - 5 - 4 - 5 - 3 - - 3 4 - 5 - - - 5 -" ?song.2
. chant@zemo   voice=men bright=0.8 voices=3 oct=3 grid=4 human=0.4 vib=0.005 breath=0.14 vol=0.6 dyn="mf f mf f f mf" ipa="e li a lər de" "1' - - 1' - - 6 - 7 - 1' - 5 - - 4 - - 1' - - 1' - 1' 1' - - 1' - - 6 - 7 - 1' - 1' - - 1' - - 1' - 1' - 1' - 6 - - 6 7 - 1' - - - 1' - 1' - - 1' - - 6 - 7 - 1' - 1' - - 1' - - 1' - 1' - 1' - 6 - - 6 7 - 1' - - - 1' -" ?song.2

*> eq          low=-5 mid=6 high=3
>  space       valley size=1 wet=0.25
>  speaker     0.5
`,
};
