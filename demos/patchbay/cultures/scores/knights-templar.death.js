// Dies irae sung by the brothers over a dead knight: the notes from the Graduale Romanum (1908) via GregoBase,
// sung at the pitch, pace and in the space of the Solesmes monks' recording (measured with refs/analyse.py).
{
  // strophes 1–4 (melodies A A B B) and the closing Pie Jesu; C-major degrees for the white-note first mode, final on 2
  const chant = "4, 3, 4, 2, 3, 1, 2, 2, - 0 4, 4, 5, 4, 3, 2, 1, 3, 4, 3, 2, - 0 6,, 1, 2, 2, 2, 1, 3, 4, 3, 2, - 0 0 0 4, 3, 4, 2, 3, 1, 2, 2, - 0 4, 4, 5, 4, 3, 2, 1, 3, 4, 3, 2, - 0 6,, 1, 2, 2, 2, 1, 3, 4, 3, 2, - 0 0 0 6, 1 1 7, 5, 6, 6, 5, 4, 5, 6, 6, 2, - 0 4, 3, 4, 2, 3, 1, 2, 2, - 0 4, 5, 6, 6, 5, 4, 3, 2, 1, 3, 4, 3, 2, - 0 0 0 6, 1 1 7, 5, 6, 6, 5, 4, 5, 6, 6, 2, - 0 4, 3, 4, 2, 3, 1, 2, 2, - 0 4, 5, 6, 6, 5, 4, 3, 2, 1, 3, 4, 3, 2, - 0 0 0 0 0 6, 5, 4, 3, 5, 5, 6, - 0 4, 3, 5, 3, 2, 3, 4, 3, 2, - 0 0 0 1, 3, 4, 3, 2, 1, 2, - 0 0 0 0 0 0 0 0 0 0";
  const words = "di es i re di es il la sol vet _ se _ klum _ in fa vil la te ste _ da vid _ kum si bil la kwan tus tre mor est fu tu rus kwan do _ ju _ deks _ est ven tu rus kunk ta _ stri kte _ di skus su rus tu ba mi rum _ _ spar _ _ dʒens so num _ per se pul kra re dʒi o num ko dʒet _ o _ _ mnes _ _ an te tro num mors stu pe bit _ _ et _ _ na tu ra _ kum re sur dʒet kre a tu ra ju di _ kan _ _ ti _ _ re spon su ra pi e je su do mi ne do na e is _ _ re kwi em a _ _ _ _ men _";
  SCORES["knights-templar:death"] = {
    about: "Dies irae, the sequence of the Day of Wrath in the first mode, sung in unison by the brothers of the Temple over a dead brother, then Pie Jesu",
    heard: "a Templar chapel of stone at night, the dead brother on his bier between candles: the house bell tolls, the brothers murmur their paternosters for his soul as the Rule asks, then all sing the sequence in one unison line, slow and even, the long stone tail carrying each phrase into the next",
    refs: [
      { title: "Sequence: Dies irae (mode 1)", who: "Monks of the Abbey of Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=vUgye2KNReM" },
      { title: "Dies irae (Graduale Romanum 1908, p. 83*), gabc", who: "GregoBase, transcribed by Andrew Hinkley", url: "https://gregobase.selapa.net/chant.php?id=3441" },
    ],
    measured: "Solesmes (first 90 s): one unison line of men, final F (+20 c), range E3–D#4, the first mode's degrees 0 210 310 500 690 910 1020 cents, about 2.6 syllables a second with phrase-final notes doubled, no pulse (clarity 0.08), little vibrato (~7 c), dark (energy 125–1000 Hz, falling 10 dB an octave above), a very long church tail (~8 s). Ours: the 1908 Vatican notes, one note an eighth at 80 (2.7 a second), the last note of each verse doubled and a breath at each bar line, final on F3 as Solesmes sings it, ten men's voices, cathedral space. Differs: the monks' phrasing swells and relaxes inside each verse (the Solesmes rhythm) where ours is even; the paternoster murmur and the bell are our staging of the Rule's burial. Render check: final F, degrees 0 200 300 500 700 1000, range E2–C#4 (Solesmes E3–D#4), 2.4 notes a second, rt60 ~7 s (Solesmes ~8); after a darkening EQ the bands are 500–1000 −6.5, 1–2 kHz −15, 2–4 kHz −19, 4–8 kHz −30 dB (Solesmes −3, −11, −19, −37); brightness 1.1 kHz against 0.95",
    text: `
. clock        80 4/4
. arrange@song toll:4bars s1:5bars s2:5bars s3:5bars s4:5bars pie:5bars
. key          major Eb

. caption@c1   "Dies iræ, dies illa, / Solvet sæclum in favilla: / Teste David cum Sibylla." ?song.2
. caption@c2   "Quantus tremor est futurus, / Quando judex est venturus, / Cuncta stricte discussurus!" ?song.3
. caption@c3   "Tuba mirum spargens sonum / Per sepulcra regionum, / Coget omnes ante thronum." ?song.4
. caption@c4   "Mors stupebit et natura, / Cum resurget creatura, / Judicanti responsura." ?song.5
. caption@c5   "Pie Jesu Domine, / dona eis requiem. Amen." ?song.6
. bell@campana oct=3 vol=0.5 dyn="mf mp p p" "1 - - - - - - - - - - - - - - -" ?song.1-2
. crowd@paternoster murmur "pa-ter NOS-ter kui es in che-lis san-ti-fi-KE-tur" voices=12 vol=0.9 dyn="mf mp p" ?song.1
. chant@fratres voice=men voices=10 oct=4 grid=8 human=0.25 vib=0.008 breath=0.06 dyn="mf mf mp mf f mf mp mf mp mf mp mp mf p" ipa="${words}" "${chant}" ?song.2-6
fratres> eq@nave mid=4 high=-12

*> space       cathedral size=0.8 wet=0.42
>  speaker     0.5
`,
  };
}
