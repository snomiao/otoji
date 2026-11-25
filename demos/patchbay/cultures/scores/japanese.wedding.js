// Takasago-ya at an Edo wedding: after the three-three-nine cups, a guest chants the travel song of the Noh Takasago, unaccompanied, to the hushed room.
SCORES["japanese:wedding"] = {
  about: "Takasago (高砂), the Noh travel song 'Takasago ya, kono urafune ni ho wo agete' chanted solo by a guest at the wedding, as utai is sung at a feast: no instruments, the guests quiet, then their congratulations",
  heard: "an evening wedding in the groom's house in Edo: lamps, a gold screen, the bride in white; the guests talk and the sake is poured, then a senior man of the family sits up straight and chants Takasago from the belly, slowly, on the three utai pitches; everyone falls silent until the last line, then the room breaks into 'omedetō gozaimasu'",
  refs: [
    { title: "Su-utai (solo) 'Takasago', Kanze school (能楽 観世流 素謡(独吟)「高砂」)", who: "Hayashi Kiemon XI, Kanze-school Noh actor (historic recording)", url: "https://www.youtube.com/watch?v=jfe798lgll4" },
  ],
  measured: "the solo utai (6.5 minutes): one man's voice centred on F (the chū-on), with a fourth above (Bb, jō-on, here 520 cents) and a fourth below (C, ge-on) as the main steps, the semitone below the centre (E, +1090 c) and a small step above (+140 c) used as ornaments; syllables mostly 0.2–0.9 s with phrase-final vowels held, vibrato ~7 cents, few glides (7 %), an old recording's narrow band (brightness 2.9 kHz, nothing under 250 Hz). Ours: scale 1 2(140) 4 5 7 on F, the travel song's text (Zeami's Takasago, public domain) one syllable a beat at 84 with the lines' ends held, the high opening 'Takasago ya' on the jō-on and each line falling to the chū-on or the ge-on as utai lines do; the melody follows the utai pitch system but is not a transcription of the Kanze notation (fushi); guests murmur before and cheer after. Rendered and measured (the chant alone): centre F with Bb the main other step, vibrato 8 cents against 7, about one onset a second; ours is darker (1.3 kHz against 2.9 kHz, but the reference is a narrow old recording) and smoother: the singer's syllables are separated by small pushes of breath that our legato voice runs together. Voice gestures: utai's belly voice is now a pressed chest voice (press=0.35, H1 weaker than H2 as in the record, whose narrow band exaggerates it: −16 dB against our −5), the held syllables are shaded with yuri (shake=0.25: the waver grows through the hold, 21→28 cents peak to peak) and notes are reached from a little below (scoop=60). Still differs: Hayashi's yuri is narrower than ours (about 5–11 cents) and comes as discrete pushes, not a growing vibrato; the breath pushes between syllables are still run together",
  text: `
. clock        84 4/4
. arrange@song utage:4bars takasago:34bars iwai:6bars
. scale@utai   1 2:140 4 5 7
. key          utai F

. caption@c1   "高砂や この浦舟に帆を上げて / 月もろともに出で潮の 波の淡路の島影や / 遠く鳴尾の沖過ぎて はや住の江に着きにけり" ?song.2
. crowd@kyaku  murmur "o me de to u ma a i pa i do u zo" voices=14 voice=mixed vol=0.9 dyn="mf mp" ?song.1
. chant@utai-kata voice=men bright=0.7 rubato=0.25 oct=3 grid=4 human=0.6 scoop=60 shake=0.25 press=0.35 vib=0.012 breath=0.15 dyn="f f f f mf mf mf mf f f mf mf mf mf mf mf f f mf mf mf mf mf mf f f mf mf mf mf mf mf mp mp" ipa="ta ka sa ɡo ja ko no u ɾa bɯ ne ni ho o a ɡe te ko no u ɾa bɯ ne ni ho o a ɡe te tsɯ ki mo ɾo to mo ni i de ɕi o no na mi no a wa dʑi no ɕi ma ka ɡe ja to o kɯ na ɾɯ o no o ki sɯ ɡi te ha ja sɯ mi no e ni tsɯ ki ni ke ɾi ha ja sɯ mi no e ni tsɯ ki ni ke ɾi" "4 - 4 4 4 (5)4 - - - - 4 4 1 1 1 1 (2)1 - 1 1 1 7, 1 - - - 4 4 1 1 1 1 (2)1 - 1 1 1 7, 1 - - - - - - - 4 4 4 1 1 1 (2)1 - 1 1 1 7, 1 - - - 1 1 1 4 4 1 1 - 1 1 7, 5, 5, - - - 4 4 4 1 1 1 1 - 1 1 1 7, 1 - - - 4 4 4 1 1 1 (2)1 - 1 1 7, 5, 5, - - - 4 4 1 1 1 1 1 - 1 1 7, (7,)5, 5, - - - - - - - - - - - - -" ?song.2
. crowd@medeto shout "O-ME-DE-TO-O" "x-x-x-x-x-------................................................" voices=16 voice=mixed vol=1 ?song.3
. crowd@kyaku2 murmur "o me de to u go za i ma su ka pa i" voices=16 voice=mixed vol=1 dyn="mp mf" ?song.3

*> space       room size=1.4
>  speaker     0.5
`,
};
