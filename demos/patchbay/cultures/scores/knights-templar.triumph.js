// Te Deum in the Church of the Holy Sepulchre after Montgisard: the notes from the Antiphonale Monasticum (1934)
// via GregoBase, sung at the pitch and pace of the Solesmes and Clervaux monks' recordings (measured with refs/analyse.py).
{
  // verses of the hymn: [notes as C-major degrees (the reciting tone on 6, = A), Latin in IPA]
  const V = [
    ["3, 5, 6, 6, 6, 5, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te de _ um lau _ da _ mus te do mi num kon fi _ te _ _ mur"],
    ["5, 7, 7, 1 7, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ e ter num pa _ trem om nis ter ra ve ne _ ra _ _ tur"],
    ["5, 7, 7, 1 7, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ti _ bi om nes _ an dʒe _ li ti bi tʃe li et u ni ver se po te _ sta _ _ tes"],
    ["5, 7, 7, 1 7, 6, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ti _ bi ke ru bim et se ra _ fim in tʃes sa bi li vo tʃe pro _ kla _ _ mant"],
    ["5, 6, 7, 6, - - 0 0 0", "san _ _ ktus"],
    ["5, 6, 7, 6, - - 0 0 0", "san _ _ ktus"],
    ["5, 6, 7, 6, - - 7, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "san _ _ ktus do mi nus de us _ sa ba _ ot"],
    ["5, 7, 7, 7, 1 7, 6, 6, 7, 6, - - 0 3, 5, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ple _ ni sunt tʃe li et ter _ ra ma je sta tis ɡlo ri e _ tu _ _ e"],
    ["5, 7, 1 7, 6, 7, 6, - - 0 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ ɡlo ri o _ sus a po sto lo rum _ ko _ _ rus"],
    ["5, 7, 1 7, 6, 7, 6, - - 0 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ pro fe ta _ rum lau da bi lis _ nu me _ rus"],
    ["5, 7, 1 7, 6, 6, 6, 6, 7, 6, - - 0 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ mar ti rum kan di da _ tus lau dat e _ kser tʃi _ tus"],
    ["5, 7, 7, 1 7, 6, 6, 7, 6, - - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ per or bem ter ra _ rum san kta _ kon fi te tur ek _ kle si _ a"],
  ];
  // each verse padded to whole bars, so each is a section; a choir rests (0) through the other's verses
  const fit = (p) => { const t = p.split(" "); while (t.length % 8) t.push("0"); return t; };
  const bars = V.map(([p]) => fit(p).length / 8);
  const part = (pick) => V.map(([p], i) => fit(p).map((x) => (pick(i) ? x : "0")).join(" ")).join(" ");
  const words = (pick) => V.filter((v, i) => pick(i)).map((v) => v[1]).join(" ");
  const cantor = (i) => i === 0, clergy = (i) => i % 2 === 1, people = (i) => i % 2 === 0 && i > 0;
  // the cantor intones the first half-verse alone, the clergy answer the second half
  const first = fit(V[0][0]), half = first.indexOf("0");
  const intone = [...first.slice(0, half), ...first.slice(half).map(() => "0")].join(" ") + " " + part(() => false).split(" ").slice(first.length).join(" ");
  const answer = [...first.slice(0, half).map(() => "0"), ...first.slice(half)].join(" ") + " " + part(clergy).split(" ").slice(first.length).join(" ");
  const answerWords = V[0][1].split(" ").slice(V[0][0].split(" ").slice(0, half).filter((x) => !"-0".includes(x)).length).join(" ") + " " + words(clergy);
  const intoneWords = V[0][1].split(" ").slice(0, V[0][0].split(" ").slice(0, half).filter((x) => !"-0".includes(x)).length).join(" ");
  const arrange = ["bells:4bars", ...bars.map((b, i) => `v${i + 1}:${b}bars`), "peal:4bars"].join(" ");
  const caps = ["Te Deum laudamus: te Dominum confitemur.", "Te æternum Patrem omnis terra veneratur.", "Tibi omnes Angeli, tibi cæli et universæ potestates:",
    "Tibi Cherubim et Seraphim incessabili voce proclamant:", "Sanctus,", "Sanctus,", "Sanctus, Dominus Deus Sabaoth.", "Pleni sunt cæli et terra majestatis gloriæ tuæ.",
    "Te gloriosus Apostolorum chorus,", "Te Prophetarum laudabilis numerus,", "Te Martyrum candidatus laudat exercitus.", "Te per orbem terrarum sancta confitetur Ecclesia,"];
  const hymn = `2-${V.length + 1}`, last = V.length + 2;
  SCORES["knights-templar:triumph"] = {
    about: "Te Deum laudamus in the solemn monastic tone, sung verse by verse between the clergy and the people in the Holy Sepulchre after the victory at Montgisard, while the bells of Jerusalem ring",
    heard: "the great church of the Holy Sepulchre packed with townspeople, knights still in mail and the white-mantled Templars: every bell in the city rings, then falls silent; a cantor intones 'Te Deum laudamus', the canons answer, and the crowd of men and women takes the next verse, the two sides alternating in the stone church's long echo; at the end the bells peal again and the people shout",
    refs: [
      { title: "Hymne: Te Deum", who: "Chœur des moines de l'Abbaye Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=O_kN19-2h3s" },
      { title: "Te Deum, hymnus (tonus monasticus)", who: "Benedictine Monks of the Abbey of Saint-Maurice, Clervaux", url: "https://www.youtube.com/watch?v=OilWu7y1IR0" },
      { title: "Te Deum (Antiphonale Monasticum 1934, p. 1250), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=9696" },
    ],
    measured: "Solesmes (first 90 s): unison men, the reciting note between A# and B (B −40 c) with the cadences a tone and a minor third below (0 170 260 1010 cents around it), range G#3–C#4, ~2.5 syllables a second, the reciting runs quick and the cadence notes doubled, vibrato ~10 c, energy 125–1000 Hz falling ~8 dB an octave above, a ~9 s church tail; Clervaux the same tone a little lower (A#). Ours: the 1934 notes, recited on Bb3 (key Db), eighths at 92 (3 a second, gaps between verses bringing it to ~2 notes a second), a breath between half-verses and a gap between verses, alternating choirs of 10 clergy and 16 mixed people, cathedral space. Differs: the monks' recitation is speech-rhythmed (longer stressed syllables) where ours is even; a lay crowd in 1177 sang less evenly than monks, which human= only hints at; the bells are our staging of the chronicle. Render check: reciting note A#, cadence on G#, as Solesmes; bands 500–1000 −8, 1–2 kHz −16, 2–4 kHz −17 dB (Solesmes −2, −8, −17), a little hollower in the middle; tail ~4.5 s against the abbey's 9",
    text: `
. clock        92 4/4
. arrange@song ${arrange}
. key          major Db

${caps.map((c, i) => `. caption@c${i + 1} "${c}" ?song.${i + 2}`).join("\n")}
. bell@sepulchre oct=3 grid=8 human=0.6 vol=0.55 dyn="f f mf p" "1 - 5, - 3 - 1 - 5, - 3 - 1 - - - 1 - 5, - 3 - 2 - 1 - 5, - 6, - 5, -" ?song.1
. bell@citybells oct=4 grid=8 human=0.8 vol=0.3 dyn="mf mf mp p" "5 3 1 0 5 3 2 0 5 3 1 0 3 2 1 0" ?song.1
. bell@peal    oct=3 grid=8 human=0.6 vol=0.55 dyn="mf f f f" "1 - 5, - 3 - 1 - 5, - 3 - 1 - - - 1 - 5, - 3 - 2 - 1 - 5, - 6, - 5, -" ?song.${last}
. crowd@church murmur "a-MEN do-mi-ne de-us SAN-ta" voices=20 vol=1 dyn="mf mp p" ?song.1
. crowd@acclaim shout "a-MEN" "x---x-------...." voices=30 voice=mixed vol=1.4 dyn="0 f f mf" ?song.${last}
. chant@cantor voice=men oct=4 grid=8 human=0.3 vib=0.012 breath=0.06 dyn="f" ipa="${intoneWords}" "${intone}" ?song.${hymn}
. chant@canons voice=men voices=10 oct=4 grid=8 human=0.3 vib=0.008 breath=0.06 dyn="mf" ipa="${answerWords}" "${answer}" ?song.${hymn}
. chant@people voice=men voices=12 oct=4 grid=8 human=0.7 vib=0.012 breath=0.1 dyn="f" ipa="${words(people)}" "${part(people)}" ?song.${hymn}
. chant@women  voice=women voices=8 oct=4 grid=8 human=0.7 vib=0.015 breath=0.1 vol=0.6 dyn="mf" ipa="${words(people)}" "${part(people)}" ?song.${hymn}
cantor,canons,people,women> eq@stone mid=5 high=-10

*> space       cathedral size=1.2 wet=0.42
>  speaker     0.5
`,
  };
}
