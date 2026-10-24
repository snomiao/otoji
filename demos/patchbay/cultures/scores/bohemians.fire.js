// Jan Hus at the stake in Constance, 6 July 1415: the chronicler Petr of Mladoňovice says he sang "Christe, Fili Dei vivi, miserere mei" twice and began "qui natus es ex Maria virgine" a third time, until the wind blew the flame into his face. That is the short responsory of Prime, and its plainchant notes (Antiphonale Romanum, via GregoBase) are what he sang, here by one man's voice over the crowd and the fire.
SCORES["bohemians:fire"] = {
  about: "Hus's last song: the Prime responsory 'Christ, Son of the living God, have mercy on me', sung twice aloud from the pyre, then 'who was born of the Virgin Mary' begun a third time and cut off by the smoke, as the fire takes hold",
  heard: "a meadow outside the walls of Constance on a summer day: a dense crowd of townsfolk and soldiers talking, the faggots and straw piled to the chin of the man chained to the stake; when the fire is lit he sings out in a strong voice, alone, in the open air; the crowd falls quiet to hear him; the blaze crackles and grows, and after the third start his voice stops and only the fire and the people are heard",
  refs: [
    { title: "Christe Fili Dei vivi", who: "Hortus Musicus (men's voices)", url: "https://www.youtube.com/watch?v=-BYiCIQYo6A" },
    { title: "Christe Fili Dei vivi … Qui natus es (responsorium breve), gabc", who: "GregoBase (Antiphonale Romanum)", url: "https://gregobase.selapa.net/chant.php?id=18119" },
  ],
  measured: "Hortus Musicus, yin-tracked: final F3, the notes F F F F-G G G-F G G-A, F G-A G-F-D F-G G F exactly as the book gives them (range D3–A3), ordinary notes 0.3–0.5 s and phrase ends 1–1.9 s, vibrato ~5 c, energy at 125–1000 Hz with a singer's ring at 2–4 kHz (brightness ~1690 Hz), a long church tail. Ours: the same notes and pace in F for one man, 'mei' for 'nobis' and 'ex Maria' as the chronicle quotes him, twice and then broken off, sung with rubato and the singer's ring raised, in the open field instead of a church; the fire grows across the scene. The crowd and the fire are our staging of the chronicle; his voice is synthetic and steadier than a man's on a pyre. Our render, yin-tracked: F F F G G G A G A G F D F G F, then the same again — the book's notes in order; range E3–A3, brightness ~1.5 kHz (record ~1.7); the vowel band at 500–1000 Hz needed an eq lift and is still thinner than real men's voices",
  text: `
. clock        75 4/4
. arrange@song luka:3bars prvni:4bars druha:4bars treti:2bars plamen:4bars
. key          major F

. caption@c1   "Christe, Fili Dei vivi, miserere mei." ?song.2-3
. caption@c2   "Qui natus es ex Maria …" ?song.4
. crowd@lid    murmur "das ist er her-got scha-u-et stil le-ut" voices=30 voice=mixed vol=0.9 dyn="mf mf mf p pp pp pp pp pp pp pp pp pp p mp mf mf" ?song.1-5
. fire@hranice 0.25 crackle=0.4 ?song.1-3
. fire@plamen  0.75 crackle=0.8 ?song.4-5
. chant@hus    voice=men voices=1 oct=3 grid=8 human=0.4 rubato=0.4 vib=0.015 breath=0.1 bright=0.6 dyn="f f f f ff ff ff f f" ipa="kris te fi li _ de i _ vi vi _ mi se _ re _ _ re _ me i kris te fi li _ de i _ vi vi _ mi se _ re _ _ re _ me i kvi na _ tus es eks ma ri a" "1 1 1 1 2 2 2 1 2 2 3 - - 0 1 2 3 2 1 6, 1 2 2 1 - - - 0 0 0 0 0 1 1 1 1 2 2 2 1 2 2 3 - - 0 1 2 3 2 1 6, 1 2 2 1 - - - 0 0 0 0 0 3 3 4 2 2 2 2 3 2 - 0 0 0 0 0 0" ?song.2-4

*> space       field size=1 wet=0.2
>  eq          low=-2 mid=6 high=0
>  speaker     0.5
`,
};
