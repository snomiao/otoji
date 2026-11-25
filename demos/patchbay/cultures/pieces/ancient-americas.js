// Named pieces of music in the stories: PIECES["<civ id>:<activity>"] = { title, native, about, melody?, key?, scale?, grid? }.
Object.assign(PIECES, {
  // ── Sumerians ──
  "sumerians:wind": { title: "Lament for Ur", about: "A Sumerian city lament of about 2000 BCE mourning the destruction of Ur, in which the goddess Ningal weeps for her city; laments like it were sung by gala priests to the balag drum.", source: "lost" },
  "sumerians:siege": { title: "Lament for Ur", about: "A Sumerian city lament of about 2000 BCE mourning the fall of Ur to the Elamites, sung in the tradition of the gala lament priests.", source: "lost" },

  // ── Greeks, Athenians, Spartans, Macedonians ──
  "greeks:showcase": { title: "Seikilos epitaph", native: "Ὅσον ζῇς φαίνου", about: "A short song carved with its musical notation on a gravestone near Tralles in Asia Minor, around the 1st century CE, by one Seikilos; the oldest complete notated song known.", source: "Seikilos stele (melody fully notated; not reproduced here)" },
  "athenians:showcase": { title: "Orestes stasimon", native: "Ὀρέστης", about: "A choral song from Euripides' tragedy Orestes (408 BCE), of which a few lines with notes survive on a papyrus of about 200 BCE now in Vienna.", source: "Vienna papyrus G 2315 (fragmentary, not reproduced here)" },
  "spartans:showcase": { title: "Alcman's Maiden Song", native: "Παρθένειον", about: "A partheneion written by Alcman for a chorus of Spartan girls in the 7th century BCE; a long part of its text survives on the Louvre papyrus.", source: "lost" },
  "macedonians:showcase": { title: "Orthios nomos", native: "ὄρθιος νόμος", about: "A high, stirring aulos piece; the story goes that when the aulete Timotheus played it at Alexander's court, the king leapt up to seize his weapons.", source: "lost" },

  // ── Romans ──
  "romans:fire": { title: "The Sack of Troy", native: "Halosis Ilii", about: "The song on the fall of Troy that rumor said Nero sang to the lyre as Rome burned in 64 CE; Suetonius and Cassius Dio report the tale, Tacitus calls it a rumor.", source: "lost" },

  // ── Egyptians, late era ──
  "egyptians-late:build": { title: "Aida", native: "Aida", about: "Verdi's opera set in ancient Egypt, commissioned for Cairo and first performed at the Khedivial Opera House on 24 December 1871.", source: "Verdi's score (1871); not reproduced here" },

  // ── Aztecs ──
  "aztecs:siege": { title: "Song of the broken spears", native: "icnocuīcatl", about: "A Nahuatl song of sorrow for the fall of Tenochtitlan and Tlatelolco in 1521, written down by Nahua authors in the years after; its words survive, not its music.", source: "lost" },

  // ── Maya, late era ──
  "mayans-late:hunt": { title: "Dance of the Deer", native: "Baile del Venado", about: "A highland Maya dance-drama of hunters, dogs and deer, danced at patron-saint fiestas to marimba or to flute and drum.", source: "living tradition (many local versions)" },
  "mayans-late:battle": { title: "Rabinal Achí", native: "Xajoj Tun", about: "An Achi Maya dance-drama about a war between two pre-Hispanic kingdoms, performed every January in Rabinal to the tun slit drum and long trumpets; written down in 1850 and recognized by UNESCO in 2005.", source: "living tradition, Rabinal" },
  "mayans-late:festival": { title: "Dance of the Conquest", native: "Baile de la Conquista", about: "A colonial-era masked dance-drama of the Spanish conquest of Guatemala, performed at highland fiestas such as Santo Tomás in Chichicastenango.", source: "living tradition (many local versions)" },
  "mayans-late:showcase": { title: "Rabinal Achí", native: "Xajoj Tun", about: "The Achi Maya dance-drama of Rabinal, first written down in the 1850s and still performed with the tun slit drum and long trumpets.", source: "living tradition, Rabinal" },

  // ── Haudenosaunee ──
  "haudenosaunee:showcase": { title: "Great Feather Dance", about: "A sacred Haudenosaunee thanksgiving dance of the Longhouse ceremonies, sung with turtle rattles at Midwinter and other gatherings.", source: "living tradition (sacred, not reproduced)" },

  // ── Americans ──
  "americans:rain": { title: "So Long, It's Been Good to Know Yuh", about: "Woody Guthrie's Dust Bowl song, written after the Black Sunday dust storm of April 1935 and recorded on his Dust Bowl Ballads (1940).", source: "Woody Guthrie (still under copyright; not reproduced)" },
  "americans:drought": { title: "So Long, It's Been Good to Know Yuh", about: "Woody Guthrie's song about the Black Sunday dust storm of 14 April 1935 and the families who left the southern Plains.", source: "Woody Guthrie (still under copyright; not reproduced)" },
  "americans:festival": { title: "Auld Lang Syne", about: "Robert Burns's Scots song of old friendship (1788), sung to a traditional tune at midnight on New Year's Eve across the English-speaking world.", melody: "1 - - 1 1 - 3 - 2 - - 1 2 - 3 - 1 - - 1 3 - 5 - 6 - - - - - 6 - 5 - - 3 3 - 1 - 2 - - 1 2 - 3 - 1 - - 6, 6, - 5, - 1 - - - - - - -", key: "F", scale: "major", grid: 8, source: "the Scots tune printed with Burns's words by George Thomson, 1799" },
  "americans:plague": { title: "I had a little bird", about: "A children's skipping rhyme of the 1918 influenza epidemic: I had a little bird, its name was Enza; I opened the window, and in-flu-enza.", source: "lost" },

  // ── Mexicans ──
  "mexicans:ritual": { title: "Las Mañanitas", native: "Las Mañanitas", about: "The traditional Mexican birthday and saint's-day song, sung by mariachis at midnight on 11–12 December to the Virgin of Guadalupe at her basilica.", source: "traditional (not reproduced here)" },
  "mexicans:wedding": { title: "La víbora de la mar", native: "La víbora de la mar", about: "A traditional Mexican children's song and line game, danced at weddings as guests run in a chain under the couple's raised arms.", source: "traditional (not reproduced here)" },

  // ── Tupi ──
  "tupi:festival": { title: "Heu, heuraure", about: "A Tupinambá men's chorus that Jean de Léry heard in a great house in 1557 and wrote down with its notes, among the first songs of the Americas notated by a European.", source: "Jean de Léry, Histoire d'un voyage (1585 edition); not reproduced here" },
});
