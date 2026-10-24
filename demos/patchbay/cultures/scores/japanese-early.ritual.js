// Gosechi no mai (五節舞) at the Niiname-sai: the ōuta singers' slow song for the dancing maidens, with wagon, flute, hichiriki and the shakubyōshi clappers.
SCORES["japanese-early:ritual"] = {
  about: "the ōuta (大歌) that accompanies the Gosechi dance: men sing 'otomedomo otomesabisu mo' in immensely long melismas, the shakubyōshi claps the phrases, the wagon is swept, flute and hichiriki follow the voice",
  heard: "a night of the eleventh month in a wooden hall of the palace, torches and braziers burning, the emperor behind his screen; four or five young noblewomen dance slowly in long sleeves; the singers of the ōutadokoro sit on the floor, their leader beating the shakubyōshi; the hall is hushed except for the fire",
  refs: [
    { title: "Ōuta, the song for the Gosechi dance (大歌〈「五節舞」の伴奏歌〉)", who: "Tokyo Gakuso (gagaku ensemble)", url: "https://www.youtube.com/watch?v=zyrn9pUc8rY" },
  ],
  measured: "the ōuta recording (8 minutes): a male chorus between G#2 and C#4 resting on D# (D# at the modern gagaku pitch), the steps 0 90 500 710 800 1010 cents above it (an in-like mode with a semitone above the tonic, no third), the voice turning around D#–C# and falling through B A# G# at phrase ends; notes held 2–8 s, only 0.22 onsets a second, little vibrato (~5 cents), slow attacks (185 ms), a warm 0.5–1 kHz peak, a wooden-hall tail of several seconds. Ours: the same mode on Eb (D#), the ancient text of the ōuta (乙女ども 乙女さびすも 唐玉を 袂に巻きて 乙女さびすも) set syllable by syllable to a melody written in the style of the recording (the song's own notes are not transcribed), quarter = 44 so most notes last 3–8 s; shakubyōshi at the phrase starts, wagon swept every two bars, ryūteki and hichiriki heterophonic with the voices, a brazier crackling. Rendered and measured: tonic D# with the same D#–C# turning and the fall to B, notes of 2–16 s, 0.31 onsets a second against 0.22, vibrato 4 cents against 5; ours is darker (1.4 kHz, peak 250–500 Hz, against 1.9 kHz and 0.5–1 kHz). Still differs: the singers' sliding from note to note inside a syllable (yuri) and the nasal timbre of gagaku singing",
  text: `
. clock        44 4/4
. arrange@song uta:28bars uta2:28bars
. scale@outa   1 b2 4 5 b6 b7
. key          outa Eb

. caption@c1   "乙女ども 乙女さびすも / 唐玉を 袂に巻きて 乙女さびすも" ?song.1-2
. chant@utaikata voice=men bright=0.5 rubato=0.2 voices=5 oct=3 grid=4 human=0.5 vib=0.01 breath=0.2 dyn="mp mf mf mf mf mf mp mp mf mf mf mf mf mp mp mf mf mf mf mp mp mf mf mf mf mp p p" ipa="o to me _ do mo o to _ me sa _ bi _ sɯ mo ka ɾa ta _ ma o ta mo to ni ma ki te o to me sa bi sɯ mo _" "7, - - 1 - - - 7, - 1 - - 1 - - 7, - - - 1 - - 1 - 7, - 1 - - - 6, - 5, - - 5, - 4, - 5, - - - 4, - - - - - 4, - 5, - - 6, - 7, - 1 - - - 7, - - - 1 - 1 - 7, - - 6, - - - 5, - - 4, - 5, - - - 7, - 1 - - 6, - 5, - - 4, - 5, - - 7, - 1 - - - - - - - -" ?song.1-2
. reed@hichiriki oct=3 grid=4 human=0.6 vol=0.35 dyn="p mp" "7,~1 - - 1 - - - 7, - 1 - - 1 - - 7, - - - 1 - - 1 - 7, - 1 - - - 6, - 5, - - 5, - 4, - 5, - - - 4, - - - - - 4, - 5, - - 6, - 7, - 1 - - - 7, - - - 1 - 1 - 7, - - 6, - - - 5, - - 4, - 5, - - - 7, - 1 - - 6, - 5, - - 4, - 5, - - 7,~1 - - - - - - - - - -" ?song.2
. flute@ryuteki oct=4 grid=4 human=0.7 vol=0.2 dyn="p mp" "7, - (2)1 - - - - 7, - (2)1 - - 1 - - 7, - - - (2)1 - - 1 - 7, - 1 - - - 6, - (6,)5, - - 5, - 4, - (6,)5, - - - 4, - - - - - 4, - 5, - - 6, - 7, - (2)1 - - - 7, - - - 1 - 1 - 7, - - 6, - - - (6,)5, - - 4, - 5, - - - 7, - 1 - - 6, - 5, - - 4, - 5, - - 7, - 1 - - - - - - - -" ?song.1-2
. pluck@wagon  oct=3 grid=4 vol=0.9 "1+4+5+7+1'/ 0 0 0 0 0 0 0" ?song.1-2
. drums@shakubyoshi kit=temple vol=0.9 "................................................................|................................................................|x...............................................................x...x..........................................................." ?song.1-2
. fire@kagaribi 0.12 crackle=0.3

*> space       ancestral size=1.1
>  speaker     0.5
`,
};
