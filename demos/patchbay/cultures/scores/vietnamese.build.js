// Hò dô ta, the dyke-builders' call and answer: rebuilt from a recording of the earth-ramming work song (hò đầm đất) of Nghệ Tĩnh, the nearest living form of the north's dyke chants, with our own calls in the old formula.
SCORES["vietnamese:build"] = {
  about: "Hò dô ta: a leader calls a short line, the whole village answers 'hò dô ta' as the wooden rammers come down on the earth of the dyke",
  heard: "on the bank of the Red River in the dry season, the whole village out on the raw earth: men carrying baskets on shoulder poles, women packing the soil with heavy wooden rammers; one strong voice calls, everyone answers on the blow, the river and the wind behind them, and a shout and laughter when a stretch is done",
  refs: [
    { title: "Earth-Ramming Work Song for Dike Building (Ví and Giặm folk songs of Nghệ Tĩnh)", who: "Hà Tĩnh Television (field documentary)", url: "https://www.youtube.com/watch?v=C5q385R5ag8" },
  ],
  measured: "Hà Tĩnh earth-ramming song (mix): the final is D# (within 10 cents) and the tune uses Sa, Re 200, Ma 520 and Pa 700 (an anhemitonic set with a wide fourth), the caller's line lies high, around D#4-A#4 (median 350 Hz), the answer falls back to Sa; the beat is 96 a minute with the rammers coming down every other beat (48), and the field is open (no tail to speak of). Ours: that scale, the call high and the 'hò dô ta' answer falling Ma-Re-Sa, rammers on the answer at the same tempo (the render's pulse is 97.5 against 95.7). Still different: these are our own calls in the formula, not the recorded verses (ví and giặm texts); the crowd's answer is cleaner and more in time than real workers' voices; the wooden rammer is a taiko stroke, not a dull thud of wood into wet earth; the source is from Nghệ Tĩnh, the nearest recorded relative of the Red River dyke chants.",
  text: `
. clock        96 4/4
. arrange@song bai:2bars ho:8bars ho2:8bars@~108 nghi:2bars@96
. scale@ho     1 2:200 4:520 5:700 6:900
. key          ho D#

. caption@c1   "Nào anh em ơi! Hò dô ta! / Đầm cho thật chặt! Hò dô ta!" ?song.2
. caption@c2   "Đê cao đê vững! Hò dô ta! / Lũ to chẳng sợ! Hò dô ta!" ?song.3
. wind@song-hong 0.12 gust=0.06Hz
. water@bai    0.2 lap=0.1 splash=0.02
. crowd@lang   murmur voices=20 voice=mixed vol=1.2 dyn="mf p p p p p p p p p p p p p p p p p mf mf" ?song.1-4
. chant@ke     voice=men oct=4 grid=8 human=0.6 bright=0.6 vib=0.01 breath=0.15 dyn="f" ipa="naːw ʔaːɲ ʔɛm əːj dəm tʃɔ tʰət tʃat dɛ kaw dɛ vəŋ lu tɔ tʃaŋ sɤ" "5 - 5 - 1 5 - - 0 0 0 0 0 0 0 0 1 1 5 - 2~1 - - - 0 0 0 0 0 0 0 0 5 - 5 2 - 1 - - 0 0 0 0 0 0 0 0 1 1 5 4 - - - - 0 0 0 0 0 0 0 0" ?song.2-3
. chant@do-ta  voice=men voices=12 oct=3 grid=8 human=0.8 vib=0.008 breath=0.2 dyn="f" ipa="hɔ zo ta" "0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - -" ?song.2-3
. chant@do-ta-nu voice=women voices=10 oct=3 grid=8 human=0.8 vib=0.008 breath=0.2 vol=0.8 dyn="mf f" ipa="hɔ zo ta" "0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - - 0 0 0 0 0 0 0 0 4 - 2 - 1 - - -" ?song.3
. drums@vo-dam kit=taiko vol=0.8 "................X.......x.......|................................" ?song.2-3
. drums@cuoc   kit=work vol=0.4 "................................|....x.......x...........x.......|x..............................." ?song.1-3
. crowd@ho-cuoi shout "HO" "x---------------" voices=24 voice=mixed vol=1.6 ?song.4

*> space       field size=1.3
>  speaker     0.5
`,
};
