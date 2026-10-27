// Te Deum in the starving camp before Acre when the grain ships came in (winter 1190–91): the notes from the
// Antiphonale Monasticum (1934) via GregoBase, pitch and pace from the Solesmes monks' recording, sung by a camp of men in the open.
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
  ];
  const fit = (p) => { const t = p.split(" "); while (t.length % 8) t.push("0"); return t; };
  const bars = V.map(([p]) => fit(p).length / 8);
  const all = V.map(([p]) => fit(p).join(" ")).join(" "), words = V.map((v) => v[1]).join(" ");
  // a priest intones the first half-verse; the camp joins from the second
  const first = fit(V[0][0]), half = first.indexOf("0"), nIntone = V[0][0].split(" ").slice(0, half).filter((x) => !"-0".includes(x)).length;
  const intone = [...first.slice(0, half), ...Array(all.split(" ").length - half).fill("0")].join(" ");
  const camp = [...Array(half).fill("0"), ...all.split(" ").slice(half)].join(" ");
  const campWords = words.split(" ").slice(nIntone).join(" ");
  const arrange = ["sails:4bars", ...bars.map((b, i) => `v${i + 1}:${b}bars`)].join(" ");
  const caps = ["Te Deum laudamus: te Dominum confitemur.", "Te æternum Patrem omnis terra veneratur.", "Tibi omnes Angeli, tibi cæli et universæ potestates:",
    "Tibi Cherubim et Seraphim incessabili voce proclamant:", "Sanctus,", "Sanctus,", "Sanctus, Dominus Deus Sabaoth."];
  const hymn = `2-${V.length + 1}`;
  SCORES["knights-templar:siege"] = {
    about: "Te Deum laudamus sung by the whole starving camp before Acre in the open air, when the grain ships were sighted after the hungry winter",
    heard: "a winter camp of tents and ditches on the shore before Acre: wind off the sea, waves on the beach, a few smoky fires and no horses left; a shout goes up along the lines as the sails come in, then a priest intones the hymn and hundreds of hoarse men take it up in rough unison under the open sky, no walls to hold the sound",
    refs: [
      { title: "Hymne: Te Deum", who: "Chœur des moines de l'Abbaye Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=O_kN19-2h3s" },
      { title: "Te Deum (Antiphonale Monasticum 1934, p. 1250), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=9696" },
    ],
    measured: "Solesmes: the reciting note between A# and B, cadences a tone and a minor third below, ~2.5 syllables a second, unison men, vibrato ~10 c, energy 125–1000 Hz. Ours: the same 1934 notes on Bb3, a little slower (eighths at 84) and much less even (human 0.8) for a camp of soldiers, two big men's crowds a few cents apart, the open-air field space instead of an abbey church. Differs: no recording exists of a crowd of soldiers singing chant; the rough singing, the shouts at the sails and the beach are reconstruction from the chronicle. Render check: reciting note A#, scale 0 200 300 1000 around it as Solesmes, range G2–B3 (the soldiers an octave down), 2 notes a second; bands 500–1000 −8, 1–2 kHz −16, 2–4 kHz −18 dB (Solesmes −2, −8, −17), more low energy from the wind and sea Revision (voice options): measured note by note with pyin, Solesmes' Te Deum reaches 37% of its notes from more than 20 c below (18% from above, median −10 c in the first 45 ms) and joins notes quickly (75% of voiced note changes within 23 ms, so no portamento); the Latin word accents now carry stress marks (ˈ), so accented syllables sound louder and the rest lighter, as in the monks' speech-rhythm recitation, and the voices scoop up into their notes (priest 35 c, Templars 50; the hoarse soldiers 65 c with a glide and a little pressed chest voice, our staging of a camp, not measured). Our Te Deum render after it (measured on the Holy Sepulchre scene, the same voices): still only ~10% of notes from below, as the choir's 10–12 voices with their own small lags smear the scoop; the accents are louder but not longer, which is the half of speech rhythm the engine cannot yet do.",
    text: `
. clock        84 4/4
. arrange@song ${arrange}
. key          major Db

${caps.map((c, i) => `. caption@c${i + 1} "${c}" ?song.${i + 2}`).join("\n")}
. wind@sea     0.3 gust=0.1Hz
. water@shore  0.3 lap=0.7 splash=0.05
. fire@camp    0.12 crackle=0.3
. crowd@lines  shout "na-VES NA-ves" "x-x-----x-x-----" voices=36 voice=men vol=1.8 dyn="mf f ff f" ?song.1
. crowd@tents  murmur "pan de-u BA na-ves AR-ri-va" voices=24 vol=1.2 dyn="f mf" ?song.1
. chant@priest scoop=35 voice=men oct=4 grid=8 human=0.4 vib=0.012 breath=0.1 dyn="f" ipa="${words.split(" ").slice(0, nIntone).join(" ")}" "${intone}" ?song.${hymn}
. chant@templars scoop=50 glide=0.1 voice=men voices=12 oct=4 grid=8 human=0.8 vib=0.012 breath=0.2 dyn="f" ipa="${campWords}" "${camp}" ?song.${hymn}
. chant@soldiers scoop=65 glide=0.15 press=0.25 voice=men voices=12 oct=3 grid=8 human=0.9 vib=0.015 breath=0.25 vol=0.7 dyn="f" ipa="${campWords}" "${camp}" ?song.${hymn}
priest,templars,soldiers> eq@hoarse mid=4 high=-8

*> space       field size=1.4 wet=0.2
>  speaker     0.5
`,
  };
}
