// "Je vous salue Marie" sung by the crowd on the quays while Notre-Dame burned (15 April 2019): the prayer recited on a
// singing tone the way the crowd sang it, in the key, pace and register measured on recordings made that night (refs/analyse.py);
// the hymn tunes some groups used are modern, so this is our own plain psalmody on the public-domain prayer.
{
  // each line on a reciting note (the tonic) with a lift or a fall at its end; [syllables, cadence]
  const lines = [
    ["ʒə vu sa ly ma ʁi plɛ nə də ɡʁa sə", "3 4 3"], ["lə se ɲœʁ ɛ ta vɛk vu", "1 7, 7,"],
    ["vu zɛt be ni ɑ tʁə tut le fa mə", "3 4 3"], ["e ʒe zy lə fʁɥi də vo zɑ tʁa jə ɛ be ni", "3 2 1"],
    ["sɛ tə ma ʁi mɛ ʁə də djø", "3 4 3"], ["pʁi je puʁ nu po vʁə pe ʃœʁ", "1 7, 7,"],
    ["mɛ tə nɑ e a lœ ʁə də nɔ tʁə mɔʁ", "3 2 1"], ["a mɛn", "2 1"],
  ];
  const line = ([w, cad]) => { const n = w.split(" ").length, c = cad.split(" "), t = [...Array(n - c.length).fill("1"), ...c]; t.splice(t.length, 0, "-", "-", "0", "0"); return t; };
  const fit = (t) => { while (t.length % 8) t.push("0"); return t; };
  const h1 = fit(lines.slice(0, 4).flatMap(line)), h2 = fit(lines.slice(4).flatMap(line));
  const prayer = [...h1, ...h2], words = lines.map(([w]) => w).join(" ");
  SCORES["french:fire"] = {
    about: "Je vous salue Marie, sung by the crowd kneeling on the quays of the Seine while Notre-Dame burned on the night of 15 April 2019",
    heard: "night on the quai across the river from the cathedral: the roof and spire in flames, the roar and crack of the fire carrying over the water, sirens and helicopters gone quiet for a moment; hundreds of people, many kneeling, young and old, sing the Ave over and over on one note with a little fall at each line, uneven, some voices crying, the sound spreading thin over the open river",
    refs: [
      { title: "Incendie Notre-Dame (Je vous salue Marie), nuit du 15/04", who: "a crowd on the quays, filmed by Alexandre Felipe", url: "https://www.youtube.com/watch?v=iH8Pbcd4z80" },
      { title: "Des croyants à genoux chantent face à Notre-Dame en feu", who: "Le Parisien", url: "https://www.youtube.com/watch?v=-aalXW4ClTw" },
    ],
    measured: "Quay recording (185 s): a big mixed crowd in unison around E (C3–B3 for the men, the women an octave up), the line moving in small steps 0 300 490 cents around the tonic, no pulse at all (clarity −0.03), ~2.2 syllables a second, voices rough and spread (harmonic 0.6), traffic and fire noise under it (0–125 Hz strong). Le Parisien clip: the same kind of singing a tone higher (F#), long held line ends (~1 s). Ours: the prayer on one reciting note with falls at the ends of lines, in E minor, 66 with rubato, men and women a little apart in time, the fire across the water through a low-pass, the open-river space. Differs: the crowd sang several tunes that night (some modern hymn tunes, not used here); ours is a plain singing tone. Render check: tonic E, range D#3–C#4 (the quay recording C3–B3), steps of 300 cents around the tonic, ~1.6 syllables a second, weak pulse (0.28); bands 1–2 kHz −18 dB under the peak (record −9) and the fire and traffic-like low end at −10 (record −12). The quay crowd reaches about a fifth of its notes from below (19% of attacks scooped by more than 40 c, pyin), so both groups now scoop=30; it slides little between notes (median 12 ms), so no glide",
    text: `
. clock        66 4/4
. arrange@song quai:4bars ave1:${h1.length / 8}bars sainte1:${h2.length / 8}bars ave2:${h1.length / 8}bars sainte2:${h2.length / 8}bars
. key          minor E

. caption@c1   "Je vous salue Marie, pleine de grâce ; le Seigneur est avec vous. / Vous êtes bénie entre toutes les femmes, et Jésus, le fruit de vos entrailles, est béni." ?song.2
. caption@c1b  "Je vous salue Marie, pleine de grâce ; le Seigneur est avec vous. / Vous êtes bénie entre toutes les femmes, et Jésus, le fruit de vos entrailles, est béni." ?song.4
. caption@c2   "Sainte Marie, Mère de Dieu, priez pour nous pauvres pécheurs, / maintenant et à l'heure de notre mort. Amen." ?song.3
. caption@c2b  "Sainte Marie, Mère de Dieu, priez pour nous pauvres pécheurs, / maintenant et à l'heure de notre mort. Amen." ?song.5
. fire@notredame 0.55 crackle=0.5
. wind@seine   0.12 gust=0.05Hz
. water@berge  0.15 lap=0.3 splash=0.01
notredame> filter@acrossriver lp 900 q=0.4
. crowd@quai   murmur "o MON dieu re-gar-de la FLE-che e-lle TOM-be" voices=30 voice=mixed vol=1.4 dyn="mf f mf" ?song.1
. crowd@sobs   murmur "a-a o-o e-e" voices=5 voice=women vol=2 dyn="mp" ?song.2-5
. chant@fideles scoop=30 voice=men voices=12 oct=3 grid=8 human=0.9 rubato=0.4 vib=0.01 breath=0.2 dyn="mf" ipa="${words}" "${prayer.join(" ")}" ?song.2-5
. chant@fideles2 scoop=30 voice=women voices=12 oct=4 grid=8 human=0.9 rubato=0.4 vib=0.012 breath=0.2 vol=0.8 dyn="mf" ipa="${words}" "${prayer.join(" ")}" ?song.2-5

*> space       river size=1.5 wet=0.3
>  speaker     0.5
`,
  };
}
