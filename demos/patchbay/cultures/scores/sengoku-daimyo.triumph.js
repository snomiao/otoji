// Okehazama, 1560: the victory cry, then Atsumori as kōwaka-mai sings it ('man's fifty years'), then the town of Owari rejoicing.
SCORES["sengoku-daimyo:triumph"] = {
  about: "the victory after Okehazama: the conch and the war drum, the kachidoki shout 'ei, ei, ō!', then a kōwaka-mai chanter sings the famous lines of Atsumori that Nobunaga danced (人間五十年…) to the kotsuzumi and the dancers' stamping, then the townspeople celebrate",
  heard: "evening at Atsuta after the battle, in the open shrine precinct among the trees: the army forms up, the lord's men raise the victory cry three times, the conch and the drum answer; then on a board stage a kōwaka chanter sings, a kotsuzumi player calls and strikes, the dancers stamp; around them soldiers and townspeople from Owari crowd in, talking, laughing, shouting",
  refs: [
    { title: "Kōwaka-mai 'Atsumori' (幸若舞「敦盛」), at Ōe Tenman-gū, 2015", who: "Ōe kōwaka-mai preservation society, Miyama, Fukuoka (the only surviving kōwaka-mai)", url: "https://www.youtube.com/watch?v=9LhnU_HeVSk" },
  ],
  measured: "the Ōe performance: men's chanting on a reciting note (A#3 here) with a fourth above (D#) as the main upper step, a major third (+340 c) passing, and a minor seventh below for the half-cadences, phrase ends held up to 7 s on the reciting note; about 1.5 syllables a second, vibrato ~7 cents, few glides; the kotsuzumi and the stamps are sparse; outdoor shrine stage with a long noisy floor, brightness 2.3 kHz with the strongest band 250–1000 Hz. Ours: the kōwaka text (a 16th-century ballad, public domain) on Bb with steps 1, 3 (340 c), 4 and b7 below, quarter = 88 so the syllables run at about 1.5 a second and the phrase ends hold 4–8 s; the melody is written in the style of the Ōe chant, not transcribed; kotsuzumi (tabla's ringing 'na' stands in for the 'pon' stroke), kakegoe calls, stamping, a kachidoki before and a crowd after. Rendered and measured (the Atsumori section alone): tonic A#, steps 0 500 1000 as in the Ōe chant, vibrato 5 cents against 7, phrase ends held 2–3 s; ours is much darker (1.2 kHz against 2.3 kHz: the formant voice lacks the chanters' strong upper partials) and busier (2.9 onsets a second against 1.5, the drum, stamps and crowd add to the voice). Voice gestures: the Ōe chanters barely glide but press the voice (H1 about 10 dB under H2) and shade the reciting note; ours now presses (press=0.3), leans into notes from below (scoop=40) and shades the held reciting note (shake=0.4, a waver that grows through the hold); the horagai is now the conch bell blown forte (dyn=f). Still differs: kobushi is a quick rise-and-fall turn on the reciting note, not a widening vibrato; the shake approximates it and a written turn (5t) would be too ornamental for kōwaka",
  text: `
. clock        88 4/4
. arrange@song kachidoki:4bars atsumori:24bars iwai:8bars
. scale@kowaka 1 3:340 4 b7
. key          kowaka Bb

. caption@c1   "人間五十年 下天の内をくらぶれば 夢幻の如くなり / 一度生を受け 滅せぬ者のあるべきか" ?song.2
. crowd@taisho shout "EI-EI" "x-x-............x-x-............x-x-..............................." voices=3 voice=men vol=1.2 ?song.1
. crowd@heishi shout "O" "........x-------........x-------........x-----------............" voices=40 voice=men vol=1.3 ?song.1
. brass@horagai oct=3 grid=4 vol=0.7 bell=conch dyn="f" "0 0 0 0 0 0 0 0 0 0 0 0 1~5 - - -" ?song.1
. drums@jindaiko kit=taiko vol=1.2 "X...............X...X...........|................................|................................" ?song.1
. chant@tayu   voice=men bright=0.65 voices=3 oct=3 grid=4 human=0.6 scoop=40 shake=0.4 press=0.3 vib=0.01 breath=0.15 dyn="mf mf f f mf mf mf f f f mf mf mf mf f f mf mf mf f f f mf mp" ipa="niŋ ɡeŋ ɡo dʑɯː neŋ ɡe teŋ no ɯ tɕi o kɯ ɾa bɯ ɾe ba jɯ me ma bo ɾo ɕi no ɡo to kɯ na ɾi hi to ta bi ɕoː o ɯ ke mes se nɯ mo no no a ɾɯ be ki ka" "1 1 4 - 4 1 - - - - - 1 1 1 4 3 1 - - 1 1 4 1 7, - - - - - - - 1 1 - 4 4 3 1 1 - - 1 1 4 - 1 1 - - - - - - - - - - 1 4 4 1 - - 1 - 1 4 1 - - - 4 4 4 1 1 7, - - 1 1 4 3 1 - - - - - - - - - - - -" ?song.2
. drums@kotsuzumi kit=tabla vol=0.9 "................................|x.......x...x...........x.......|................................" ?song.2
. crowd@kakegoe shout "YO-O" "......x-x-..............x-......" voices=1 voice=men vol=0.7 ?song.2
. drums@ashibyoshi kit=taiko vol=0.35 "........x.......................x...............x...............|................................................................|................................................................" ?song.2
. drums@iwaidaiko kit=taiko vol=1 "X..xX...X..xX...|....x.......x...|x.x.x.x.x.x.x.x." ?song.3
. flute@nohkan oct=5 grid=8 human=0.6 vol=0.6 "1' - 4' - (5')4' 1' - - 7 - 1' - 4' - 1' - 4' - 5' 4' 1' - 7 1' - - - - - - - -" ?song.3
. crowd@cheer  shout "WA-A" "x-----......x-------............" voices=30 voice=mixed vol=0.9 ?song.3
. crowd@machi  murmur "ya re me de ta ya o wa ri no to no sa ma ka tsu ta zo" voices=24 voice=mixed vol=0.9 dyn="mf p p p p p p p p p p p p p p p p p p p p p p p p p p p f f f f f f f f" ?song.1-3

*> space       field size=1.6
>  speaker     0.5
`,
};
