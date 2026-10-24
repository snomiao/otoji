// Ave maris stella on the deck of a Hanseatic cog sighting Flanders: the hymn in the Dominican form (Processionarium O.P., GregoBase; the Teutonic Order took the Dominican liturgy in 1244), sung by the crew in rough unison over the sea, after the lookout's cry of land.
SCORES["teutons:voyage"] = {
  about: "Ave maris stella, the Vespers hymn to Mary, Star of the Sea: the crew of an Order cog, out of the fog at last and in sight of the Flemish coast, sing three stanzas of it on deck",
  heard: "a heavy cog off Flanders on a spring morning: the fog thinning, the hull creaking and the sea slapping along the planks, wind in the rigging; the lookout in the masthead shouts land, then the brother in charge starts the hymn and the sailors join, a dozen men in the open air with no walls to answer them, a little behind each other and sinking slowly in pitch as unaccompanied singers do",
  refs: [
    { title: "Ave Maris Stella (Dominican chant)", who: "Dominican Friars of the Holy Trinity Convent, Kraków", url: "https://www.youtube.com/watch?v=HeGoncU5D7M" },
    { title: "Ave Maris Stella (Processionarium O.P., 1913), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=4594" },
  ],
  measured: "the Kraków Dominicans: men in unison on a final near D (sung ~30 c flat and sinking by most of a semitone over the hymn), range A#2–B3, the mode-1 tune D A A B G A B C D C B A G … tracked as in the Dominican book, ordinary notes 0.3–0.45 s and the line ends 1.3–1.6 s, ~2.5 notes a second, vibrato ~5 c, energy 125–1000 Hz (brightness ~1320 Hz), a long church tail. Ours: the Dominican notes (melismas on 'Ave', 'maris', 'stella', 'Mater', 'alma', 'Virgo', 'porta') for stanzas 1–3, 76 eighths a minute with rubato, a drift of −25 c a minute like the friars' sinking, in the open air with the sea, the hull and the wind instead of a church; it differs in that a ship's crew would sing far rougher than friars and than our voices. Our render, yin-tracked: D A B G A B C D C B G A D …, the Dominican line in order, sinking from −5 to −30 c over the first half minute; range C#3–B3, energy at 125–500 Hz, brightness ~1090 Hz (friars ~1320) with the sea and hull under it",
  text: `
. clock        76 4/4
. arrange@song nebel:3bars land:1bars hymnus:22bars
. key          dorian D

. caption@c1   "Ave maris stella, / Dei Mater alma, / atque semper Virgo, / felix cæli porta." ?song.3
. water@see    0.5 lap=0.6 splash=0.05 ?song.1-3
. boat@kogge   0.45 creak=0.5 ?song.1-3
. wind@takel   0.2 gust=0.1Hz ?song.1-3
. crowd@ausguck shout "LANT LANT" "x---x---........" voices=1 voice=men vol=2 ?song.2
. crowd@mannschaft shout "HO-LA" "........x-x-----" voices=10 voice=men vol=2 ?song.2
. chant@bruder voice=men voices=1 oct=3 grid=8 human=0.4 rubato=0.3 drift=-25 vib=0.012 breath=0.08 dyn="f" ipa="a ve _ _ ma ris _ stɛl _ la _ _ _" "1 5 5 6 4 5 6 7 1' 7 6 5 4 - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.3
. chant@matrosen vol=1.4 voice=men voices=12 oct=3 grid=8 human=0.8 rubato=0.35 drift=-25 vib=0.014 breath=0.12 dyn="mf f f f f f f f f f f f f f f f f f f mf mp" ipa="de i ma _ tɛr al _ ma at kve sɛm pɛr vir go _ _ _ _ _ fe liks tsɛ li pɔr _ _ ta su mɛns _ _ il lud _ a _ ve _ _ _ ga bri e _ lis o _ re fun da nos in pa tse _ _ _ _ _ mu tans e ve no _ _ mɛn sol ve _ _ vin kla _ re _ is _ _ _ pro fɛr lu _ mɛn tse _ tsis ma la nos tra pɛl le _ _ _ _ _ bo na kunk ta pos _ _ tse" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 5 1 2 4 3 2 1 - - 0 0 3 2 4 5 5 1 2 3 2 1 7, - - 0 2 4 2 3 2 1 7, 1 - - 0 0 0 0 0 1 5 5 6 4 5 6 7 1' 7 6 5 4 - - 0 5 5 1 2 4 3 2 1 - - 0 0 3 2 4 5 5 1 2 3 2 1 7, - - 0 2 4 2 3 2 1 7, 1 - - 0 0 0 0 0 1 5 5 6 4 5 6 7 1' 7 6 5 4 - - 0 5 5 1 2 4 3 2 1 - - 0 0 3 2 4 5 5 1 2 3 2 1 7, - - 0 2 4 2 3 2 1 7, 1 - - 0 0 0 0 0 0 0 0 0 0" ?song.3

*> space       field size=1.2 wet=0.22
>  eq          low=0 mid=0 high=-6
>  speaker     0.5
`,
};
