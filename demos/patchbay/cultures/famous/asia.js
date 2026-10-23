// Well-known public-domain music for a scene: FAMOUS["<civ id>:<activity>"] = { title, native, about, melody, key, scale, meter, grid, source } (meter: "3/4" or "6/8" for a tune in three; default 4/4).
Object.assign(FAMOUS, {
  "japanese:festival": {
    title: "Sakura Sakura", native: "さくら さくら",
    about: "The Edo-period koto song of cherry blossoms filling the spring sky, sung at hanami, the blossom-viewing festival.",
    melody: "4 - 4 - 5 - - - 4 - 4 - 5 - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - -",
    key: "E", scale: "in", grid: 8,
    source: "traditional (Edo period koto piece for beginners)",
  },
  "japanese:death": {
    title: "Moon over the Ruined Castle", native: "荒城の月 Kōjō no tsuki",
    about: "Rentarō Taki's 1901 song on Bansui Doi's poem of a moonlit castle where feasts once were, the Japanese elegy for vanished glory.",
    melody: "5, 5, 1 2 3 2 1 - 6, 6, 5, #4, 5, - - -",
    key: "B", scale: "minor", grid: 4,
    source: "Rentarō Taki (d. 1903), 1901, original version (Taki's #4 on 'en')",
  },
  "koreans:voyage": {
    title: "Arirang", native: "아리랑",
    about: "Korea's best-known folk song, of a love who leaves over the Arirang pass, the song of parting and setting out.",
    melody: "5, - - 6, 5, 6, 1 - - 2 1 2 3 2 1 6, 5, 6, - - - - - -",
    key: "G", scale: "gong", meter: "3/4", grid: 8,
    source: "traditional (Gyeonggi Arirang, Joseon folk song; popularized 1926)",
  },
  "chinese:gather": {
    title: "Jasmine Flower", native: "茉莉花 Mòlìhuā",
    about: "The Qing-dynasty Jiangnan folk song of wanting to pick a jasmine blossom, printed in Europe by John Barrow in 1804, a song of the flower-gathering.",
    melody: "3 3 5 6 1' 1' 6 5 5 - 6 - 5 - - - 3 3 5 6 1' 1' 6 5 5 - 6 - 5 - - -",
    key: "D", scale: "gong", grid: 8,
    source: "traditional (Qing dynasty, as 'Xianhua diao' 鲜花调; Barrow 1804)",
  },
});
