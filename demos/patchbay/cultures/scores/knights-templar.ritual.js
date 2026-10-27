// Psalm 132 (133), Ecce quam bonum, sung by the brothers at the reception of a new Templar: the antiphon from the
// Antiphonale Monasticum (1934, the melody already in the St Gall antiphoner of c. 990) via GregoBase, the psalm on the
// first tone with its ending, at the pitch and pace of the Pluscarden monks' recording (measured with refs/analyse.py).
{
  // C-major degrees (white-note first mode): 6, = A3 the reciting tone, 2, = D3 the final
  const antiphon = ["6, 6, 5, 6, 5, 3, 4, 5, 3, 4, 3, 2, - 3, 4, 6, 5, 4, 3, 4, 5, 4, 3, 2, - 2, - - 0 0",
    "ˈek tʃe kwam ˈbo _ num et kwam ju ˈkun _ dum a bi ˈta re _ ˈfra _ tres in _ ˈu num"];
  // the psalm: intonation F G (first verse and Gloria), tenor A, mediant G A, ending G F G A
  const psalm = [
    ["4, 5, 6, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "ˈek tʃe kwam ˈbo num et kwam ju ˈkun dum a bi ˈta re ˈfra tres in ˈu num"],
    ["6, 6, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 6, 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "ˈsi kut un ˈɡwen tum in ˈka pi te kwod de ˈʃen dit in ˈbar bam ˈbar bam ˈa ron"],
    ["6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "kwod de ˈʃen dit in ˈo ram ve sti ˈmen ti ˈe jus ˈsi kut ros ˈer mon kwi de ˈʃen dit in ˈmon tem ˈsi on"],
    ["6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "ˈkwo ni am ˈil lik man ˈda vit ˈdo mi nus be ne dik tsi ˈo nem et ˈvi tam ˈus kwe in ˈse ku lum"],
    ["4, 5, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "ˈɡlo ri a ˈpa tri et ˈfi li o et ˈspi ri tu i ˈsan kto"],
    ["6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 6, - 0 6, 6, 6, 6, 6, 6, 6, 5, 4, 5, 6, - 0 0 0", "ˈsi kut ˈe rat in prin ˈtʃi pi o et nunk et ˈsem per et in ˈse ku la se ku ˈlo rum a ˈmen"],
  ];
  const fit = (p) => { const t = p.split(" "); while (t.length % 8) t.push("0"); return t; };
  // the form: the cantor begins the antiphon, all finish it; the psalm verses alternate between the two sides of the chapter; all repeat the antiphon
  const parts = [antiphon, ...psalm, antiphon].map(([p, w]) => [fit(p), w.split(" ")]);
  const ant = parts[0][0], two = 2; // the cantor's two notes "Ecce"
  const who = (i) => (i === 0 || i === parts.length - 1 ? "all" : i % 2 ? "left" : "right");
  const rest = (t) => t.map(() => "0");
  const lineFor = (side) => parts.map(([t], i) => {
    if (side === "cantor") return (i === 0 ? [...t.slice(0, two), ...rest(t.slice(two))] : rest(t)).join(" ");
    if (i === 0) return [...rest(t.slice(0, two)), ...t.slice(two)].join(" ");
    return (who(i) === "all" || who(i) === side ? t : rest(t)).join(" ");
  }).join(" ");
  const wordsFor = (side) => parts.flatMap(([, w], i) => side === "cantor" ? (i === 0 ? w.slice(0, two) : [])
    : i === 0 ? w.slice(two) : who(i) === "all" || who(i) === side ? w : []).join(" ");
  const arrange = ["chapter:2bars", ...parts.map(([t], i) => `${i === 0 ? "ant" : i === parts.length - 1 ? "antrep" : "v" + i}:${t.length / 8}bars`)].join(" ");
  const caps = ["Ecce quam bonum, et quam jucundum habitare fratres in unum.", "Ecce quam bonum, et quam jucundum, * habitare fratres in unum.",
    "Sicut unguentum in capite, * quod descendit in barbam, barbam Aaron.", "Quod descendit in oram vestimenti ejus: * sicut ros Hermon, qui descendit in montem Sion.",
    "Quoniam illic mandavit Dominus benedictionem, * et vitam usque in sæculum.", "Gloria Patri, et Filio, * et Spiritui Sancto.",
    "Sicut erat in principio, et nunc, et semper, * et in sæcula sæculorum. Amen.", "Ecce quam bonum, et quam jucundum habitare fratres in unum."];
  const all = `2-${parts.length + 1}`;
  SCORES["knights-templar:ritual"] = {
    about: "Ecce quam bonum, the psalm of brothers dwelling together in unity, chanted by the Templars in chapter at night when a new brother has taken the white mantle",
    heard: "the chapter house at night, a vaulted stone room lit by a few candles, the brothers on benches along both walls, the new knight kneeling in his white mantle; a cantor begins the antiphon, all finish it, then the two sides of the room take the psalm verse by verse on one reciting note, and all sing the antiphon again",
    refs: [
      { title: "Psalm 132: Ecce quam bonum et quam iucundum", who: "The Monks of Pluscarden Abbey", url: "https://www.youtube.com/watch?v=edzjX5Vij4g" },
      { title: "Antiphon Ecce quam bonum (Antiphonale Monasticum 1934, p. 140), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=10122" },
      { title: "Antiphon Ecce quam bonum (Cod. Sang. 390, c. 990), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=20094" },
    ],
    measured: "Pluscarden: unison men reciting on A3 (−20 c) for long stretches (one pitch held over 3–8 s of syllables), the cadences falling a tone and a fourth/fifth below (0 500 700 990 around the final), range C#3–A3, ~2.1 syllables a second, vibrato ~6 c, energy 125–1000 Hz flat then falling ~8 dB an octave, an ~8 s church tail. Ours: the antiphon notes from the 1934 book (the same melody as the St Gall antiphoner of c. 990), the psalm in the first tone (intonation F G, tenor A, mediant G A, ending G F G A as the antiphon's euouae gives it), A3 as Pluscarden sings it, one syllable an eighth at 96 (3.2 a second, quicker than Pluscarden as a small community recites), the two sides of the chapter alternating. Differs: our psalm tone puts the mediant and ending on the last syllables without following the Latin accents, as a real cantor would; the chapter house is our staging. Render check: reciting note and final as Pluscarden (A3, range C#3–A3), cadence degrees 0 500 800 1000 around A, 1.7 syllables a second with the breaths, bands 500–1000 −7, 1–2 kHz −14, 2–4 kHz −15 dB (Pluscarden −2, −10, −18), tail ~4 s against ~8 in the abbey church Revision: Pluscarden's notes start as often above as below (29%/29% by more than 20 c) and change in under 25 ms, so no scoop or glide here; the Latin word accents now carry stress marks, as the psalm is recited in speech rhythm. Render: syllable-peak spread p90–p10 rose from 8.0 to 9.5 dB (Pluscarden 15.2); the accents are louder but not longer, which the engine cannot yet do.",
    text: `
. clock        96 4/4
. arrange@song ${arrange}
. key          major C

${caps.map((c, i) => `. caption@c${i + 1} "${c}" ?song.${i + 2}`).join("\n")}
. crowd@brothers murmur "a-men pa-ter fa-ter de-us" voices=8 vol=1.2 dyn="mp p" ?song.1
. chant@cantor voice=men oct=4 grid=8 human=0.25 vib=0.01 breath=0.06 dyn="mf" ipa="${wordsFor("cantor")}" "${lineFor("cantor")}" ?song.${all}
. chant@leftside voice=men voices=7 oct=4 grid=8 human=0.35 vib=0.008 breath=0.06 dyn="mf" ipa="${wordsFor("left")}" "${lineFor("left")}" ?song.${all}
. chant@rightside voice=men voices=7 oct=4 grid=8 human=0.35 vib=0.008 breath=0.06 dyn="mf" ipa="${wordsFor("right")}" "${lineFor("right")}" ?song.${all}
cantor,leftside,rightside> eq@vault mid=4 high=-10

*> space       church size=0.75 wet=0.38
>  speaker     0.5
`,
  };
}
