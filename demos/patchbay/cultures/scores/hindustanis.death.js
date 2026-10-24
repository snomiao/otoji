// Ram naam satya hai: the chant of the men carrying a bier through the lanes of Kashi to the burning ghat, rebuilt from field recordings of funeral processions in Varanasi (its reciting tone, neighbour note and fall, and the walking pulse measured).
SCORES["hindustanis:death"] = {
  about: "Ram naam satya hai, satya bolo gat hai: the call and answer of the men carrying the bier at a walking pace through the lanes, down to the pyres and the river",
  heard: "the narrow stone lanes of Varanasi in the morning, shops and temple bells on either side, people stepping aside; a few men call and the rest answer as they walk with the bamboo bier on their shoulders; at Manikarnika the pyres crackle, the Ganga laps at the steps, the chant fades and only fire and water remain",
  refs: [
    { title: "Funeral procession, Varanasi (field recording)", who: "bmdhacks", url: "https://www.youtube.com/watch?v=VPG7pRlJ4VM" },
    { title: "Funeral procession, Varanasi (field recording)", who: "Ryan Bock", url: "https://www.youtube.com/watch?v=0XWZvRSuSlo" },
    { title: "Funeral procession in Varanasi (excerpt)", who: "Michael T. Balonek", url: "https://www.youtube.com/watch?v=8oqtOT_Zf20" },
  ],
  measured: "Three street recordings of processions in Varanasi (mix; noisy, so few voiced frames): the men chant on one reciting tone (F, about 20 cents flat, near 347 Hz: high, shouted), touch the semitone above it and drop about a minor third (930 cents, i.e. -270) at the end of the answer; the walking pulse is near 60 a minute (also 120 and 246 as subdivisions); the street is loud and noisy (harmonic ratio 0.35-0.48, noise floor -8 dB, level steady within 7 dB). Ours: that tone, neighbour and fall as call (one man) and answer (eight), at 60 a minute; the render comes back with pulse 59.4 and centroid 1.76 kHz against 1.73. Still different: our voices are cleaner and more in tune than shouting men in a crowd (harmonic 0.94 against 0.47), the street murmur stays thin, footsteps and the creak of the bamboo bier are missing; the pyres and river at the ghat are the scene's ending, not on these clips.",
  text: `
. clock        60 4/4
. arrange@song gali:4bars yatra:8bars ghat:4bars agni:4bars
. scale@shok   1 2:100 6:930
. key          shok F

. caption@c1   "राम नाम सत्य है, सत्य बोलो गत है" ?song.1-2
. crowd@bazaar murmur voices=20 voice=mixed vol=2 dyn="mf mf mp p" ?song.1-2
. bell@mandir-ghanta oct=5 grid=8 vol=0.35 "1 0 1 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.1-2
. chant@agua   voice=men oct=4 grid=8 human=0.5 vib=0.006 breath=0.2 dyn="p mp mf f" ipa="raːm naːm sət jə boː loː" "1 - 1 - 0 0 0 0 1 1 2 1 0 0 0 0" ?song.1
. chant@kandhe voice=men voices=8 oct=4 grid=8 human=0.7 vib=0.006 breath=0.25 dyn="p mp mf f" ipa="sət jə hɛː _ gət jə hɛː _" "0 0 0 0 1 1 6, - 0 0 0 0 2 1 6, -" ?song.1
. chant@agua2  voice=men oct=4 grid=8 human=0.5 vib=0.006 breath=0.2 dyn="f" ipa="raːm naːm sət jə boː loː" "1 - 1 - 0 0 0 0 1 1 2 1 0 0 0 0" ?song.2
. chant@kandhe2 voice=men voices=8 oct=4 grid=8 human=0.7 vib=0.006 breath=0.25 dyn="f f f mf" ipa="sət jə hɛː _ gət jə hɛː _" "0 0 0 0 1 1 6, - 0 0 0 0 2 1 6, -" ?song.2
. drums@paon   kit=work vol=0.25 "................|................|x.......x......." ?song.1-2
. chant@door   voice=men voices=6 oct=4 grid=8 human=0.8 vol=0.35 dyn="mp p pp ppp" ipa="raːm naːm sət jə hɛː _" "1 - 1 - 2 1 6, -" ?song.3
. fire@chita   0.35 crackle=0.5 ?song.3-4
. water@ganga  0.35 lap=0.3 splash=0.04 ?song.3-4
. bell@ghat-ghanta oct=4 grid=4 vol=0.4 "1 - - - - - - - - - - - - - - -" ?song.4

*> space       courtyard size=1.3
>  speaker     0.5
`,
};
