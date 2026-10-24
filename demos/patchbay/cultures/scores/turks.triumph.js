// Dede Korkut comes to the feast: the Oghuz ozan's art heard through its living heir, the Azerbaijani aşıq with his saz,
// after Aşıq Məhbub Xəlili's Qəhrəmanı havası (the heroes' air; tonic, mode, pulse and the saz's ring measured with
// refs/analyse.py on demucs stems). The words are from the Book of Dede Korkut.
SCORES["turks:triumph"] = {
  about: "the bard Dede Korkut sings the hero's tale into a song at the victory feast, to his kopuz: a heroic aşıq air in 6/8, the lute ringing its open strings under a voice that stays near its tonic",
  heard: "white pavilions pitched on a green meadow for a feast of forty days: the beys sit on carpets, meat and kumis go round and the talk is loud until the white-bearded bard tunes his kopuz; then they listen, and shout their blessing at the end",
  refs: [{ title: "Qəhrəmanı havası (the heroes' air)", who: "Aşıq Məhbub Xəlili, voice and saz", url: "https://www.youtube.com/watch?v=o_iUym5ldm4" }],
  measured: "a stand-in (no Oghuz music was written down): the aşıq is the heir of the ozan. Tonic F (+10 cents); the voice keeps within A3–A4, mostly on the tonic and a 2nd about 185 cents up, with a minor 3rd near 290 and falling to the lower 7th and 6th (about 990 and 905 cents) at phrase ends, syllabic and almost without vibrato (≈5 cents); the saz rings on the tonic, the 2nd (205), the 4th and the 7th; the pulse is an eighth of 0.25 s grouped in threes (0.755 s), so a 6/8 at 80 dotted quarters; the saz's metal strings make the recording bright (brightness 3100 Hz, strong up to 8 kHz). The tune is in the aşıq's style, not his air (his words are 20th-century); the verses are the tale's formulas: 'Dede Korkut came and told the tale, sang the lineage' and the blessing 'may your white-bearded father's place be paradise, your white-haired mother's place be heaven'. Our render: tonic F, the voice D3–A♯4 on the same degrees (180, 280, 490, 700, 900, 990), the 0.25 s eighth in threes (0.755 s); the saz is our lute model, rounder than his steel strings (brightness about 2000 Hz against 3100 even with a high shelf), and he sings closer and harder than our formant voice",
  text: `
. clock        120 3/4
. arrange@song saz:12bars boy:12bars alqis:2bars
. scale@ashiq  1 2:185 3:290 4:500 5:705 6:905 7:990
. key          ashiq F

. caption@l1   "Dədəm Qorqud gəlib boy boyladı, soy soyladı" ?song.2
. crowd@obalar murmur "ba ja sa ma ko gu ta na bek ol" voices=16 vol=0.8 dyn="mf p" ?song.1
. crowd@alqis  shout "a-MIN a-MIN" pattern="x-x---x-x-------" voices=20 vol=0.9 ?song.3
. chant@dede   voice=men oct=4 vol=0.45 grid=8 human=0.5 rubato=0.15 bright=0.6 vib=0.012 breath=0.1 dyn="f mf f f" ipa="dæ dæm qor qud ɟæ lib boj boj la dɯ soj soj la dɯ bu oɣ uz naː mæ ji dæ dæm qor qud dyz di qoʃ dɯ aɣ sa qal lɯ ba ban je ri utʃ maq ol sun _ aɣ bir tʃæk li a nan je ri be hiʃt ol sun _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2 3 3 2 3 2 1 2 2 3 2 1 7, 1 - - 0 0 5 5 4 3 4 3 2 3 2 1 2 1 7, 6, - - 0 0 3 3 3 2 3 4 3 2 1 2 - 1 7, 1 - - 0 0 2 3 2 1 7, 1 2 1 7, 6, - 6, 7, 1 - - 0 0" ?song.1-2
. pluck@kopuz  oct=4 grid=8 human=0.4 vol=2 dyn="mf mp" "2 3 3 2 3 2 1 2 2 3 2 1 7, 1 - - - - 5 5 4 3 4 3 2 3 2 1 2 1 7, 6, - - - - 3 3 3 2 3 4 3 2 1 2 - 1 7, 1 - - - - 2 3 2 1 7, 1 2 1 7, 6, - 6, 7, 1 - - - - 2 3 3 2 3 2 1 2 2 3 2 1 7, 1 - - - - 5 5 4 3 4 3 2 3 2 1 2 1 7, 6, - - - - 3 3 3 2 3 4 3 2 1 2 - 1 7, 1 - - - - 2 3 2 1 7, 1 2 1 7, 6, - 6, 7, 1 - - - -" ?song.1-2
. pluck@kopuz-strum oct=3 grid=8 human=0.4 vol=0.8 dyn="mp" "1+5 1 2 1 1+5 7," ?song.1-3
. drums@daf    kit=daf vol=0.25 "X.....x.....|...x.....x..|x.x.x.x.x.x." ?song.3

*> eq          mid=2 high=8
>  space       pavilion size=1.2 wet=0.2
>  speaker     0.5
`,
};
