// Salve Regina (simple tone) on the Order's feast of the Assumption: the Marian antiphon as the Liber Usualis gives it (public domain), sung by the brethren in procession into the castle church, the feast bells ringing outside and villagers filling the nave.
SCORES["teutons:festival"] = {
  about: "Salve Regina, the Marian antiphon, sung by the white-mantled brethren on 15 August, the Assumption, the Order's great feast: the bells of the castle ring the people in, then the brethren sing to the Virgin in unison",
  heard: "the castle church at Marienburg on the morning of the feast: the bells ringing in the tower, villagers from the fields talking in the nave; then the procession of brethren comes in two by two and they sing the antiphon in unison, unaccompanied, slowly, the brick vault holding each phrase-end; the people fall quiet",
  refs: [
    { title: "Salve Regina (simple tone)", who: "Gregorian Chant Academy, a single cantor", url: "https://www.youtube.com/watch?v=vNzsu_-rFe0" },
    { title: "Salve Regina, antiphona (tonus monasticus)", who: "Benedictine monks of the Abbaye Saint-Maurice de Clervaux", url: "https://www.youtube.com/watch?v=qaUwfIeRDCc" },
    { title: "Salve Regina, simple tone (engraving)", who: "German Wikipedia's score of the Liber Usualis chant", url: "https://de.wikipedia.org/wiki/Salve_Regina" },
  ],
  measured: "cantor record: the mode-5 tune sung on B♭ (B♭2–A3, men's register), the notes B♭ D F G F / G B♭ A G F G F F / B♭ F G E♭ E♭ C / D E♭ F D D C B♭ for 'Salve Regina … spes nostra, salve', then 'Ad te clamamus, exsules filii Hevae' as F F G A B♭ F G A B♭ A G F G-F (pitch-tracked; consistent with the chant's formulas); syllables 0.3–0.45 s, phrase ends ~0.8–1 s; vibrato ~7 c; voice energy at 125–1000 Hz, brightness ~780 Hz; a long church tail (rt60 ~8.9 s estimated). Ours: those two sentences only (the antiphon goes on: 'Ad te suspiramus …' is not sung here because we could not follow it reliably in the record), in B♭, 76 eighths a minute, men in unison in a church space, the bells and the people before; it differs in that our pulse is a grid loosened by rubato where the chant's is truly free and the voices are cleaner than a monastic choir. Our render, pitch-tracked: B♭ D F G F F G B♭ A G F G F F F B♭ G E♭ C D D B♭ … — the chant's notes in order; range A2–A3; voice energy at 125–500 Hz like the record, brightness about 1 kHz against the record's 780 Hz",
  text: `
. clock        76 4/4
. arrange@song glocken:4bars salve:8bars
. key          major Bb

. caption@c1   "Salve, Regina, mater misericordiae; / vita, dulcedo et spes nostra, salve. / Ad te clamamus, exsules filii Hevae." ?song.2
. bell@glocke1 oct=3 grid=4 vol=0.5 "1 - - - 5, - -" ?song.1
. bell@glocke2 oct=3 grid=4 vol=0.35 "0 3 - - - -" ?song.1
. crowd@volk   murmur "ja ma-ri-a hoi-te fe-te ko-me la-se gu-ten tak" voices=20 voice=mixed vol=0.6 dyn="mf mf mp p pp" ?song.1-2
. chant@brueder rubato=0.4 voice=men voices=12 oct=2 grid=8 human=0.5 vib=0.007 breath=0.05 dyn="mf mf f mf mf mf mp" ipa="sal ve re gi na ma ter mi se ri kor di ɛ vi ta dul tse _ do ɛt spɛs no stra sal _ ve ad te kla ma mus ɛk su lɛs fi li i hɛ vɛ _" "1 3 5 6 5 - - 0 6 1' 7 6 5 6 5 5 - - 0 1' 5 6 4 4 2 - 0 3 4 5 3 3 2 1 - - - 0 5 5 6 7 1' - 0 5 6 7 1' 7 6 5 6 5 - - - 0 0 0 0 0 0 0" ?song.2

*> space       church size=1.6 wet=0.48
>  eq          low=1 mid=-2 high=-14
>  speaker     0.5
`,
};
