// Te Deum in San Lawrenz, Birgu, on 8 September 1565 when the Great Siege was lifted: the chant from the Antiphonale
// Monasticum (1934) via GregoBase, sung at the Solesmes monks' pitch and pace, in alternation with the organ as Italian
// churches of the 1560s did (after Cavazzoni's alternatim organ verses); bells and the guns of Fort St Angelo around it.
{
  // verses of the hymn: [notes as C-major degrees (the reciting tone on 6, = A), Latin in IPA]
  const V = [
    ["3, 5, 6, 6, 6, 5, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te ˈde _ um lau _ ˈda _ mus te ˈdo mi num kon fi _ ˈte _ _ mur"],
    ["5, 7, 7, 1 7, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ e ˈter num ˈpa _ trem ˈom nis ˈter ra ve ne _ ˈra _ _ tur"],
    ["5, 7, 7, 1 7, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈti _ bi ˈom nes _ ˈan dʒe _ li ˈti bi ˈtʃe li et u ni ˈver se po te _ ˈsta _ _ tes"],
    ["5, 7, 7, 1 7, 6, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈti _ bi ˈke ru bim et ˈse ra _ fim in tʃes ˈsa bi li ˈvo tʃe pro _ ˈkla _ _ mant"],
    ["5, 6, 7, 6, - - 0 0 0", "ˈsan _ _ ktus"],
    ["5, 6, 7, 6, - - 0 0 0", "ˈsan _ _ ktus"],
    ["5, 6, 7, 6, - - 7, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈsan _ _ ktus ˈdo mi nus ˈde us _ ˈsa ba _ ot"],
    ["5, 7, 7, 7, 1 7, 6, 6, 7, 6, - - 0 3, 5, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈple _ ni sunt ˈtʃe li et ˈter _ ra ma je ˈsta tis ˈɡlo ri e _ ˈtu _ _ e"],
  ];
  const fit = (t) => { t = t.slice(); while (t.length % 8) t.push("0"); return t; };
  const sung = (i) => i % 2 === 0, organ = (i) => i % 2 === 1;
  // the organ's verse: the chant as a cantus firmus in the tenor, each note a quarter with a plain triad over it
  const step = (tok, k) => { const m = /^(\d)([',]*)$/.exec(tok); const d = +m[1] - 1 + k, o = (m[2].match(/'/g) || []).length - (m[2].match(/,/g) || []).length + Math.floor(d / 7);
    return `${(d % 7) + 1}${o > 0 ? "'".repeat(o) : ",".repeat(-o)}`; };
  const organVerse = (p) => p.split(" ").flatMap((x) => (x === "-" || x === "0" ? [x, x] : [`${x}+${step(x, 2)}+${step(x, 4)}`, "-"]));
  const verse = (i) => (organ(i) ? organVerse(V[i][0]) : V[i][0].split(" "));
  const T = V.map((v, i) => fit(verse(i)));
  const line = (pick) => T.map((t, i) => (pick(i) ? t : t.map(() => "0")).join(" ")).join(" ");
  const words = V.filter((v, i) => sung(i)).map((v) => v[1]).join(" ");
  const arrange = ["bells:4bars", ...T.map((t, i) => `v${i + 1}:${t.length / 8}bars`), "guns:4bars"].join(" ");
  const caps = ["Te Deum laudamus: te Dominum confitemur.", "Te æternum Patrem omnis terra veneratur.", "Tibi omnes Angeli, tibi cæli et universæ potestates:",
    "Tibi Cherubim et Seraphim incessabili voce proclamant:", "Sanctus,", "Sanctus,", "Sanctus, Dominus Deus Sabaoth.", "Pleni sunt cæli et terra majestatis gloriæ tuæ."];
  const hymn = `2-${V.length + 1}`, last = V.length + 2;
  SCORES["maltese:triumph"] = {
    about: "Te Deum laudamus in San Lawrenz at Birgu when the Great Siege ends: the knights and the people sing the verses of the chant, the organ answers every other verse, and the bells of every church still standing ring",
    heard: "a battered church by the harbour, full of starved and wounded people, knights in their red surcoats, women and children come up out of the ruins; outside every bell left in the town rings and the guns of the fort fire a salute; inside the Grand Master's choir and the people sing the hymn verse by verse and the organ plays the verses between, in the Italian manner",
    refs: [
      { title: "Hymne: Te Deum", who: "Chœur des moines de l'Abbaye Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=O_kN19-2h3s" },
      { title: "Cavazzoni, Gloria (in alternatim) from the Missa de Beata Virgine", who: "Schola Gregoriana Benedetto XVI with organ", url: "https://www.youtube.com/watch?v=OjF7sRnaIxc" },
      { title: "Te Deum (Antiphonale Monasticum 1934, p. 1250), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=9696" },
    ],
    measured: "Solesmes: the reciting note between A# and B, cadences a tone and a minor third below, ~2.5 syllables a second, vibrato ~10 c, energy 125–1000 Hz. Cavazzoni (first 120 s): the organ's energy sits 125–1000 Hz with a strong low end (0–125 Hz −9 dB), ~3.5 onsets a second, no pulse, plain diatonic harmony around the chant. Ours: the chant on Bb3 at 88 for the sung verses (knights, men and women of Birgu), organ verses with the chant as a cantus firmus in quarters under plain triads and doubled an octave down in the pedal, church space; bells before and after, a salute of guns at the end. Differs: Cavazzoni's verses are free counterpoint over the chant, ours only harmonise it note by note; the Maltese people's own songs of the feast (the regatta, l-għana) are not in this scene. Render check: reciting note A#, cadence G#; with the pedal the low end matches Cavazzoni's organ (0–125 Hz −10 dB against −9, 500–1000 −6 against −2); bands 1–2 kHz −14, 2–4 kHz −19 dB (Solesmes −8, −17) Revision (voice options): measured note by note with pyin, Solesmes' Te Deum reaches 37% of its notes from more than 20 c below (18% from above, median −10 c in the first 45 ms) and joins notes quickly (75% of voiced note changes within 23 ms, so no portamento); the Latin word accents now carry stress marks (ˈ), so accented syllables sound louder and the rest lighter, as in the monks' speech-rhythm recitation, and the voices scoop up into their notes (the knights 50 c; the people of Birgu 60/55 with a slight glide, our staging, not measured). Our Te Deum render after it (measured on the Holy Sepulchre scene, the same voices): still only ~10% of notes from below, as the choir's 10–12 voices with their own small lags smear the scoop; the accents are louder but not longer, which is the half of speech rhythm the engine cannot yet do.",
    text: `
. clock        88 4/4
. arrange@song ${arrange}
. key          major Db

${caps.map((c, i) => `. caption@c${i + 1} "${c}" ?song.${i + 2}`).join("\n")}
. bell@sanlawrenz oct=3 grid=8 human=0.6 vol=0.55 dyn="f f f mf" "1 - 5, - 3 - 1 - 5, - 3 - 1 - - - 1 - 5, - 3 - 2 - 1 - 5, - 6, - 5, -" ?song.1
. bell@birgu   oct=4 grid=8 human=0.9 vol=0.3 dyn="f mf mf mp" "5 3 1 0 6 5 3 0 5 3 2 0 3 2 1 0" ?song.1
. bell@isla    oct=4 grid=16 human=0.9 vol=0.2 dyn="mf mf mp p" "2 0 0 1 0 0 6, 0 0 5, 0 0 0 0 0 0" ?song.1
. bell@peal    oct=3 grid=8 human=0.6 vol=0.55 dyn="f f f f" "1 - 5, - 3 - 1 - 5, - 3 - 1 - - - 1 - 5, - 3 - 2 - 1 - 5, - 6, - 5, -" ?song.${last}
. drums@santangelo kit=guns vol=0.8 "x...............|................|................" ?song.${last}
. crowd@ruins  murmur "ma-ri-ja SAN-ta al-la ga-RA-zi" voices=20 voice=mixed vol=1.6 dyn="mf mp p" ?song.1
. crowd@vittorja shout "vit-TOR-ja" "x-x-x---........" voices=40 voice=mixed vol=1.6 dyn="f ff ff f" ?song.${last}
. chant@cavalieri scoop=50 voice=men voices=10 oct=4 grid=8 human=0.4 vib=0.01 breath=0.08 dyn="f" ipa="${words}" "${line(sung)}" ?song.${hymn}
. chant@nies scoop=60 glide=0.1   voice=men voices=10 oct=4 grid=8 human=0.8 vib=0.014 breath=0.15 vol=0.7 dyn="f" ipa="${words}" "${line(sung)}" ?song.${hymn}
. chant@nisa scoop=55 glide=0.1   voice=women voices=10 oct=4 grid=8 human=0.8 vib=0.016 breath=0.15 vol=0.6 dyn="f" ipa="${words}" "${line(sung)}" ?song.${hymn}
. organ@orgni  oct=4 grid=8 human=0.2 vol=1.3 dyn="mf" "${line(organ)}" ?song.${hymn}
. organ@pedale oct=3 grid=8 human=0.2 vol=0.7 dyn="mf" "${line(organ).replace(/\+\S+/g, "")}" ?song.${hymn}
cavalieri,nies,nisa> eq@voices mid=4 high=-9

*> space       church size=1.3 wet=0.4
>  speaker     0.5
`,
  };
}
