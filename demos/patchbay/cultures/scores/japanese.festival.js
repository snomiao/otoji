// Sakura Sakura at an Edo hanami: the old koto song (箏の手ほどき曲) sung on a mat under the blossoms, the party singing along, and a festival hayashi band coming through.
SCORES["japanese:festival"] = {
  about: "Sakura Sakura (さくら さくら), the Edo koto song of the blossoms, sung at a hanami: koto and voice, then shamisen and the whole party, then a matsuri-bayashi of shinobue and drums passing by",
  heard: "open air under the cherry trees of Ueno or Asukayama in spring: mats spread on the ground, people eating and drinking and talking; a woman sings to her koto, a shamisen joins, the neighbours on the next mats sing the second verse with her and clap; then a festival hayashi (shinobue, shime-daiko, ōdō, atarigane) comes through the crowd",
  refs: [
    { title: "Sakura Sakura (from the LP Favourite Melodies of Japan)", who: "koto and voice, traditional style", url: "https://www.youtube.com/watch?v=dKyqYkvMg78" },
    { title: "Shitaya Jinja grand festival, Kanda-bayashi (field recording, 2018)", who: "a Kanda-bayashi ren in the street", url: "https://www.youtube.com/watch?v=Vi9qrgZMK4w" },
  ],
  measured: "koto record: phrases rest on the in-scale tonic (here written as E, degrees E F A B C, no 3rd or 7th), notes mostly quarter and half values at about 60 a minute, koto attack ~70 ms with a ~0.4 s decay, very little vibrato, nearly no glide except the koto's pressed notes; hayashi field recording: about 103 beats a minute in 2, 4.7 onsets a second (the shime-daiko keeps steady eighths and sixteenths, the ōdō on the downbeats), the shinobue is not tempered (steps of about 150, 470, 620, 690, 850 cents above its tonic) and sits two octaves above the drums; outdoor, long noisy floor. Ours, rendered and measured the same way: the koto section reads tonic A with steps 190 290 690 790 1190 against the record's 200 290 690 800 1190 (the same in-scale, since the analyser hears the koto's pitch centre on the 4th), attack 69 ms as on the record, decay 0.65 s against 0.37 s, and darker (1.2 kHz against 1.7 kHz brightness: the record has the voice in it); the hayashi section measures 103 a minute in 2 like the street band, 5.2 onsets a second against 4.7, but far steadier (pulse clarity 0.75 against 0.17: the street players push and pull) and with more low drum. Still differs: the koto's oshide pressed-string bends and its sukui upstrokes are only approximated with slides and grace notes, and the crowd singing is synthesized",
  text: `
. clock        62 4/4
. arrange@song koto:14bars uta:14bars minna:14bars hayashi:8bars@104
. scale@in     1 b2 4 5 b6
. scale@fue    1 2:150 4:470 5:690 6:850
. key          in E

. caption@c1   "さくら さくら / 弥生の空は 見わたす限り" ?song.2
. caption@c2   "霞か雲か 匂ひぞ出づる / いざや いざや 見にゆかん" ?song.3
. crowd@te     chant "HA" "x...x...x...x..." voices=8 voice=mixed vol=1.2 ?song.3
. pluck@koto   oct=4 grid=8 human=0.4 vol=1.8 dyn="mf mf mf mf mp mp mf mf mp mp mf mf mp p" "4+4' - 4 - 5 - - - 4+4' - 4 - 5 - - - 4 - 5 - 6 - 5 - 4 - (6)5 4 2 - - - 1+1' - 6, - 1 - 2 - 1 - 1 6, 5,+5 - - - 4 - 5 - 6 - 5 - 4 - (6)5 4 2 - - - 1+1' - 6, - 1 - 2 - 1 - 1 6, 5,+5 - - - 4+4' - 4 - 5 - - - 4+4' - 4 - 5 - - - 1 - 2 - (6)5 4 2 - 1+5+1'/ - - - - - - -" ?song.1-3
. chant@uta    voice=women oct=4 grid=8 human=0.5 vib=0.008 breath=0.12 dyn="mf mf mf mf mf mf f f mf mf mf mf mp mp" ipa="sa ku ɾa sa ku ɾa ja jo i no so ɾa _ wa mi wa ta sɯ ka ɡi _ ɾi ka sɯ mi ka kɯ mo _ ka ni o i zo i zɯ _ ɾɯ i za ja i za ja mi ni jɯ _ ka n" "4 - 4 - 5 - - - 4 - 4 - 5 - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 4 - 5 - - - 4 - 4 - 5 - - - 1 - 2 - 5 4 2 - 1 - - - - - - -" ?song.2-3
. chant@minna  voice=women voices=5 oct=4 grid=8 human=0.8 vib=0.01 breath=0.2 vol=0.7 dyn="mp mf mf mf mf mf f f mf mf f f mf mp" ipa="sa ku ɾa sa ku ɾa ja jo i no so ɾa _ wa mi wa ta sɯ ka ɡi _ ɾi ka sɯ mi ka kɯ mo _ ka ni o i zo i zɯ _ ɾɯ i za ja i za ja mi ni jɯ _ ka n" "4 - 4 - 5 - - - 4 - 4 - 5 - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 4 - 5 - - - 4 - 4 - 5 - - - 1 - 2 - 5 4 2 - 1 - - - - - - -" ?song.3
. chant@otoko   voice=men voices=4 oct=3 grid=8 human=0.9 vib=0.01 breath=0.2 vol=0.55 dyn="mp mf mf mf mf mf f f mf mf f f mf mp" ipa="sa ku ɾa sa ku ɾa ja jo i no so ɾa _ wa mi wa ta sɯ ka ɡi _ ɾi ka sɯ mi ka kɯ mo _ ka ni o i zo i zɯ _ ɾɯ i za ja i za ja mi ni jɯ _ ka n" "4 - 4 - 5 - - - 4 - 4 - 5 - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 5 - 6 - 5 - 4 - 5 4 2 - - - 1 - 6, - 1 - 2 - 1 - 1 6, 5, - - - 4 - 4 - 5 - - - 4 - 4 - 5 - - - 1 - 2 - 5 4 2 - 1 - - - - - - -" ?song.3
. pluck@shamisen oct=3 grid=8 human=0.5 vol=1.5 dyn="mp mf" "4 4' 4 4' 5 5' (6)5 - 4 4' 4 4' 5 5' (6)5 - 4 - 5 5' 6 - 5 5' 4 4' 5 4 2 2' 2 - 1 1' 6, 6 1 1' 2 2' 1 1' 1 6, 5, 5 5, - 4 - 5 5' 6 - 5 5' 4 4' 5 4 2 2' 2 - 1 1' 6, 6 1 1' 2 2' 1 1' 1 6, 5, 5 5, - 4 4' 4 4' 5 5' (6)5 - 4 4' 4 4' 5 5' (6)5 - 1 1' 2 2' 5 4 2 - 1 1' 1 - 1+5/ - - -" ?song.2-3
. flute@shinobue  fue F# oct=5 grid=8 human=0.6 vol=0.7 dyn="mf f f f mf f f mf" "1' - 6 5 4 - 5 6 1' - - 2' 1' 6 5 - 4 5 6 5 4 2 1 - 2 - 4 - 5 - - - 1' - 6 5 4 - 5 6 1' 2' 1' 6 5 6 1' - 4 5 6 5 4 2 4 5 1 - - - 1 - - -" ?song.4
. drums@shime   kit=taiko vol=1.8 "................|................|x.xxx.x.x.xxx.x." ?song.4
. drums@shime2  kit=taiko vol=1.4 "................|................|..x.x.xx..x.x.xx" ?song.4
. drums@odo     kit=taiko vol=0.55 "X.......x..x....|.......x........|................" ?song.4
. drums@kane    kit=temple vol=0.25 "................|x...x.x.x...x.x.|................" ?song.4
. crowd@kakegoe shout "SO-RE" "x-x-............................................................" voices=6 voice=men vol=1.4 ?song.4
. crowd@hanami murmur "sa ke no mo ka na ha na mi ya yo i ne e so re" voices=14 vol=1.2 dyn="mp mp p p" ?song.1-4

*> space       field size=1.2
>  speaker     0.5
`,
};
