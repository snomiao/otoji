// Te Deum after the relief of Nándorfehérvár (1456): the noon bell that the Pope had ordered for the defenders rings out as a bell of thanksgiving, then a town church sings the Te Deum, the clergy and the people taking the verses in turn. Notes from the Antiphonale Monasticum via GregoBase, sung at the pitch and slow pace of Schola Hungarica, in the Hungarian way of pronouncing Latin (s as sh).
SCORES["magyars:triumph"] = {
  about: "Te Deum laudamus: the noon bell rings for the victory, then the hymn of thanksgiving in a Magyar town church, a cantor intoning, the friars and priests and the townspeople answering verse by verse",
  heard: "midday in a town church in Hungary in late summer 1456: the great bell in the tower tolling at noon, as it had every day to call for prayer and now for thanks; the nave fills with townspeople still talking; the cantor intones and the clergy in the choir take it up, the people answer from the nave, men and women together, slower and rougher; the stone church holds every phrase",
  refs: [
    { title: "Te Deum laudamus", who: "Schola Hungarica (László Dobszay, Janka Szendrei)", url: "https://www.youtube.com/watch?v=ZsBURJOYOaE" },
    { title: "Te Deum (Antiphonale Monasticum, 1934), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=9696" },
  ],
  measured: "Schola Hungarica (first 90 s): men in unison reciting on a note near G#3 (sung ~45 c above G), the half-verse cadences a tone and a third below, range D3–A#3, very broad (0.8 clear onsets a second, the reciting notes ~0.3–0.5 s and the cadences held 1–2 s), vibrato ~4 c, energy at 250–1000 Hz (brightness ~1430 Hz), a church tail of ~7 s. Ours: the first four verses from the 1934 book, recited on G#3 (key B), eighths at 66 with rubato, cantor / clergy / people alternating, with the noon bell before and after; the Hungarian 'sh' for Latin s. It differs in that we do not know whether a 15th-century Hungarian town used exactly this monastic form of the tone (Schola Hungarica follows medieval Hungarian sources, close to it), and our people sing more evenly than a town congregation. Our render: range D3–A#3 with the reciting note G#3 and cadences on F# and D#, exactly the record's frame; scale steps 0 200 290 700 1000 c like the record's 0 200 290 710 1000; brightness ~1270 Hz (record ~1430); the women double the people's verses an octave up, which the all-male record has not Revision: measured note by note, Schola Hungarica reaches 22% of its notes from more than 20 c below (12% from above) and slides through a quarter of its note changes (75th percentile 58 ms); so the singers now scoop (cantor 25 c, clergy 40, people 50/45) and glide (0.15), and the Latin accents carry stress marks. Render: 15–25% of notes from below, 12–15% from above, note changes p75 46–70 ms, close to the record; accents louder but not lengthened.",
  text: `
. clock        66 4/4
. arrange@song harang:4bars v1:4bars v2:3bars v3:4bars v4:4bars delharang:4bars
. key          major B

. caption@c1   "Te Deum laudamus: te Dominum confitemur." ?song.2
. caption@c2   "Te æternum Patrem omnis terra veneratur." ?song.3
. caption@c3   "Tibi omnes Angeli, tibi cæli et universæ potestates:" ?song.4
. caption@c4   "Tibi Cherubim et Seraphim incessabili voce proclamant:" ?song.5
. bell@harang  oct=2 grid=4 vol=0.8 human=0.3 "1 - - - - -" ?song.1
. bell@harang2 oct=2 grid=4 vol=0.8 human=0.3 dyn="f f f mf" "1 - - - - -" ?song.6
. bell@kisharang oct=3 grid=4 vol=0.35 human=0.5 "0 0 0 5 - - - 0 3 - - -" ?song.6
. crowd@nep    murmur "is-ten a-zon ha-rang go-zik a hi-rek gyoz-tunk" voices=24 voice=mixed vol=0.8 dyn="mp mf mf p" ?song.1
. chant@kantor scoop=25 glide=0.15 voice=men voices=1 oct=3 grid=8 human=0.3 rubato=0.35 vib=0.012 breath=0.07 dyn="f" ipa="te ˈde _ um lau _ ˈda _ muʃ" "3, 5, 6, 6, 6, 5, 6, 7, 6, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.2-5
. chant@papok scoop=40 glide=0.15  voice=men voices=8 oct=3 grid=8 human=0.4 rubato=0.35 vib=0.01 breath=0.07 dyn="mf" ipa="te ˈdo mi num kon fi _ ˈte _ _ mur ˈti _ bi ˈom neʃ _ ˈan ge _ li ˈti bi ˈtse li et u ni ˈver ʃe po te _ ˈʃta _ _ teʃ" "0 0 0 0 0 0 0 0 0 0 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 7, 1 7, 6, 7, 6, 5, 6, - 0 3, 5, 6, 6, 6, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.2-5
. chant@ferfiak scoop=50 glide=0.15 voice=men voices=12 oct=3 grid=8 human=0.8 rubato=0.4 drift=-10 vib=0.014 breath=0.12 dyn="f" ipa="te _ e ˈter num ˈpa _ trem ˈom niʃ ˈter ra ve ne _ ˈra _ _ tur ˈti _ bi ˈke ru bim et ˈʃe ra _ fim in tseʃ ˈʃa bi li ˈvo tse pro _ ˈkla _ _ mant" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 7, 1 7, 6, 7, 6, - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 7, 1 7, 6, 6, 7, 6, 5, 6, - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0" ?song.2-5
. chant@asszonyok scoop=45 glide=0.15 voice=women voices=10 oct=4 grid=8 human=0.8 rubato=0.4 drift=-10 vib=0.016 breath=0.12 vol=0.6 dyn="mf" ipa="te _ e ˈter num ˈpa _ trem ˈom niʃ ˈter ra ve ne _ ˈra _ _ tur ˈti _ bi ˈke ru bim et ˈʃe ra _ fim in tseʃ ˈʃa bi li ˈvo tse pro _ ˈkla _ _ mant" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 7, 1 7, 6, 7, 6, - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5, 7, 7, 1 7, 6, 6, 7, 6, 5, 6, - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - 0 0 0 0 0" ?song.2-5

*> space       church size=1.4 wet=0.42
>  eq          low=0 mid=6 high=-6
>  speaker     0.5
`,
};
