// The wake (通夜): a priest recites the Heart Sutra to the wooden fish, then a shakuhachi plays Kōjō no tsuki for the dead.
SCORES["japanese:death"] = {
  about: "an all-night wake: the priest's sutra on one note to the mokugyo and the rin, then a shakuhachi plays the first half of Kōjō no tsuki (荒城の月) slowly for the dead, then the sutra again",
  heard: "a tatami room of the family house at night, the coffin before the altar, incense; the priest kneels and chants the Heart Sutra on a single reciting note, striking the wooden fish on every syllable and the rin bowl at the start and end; the family sits quiet, a few whisper; crickets in the garden outside; afterwards a friend of the dead plays Taki's elegy on the shakuhachi, very slowly, the breath heard in every note",
  refs: [
    { title: "Pillow sutras chanted at a wake (枕経)", who: "Shingon priest Yamamoto Mitsuo, Shiun-ji", url: "https://www.youtube.com/watch?v=s7x8USX2NU8" },
    { title: "Kōjō no tsuki for shakuhachi and koto", who: "Miyata Kōhachirō (shakuhachi) and Nosaka Keiko (koto)", url: "https://www.youtube.com/watch?v=HAWy8Pulk3c" },
    { title: "Kōjō no tsuki, HMV 78 rpm", who: "Fujiwara Yoshie", url: "https://www.youtube.com/watch?v=OLSIG3DlrE8" },
  ],
  measured: "sutra (a 90 s excerpt): one reciting note at about C3 with a drop of roughly 150 cents at phrase ends, about 120 syllables a minute in even beats with the mokugyo on each (4.5 onsets a second counting the wood), a close dry room; shakuhachi and koto: G minor, the melody D D G A Bb A G / Eb Eb D C D (Yamada's later version, which drops Taki's sharp), notes held 1.5–3 s (the tune at about 30–45 a minute, freely), vibrato ~6 cents, breathy (1.4 kHz brightness); the 78 rpm vocal (demucs stem) confirms the first two lines and the slow 2-beat pulse. Ours: the sutra on C at four syllables a second, the mokugyo on every syllable and the rin at the line ends; the shakuhachi in G minor as on the shakuhachi record (Taki wrote B minor) but with Taki's own sharp 4th on 'en' (FAMOUS), in half notes at 60 a minute, about 2 s a note as the player holds them with slides into the long notes; only the first two lines (the A part) are played, because the recordings confirm them and the third line could not be measured reliably. Rendered and measured: the sutra comes out at 4.4 onsets a second against the priest's 4.5 on the same reciting note; the shakuhachi notes last 2.6–2.8 s against the player's 1.7–2.9 s, but ours is brighter (2.4 kHz against 1.4 kHz) and steadier (vibrato 2 cents against 6). Still differs: shakuhachi meri/kari bends and muraiki (the burst of breath on attacks) are only approximated with slides and grace notes",
  text: `
. clock        120 4/4
. arrange@song dokyo:4bars kojo:8bars@60 kojo2:8bars dokyo2:4bars@120
. key          minor G

. chant@soryo  minor C voice=men oct=3 grid=8 human=0.3 vib=0.004 breath=0.15 dyn="mf mf mf mf mf mf mf mp" ipa="kan dʑi zai bo sa ɡjo dʑin han ɲa ha ɾa mi ta dʑi ɕo ken ɡo on kai kɯ do is sai kɯ ja kɯ ɕa ɾi ɕi ɕi ki fɯ" "1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 7, 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 7," ?song.1
. chant@soryo2 minor C voice=men oct=3 grid=8 human=0.3 vib=0.004 breath=0.15 dyn="mf mf mf mf mf mf mp p" ipa="kɯ kɯ fɯ i ɕi ki ɕi ki sokɯ ze kɯ kɯ sokɯ ze ɕi ki dʑɯ so ɡjo ɕi ki jakɯ bɯ ɲo ze ɕa ɾi ɕi ze ɕo ho kɯ" "1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 7, 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 7," ?song.4
. drums@mokugyo kit=temple vol=1.8 "x.x.x.x.x.x.x.x.|................|................" ?song.1
. drums@rin     kit=temple vol=0.7 "................|x...............................................................|................" ?song.1
. drums@mokugyo2 kit=temple vol=1.8 "x.x.x.x.x.x.x.x.|................|................" ?song.4
. drums@rin2    kit=temple vol=0.7 "................|x...............................................................|................" ?song.4
. flute@shakuhachi oct=4 rubato=0.3 grid=4 human=0.6 vol=1.1 dyn="p mp mf mp mp mf mf p" "(6,)5, - 5, - 1 - 2 - 3 - (3)2 - 1 - - - 6, - 6, - 5, - #4, - 5, - - - - - 0 0 5, - 5, - 1 - 2 - 3 - (3)2 - 1 - - - 6, - 4, - 5, - 5, - 1 - - - - - 0 0" ?song.2-3
. drums@rin3    kit=temple vol=0.5 "................|x...............................................................|................" ?song.3
. crowd@kazoku  murmur "o ka a sa ma a ri ga to so u de su ne" voices=5 vol=0.8 dyn="p p" ?song.1-4
. insects@niwa  0.12 temp=22 count=3

*> space       room size=1.6
>  speaker     0.5
`,
};
