// Δεῦτε τελευταῖον ἀσπασμὸν δῶμεν, the hymn of the last kiss: rebuilt from Iakovos Nafpliotis's early recording (protopsaltis of the Great Church), its melody outline and real intervals measured with refs/analyse.py and a pitch-track histogram.
SCORES["byzantines:death"] = {
  about: "Δεῦτε τελευταῖον ἀσπασμὸν δῶμεν, the idiomelon of the funeral service, sung slowly by one psaltis over a held ison while the mourners come to give the last kiss",
  heard: "a stone church with the body lying before the icon screen: candles, the censer's chains clinking as the priest swings it, people weeping quietly; one chanter sings alone, slow and ornate, another holds the ison; when the hymn ends the family comes forward for the kiss and the women's lament rises",
  refs: [
    { title: "Δεῦτε τελευταῖον ἀσπασμόν", who: "Iakovos Nafpliotis (protopsaltis of the Patriarchate, early 20th-century recording; Kalan, Bizans Kilise Müziği 5)", url: "https://www.youtube.com/watch?v=lNe41lZC7yY" },
  ],
  measured: "solo man's voice on a base A3 (to 0 cents), a quiet ison; steady-pitch histogram: 0, 200 (150-180 when it falls back to the base), 405-415, 520-540, 770 above and 170 and 330 below, so whole-tone steps up to the third and then a narrow-wide pair (about 120 then 240 cents) above it, the Second Echos colour, nothing like 12-tone minor or the profile's echos2 on 133/367; phrases start with long held notes (4 s on the base), dip to the low 6 and 7 and climb back, reach 5 at the peak of each line and come to rest on the base or on the third; free rhythm (no pulse), 0.5 onsets a second, a dense fast vibrato-tremolo of ±25 cents on held notes, 6-7 s of church tail. Ours follows the scale in cents, the range (low 6 to 5), the shape of each line and the slow pace (an eighth = 0.42 s, with breaths where he breathes); the notes are written in the style from the outline. Still differs: the engine's chant cannot slide or ornament (Nafpliotis's quick turns, the glides into the third, the shake on held notes), its rhythm is metric, and the voice is darker and smoother than his nasal, bright old-style tone",
  text: `
. clock        72 4/4
. arrange@song ναός:2bars δεῦτε:4bars ἀσπασμόν:4bars ἀδελφοί:4bars εὐχαριστοῦντες:4bars ἀσπασμός:4bars@~60
. scale@deuteros 1 2:200 3:410 4:530 5:770 6:870 7:1030
. key          deuteros A

. caption@c1   "Δεῦτε τελευταῖον ἀσπασμὸν" ?song.2
. caption@c2   "δῶμεν, ἀδελφοί," ?song.3
. caption@c3   "τῷ θανόντι," ?song.4
. caption@c4   "εὐχαριστοῦντες Θεῷ·" ?song.5
. crowd@penthos murmur "a ma na mu pe di mu o hi o hi e le i son" voices=8 voice=mixed pitch=0.95 vol=1.2 dyn="p pp pp pp pp p" ?song.1-6
. drums@thymiato kit=elephants vol=0.8 "................................|................................|x.......x.........x.......x....." ?song.1-6
. chant@isokrates voice=men voices=1 oct=3 grid=8 vol=0.16 vib=0.004 breath=0.12 ipa="ne _ _ _ _ _" "0 0 0 0 1 - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - 0 0 0 0 0 0 0 0" ?song.1-6
. chant@psaltis voice=men voices=1 oct=3 grid=8 human=0.8 vib=0.016 breath=0.08 dyn="mp mf mf mp mf mf f mf mp mf mf mp mf mf mf p" ipa="ðef te _ te _ _ lef _ te _ on a spaz _ mon _ _ _ ðo _ _ men _ a _ _ ðel fi _ to θa _ _ non _ di _ _ _ ef _ xa _ ɾi _ _ stun _ _ _ des _ _ _ θe o _ _ _" "1 - - - - - - - 0 0 6, - - - 7, 0 6, 7, 1 2 1 - - 0 3 2 0 7, - - 0 0 1 - 2 1 2 3 4 3 - 0 0 5 4 - - 3 - 0 3 - 1 - 0 1 6, 7, 1 - - - 0 0 7, 1 - - - 0 0 1 1 2 7, - 0 1 - 2 - 0 3 - 4 2 7, - - - - - - - 0 0 1 2 3 - 4 5 4 3 0 2 3 3 4 3 5 4 3 3 - - - - 0 7, 1 2 1 - - - 0 0" ?song.2-5
. chant@moirologi voice=women voices=3 oct=4 grid=8 human=0.9 vol=0.5 vib=0.03 breath=0.25 dyn="p mp p" ipa="ax _ _ o _ _ _ _ _ _ _" "5 - 4 3 - - 2 - 1 - - - 0 0 0 0 4 - 3 2 - 1 7, - 1 - - - - - 0 0" ?song.6

*> space       church size=1.2 wet=0.4
>  speaker     0.5
`,
};
