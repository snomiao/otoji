// 雲漢: the Zhou king's prayer in the great drought (Book of Songs, Greater Odes). The Zhou tune is lost; set in the manner of
// the Song-period ritual songs that survive (one note a syllable, bell and stone framing the lines), after Zhao Yue's yayue
// reconstruction of 鹿鳴 (see zhu-xis-legacy:showcase), measured with refs/analyse.py.
{
  // The old scale on D with its #4, resting on 6 (B, the yu tone) for a lament. Each syllable a quarter at ♩ = 46; a line is two bars.
  const lines = [
    ["6 5 3 5", "tʂuo pi yn xan"],           // 倬彼雲漢
    ["6 1' 6 5", "tʂau xuei y tʰian"],        // 昭回于天
    ["3 2 #4 3", "waŋ ye u xu"],              // 王曰於乎
    ["2 3 5 3 2", "xɤ ku tɕin tʂɨ ʐən"],      // 何辜今之人
    ["5 6 3 2", "tʰian tɕiaŋ saŋ luan"],      // 天降喪亂
    ["1 2 3 6,", "tɕi tɕin tɕian tʂən"],      // 饑饉薦臻
    ["6, 1 2 3", "mi ʂən pu tɕy"],            // 靡神不舉
    ["5 3 2 1", "mi ai sɨ ʂəŋ"],              // 靡愛斯牲
    ["2 3 5 6", "kuei pi tɕi tsu"],           // 圭璧既卒
    ["5 3 2~6, 6,", "niŋ mo wo tʰiŋ"],        // 寧莫我聽
  ];
  const bar2 = (m) => { const t = m.split(" ").flatMap((x) => [x, "-"]); while (t.length < 16) t.push("-"); return t.join(" "); };
  const ode = lines.map(([m]) => bar2(m)).join(" ");
  const words = lines.map(([, w]) => w).join(" ");
  // 金聲玉振: the bell on each line's first syllable, the stone chime after its last
  const bells = lines.map(([m]) => bar2(m.split(" ")[0])).join(" ");
  const stones = lines.map(([m]) => { const n = m.split(" ").length * 2; const t = Array(16).fill("0"); t[n] = m.split(" ").at(-1).replace(/~.*/, ""); return t.join(" "); }).join(" ");
  SCORES["chinese-early:drought"] = {
    about: "The Milky Way (雲漢): in the great drought the Zhou king stands at the altar under a cloudless sky and sings his prayer, 'I have offered to every spirit and spared no victim, and still no one hears me', with bells, stone chimes and a slow drum",
    heard: "an open altar outside the city in a burning summer: dry wind over cracked fields, insects shrilling in the heat; the king's single voice, slow, one note to a word, a bronze bell opening each line and a stone chime closing it, the drum beating between the lines, the officials standing silent; no rain comes",
    refs: [
      { title: "Lu Ming 鹿鸣, Confucian ritual song from the Feng Ya Shi'er Shi Pu (the model for the manner)", who: "Zhao Yue 赵越 and the Yayue Training Institute, China Conservatory of Music", url: "https://www.youtube.com/watch?v=yQ4KkaFlA4U" },
    ],
    measured: "from the ritual-song reconstruction: one note a syllable at about ♩ = 44, gong on D with both G and G# (the old scale), a man's voice with bells and stones framing the lines, a long tail. The drought ode has no surviving tune and no recording of it sung was found (only a spoken reading, whose free speech pitch is no model): the melody here is ours in that manner, resting on B (the yu tone) for a lament; words in Mandarin; the heat is crickets at 35 °C, the nearest the engine has to cicadas. Render: one syllable a quarter (1.6 onsets a second with the bells and stones), E3–C#4, centroid 1.76 kHz against the reconstruction's 1.49, a long open-air tail from the field space. Voice gestures (pyin on the reconstruction's voice stem): the singer reaches over half of his notes from about 50 cents below and slides 0.3–0.4 s between notes; ours now scoops (scoop=60) and glides (glide=0.3, transitions ~0.29 s against 0.38 s), but the scoops mostly fall inside the syllables' opening consonants, so fewer of them are heard than in his singing",
    text: `
. clock        46 4/4
. arrange@song heat:2bars prayer:20bars
. key          major D

. caption@c1   "倬彼雲漢，昭回于天。王曰於乎，何辜今之人！ / 天降喪亂，饑饉薦臻。靡神不舉，靡愛斯牲。圭璧既卒，寧莫我聽？" ?song.2
. wind@dry      0.15 gust=0.05Hz
. insects@heat  0.35 temp=35 count=6
. chant@king    voice=men oct=3 grid=8 human=0.4 rubato=0.25 scoop=60 glide=0.3 vib=0.02 breath=0.15 bright=0.4 dyn="mf mf f mf mp mf mf mp f mp" ipa="${words}" "${ode}" ?song.2
. bell@bianzhong oct=3 grid=8 vol=0.8 "${bells}" ?song.2
. bell@bianqing  oct=4 grid=8 vol=0.6 "${stones}" ?song.2
. drums@gu      kit=zhangu vol=0.3 "........................x.......|................................|................................" ?song.2

*> space       field size=1.4
>  speaker      0.5
`,
  };
}
