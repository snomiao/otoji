// A hsaing waing at a pagoda festival: the hne oboe's free opening, then the full ensemble (pat waing drum circle, kyi waing gongs, si and wa keeping time, the big pat ma), written in the style of an old field recording of a Burmese hsaing waing (its pitch set in cents, tempo and timbre measured); our own melody.
SCORES["burmese:showcase"] = {
  about: "a hsaing waing piece: the hne plays a free, ornamented opening over a few drum calls, then the ensemble comes in together, the pat waing running round the tune, the gongs doubling it in octaves, the si bell and wa clapper keeping the cycle, faster at the end",
  heard: "the open ground of a pagoda festival at night: stalls and families talking and walking about, the musicians on a raised wooden stage in the gilded circle of the pat waing, everything loud and outdoors",
  refs: [
    { title: "Burma: Hsaing Waing", who: "traditional hsaing waing ensemble (archival recording)", url: "https://www.youtube.com/watch?v=i-sReU1mrJY" },
    { title: "Hsaing Waing, Kyaukpadaung (field recording)", who: "South Seas Voice Workshop", url: "https://www.youtube.com/watch?v=KRBHpbA7qoA" },
  ],
  measured: "'Burma: Hsaing Waing' (mix and demucs stems): the pitch set clusters on a final about 25 cents above C# (written C#) with steps near 175, 360, 530, 680, 910 and 1050 cents, neither Western nor equal; the hne and gongs sit high (median ~610 Hz, B3-C6), the music is loud, bright and busy (centroid 2.6 kHz, 3.2 onsets a second, noisiness 0.02) with fast drum-circle runs at 136/272 a minute and long free passages (pulse clarity 0.03 over the whole track). Ours: that pitch set in cents, a free hne opening (rubato) then the ensemble at 136 rising to 150, pat waing running in sixteenths round a hne tune, kyi waing in alternating octaves, si and wa on the beats; the render gives 136 bpm and 5.9 onsets a second. Still different: the melody is ours, in the style, not the record's; the pat waing is the timpani voice (one drum sound, no tuned set of 21 drums with their paste-tuned ring), the kyi waing is a generic bell, so our centroid stays at 1.2 kHz against 2.6; the hne has none of the record's flutter-tongued ornaments and wide slides.",
  text: `
. clock        136 4/4
. arrange@song pwe:2bars hne:4bars@92 hsaing:8bars@136 hsaing2:8bars@~150 thein:2bars@100
. scale@hsaing 1 2:175 3:360 4:530 5:680 6:910 7:1050
. key          hsaing C#

. caption@c1   "ဆိုင်းဝိုင်း · ပတ်ဝိုင်း · နှဲ" ?song.2-4
. crowd@pwe-thu murmur voices=24 voice=mixed vol=1.4 dyn="mf mf p p p p p p p p p p p p p p p p p p p p mf mf" ?song.1-5
. reed@hne-solo rubato=0.7 oct=5 grid=8 human=0.6 vol=0.5 dyn="mf f" "5 - (6)5 - 3~2 - 1 - 2 3 (6)5 - - 6 5 3 2~1 - 1 2 3 5 3 - - 2 1 - - - - -" ?song.2
. timpani@pat-waing-solo oct=3 grid=16 vol=0.7 human=0.5 "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 2 3 5 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 3 2 1" ?song.2
. reed@hne     oct=5 grid=8 human=0.5 vol=0.5 dyn="f" "5 - 6 5 3 - 2 1 2 3 5 - 6 1' 6 5 3 5 6 5 3 2 1 2 3 - - - 2 1 6, 1" ?song.3-4
. timpani@pat-waing oct=3 grid=16 human=0.4 vol=0.3 dyn="mf f" "1 2 3 5 3 2 1 2 3 5 6 5 3 5 3 2 1 2 1 6, 1 2 3 2 1 2 3 5 6 1' 6 5 3 5 6 5 3 2 1 2 3 2 3 5 3 2 1 2 3 5 3 2 1 6, 1 2 3 2 1 6, 5, 6, 1 -" ?song.3-4
. bell@kyi-waing oct=4 grid=8 human=0.4 vol=0.5 "5 - 6 5' 3 - 2 1' 2 3' 5 - 6 1' 6 5' 3 5' 6 5' 3 2' 1 2' 3 - - - 2 1' 6, 1'" ?song.3-4
. drums@si-wa  kit=temple vol=0.6 "................|....x.......x...|x.......x......." ?song.3-5
. drums@pat-ma kit=taiko vol=0.7 "X...............................|................................|................................" ?song.3-4
. reed@hne-thein oct=5 grid=8 human=0.5 vol=0.5 dyn="f mp" "3 - 2 1 6, - 1 - - - - - - - - -" ?song.5
. timpani@pat-waing-thein oct=3 grid=16 vol=0.8 "3 2 1 6, 1 - - - - - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 1 - - -" ?song.5

*> space       field size=1.4
>  speaker     0.5
`,
};
