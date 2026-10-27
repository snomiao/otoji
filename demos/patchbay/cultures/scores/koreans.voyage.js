// Arirang on a drifting boat: Choe Bu's men, days out on the open sea, keep their spirits up with the song of parting.
SCORES["koreans:voyage"] = {
  about: "Arirang (아리랑) sung by tired men on a boat drifting at sea: one voice leads a verse, everyone joins the refrain, while the wind, the swell and the rain go on",
  heard: "on the open sea after the storm, forty men on a small wooden boat with no water left: the hull creaks and the swell slaps it, the wind does not stop, rain comes and goes; one man begins to sing, slowly and roughly, the others join in on 'arirang, arirang, arariyo', someone knocks the beat on the gunwale; no instruments, only voices in the open air",
  refs: [
    { title: "Arirang, the 1896 student cylinders (copies of the Library of Congress wax cylinders)", who: "Korean students in Washington, recorded by Alice Fletcher, 1896", url: "https://www.youtube.com/watch?v=5PTayH4qgrk" },
    { title: "Arirang (Gyeonggi japga), Victor 49090-A, 1936", who: "Sin Hae-jungwol and Pyo Yeon-wol, Gyeonggi folk singers", url: "https://www.youtube.com/watch?v=0wjI7P2EweI" },
  ],
  measured: "1936 Gyeonggi record: a slow triple metre (the analyser's 144 onsets a minute are the eighth-note pulse of a 3/4 at about 96, with janggu), voices with a wide slow vibrato (~11 cents measured, more on held notes) and many glides (12 % of notes slide into the next), phrases resting on the gong-mode notes sol and la, the singers' pitch centre at F#+40 c (G on the turntable's speed), bright nasal voices (2.7 kHz brightness, peak 1–2 kHz); the 1896 cylinder is too narrow-band to measure beyond its slow pulse and the single unaccompanied voice. Ours: G gong, 3/4 at 84 (the boat song is slower and wearier than the record), the lead sings all four lines, everyone answers on the two refrain lines as in folk call-and-response, slides into the cadences; rendered and measured: the gong-mode steps G A B D E come out as on the record, vibrato 11–16 cents against the record's 11, but our voices are darker (1.3 kHz brightness against 2.7 kHz) and the onset rate is lower (1.7 a second against 5: the record has a janggu, the boat has none); voice gestures, measured with pyin on the 1936 record: short slides between notes, scoops into a third of the notes, H1 a little under H2; ours now has the nonghyeon as held-note shading (shake=0.7 lead, 0.5 chorus: a plain start that shakes wider and slower toward a semitone), scoops (scoop=60: 0→23 % of notes from below against 32 %), glides (glide=0.25–0.3: 4→21 sliding steps, 0.16 s against their 0.10 s) and a pressed voice (press=0.3, H1−H2 −3.0 dB against −3.6); still differs: the Gyeonggi singers' bright nasal colour (they are women, ours boatmen) and the throaty catch inside the nonghyeon; the verse lines are written in the style of the Gyeonggi Arirang, only the refrain follows the known tune",
  text: `
. clock        84 3/4
. arrange@song storm:4bars seonchang:16bars dachang:16bars bi:8bars
. key          gong G

. caption@c1   "아리랑 아리랑 아라리요 / 아리랑 고개로 넘어간다" ?song.2
. caption@c2   "나를 버리고 가시는 님은 / 십리도 못 가서 발병난다" ?song.3
. wind@baram   0.35 gust=0.07Hz
. water@bada   0.5 lap=0.6 splash=0.1
. boat@bae     0.45 creak=0.5
. rain@bi      0.4 drops=0.4 ?song.4
. chant@seonchang voice=men bright=0.7 oct=3 grid=8 human=0.7 scoop=60 glide=0.25 shake=0.7 press=0.3 vib=0.025 breath=0.18 dyn="mp mp mf mf mf mf mf mf mf mf f f mf mf mp mp" ipa="a ɾi ɾaŋ _ a ɾi ɾaŋ _ a ɾa ɾi _ jo a ɾi ɾaŋ ko ɡe ɾo _ nʌ mʌ kan _ da na ɾɯl pʌ ɾi ɡo ka ɕi nɯn _ _ _ ni mɯn ɕim ni do mot ka sʌ _ pal _ pjʌŋ nan da" "5, - - 6, 5, 6, 1 - - 2 1 2 3 2 1 6, 5,~6, - - - - - - - 3 - - 3 2 - 1 - - 2 1 2 3 2 1 6, 5,~6, - - - - - - - 5 - - 5 5 3 5 - - 3 2 1 3 2 1 6, 5,~6, - - - - - - - 3 - - 3 2 - 1 - - 2 1 2 3 2 1 6, 5,~6, - - - - - - -" ?song.2-4
. chant@dachang voice=men bright=0.6 voices=9 oct=3 grid=8 human=0.9 glide=0.3 shake=0.5 press=0.3 vib=0.025 breath=0.25 vol=0.8 dyn="mf mf f f mf mf f f" ipa="a ɾi ɾaŋ _ a ɾi ɾaŋ _ a ɾa ɾi _ jo a ɾi ɾaŋ ko ɡe ɾo _ nʌ mʌ kan _ da" "5, - - 6, 5, 6, 1 - - 2 1 2 3 2 1 6, 5,~6, - - - - - - - 3 - - 3 2 - 1 - - 2 1 2 3 2 1 6, 5,~6, - - - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - -" ?song.3
. chant@dachang2 voice=men voices=5 oct=2 grid=8 human=0.9 glide=0.3 shake=0.5 press=0.3 vib=0.025 breath=0.3 vol=0.5 dyn="mf mf f f mf mf f f" ipa="a ɾi ɾaŋ _ a ɾi ɾaŋ _ a ɾa ɾi _ jo a ɾi ɾaŋ ko ɡe ɾo _ nʌ mʌ kan _ da" "5 - - 6 5 6 1' - - 2' 1' 2' 3' 2' 1' 6 5~6 - - - - - - - 3' - - 3' 2' - 1' - - 2' 1' 2' 3' 2' 1' 6 5~6 - - - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - - 0 - - - - -" ?song.3
. drums@baejeon kit=work vol=0.5 "x.....x.....|............|............" ?song.3
. crowd@saramdeul murmur "eo i gu mul mul pa do a i go chu wo" voices=8 voice=men vol=0.6 dyn="mp p p" ?song.1-4

*> space       field size=1.4
>  speaker     0.5
`,
};
