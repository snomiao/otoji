// The Tale of the Heike as the blind biwa priests chanted it (Gion shōja), then the warriors' own Satsuma biwa with nōkan and the war drum.
SCORES["sengoku-daimyo:showcase"] = {
  about: "the opening of the Tale of the Heike (祇園精舎) chanted to the heike biwa, the bell of Gion tolling first; then the fiercer warrior style of the Satsuma biwa answered by the nōkan's shriek and the jindaiko",
  heard: "a lord's hall at night, lamps on the tatami, armoured retainers sitting in rows to listen; a blind biwa priest chants alone, his biwa speaking only between the lines; a temple bell is heard from outside; later young warriors of Satsuma strike their biwa hard, a Noh flute and a drum join in; the room is quiet, the wood answers with a short tail",
  refs: [
    { title: "Heike monogatari: Gion shōja (平家物語 祇園精舎)", who: "Iwasa Kakujō, heikyoku (Maeda-ryū tradition)", url: "https://www.youtube.com/watch?v=5HGe_MI3akM" },
    { title: "Gion shōja (平家琵琶)", who: "Tateyama Kōgo, heike biwa (King Records)", url: "https://www.youtube.com/watch?v=bACEzPTuhcU" },
  ],
  measured: "Iwasa Kakujō: the voice recites on E with A a fourth above as the upper reciting note, passing G (+320 c) and F (+100 c) on the way down to E, D (+1050 c) below; notes are held 1.5–5 s, 0.8 onsets a second, wide vibrato ~9 cents and many glides (13 %); the biwa plays only between phrases; a small hall (rt ~3.7 s, brightness 2.2 kHz); Tateyama Kōgo: the same E centre, even slower (0.5 onsets a second), held notes up to 9 s, vibrato 11 cents. Ours: E with those steps (scale 1 b2(100) 3(320) 4 5 b7(1050)), the text of the opening (public domain) one syllable a beat at 60 with holds of 6–10 beats on the cadences, slides and graces on the falling cadences, biwa strokes only in the holds; a bonshō before; the Satsuma part (in the style of Satsuma biwa, not a transcribed piece) at 96 with the biwa's struck chords and tremolo, the nōkan high, jindaiko. Rendered and measured (the chant alone): it rests on E as Iwasa's does, steps F G A above it, notes of 2–6 s, 0.6 onsets a second against 0.8, vibrato 13 cents (now lowered toward the 9–11 of the singers); ours is darker (1.4 kHz against 2.2 kHz). Voice gestures (pyin on Iwasa): his steps slide (median 0.29 s); ours now glides between notes (glide=0.4: 13 sliding steps where there were 3, median 0.28 s) and shades the long holds (shake=0.2); vibrato lowered to 0.012. A volume swell (swell=) was tried and left out: measured in fifths of each held note, Tateyama's holds stay level (within 0.6 dB) and Iwasa's fall away (−4 to −8 dB, the voice tiring and the biwa's decay), so the recordings show no swell to copy. Still differs: the biwa's struck plectrum with its buzzing sawari is only a plucked string here",
  text: `
. clock        60 4/4
. arrange@song kane:2bars katari:24bars satsuma:8bars@96 kane2:2bars@60
. scale@heike  1 2:100 3:320 4 5 b7:1050
. key          heike E

. caption@c1   "祇園精舎の鐘の声 諸行無常の響きあり / 沙羅双樹の花の色 盛者必衰の理をあらはす" ?song.2
. bell@bonsho  oct=2 grid=4 vol=0.9 "1 - - - - - - -" ?song.1
. chant@biwahoshi voice=men bright=0.6 rubato=0.3 oct=3 grid=4 human=0.6 glide=0.4 shake=0.2 vib=0.012 breath=0.2 dyn="mf mf mf mf mp mf mf f f mf mp mf mf mf mf mf mf mf f f mf mp mp p" ipa="ɡi on ɕoː dʑa no ka ne no ko e _ ɕo ɡjoː mɯ dʑoː no hi bi ki a ɾi sa ɾa soː dʑɯ no ha na no i ɾo _ dʑoː ɕa his sɯi no ko to wa ɾi o a ɾa wa sɯ" "1 - 1 4 - - 1 1 1 3 4 (4)3 - 2 1 - - - - - - - 1 1 - 4 1 - - 1 1 4 1 3 - 2~1 - - - - - - - 1 1 4 - 5 4 1 1 3 (4)3 - 2 1 - - - - - - 1 - 1 4 - 4 - - 1 1 4 1 1 3 - 3 2 2 1 - - - - - - - - - - - - - - -" ?song.2
. pluck@heike-biwa oct=2 grid=4 human=0.4 vol=1.4 "1+5/ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1+5+1'/ 0 5 4 1+4+1'/ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1+5+1'/ 0 5 4 1+4+1'/ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1+5+1'/ 0 5 4 1+4+1'/ 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1+5+1'/ 0 5 4 1+4+1'/ 0 0 0 0 0 0 0 0 0" ?song.2
. pluck@satsuma-biwa oct=2 grid=8 human=0.5 vol=1.5 dyn="f f ff f f ff ff f" "1+5+1'/ - 0 1 4 - 1+4+1'/ - 5 4 3 2 1 - 1+5+1'/ - 1+5+1'r - - - 4 5 7 - 5 4 1+4+1'/ - 4 3 2 1 1+5+1'/ - 0 1 4 - 1+4+1'/ - 5 4 3 2 1 - 1+5+1'/ - 1+5+1'r - - - 4 5 7 - 1'+5/ - 5 4 1+5+1'/ - - -" ?song.3
. flute@nohkan oct=5 grid=8 human=0.7 vol=0.7 "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1'' - - (b7')1'' - 4' - 5' - - - 4' 3' 1' - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1'' - - - 4' - (5')4' 3' 1' - - - - - - - -" ?song.3
. drums@jindaiko kit=taiko vol=1 "X.......X...X...|....x.......x...|................" ?song.3
. bell@bonsho2 oct=2 grid=4 vol=0.9 "1 - - - - - - -" ?song.4
. crowd@samurai murmur "o o so re ni te so ro" voices=6 voice=men vol=0.35 dyn="p pp" ?song.1-4

*> space       room size=2.2
>  speaker     0.5
`,
};
