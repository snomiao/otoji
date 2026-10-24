// Rabinal Achí (Xajoj Tun): the two warriors' sones on the long trumpets and the tun, after Henrietta Yurchenco's 1945 recording in Rabinal (Folkways).
SCORES["mayans-late:battle"] = {
  about: "the dance-drama Rabinal Achí: the Son of K'iche' Achi and the Son of Rabinal Achi, two long valveless trumpets wailing slightly apart in pitch over the slow strokes of the tun slit drum, as the two warriors circle each other",
  heard: "in the plaza of Rabinal before the church at the January fiesta: masked dancers circle slowly on the packed earth, the townspeople stand around and talk softly, the trumpets and the tun are heard far across the open square",
  refs: [
    { title: "Rabinal Achí: Son del Quiché Achí / Son del Rabinal Achí", who: "Achi musicians of Rabinal, recorded by Henrietta Yurchenco in 1945 (Folkways, Music of the Maya-Quiches of Guatemala)", url: "https://www.youtube.com/watch?v=lcypEPBtOCc" },
  ],
  measured: "1945 record, demucs 'other' stem (the trumpets): rests on D♯ (+30 c), uses about 0 150 510 680/750 910 cents, the fifth heard both at 680 and at 750 (the two trumpets are not in tune with each other, which is the sound), notes 0.2–3 s with quick repeated tonguings on one note and long held calls, vibrato ~6 c, energy at 1–2 kHz; drum stem: the tun only about once every 2 s, no steady fast beat. Ours: the same cents in two scale@ lines (one trumpet each), the tune rebuilt from the stem's note sequence on a 16th grid at 60 with rubato and opposite pitch drift, the tun twice a bar on its two tongues; rests on D♯, spectrum 250 Hz–2 kHz. Still differs: the synth brass has no breathy, buzzing lip attack of the real long trumpets and cannot crack between partials; the drama's spoken K'iche' dialogue between the sones is not here",
  text: `
. clock        60 4/4
. arrange@song quiche:8bars rabinal:8bars
. scale@trumpet-a 1 2:150 4:510 5:680 6:910
. scale@trumpet-b 1 2:150 4:510 5:750 6:910
. key          trumpet-a D#

. crowd@plaza  murmur "la ki xa ta wa ri ke cha" voices=14 voice=mixed vol=0.6 dyn="p"
. marimba@tun  scale=trumpet-a oct=2 grid=16 human=0.3 vol=0.9 "1 - - - - - - - 2 - - - - - - -"
. drums@tun-wood kit=aztec vol=0.6 "................|X.......x.......|................"
. brass@trompeta oct=5 grid=16 human=0.4 rubato=0.3 drift=6 vol=1 dyn="mf f mf f mf f mp mf" "1, 1, 1, 1, - 5, - 6, 2 - 2 - - - 2 - - - 5, 5, 5, - 1 - - 1 - 1 - 2 - - - 2 - - 2 - - - - 6, - - - - - - - - - - - 0 - 1, - 5, 5, - 5, 6, - - 2 - 5, 5, - 5, - 1, - 5, - 5, 5, 1, - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.1
. brass@trompeta-2 scale=trumpet-b oct=5 grid=16 human=0.6 rubato=0.4 drift=-8 vol=0.8 dyn="mf" "0 1, 1, 1, 1, - 5, - 6, 2 - 2 - - - 2 - - - 5, 5, 5, - 1 - - 1 - 1 - 2 - - - 2 - - 2 - - - - 6, - - - - - - - - - - - 0 - 1, - 5, 5, - 5, 6, - - 2 - 5, 5, - 5, - 1, - 5, - 5, 5, 1, - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.1
. brass@trompeta-r oct=5 grid=16 human=0.4 rubato=0.3 drift=6 vol=1 dyn="mf f mf f mf f mp mf" "5, 5, - - - 5, 4, 4, - - - 1, - - 4, - - - 4, 4, 4, - - - 5, - 1 - - 1 - 6, - 5, - 4, - - - - - 5, 5, 6, - 2 - - - - - 1 - 6, - 5, - - 4, - 5, - 1, - - - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.2
. brass@trompeta-r2 scale=trumpet-b oct=5 grid=16 human=0.6 rubato=0.4 drift=-8 vol=0.8 dyn="mf" "0 5, 5, - - - 5, 4, 4, - - - 1, - - 4, - - - 4, 4, 4, - - - 5, - 1 - - 1 - 6, - 5, - 4, - - - - - 5, 5, 6, - 2 - - - - - 1 - 6, - 5, - - 4, - 5, - 1, - - - - - - - - - 0 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.2

*> space       courtyard size=2.2 wet=0.2
>  eq          low=-4 mid=2 high=3
>  speaker     0.5
`,
};
