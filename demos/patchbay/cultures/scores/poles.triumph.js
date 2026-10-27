// Hejnał mariacki: the tower call of St Mary's in Kraków, transcribed from the trumpeter's own playing (pitches and holds measured), sounded four times to the four sides over the market square after the hour bell.
SCORES["poles:triumph"] = {
  about: "Hejnał mariacki, the call a trumpeter sounds from the tower of St Mary's over the Kraków market square, breaking off in mid-phrase; the hour bell strikes first, then the call goes out four times, once from each window",
  heard: "the Rynek on a festive day: a crowd in the square talking, falling quiet when the bell strikes; the trumpet comes from high up and far off, the long notes hanging between the house fronts and the cloth hall; each repeat comes from another window of the tower, so one sounds near and bright and the next turned away and dim",
  refs: [
    { title: "Hejnał mariacki", who: "St Mary's tower trumpeter, recorded from the square", url: "https://www.youtube.com/watch?v=WVQbxXvyG7A" },
    { title: "Hejnał Mariacki, Kraków (the hour bell and all four calls)", who: "recorded from the Rynek", url: "https://www.youtube.com/watch?v=-Z6Oa3Gbi7c" },
  ],
  measured: "one call, pitch-tracked note by note: F4 held ~3.4 s; A4 C5 then F5 held ~3.2 s; C5 A4 F4 then C5 held; A4 held ~1.6 s; F4 A4 C5 (1.7 s) A4 F4; F4 held ~2.9 s; A4 F4 A4 C5 (1.4 s) A4 F4, C5 held ~4 s; A4 held, then it breaks off. Only the notes of the F major chord (a natural-trumpet arpeggio) plus a passing Bb in the second record; tuning A≈440 in one record and about 35 c sharp in the other; quick notes ~0.17–0.2 s, the held ones fermatas of 1.5–4 s with the square's echo hanging on (rt60 measured ~7 s, much of it the echo off the houses); brightness ~1.7 kHz, energy peaking at 1–2 kHz. Ours follows the notes and holds on a 16th grid at 72 bpm (each fermata a fixed length, which the trumpeter varies a little), four calls at falling then rising loudness for the four windows, the hour struck before, the crowd hushing. Our render, tracked the same way: F4 3.3 s, A4 C5 F5 2.5 s, C5 A4 F4 C5 held, A4, F4 A4 C5 A4, F4 3.3 s, A4 F4 A4 C5 A4 F4 C5 3.8 s, A4 broken off: the same notes and holds; with the lip-buzz brass at f (all four calls f; vol= is only how far each window is turned away) the energy now peaks at 1–2 kHz as on the record, so the old eq lift is gone (now low −3, mid +1, high −2) and a 3 kHz low-pass stands for the height and distance: bands 500–1000 −5, 2–4 kHz −4, 4–8 kHz −28 dB under the peak (record −3, −9, −29), centroid 1.8 kHz (record 1.4 kHz with the square's crowd). Still differs: 2–4 kHz is about 5 dB brighter than the record; the lips' scoop on the attacks is too short to show in the pitch track (the record's too)",
  text: `
. clock        72 4/4
. arrange@song godzina:3bars poludnie:11bars zachod:11bars polnoc:11bars wschod:11bars
. key          major F

. caption@c1   "Hejnał mariacki" ?song.2
. crowd@rynek  murmur "ja-ku-pa ni-e mo-ve ta-ko to-je ve-chu je-ku-je po-she pa-ni" voices=14 voice=mixed vol=0.7 dyn="mf p pp pp pp pp pp pp pp pp p p p p p p mp" ?song.1-5
. bell@dzwon   oct=3 grid=4 vol=0.8 "1 - - 1 - - 1 - - - - -" ?song.1
. brass@trabka oct=4 grid=16 human=0.3 rubato=0.25 dyn="f" "1 - - - - - - - - - - - - - 0 0 3 5 1' - - - - - - - - - - - 0 0 5 - - 3 1 5 - - - - - - - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 3 - - - - - - - 0 0 0 0 0 0 0 0 1 3 5 - - - - - - 3 - 1 - 0 0 0 1 - - - - - - - - - - - - - 0 0 3 1 3 5 - - - - - - 3 - 1 - 5 - - - - - - - - - - - - - - - - - 0 0 3 - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.2
. brass@trabka2 oct=4 grid=16 human=0.3 rubato=0.25 vol=0.55 dyn="f" "1 - - - - - - - - - - - - - 0 0 3 5 1' - - - - - - - - - - - 0 0 5 - - 3 1 5 - - - - - - - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 3 - - - - - - - 0 0 0 0 0 0 0 0 1 3 5 - - - - - - 3 - 1 - 0 0 0 1 - - - - - - - - - - - - - 0 0 3 1 3 5 - - - - - - 3 - 1 - 5 - - - - - - - - - - - - - - - - - 0 0 3 - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.3
. brass@trabka3 oct=4 grid=16 human=0.3 rubato=0.25 vol=0.35 dyn="f" "1 - - - - - - - - - - - - - 0 0 3 5 1' - - - - - - - - - - - 0 0 5 - - 3 1 5 - - - - - - - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 3 - - - - - - - 0 0 0 0 0 0 0 0 1 3 5 - - - - - - 3 - 1 - 0 0 0 1 - - - - - - - - - - - - - 0 0 3 1 3 5 - - - - - - 3 - 1 - 5 - - - - - - - - - - - - - - - - - 0 0 3 - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.4
. brass@trabka4 oct=4 grid=16 human=0.3 rubato=0.25 vol=0.6 dyn="f" "1 - - - - - - - - - - - - - 0 0 3 5 1' - - - - - - - - - - - 0 0 5 - - 3 1 5 - - - - - - - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 3 - - - - - - - 0 0 0 0 0 0 0 0 1 3 5 - - - - - - 3 - 1 - 0 0 0 1 - - - - - - - - - - - - - 0 0 3 1 3 5 - - - - - - 3 - 1 - 5 - - - - - - - - - - - - - - - - - 0 0 3 - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.5
trabka,trabka2,trabka3,trabka4> filter@height lp 3000 q=0.5

*> space       courtyard size=3 wet=0.45 dry=0.7
>  eq          low=-3 mid=1 high=-2
>  speaker     0.5
`,
};
