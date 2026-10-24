// Bolo Hari, Hari bol: the mourners' call and answer as the bier is carried to the burning ghat on the Hooghly, rebuilt from a Bengali village funeral procession recorded on a phone (pitch, pulse and the crowd's loose unison measured on demucs stems).
SCORES["bengalis:death"] = {
  about: "Bolo Hari, Hari bol: a man calls 'say Hari', the crowd answers 'Hari bol', over and over at a walking pace with khol and kartal, until the river ghat, where the pyre is lit",
  heard: "a lane of Kolkata at dusk leading down to Nimtala ghat: neighbours murmuring at the door as the bier is lifted, the men chanting as they walk, a khol drum and brass kartals keeping the step, the crowd's voices never quite together; at the ghat the Hooghly laps at the steps, a boat creaks, the fire takes",
  refs: [
    { title: "বাজনা বাজিয়ে শ্মশান যাত্রা, হরিবোল হরিবোল (a village funeral procession)", who: "field recording (Payel Mandal)", url: "https://www.youtube.com/watch?v=YAc3V3aXqKM" },
    { title: "শ্মশান যাত্রা (a funeral procession)", who: "field recording (Biswajit)", url: "https://www.youtube.com/watch?v=Fx5uxkGuSmI" },
  ],
  measured: "Village procession clip (demucs voice and drum stems; a phone recording, so rough): the crowd centres on a Sa between F# and G (about +30 cents over G's neighbour, written G), sung high (median 374-395 Hz) with the upper Re (~210) and the ni below (~1090) around it, never in exact unison (vibrato and spread ~12 cents, many glides); the drums pulse at 67 and 132 a minute. Ours: the call 'bolo hori' on Sa-Re-Sa and the answer 'hori bol' dropping to ni and the low dha, ten men and six women answering loosely (human=0.9), khol and kartal at 66; the render returns median 393 Hz and pulse 66/132. Still different: the clip has a village drum band (bajna) where we use khol and kartal, its crowd is noisier and brighter (centroid 1.4-1.8 kHz against our 1.2), and the ghat (river, boat, pyre) is the scene's ending, not in the clip.",
  text: `
. clock        66 4/4
. arrange@song bari:2bars jatra:8bars nimtala:4bars chita:2bars
. scale@hari   1 2:210 3:360 4:490 5:700 6:880 7:1090
. key          hari G

. caption@c1   "বলো হরি, হরি বোল" ?song.2-3
. crowd@protibeshi murmur voices=14 voice=women vol=2 dyn="mp p" ?song.1
. chant@dak    voice=men oct=4 grid=8 human=0.5 vib=0.012 breath=0.2 dyn="mf f" ipa="bo lo ɦo ri bo lo ɦo ri" "1 1 2 1 0 0 0 0 1 1 2 1 0 0 0 0" ?song.2
. chant@uttor  voice=men voices=10 oct=4 grid=8 human=0.9 vib=0.012 breath=0.25 vol=0.9 dyn="mf f" ipa="ɦo ri bol _ ɦo ri bol _" "0 0 0 0 7, 1 1 - 0 0 0 0 7, 1 6, -" ?song.2
. chant@uttor-meye voice=women voices=6 oct=4 grid=8 human=0.9 vib=0.012 breath=0.25 vol=0.5 dyn="mp" ipa="ɦo ri bol _ ɦo ri bol _" "0 0 0 0 7, 1 1 - 0 0 0 0 7, 1 6, -" ?song.2
. drums@khol   kit=tabla vol=0.6 "X.......x.......|....x.x.....x.x.|..x.......x....." ?song.2
. drums@kartal kit=daf vol=2 "................|................|x...x...x...x..." ?song.2
. chant@dur    voice=men voices=8 oct=4 grid=8 human=0.9 vol=0.3 dyn="mp p pp ppp" ipa="bo lo ɦo ri ɦo ri bol _" "1 1 2 1 7, 1 1 -" ?song.3
. water@hugli  0.4 lap=0.35 splash=0.03 ?song.3-4
. boat@nouka   0.25 creak=0.3 ?song.3-4
. fire@chita   0.4 crackle=0.5 ?song.4

*> space       river size=1.2
>  speaker     0.5
`,
};
