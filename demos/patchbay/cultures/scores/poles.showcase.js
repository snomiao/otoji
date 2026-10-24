// Bogurodzica, the oldest Polish hymn (Kraków manuscript of 1407/08; public domain), as the knights' host sang it before battle: a cantor intones, then thousands of men take it up in unison in the open field, horses stamping, banners in the wind. Notes pitch-tracked from Collegium Vocale's unison recording.
SCORES["poles:showcase"] = {
  about: "Bogurodzica, 'Mother of God, Virgin, Mary praised by God', the medieval Polish hymn the knights sang before battle, as at Grunwald in 1410: the first stanza and its Kyrieleison, a cantor first, then the whole host",
  heard: "a July morning on the field before the battle: the army drawn up under its banners, men in mail on their horses; a priest or cantor starts the hymn and the ranks take it up, a great rough unison of men's voices rolling across open ground with no walls to answer it, the horses shifting and snorting, the wind in the banners",
  refs: [
    { title: "Bogurodzica", who: "Collegium Vocale (unison men's voices), Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Bogurodzica_-_Collegium_Vocale.ogg" },
    { title: "Bogurodzica", who: "Monodia Polska and Adam Strug (traditional-style singing)", url: "https://www.youtube.com/watch?v=cO5csWCewd0" },
  ],
  measured: "Collegium Vocale, yin-tracked note by note: a men's unison on a final C#3 (range B2–C#4), the steps C# D# E F# G# B (a C natural only as a passing note), thirteen phrases each ending on a long note (1.3–2.5 s), the other notes 0.3–0.5 s; the 'Maryja' phrase F# G# F# D# B C# comes back identically twice, which confirms the reading; vibrato ~7 c, energy at 125–1000 Hz (brightness ~975 Hz). Ours: the same notes and phrase lengths (0.48 s a note, held ends of ~1.9 s), the cantor alone for the first two phrases then the host of men; where the words fall on the melismas is our reading (the record's syllables could not all be separated), and in 'matko zwolena' we repeat an F# the tracker merged. The host sings with rubato and a slow pitch drift (two groups drifting apart, +8 and −10 c a minute). Our render, yin-tracked: C# B E D# C# B C#, E F# E F# G#, B C#' B F# E … the record's notes in order; brightness ~1150 Hz (record ~975) after an eq cut; energy at 125–1000 Hz like the record. A real host would still be rougher and less together than ours",
  text: `
. clock        62 4/4
. arrange@song pole:3bars hymn:16bars
. scale@bogurodzica 1 2 b3 4 5 b6 b7
. key          bogurodzica C#

. caption@c1   "Bogurodzica dziewica, Bogiem sławiena Maryja, / u twego Syna Gospodzina matko zwolena, Maryja! / Zyszczy nam, spuści nam. / Kyrieleison." ?song.2
. wind@wiatr   0.2 gust=0.09Hz ?song.1-2
. drums@konie  kit=horses vol=0.25 "................................|......x.........................|................................" ?song.1-2
. crowd@rycerze murmur "bo-ze da-ji he ko-nie sa-ji" voices=20 voice=men vol=0.8 dyn="mp p 0" ?song.1
. chant@kantor rubato=0.3 voice=men voices=1 oct=3 grid=8 human=0.4 vib=0.012 breath=0.08 dyn="f" ipa="bɔ gu rɔ dʑi _ tsa _ dʑɛ vi _ _ _ tsa bɔ gjɛm swa vjɛ na ma rɨ _ ja _ _ u twɛ gɔ sɨ _ _ na _ gɔs pɔ dʑi _ na mat kɔ zvɔ lɛ na ma rɨ _ ja _ _ ʐɨʂ tʂɨ nam _ spu ɕtɕi nam ki _ _ _ _ _ ri _ ɛ _ _ _ ɛ _ _ _ lɛj sɔn _" "1 7, 3 2 1 7, 1 - - - 0 3 3 4 3 4 5 - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.2
. chant@zastep rubato=0.3 drift=8 voice=men voices=12 oct=3 grid=8 vol=1.5 human=0.8 vib=0.012 breath=0.1 dyn="ff" ipa="bɔ gjɛm swa vjɛ na ma rɨ _ ja _ _ u twɛ gɔ sɨ _ _ na _ gɔs pɔ dʑi _ na mat kɔ zvɔ lɛ na ma rɨ _ ja _ _ ʐɨʂ tʂɨ nam _ spu ɕtɕi nam ki _ _ _ _ _ ri _ ɛ _ _ _ ɛ _ _ _ lɛj sɔn _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7 1' 7 4 3 - - - 0 4 5 4 2 7, 1 - - - 0 1' 7 5 3 4 3 4 5 - - - 0 7 1' 5 4 3 - - - 0 7 5 4 4 3 - - - 0 4 5 4 2 7, 1 - - - 0 3 4 5 4 2 7, 1 - - - 0 3 3 4 3 4 5 - - - 0 7 1' - - - 0 7 5 4 3 - - - 0 4 5 4 2 1 1 1 - - - 0 0 0" ?song.2
. chant@zastep2 rubato=0.4 drift=-10 voice=men voices=12 oct=2 grid=8 human=0.9 vib=0.015 breath=0.12 vol=0.5 ipa="bɔ gjɛm swa vjɛ na ma rɨ _ ja _ _ u twɛ gɔ sɨ _ _ na _ gɔs pɔ dʑi _ na mat kɔ zvɔ lɛ na ma rɨ _ ja _ _ ʐɨʂ tʂɨ nam _ spu ɕtɕi nam ki _ _ _ _ _ ri _ ɛ _ _ _ ɛ _ _ _ lɛj sɔn _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 7 1' 7 4 3 - - - 0 4 5 4 2 7, 1 - - - 0 1' 7 5 3 4 3 4 5 - - - 0 7 1' 5 4 3 - - - 0 7 5 4 4 3 - - - 0 4 5 4 2 7, 1 - - - 0 3 4 5 4 2 7, 1 - - - 0 3 3 4 3 4 5 - - - 0 7 1' - - - 0 7 5 4 3 - - - 0 4 5 4 2 1 1 1 - - - 0 0 0" ?song.2

*> space       field size=1.4 wet=0.25
>  eq          low=0 mid=0 high=-10
>  speaker     0.5
`,
};
