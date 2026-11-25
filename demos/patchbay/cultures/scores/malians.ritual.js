// Sunjata at the Kamablon: the kora accompaniment after Cordes anciennes (1970), the singing after the Diabate griots of
// Kela (2004); tempo, cycle, tonic and tunings measured with refs/analyse.py on demucs stems.
SCORES["malians:ritual"] = {
  about: "Sunjata ߛߎ߲ߖߊߕߊ, the Mande epic's own song, as the Diabate griots of Kela sing it at the reroofing of the Kamablon: the kora's rocking two-chord cycle, a jeli's praise lines and the women's answer, the iron karinyan scraping time",
  heard: "Kangaba, the day the Kamablon gets its new thatch: a crowd talks outside the round house; inside, close under the fresh straw, the jeliw of Kela sing the praises of Sunjata to kora and ngoni, the women answer each line, one of them scrapes the karinyan",
  refs: [
    { title: "Sunjata (Cordes anciennes, 1970)", who: "Sidiki Diabaté, Djelimady Sissoko, Batrou Sekou Kouyaté and others (koras)", url: "https://www.youtube.com/watch?v=LhaEq1cbJUk" },
    { title: "Kelajeliw 2004: the young Diabate griots of Kela after the restoration of the Kamablon", who: "Diabate family of Kela (video by Jan Jansen's team)", url: "https://www.youtube.com/watch?v=2ybN_ixi1ss" },
  ],
  measured: "Cordes anciennes Sunjata: tonic F♯ (pitch peaks F♯, D♯ 880, G♯ 200, C♯ 700, A♯ 390 and a low 7th near 1040 cents, not a 12-tone 7th), a steady pulse of 0.313 s (192 a minute) grouped in twos and an 8-pulse cycle of 2.5 s; kora bass on F♯2. Kela 2004: the voice phrases fall from the 4th and 3rd to the tonic and rest there, vibrato ≈13 cents, degrees about 0, 180, 300/400 (a 3rd that moves between minor and major), 510, 730, 890, 1010–1080; the karinyan's scrape is the brightest thing in the recording (4 kHz); the women answer in unison. We play the kumbengo (bass thumb rocking F♯–E under interlocking treble notes) at the measured pulse, with the voice lines written in the Kela style (praise names of Sunjata, traditional), not transcribed. Our render: the same 0.313 s pulse and 95.7 beat (the analyser finds both), tonic F♯, kora bass on E2–F♯2; the band profile is close below 250 Hz and above 1 kHz (within 2–6 dB) but has a bulge at 250–1000 Hz from the voices (the 1970 record is koras alone); our pulse is far more regular (clarity 0.8 against 0.17), the koras' own push and pull and their buzzing nyenyemo rattles are missing",
  text: `
. clock        96 4/4
. arrange@song kumbengo:4bars kuma:16bars birimintingo:4bars
. scale@sauta  1 2:200 3:390 4:600 5:700 6:880 7:1040
. scale@donkili 1 2:180 3:350 4:510 5:720 6:890 7:1040
. key          sauta F#

. caption@title "ߛߎ߲ߖߊߕߊ · Sunjata" ?song.2
. crowd@kangaba murmur "ka ma ba la ko ni ja ta se ma" voices=14 vol=0.6 dyn="mp p" ?song.1-3
. pluck@kora   oct=3 grid=8 human=0.5 dyn="mf mf" "1, 5 3 5 1, 5 3 5 7,, 4 2 4 7,, 4 2 4" ?song.1-3
. pluck@kora-treble oct=4 grid=8 human=0.5 vol=0.6 dyn="mp" "0 3 0 5 0 3 0 1' 0 2 0 4 0 2 0 7" ?song.1-2
. pluck@kora-run oct=4 grid=16 human=0.3 vol=0.6 dyn="mf mp" "5' 4' 3' 2' 1' 7 5 3 4' 3' 2' 1' 7 5 4 2 3' 2' 1' 7 5 4 3 1 2' 1' 7 5 4 2 7, 1" ?song.3
. pluck@ngoni  oct=3 grid=8 human=0.4 vol=1.0 dyn="mp" "1 - 3 5 1' - 5 3 7, - 2 4 7 - 4 2" ?song.2
. drums@karinyan kit=celtic vol=0.9 human=0.4 "................|................|x.xxx.xxx.xxx.xx" ?song.1-3
. chant@jeli   donkili F# voice=men bright=0.5 oct=3 grid=8 human=0.5 vib=0.03 breath=0.1 dyn="f mf f mf" ipa="sun dʒa ta _ _ ma ɡan kɔ na te ma ri dʒa ta sim bɔn _ na re ma ɡan" "5 - 5 4 3 - 2 1 - - 2 1 7, - 1 - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1' 1' 1' - 1' 7 5 - 4 4 3 - 2 1 - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.2
. chant@jelimusow donkili F# voice=women voices=5 oct=3 grid=8 human=0.5 vib=0.03 breath=0.12 vol=0.7 dyn="mf" ipa="e e sun dʒa ta _ _ e" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1' - 7 5 - - 4 5 - - 3 2 1 - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1' - 7 5 - - 4 5 - - 3 2 1 - - -" ?song.2

*> space       room size=0.8 wet=0.15
>  speaker     0.5
`,
};
