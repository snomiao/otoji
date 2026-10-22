// Named pieces of music in the stories: PIECES["<civ id>:<activity>"] = { title, native, about, melody?, key?, scale?, grid? }.
Object.assign(PIECES, {
  // ── Zhou–Han ──
  "chinese-early:wind": { title: "Song of the Great Wind", native: "大风歌", about: "Three lines Liu Bang sang to his own zhu zither at the homecoming feast in Pei in 195 BC, with a chorus of 120 boys.", source: "lost" },
  "chinese-early:triumph": { title: "Song of the Heavenly Horses", native: "天马歌", about: "A hymn Emperor Wu had made for the Music Bureau in 101 BC to celebrate the Ferghana horses, sung at the great sacrifices.", source: "lost" },
  "chinese-early:flood": { title: "Songs of Huzi", native: "瓠子歌", about: "Two songs Emperor Wu composed at the Yellow River breach at Huzi in 109 BC, asking the river god to return to its old course.", source: "lost" },
  "chinese-early:wedding": { title: "The Phoenix Seeks His Mate", native: "凤求凰", about: "The qin song Sima Xiangru is said to have played for Zhuo Wenjun at Linqiong around 140 BC; later qin pieces with this name are not the original.", source: "lost" },
  "chinese-early:gather": { title: "Plantain", native: "芣苢", about: "A Zhou work song of women gathering plantain seeds, from the Airs of Zhounan in the Book of Songs.", source: "lost" },
  "chinese-early:festival": { title: "The Zhen and the Wei", native: "溱洧", about: "A spring song of the state of Zheng in the Book of Songs, about young people meeting on the river banks with orchids and peonies.", source: "lost" },
  "chinese-early:drought": { title: "The Milky Way", native: "云汉", about: "A Greater Ode in the Book of Songs, a Zhou king's prayer in a great drought, traditionally linked to King Xuan.", source: "lost" },
  "chinese-early:showcase": { title: "Shao", native: "韶", about: "The ancient court music credited to the sage-king Shun, which Confucius heard in Qi and called perfectly beautiful and perfectly good.", source: "lost" },

  // ── Three Kingdoms ──
  "wei:triumph": { title: "Viewing the Blue Sea", native: "观沧海", about: "Cao Cao's verses written at Jieshi in 207 on the way home from White Wolf Mountain, part of the yuefu song Out of the Xia Gate (步出夏门行).", source: "lost" },
  "wei:winter": { title: "Bitter Cold", native: "苦寒行", about: "Cao Cao's yuefu song of the winter march through the Taihang mountains in 206, later sung in the Wei court's qingshang repertoire.", source: "lost" },
  "shu:showcase": { title: "Ba-Yu Dance", native: "巴渝舞", about: "The war dance of the Ba people of the Sichuan region, adopted as a court dance by the Han.", source: "lost" },

  // ── Sui–Tang–Song ──
  "chinese-middle:triumph": { title: "The Prince of Qin Breaks the Ranks", native: "秦王破阵乐", about: "A soldiers' song from Li Shimin's victory of 620, later made into a great Tang court dance for 120 dancers in armour.", source: "lost (Japanese gagaku and a Tang pipa tablature keep pieces of this name, but the link to the original is uncertain)" },
  "chinese-middle:showcase": { title: "Rainbow Skirt and Feathered Dress", native: "霓裳羽衣曲", about: "The most famous Tang court suite, associated with Emperor Xuanzong and the Pear Garden musicians in the 8th century.", source: "lost (Jiang Kui's 1202 song Nichang zhongxu diyi claims to keep one section)" },
  "zhu-xis-legacy:showcase": { title: "Twelve Songs of the Book of Songs", native: "风雅十二诗谱", about: "Twelve Book of Songs melodies said to come down from the Tang, preserved by Zhu Xi in his Yili jingzhuan tongjie.", source: "Zhu Xi, Yili jingzhuan tongjie (Zhao Yansu's scores, in lülü pitch names)" },

  // ── Ming–Qing ──
  "chinese:winter": { title: "The Nines Song", native: "九九歌", about: "A Beijing children's counting rhyme for the nine nines of winter after the solstice: in the third and fourth nines, you can walk on the ice.", source: "a spoken rhyme with no fixed tune" },

  // ── Japan ──
  "japanese-early:triumph": { title: "Ryōō", native: "蘭陵王", about: "A tōgaku dance of the Left in which a dancer in a gilded dragon mask plays the masked warrior prince of Lanling; at the Heian wrestling festival it greeted a victory of the Left.", source: "living gagaku tradition of the Imperial Household" },
  "japanese-early:ritual": { title: "Gosechi Dance", native: "五節舞", about: "A dance of young noblewomen at the Niiname-sai harvest rite, said to go back to heavenly maidens who danced for Emperor Tenmu; still performed at enthronements.", source: "living court tradition (the old tune was revived in the Edo period)" },
  "sengoku-daimyo:triumph": { title: "Atsumori", native: "敦盛", about: "A kōwaka-mai ballad about the young Taira warrior Atsumori; Nobunaga danced and sang its lines on man's fifty years before Okehazama in 1560.", source: "lost (the text survives)" },
  "sengoku-daimyo:showcase": { title: "The Tale of the Heike", native: "平家物語", about: "The war epic chanted by blind biwa priests (heikyoku) from the 13th century, beginning with the bell of the Gion temple.", source: "heikyoku tradition; neumes in the Heike mabushi (1776)" },
  "japanese:wedding": { title: "Takasago", native: "高砂", about: "A Noh play by Zeami about the spirits of two old pines; its travel song Takasago ya is chanted at weddings to wish the couple a long life together.", source: "Noh chant (utai) of the Kanze and other schools, sung without fixed pitch" },
  "japanese:showcase": { title: "Rokudan", native: "六段の調", about: "A solo koto piece in six sections attributed to Yatsuhashi Kengyō in the 17th century, the classic of the koto repertoire.", source: "living koto tradition (Ikuta and Yamada schools)" },

  // ── Korea ──
  "koreans:ritual": { title: "Jongmyo Jeryeak", native: "종묘제례악", about: "The music for the royal ancestral rite at Jongmyo in Seoul, with stone chimes and bronze bells, credited in part to King Sejong in the 15th century.", source: "living court tradition; scores in the Sejong Sillok" },
  "koreans:festival": { title: "Ganggangsullae", native: "강강술래", about: "A moonlit circle dance and call-and-answer song of the women of the southwest coast, sung at Chuseok.", source: "living folk tradition of South Jeolla" },
  "koreans:showcase": { title: "Yeomillak", native: "여민락", about: "Court music set to the Songs of the Dragons Flying to Heaven, credited to King Sejong in the 15th century; its name means joy shared with the people.", source: "living court tradition; scores in the Sejong Sillok" },
  "koreans-early:showcase": { title: "Song of the Green Mountains", native: "청산별곡", about: "A Goryeo song of a man who wishes to live in the green mountains, eating wild grapes and wild berries.", source: "Siyong hyangakbo (16th century)" },
  "koreans-early:festival": { title: "Hoesogok", native: "회소곡", about: "The sad song a woman of the losing team sang at the Silla gabae weaving contest in the reign of King Yuri, crying hoeso, hoeso.", source: "lost" },
  "koreans-early:plague": { title: "Cheoyong Dance", native: "처용무", about: "A masked dance of five dancers recalling Cheoyong, who drove away the spirit of plague with song and dance in 9th-century Silla; still performed.", source: "living court tradition (described in the Akhak gwebeom, 1493)" },
  "koreans-early:wedding": { title: "Song of Seodong", native: "서동요", about: "The hyangga a Baekje yam-digger taught the children of Gyeongju to win Princess Seonhwa of Silla.", source: "lost" },
  "koreans-early:death": { title: "Requiem for a Dead Sister", native: "제망매가", about: "An 8th-century hyangga by the Silla monk Wolmyeong, sung at his sister's memorial rite.", source: "lost" },
  "choson:showcase": { title: "Gonghuin", native: "공후인", about: "The lament of a wife whose white-haired husband drowned crossing a river, set to the gonghu harp by the ferryman's wife Yeo-ok.", source: "lost" },
});
