// Te Deum on the deck of a Templar ship at the first sight of Acre: the notes from the Antiphonale Monasticum (1934)
// via GregoBase, pitch and pace from the Solesmes and Clervaux recordings; sung by a chaplain and the pilgrims, men and women.
{
  // verses of the hymn: [notes as C-major degrees (the reciting tone on 6, = A), Latin in IPA]
  const V = [
    ["3, 5, 6, 6, 6, 5, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te ˈde _ um lau _ ˈda _ mus te ˈdo mi num kon fi _ ˈte _ _ mur"],
    ["5, 7, 7, 1 7, 6, 7, 6, - - 0 3, 5, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "te _ e ˈter num ˈpa _ trem ˈom nis ˈter ra ve ne _ ˈra _ _ tur"],
    ["5, 7, 7, 1 7, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈti _ bi ˈom nes _ ˈan dʒe _ li ˈti bi ˈtʃe li et u ni ˈver se po te _ ˈsta _ _ tes"],
    ["5, 7, 7, 1 7, 6, 6, 7, 6, 5, 6, - - 0 3, 5, 6, 6, 6, 6, 5, 6, 7, 7, 6, 5, 5, - - 0 0 0", "ˈti _ bi ˈke ru bim et ˈse ra _ fim in tʃes ˈsa bi li ˈvo tʃe pro _ ˈkla _ _ mant"],
  ];
  const fit = (t) => { t = t.slice(); while (t.length % 8) t.push("0"); return t; };
  // the chaplain intones each verse's first half alone, the pilgrims sing each second half; each half its own section
  const halves = V.map(([p, w]) => { const t = p.split(" "), h = t.indexOf("0"), n = t.slice(0, h).filter((x) => !"-0".includes(x)).length, ws = w.split(" ");
    return [[fit(t.slice(0, h)), ws.slice(0, n)], [fit(t.slice(h)), ws.slice(n)]]; });
  const flat = halves.flat(), rest = (t) => t.map(() => "0");
  const chaplain = flat.map(([t], i) => (i % 2 ? rest(t) : t).join(" ")).join(" ");
  const pilgrims = flat.map(([t], i) => (i % 2 ? t : rest(t)).join(" ")).join(" ");
  const cw = flat.filter((x, i) => !(i % 2)).flatMap(([, w]) => w), pw = flat.filter((x, i) => i % 2).flatMap(([, w]) => w);
  const arrange = ["land:4bars", ...flat.map(([t], i) => `${i % 2 ? "people" : "priest"}${(i >> 1) + 1}:${t.length / 8}bars`), "shore:4bars"].join(" ");
  const caps = ["Te Deum laudamus: te Dominum confitemur.", "Te æternum Patrem omnis terra veneratur.", "Tibi omnes Angeli, tibi cæli et universæ potestates:", "Tibi Cherubim et Seraphim incessabili voce proclamant:"];
  const hymn = `2-${flat.length + 1}`, last = flat.length + 2;
  SCORES["knights-templar:voyage"] = {
    about: "Te Deum laudamus on the deck of a Templar ship when the coast of Acre comes in sight: the chaplain gives each verse, the kneeling pilgrims answer",
    heard: "a ship at sea in the morning after weeks out of Marseille: the hull creaking and the sea washing along it, wind in the rigging; a sailor calls out from aloft, the pilgrims cry and weep among the sacks and the horses, then the Templar chaplain intones each verse and the pilgrims, men and women, sing the second half back to him, the sound blown away over open water",
    refs: [
      { title: "Te Deum, hymnus (tonus monasticus)", who: "Benedictine Monks of the Abbey of Saint-Maurice, Clervaux", url: "https://www.youtube.com/watch?v=OilWu7y1IR0" },
      { title: "Hymne: Te Deum", who: "Chœur des moines de l'Abbaye Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=O_kN19-2h3s" },
      { title: "Te Deum (Antiphonale Monasticum 1934, p. 1250), gabc", who: "GregoBase", url: "https://gregobase.selapa.net/chant.php?id=9696" },
    ],
    measured: "Clervaux (first 90 s): unison men on a reciting note of A# (+20 c), cadences a tone and a minor third below, range A#2–C#4, slow (0.5 clear onsets a second, the notes slurred in the abbey's ~8 s tail), energy centred 500–1000 Hz; Solesmes the same tone at ~2.5 syllables a second. Ours: the 1934 notes on Bb3, eighths at 80, a solo chaplain for each first half-verse and pilgrims (men and women, uneven) for each second half, at sea with the river (open water) space, no church tail. Differs: no recording of chant at sea exists; the half-verse alternation is the usual way a priest leads lay people in the hymn, the scene itself is imagined. Render check: reciting note A#, cadence G#, range E3–C4, 1.6 notes a second (between Clervaux's slur and Solesmes' pace), bands 500–1000 −5, 1–2 kHz −12, 2–4 kHz −17 dB (Clervaux 0, −6, −13): a little darker, and the sea adds low noise the abbey records lack Revision (voice options): measured note by note with pyin, Solesmes' Te Deum reaches 37% of its notes from more than 20 c below (18% from above, median −10 c in the first 45 ms) and joins notes quickly (75% of voiced note changes within 23 ms, so no portamento); the Latin word accents now carry stress marks (ˈ), so accented syllables sound louder and the rest lighter, as in the monks' speech-rhythm recitation, and the voices scoop up into their notes (chaplain 35 c; the pilgrims 60/55 with a slight glide, our staging, not measured). Our Te Deum render after it (measured on the Holy Sepulchre scene, the same voices): still only ~10% of notes from below, as the choir's 10–12 voices with their own small lags smear the scoop; the accents are louder but not longer, which is the half of speech rhythm the engine cannot yet do.",
    text: `
. clock        80 4/4
. arrange@song ${arrange}
. key          major Db

${caps.map((c, i) => `. caption@c${i + 1} "${c}" ?song.${2 * i + 2}-${2 * i + 3}`).join("\n")}
. water@hull   0.3 lap=0.6 splash=0.03
. boat@ship    0.4 creak=0.45
. wind@rigging 0.22 gust=0.08Hz
. crowd@lookout shout "TE-ra TE-ra" "x-x-----x-x-----" voices=2 voice=men vol=1.2 dyn="f ff 0 0" ?song.1
. crowd@deck   murmur "a-ke TE-ra sen-ta MA-ri-a de-u" voices=16 voice=mixed vol=1.8 dyn="0 mf f mf" ?song.1
. chant@chaplain scoop=35 voice=men oct=4 grid=8 human=0.3 vib=0.012 breath=0.08 dyn="f" ipa="${cw.join(" ")}" "${chaplain}" ?song.${hymn}
. chant@pilgrims scoop=60 glide=0.1 voice=men voices=10 oct=4 grid=8 human=0.8 vib=0.014 breath=0.18 dyn="mf" ipa="${pw.join(" ")}" "${pilgrims}" ?song.${hymn}
. chant@pilgrimwomen scoop=55 glide=0.1 voice=women voices=7 oct=4 grid=8 human=0.8 vib=0.016 breath=0.18 vol=0.6 dyn="mf" ipa="${pw.join(" ")}" "${pilgrims}" ?song.${hymn}
. crowd@weeping murmur "a-a o-i e-a" voices=6 voice=women vol=2 dyn="mf mp" ?song.${last}
chaplain,pilgrims,pilgrimwomen> eq@voices mid=4 high=-8

*> space       river size=1.3 wet=0.3
>  speaker     0.5
`,
  };
}
