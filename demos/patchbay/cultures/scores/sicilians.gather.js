// The cialoma at the raising of the tuna net: rebuilt from the tonnara chanteys recorded by Alan Lomax and Diego
// Carpitella in 1954 ("U leva leva", soloist and a chorus of Sicilian and Calabrian fishermen) and the Favignana
// "Aiamola" cialoma; tonic, scale, pulse and the call-and-response shape measured with refs/analyse.py.
{
  // the rais calls a line high, the crew answers 'oh leva leva' as they heave on the capstan (2 bars each)
  const call = "1' 1' 7 6 - 6 5 4 3 5 - - 0 0 0 0";
  const answer = "5 - 6 1' - 2' 7 1' - - - - 0 0 0 0";
  const R = "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
  const rais = [call, R, call, R, call, R, call, R].join(" ");
  const crew = [R, answer, R, answer, R, answer, R, answer].join(" ");
  const callWords = "e ti ra mu la _ ran ka ta ri spon di mu a tut ta vu tʃi a ja mo la e vai a van ti e ti ra mu la _ ran ka ta";
  SCORES["sicilians:gather"] = {
    about: "The cialoma of the tonnara: the rais calls, the crew answers 'oh leva leva' as they haul the net of the death chamber up from the sea and the tuna thrash",
    heard: "spring at the tonnara of Favignana, the black barges drawn in a square over the last chamber of the nets, out on the open sea in the sun: the rais gives the order and a man with a big high voice calls the cialoma, the crews heave in rhythm, bare feet slapping the deck, ropes and timbers creaking; the water churns white as the fish come up, the men shout and gaff them",
    refs: [
      { title: "U leva leva (tuna-fishing chantey), Vibo Valentia Marina, 1954", who: "Rocco Cannovino and fishermen, recorded by Alan Lomax and Diego Carpitella", url: "https://www.youtube.com/watch?v=W1DEg175TP8" },
      { title: "Canto della Tonnara: Cialoma – Aiamola e vvai avanti", who: "tonnaroti of Favignana", url: "https://www.youtube.com/watch?v=LZy6Stzjzok" },
    ],
    measured: "Lomax 1954: a soloist high (to G5) and a men's chorus answering, tonic G, a scale with a low second and a neutral seventh (0 180 390 500 710 890 1040 cents), each call descending 1' 7 6 5 4 3 to the fifth, ~3.5 onsets a second over a heavy walking pulse (~108), vibrato ~14 c, 17% glides, bright and open-air (energy 500–1000 Hz, little low end, brightness ~2 kHz). Favignana: the same call-and-response, slower, the answers held long. Ours: that scale on G at 108, the call and the answer two bars each, feet on the deck on the beat, sea, timbers, shouts at the gaffing, open air. Differs: the record is a re-enactment for the collectors (no fish were in the net); our crowd and splashing stage the mattanza itself. Render check: tonic G, the scale 180 390 490 700 880 1040 cents as on the Lomax record, range D4–G5 (record B3–G5), 3.3 onsets a second at 108 (record 3.5), bands 1–2 kHz −10 and 2–4 kHz −9 dB (record −11, −18): a little brighter; the deck and the sea add low end the record lacks",
    text: `
. clock        108 4/4
. arrange@song order:2bars c1:2bars r1:2bars c2:2bars r2:2bars c3:2bars r3:2bars c4:2bars r4:2bars mattanza:4bars
. scale@tonnara 1 2:180 3:390 4:500 5:710 6:890 7:1040
. key          tonnara G

. caption@c1   "E tiramul' a rancata" ?song.2-3
. caption@c2   "Rispondimu a tutta vuci" ?song.4-5
. caption@c3   "Aiamola, e vvai avanti" ?song.6-7
. water@mare   0.18 lap=0.5 splash=0.08 ?song.1-9
. water@churn  0.7 lap=0.9 splash=0.9 ?song.10
. boat@barche  0.4 creak=0.6
. crowd@rais   shout "A-ja MO-la" "x-x-x---........" voices=1 voice=men vol=2 dyn="ff" ?song.1
. chant@cantaturi voice=men oct=4 grid=8 human=0.5 vib=0.012 breath=0.15 bright=0.6 dyn="f" ipa="${callWords}" "${rais}" ?song.2-9
. chant@ciurma voice=men voices=12 oct=3 grid=8 human=0.7 vib=0.012 breath=0.25 dyn="f" ipa="o le va le va _" "${crew}" ?song.2-9
. drums@peri   kit=flamenco vol=0.35 "x...x...x...x...|................|................" ?song.2-10
. crowd@mattanza shout "dai DAI a-MMAZ-za" "x-x-x-x-........" voices=24 voice=men vol=2 dyn="f ff ff f" ?song.10

*> space       field size=1.2 wet=0.18
>  speaker     0.5
`,
  };
}
