// Ein feste Burg ist unser Gott on the walls of a besieged Hanseatic town at night: Luther's hymn (1529, public domain) sung in unison by the burghers on watch, as Lutheran congregations sang it then without an organ, in the rain, with the siege guns firing from the trenches.
SCORES["germans:siege"] = {
  about: "Ein feste Burg ist unser Gott, Luther's hymn of God as a stronghold, sung by the townsmen keeping watch on the walls of Stralsund in 1628 while the imperial guns fire and the rain floods the trenches",
  heard: "on the rampart walk at night in a summer downpour: a few dozen merchants and craftsmen with muskets, singing the whole first verse in unison, loud and rough, in the plain tune of the Lutheran hymnals; a second group further along the wall answers a beat late; out in the dark the heavy guns of the besiegers boom every half minute, a musket cracks now and then; no instruments",
  refs: [
    { title: "Osiander: Ein feste Burg ist unser Gott (cantional setting, 1586)", who: "vocal ensemble (Release topic)", url: "https://www.youtube.com/watch?v=mqhhczS674s" },
    { title: "Johann Walter: Ein feste Burg ist unser Gott", who: "Musica Antiqua Wien, Bernhard Klebel", url: "https://www.youtube.com/watch?v=nYH3nNKzRbY" },
    { title: "Ein feste Burg ist unser Gott (EG 362), melody", who: "Wikimedia Commons MIDI of the hymnal tune", url: "https://commons.wikimedia.org/wiki/File:Ein_feste_Burg_ist_unser_Gott_(EG_362_sp%C3%A4tere_Form).mid" },
  ],
  measured: "the tune from the hymnal MIDI (the later even-note form; Luther's 1529 print is syncopated, which we do not have note for note); Osiander's cantional setting: the tune on top in D (D4–D5), a quarter of ~0.75 s, almost no vibrato (~5 c), voices bright at 500–2000 Hz (brightness ~1310 Hz), a church tail. Ours: the tune in D for men (D3–D4), 80 bpm, 9 lines with the melismas on 'unser', 'Waffen', 'böse', 'seinsgleichen'; sung in unison by two groups on the open wall (field space), with rain, cannon and musket; it differs in that our crowd is synthetic and too steady in pitch, the tune is the later even form, and there is no echo of a church. Our render measured: tonic D, range D2–A4 (the guns reach down to D2), the voices' band at 250–500 Hz, brightness ~2.9 kHz because the rain fills the top (the voices alone sit near the record's 1.3 kHz), dynamics swelling from the rain-only opening to the singing",
  text: `
. clock        80 4/4
. arrange@song nacht:4bars lied:20bars
. key          major D

. caption@c1   "Ein feste Burg ist unser Gott, / ein gute Wehr und Waffen. / Er hilft uns frei aus aller Not, / die uns jetzt hat betroffen." ?song.2
. rain@regen   0.4 drops=0.4 ?song.1-2
. wind@sturm   0.15 gust=0.1Hz ?song.1-2
. drums@belagerung kit=guns vol=0.5 "x.....................................................................|.......................x.............x.......|...............................................................................................x..............." ?song.1-2
. crowd@wache  murmur "va-ha ho-ra ru-he da dor-ten la-den" voices=6 voice=men vol=1.2 dyn="mp p 0" ?song.1
. chant@buerger voice=men voices=12 oct=3 grid=8 human=0.7 vib=0.01 breath=0.1 dyn="f f f f f f f f f f ff ff f f f f f f f f" ipa="aɪn fɛs tə bʊrk ɪst ʊn _ zɐ gɔt aɪn guː tə veːr ʊnt va _ _ fən eːr hɪlft ʊns fraɪ aʊs al _ lɐ noːt diː ʊns jɛtst hat bə trɔ _ _ fən deːr alt bøː _ zə faɪnt mɪt ɛrnst eːrs jɛtst maɪnt groːs maxt ʊnt fiːl lɪst zaɪn graʊ zam rʏs tʊŋ ɪst aʊf eːrt ɪst nɪxt zaɪns glaɪ _ _ xən" "1' - 1' - 1' - 5 - 7 - 1' 7 6 - 5 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 1' - 1' - 1' - 5 - 7 - 1' 7 6 - 5 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 1 - 5 - 6 5 #4 - 5 - - 0 1 - 5 - 6 - 7 - 1' - - 0 7 - 1' - 7 - 6 - 5 - - - - 0 6 - 6 - 5 - 6 - 4 - 3 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 0 0 0 0 0 0" ?song.2
. chant@weiter voice=men voices=8 oct=3 grid=8 human=0.8 vib=0.012 breath=0.12 vol=0.45 ipa="aɪn fɛs tə bʊrk ɪst ʊn _ zɐ gɔt aɪn guː tə veːr ʊnt va _ _ fən eːr hɪlft ʊns fraɪ aʊs al _ lɐ noːt diː ʊns jɛtst hat bə trɔ _ _ fən deːr alt bøː _ zə faɪnt mɪt ɛrnst eːrs jɛtst maɪnt groːs maxt ʊnt fiːl lɪst zaɪn graʊ zam rʏs tʊŋ ɪst aʊf eːrt ɪst nɪxt zaɪns glaɪ _ _ xən" "0 1' - 1' - 1' - 5 - 7 - 1' 7 6 - 5 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 1' - 1' - 1' - 5 - 7 - 1' 7 6 - 5 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 1 - 5 - 6 5 #4 - 5 - - 0 1 - 5 - 6 - 7 - 1' - - 0 7 - 1' - 7 - 6 - 5 - - - - 0 6 - 6 - 5 - 6 - 4 - 3 - - - - 0 1' - 7 - 6 - 5 - 6 - 4 3 2 - 1 - - - 0 0 0 0 0 0 0 0" ?song.2

*> space       field size=1.5 wet=0.3
>  speaker     0.5
`,
};
