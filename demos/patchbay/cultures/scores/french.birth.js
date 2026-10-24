// "Ah ! vous dirai-je, maman" sung to a newborn while the bells ring: rebuilt from Claire Lefilliâtre's recording of the
// air with Le Poème Harmonique (period theorbo and voice; Vincent Dumestre), tonic, pace and the voice's vibrato measured with refs/analyse.py.
{
  const A = "1 1 5 5 6 6 5 - 4 4 3 3 2 2 1 -", B = "5 5 4 4 3 3 2 2 5 5 4 4 3 3 2 2";
  const song = [A, B, A].join(" ");
  // the theorbo: a bass and the chord broken in eighths, two chords a bar
  const I = "1 5 1' 3'", IV = "4, 1 4 6", V = "5, 2 5 7";
  const bars = [[I, I], [IV, I], [IV, I], [V, I], [I, V], [I, V], [I, V], [I, V], [I, I], [IV, I], [IV, I], [V, I]];
  const form = [...bars.slice(0, 4), ...bars, ...bars.slice(0, 4)]; // the intro and the coda play the first line's chords
  const theorbo = form.map((b) => b.join(" ")).join(" ");
  const theorboBass = form.map((b) => b.map((h) => h.split(" ")[0] + " - - -").join(" ")).join(" ");
  SCORES["french:birth"] = {
    about: "Ah ! vous dirai-je, maman, the French air later known as Twinkle, Twinkle, sung softly to a newborn with a theorbo while every bell in the town rings for the birth",
    heard: "a high bedchamber in the château of Saint-Germain-en-Laye on the night of the birth, windows open: the bells of the town and the countryside ring and ring, people shout far off below; inside a young woman sings the little air to the baby, half under her breath, and a theorbo player breaks the chords under her",
    refs: [
      { title: "Ah ! Vous dirai-je maman (air, 1771)", who: "Claire Lefilliâtre, Le Poème Harmonique, Vincent Dumestre", url: "https://www.youtube.com/watch?v=s8L0-EksiHs" },
    ],
    measured: "Lefilliâtre: tonic F, the tune on 1 1 5 6 6 5 | 4 3 2 1 at about 76 crotchets a minute (notes ~0.75 s, phrase ends held 1.5–2.5 s), voice F4–D5 with ~9 cents vibrato and some slides, the theorbo's broken chords around her (3.4 onsets a second all told), energy 250–2000 Hz, a small resonant room (~6 s tail estimated, mostly the recording's). Ours: key F at 76, a woman's voice soft and close with ~9 c vibrato, a theorbo in eighths under I–IV–V, the bedchamber as a room space, bells outside through a low-pass. Differs: the air was printed in 1761, a century after this birth; the record has no bells or crowd; our theorbo pattern is plainer than Dumestre's continuo, which improvises. Render check: tempo 76, tonic F, vibrato 9 c as the record; the voice's 1–2 kHz band −7 dB under the peak with an EQ lift (the record −1), 2–4 kHz −15 (record −12)",
    text: `
. clock        76 4/4
. arrange@song cloches:4bars l1:2bars l2:2bars l3:2bars l4:2bars l5:2bars l6:2bars coda:4bars
. key          major F

. caption@c1   "Ah ! vous dirai-je, maman, / Ce qui cause mon tourment ?" ?song.2-3
. caption@c2   "Papa veut que je raisonne / Comme une grande personne." ?song.4-5
. caption@c3   "Moi je dis que les bonbons / Valent mieux que la raison." ?song.6-7
. bell@saintgermain oct=3 grid=8 human=0.6 vol=0.3 dyn="f mf mf mp mp mp mp mp mp mp mp mp mp mp mf mf" "1 - 5, - 3 - 1 - 5, - 3 - 1 - - - 1 - 5, - 3 - 2 - 1 - 5, - 6, - 5, -" ?song.1-8
. bell@paroisses oct=4 grid=8 human=0.9 vol=0.2 dyn="mf mp" "5 3 1 0 6 5 3 0 5 3 2 0 3 2 1 0" ?song.1-8
. crowd@vivat  shout "vi-ve le ROI" "x-x-x---........" voices=30 voice=mixed vol=1.8 dyn="mf mp p 0" ?song.1
saintgermain,paroisses,vivat> filter@window lp 1400 q=0.5
. pluck@theorbe oct=3 grid=8 human=0.4 vol=1.1 dyn="mp p" "${theorbo}" ?song.1-8
. pluck@theorbe-bas oct=2 grid=8 human=0.4 vol=0.9 dyn="mp p" "${theorboBass}" ?song.1-8
. chant@nourrice voice=women oct=4 grid=4 human=0.5 vib=0.02 breath=0.15 dyn="mp p mp p mp mp p p mp p pp pp" ipa="a vu di ʁɛ ʒə ma mɑ sə ki ko zə mɔ tuʁ mɑ pa pa vø kə ʒə ʁɛ zɔ nə kɔ my nə ɡʁɑ də pɛʁ sɔ nə mwa ʒə di kə le bɔ bɔ va lə mjø kə la ʁɛ zɔ" "${song}" ?song.2-7
nourrice> eq@voice mid=5

*> space       room size=1.6 wet=0.3
>  speaker     0.5
`,
  };
}
