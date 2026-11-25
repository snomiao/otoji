// Пеперуда, the Bulgarian rain song: rebuilt from the 1968 Balkanton field-style recording of the children of Knyazhevo (Yambol) singing it for the rain ritual (tonic, intervals, syllable rate and the drift upward measured with refs/analyse.py).
SCORES["bulgarians:rain"] = {
  about: "Пеперуда, the rain song: children lead the leaf-clad peperuda girl from door to door singing 'Peperuda flew, give, God, rain', the women pour water on her, and at last the rain comes",
  heard: "a dusty village street at noon in a dry summer, between walled yards: a crowd of children singing loud and a little rough in unison, each door's woman talking as she pours a bucket over the dancing girl and hands out flour; the children's pitch creeps up as they go; then clouds over the hills, wind, a far thunder, the children shout for joy and sing on in the rain",
  refs: [
    { title: "Пеперуда (Пеперуда - обичай за дъжд)", who: "Children's troupe of Knyazhevo, Yambol region, Balkanton 1968 (Bulgarian ritual songs and dances)", url: "https://www.youtube.com/watch?v=McRq1cyYamY" },
    { title: "Облак се вие (Пеперуда - обичай за дъжд)", who: "Children's troupe of Knyazhevo, Balkanton 1968", url: "https://www.youtube.com/watch?v=XA5yd6V1wfI" },
  ],
  measured: "Knyazhevo (72 s): unison children, range D4-A4, a narrow tune on four notes over the final: 2nd at 200-210, minor 3rd at 290-300, 4th at 500, with the whole tone (b7) and the 6th (C#, dorian) below for the refrain cadence; each line falls 3 4 3 2 3 2 1 and the refrain dips 2 1 6, 7, 1; syllables ~0.35 s (eighths at about 86), long finals 0.8-1.5 s, phrases ~2-3 s; no instruments, no steady beat for the machine (pulse clarity 0.04) but a clear walking pulse to the ear; the pitch rises a semitone over the take (E-centred at the start, F-centred by 40 s); the second song keeps to two notes (F-G) at the end. Ours follows the scale, the tune shape, the syllable rate, the unison crowd of children and the drift (the later verses are a semitone up). Still differs: the engine's 'boy' voices are cleaner and steadier than children shouting in the street, the drift is a step, not a creep, and the poured water and the girl's dancing have no real sound in the engine",
  text: `
. clock        86 2/4
. arrange@song улица:4bars стих1:8bars вода1:2bars стих2:8bars вода2:2bars стих3:8bars облак:4bars дъжд:8bars
. scale@peperuda 1 2:205 3:295 4:500 5:700 6:900 7:1000

. caption@c1   "Пеперуда летала, / дай, Боже, дъжд!" ?song.2
. caption@c2   "Жито и пшеница, / дай, Боже, дъжд!" ?song.4
. caption@c3   "Пеперуда летала, / дай, Боже, дъжд!" ?song.6
. caption@c4   "дъжд!" ?song.7
. caption@c5   "Жито и пшеница, / дай, Боже, дъжд!" ?song.8
. crowd@selo   murmur "e la de mo ma ri ya i tsa ne ves ta ka ko le le na" voices=6 voice=women vol=1.2 dyn="mp p p mp p p mp p p p" ?song.1-6
. crowd@vikane shout "pe-pe-RU-do" "x-x-x---........" voices=3 voice=women pitch=1.35 vol=0.8 ?song.1
. water@kofa1  level=0.5 lap=1 splash=1 ?song.3
. water@kofa2  level=0.5 lap=1 splash=1 ?song.5
. crowd@smyah  shout "i-HI-hi ha-HA" "x-x-....x-x-...." voices=8 voice=women pitch=1.4 vol=0.5 ?song.3
. chant@detsa  voice=boy voices=10 oct=4 grid=8 human=0.9 vib=0.01 breath=0.2 scale=peperuda key=E dyn="f f f f f f f f 0 0 f f f f f f f f" ipa="pɛ pɛ ru da lɛ ta la daj _ bɔ ʒɛ dɤʃt da sɛ rɔ _ di ʒi tɔ daj _ bɔ ʒɛ dɤʃt ʒi tɔ i pʃɛ _ ni tsa daj _ bɔ ʒɛ dɤʃt pɛ pɛ ru da xvɤr ka la daj _ bɔ ʒɛ dɤʃt" "3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0 3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0 0 0 0 0 0 0 0 0 3 4 3 3 2 3 1 - 2 1 6, 7, 1 - - 0 3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0" ?song.2-4
. chant@detsa-f voice=boy voices=10 oct=4 grid=8 human=0.9 vib=0.01 breath=0.2 scale=peperuda key=F dyn="f f f f f f f f 0 0 0 0 ff ff f f f f f f" ipa="pɛ pɛ ru da lɛ ta la daj _ bɔ ʒɛ dɤʃt da sɛ rɔ _ di ʒi tɔ daj _ bɔ ʒɛ dɤʃt ʒi tɔ i pʃɛ _ ni tsa daj _ bɔ ʒɛ dɤʃt pɛ pɛ ru da xvɤr ka la daj _ bɔ ʒɛ dɤʃt" "3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0 3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 4 3 3 2 3 1 - 2 1 6, 7, 1 - - 0 3 4 3 2 3 2 1 - 2 1 6, 7, 1 - - 0" ?song.6-8
. wind@oblak   level=0.25 gust=0.2Hz ?song.7-8
. drums@gram   kit=sky vol=0.7 "....................x.................................................x.........................|................................................................................................|................................................................................................" ?song.7-8
. crowd@radost shout "DAI bo-zhe DəS" "x-x-x-x---......" voices=12 voice=women pitch=1.35 vol=1 ?song.7
. rain@dazhd   0.55 drops=0.5 ?song.8

*> space       courtyard size=1.2 wet=0.2
>  speaker     0.5
`,
};
