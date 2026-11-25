// Chakrulo: rebuilt from the Kakhetian recording that flew on the Voyager golden record (drones, cadence and tuning measured
// with refs/analyse.py and a multi-pitch view of the mix; the soloists' lines are written in their style, not transcribed).
SCORES["georgians:showcase"] = {
  about: "Chakrulo ჩაკრულო, the Kakhetian table song for two soloists over a held bass, as it was sent into space on the Voyager golden record",
  heard: "at a supra in a Kakhetian house: the long table falls quiet, two singers trade slow ornamented lines over the drone of the other men, and when the last chord dies the table answers with a toast",
  refs: [{ title: "Tchakrulo (Voyager golden record)", who: "Kakhetian singers, Georgian State Merited Ensemble, Melodiya recording", url: "https://www.youtube.com/watch?v=bV85zrndvdY" }],
  measured: "free rhythm, about 145 s; the bass men hold one drone that steps up twice: Eb for the first 46 s, F (about 30 cents sharp) for the next 80, then F → C → G for the cadence; the soloists move in open fifths and fourths over it (Eb–Bb–Eb, F–C–F) and the song ends on G–C–G (1–4–8, not a triad). Pitch classes above the final G: 0, 180, 300, 520, 620, 790, 1030 cents, Georgian not 12-tone (a low 2nd, a 4th 20 cents wide, a neutral 5th region, the 7th sharp). Vibrato almost none (≈5 cents), attacks slow. What differs: the soloists' melismas are written in the recording's style and range, not transcribed note for note; the words are vocables, not the song's text. Our render (bright=0.8, eq lifting 1–4 kHz, soloists in rubato): brightness 1790 Hz against the record's 1620 and the same 2–4 kHz level (−8 dB against −7); the record is strongest at 500–2000 Hz (open, pressed chest voices), and with press= on every voice (0.6 the soloists, 0.4 the bass) our voices alone now give the same profile (500–1000 Hz −3.9 dB against −3.4, 1–2 kHz −5.2 against −5.3, 2–4 kHz −8.1 against −9.3), with a light glide=0.15 joining the soloists' notes as they do (they glide little: 6% of the time). Still differs: our bass men are about 10 dB weaker below 250 Hz, our vibrato is smaller than the record's mix of voices shows (6 against 16 cents), and the 4–8 kHz air is 9 dB above the old Melodiya tape",
  text: `
. clock        60 4/4
. arrange@song supra:2bars eb:12bars f:20bars cadence:5bars toast:2bars
. scale@kakhuri 1 2:180 3:300 4:520 5:620 6:790 7:1030
. key          kakhuri G

. caption@title "ჩაკრულო · Chakrulo" ?song.2
. crowd@supra  murmur "ga ma ri ji ne ra do ki tsi ba ra mo" voices=10 vol=1.3 dyn="mp p" ?song.1
. crowd@sadghegrdzelo shout "ga-u-MAR-jos" pattern="x-x-x---x-------" voices=12 vol=0.9 ?song.5
. chant@bani       voice=men bright=0.8 voices=6 oct=2 grid=8 human=0.5 vib=0.004 breath=0.12 press=0.4 dyn="mp mf" vol=1.1 ipa="ha _ a _" "6 - - - - - - - - - - - - - - -" ?song.2
. chant@bani2      voice=men bright=0.8 voices=6 oct=2 grid=8 human=0.5 vib=0.004 breath=0.12 press=0.4 dyn="mf" vol=1.1 ipa="ha _ a _" "7 - - - - - - - - - - - - - - -" ?song.3
. chant@bani3      voice=men bright=0.8 voices=6 oct=2 grid=8 human=0.5 vib=0.004 breath=0.12 press=0.4 dyn="mf mf mp mp p" vol=1.1 ipa="ha a a _" "7 - - - - - - - 4 - - - - - - - 4 - - - - - - - 1 - - - - - - - - - - - - - - -" ?song.4
. chant@mtkmeli    voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.7 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="mf f mf mf mp mf" ipa="ʁa _ _ e _ de la _ _ o _ _ ʁa ri _ ra _ _ _ o _ _ _ _ _ _ _" "3' - - - - - (4')3' 5' 4' - 3' - 7 - 6 - 7 - - 3' - - 4' 3' 7 - 6 - - - - - 0 0 0 0 0 0 0 0 6 7 3' - 4'~5' - 4' 3'" ?song.2
. chant@modzakhili voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.7 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="mp mf mf mp mf" ipa="o _ de la _ o ʁa ri ra o _ _ _" "6 - - - - - - - - - - - 6 - - - 7 - - - 6 - - - 3 - 4 - 6 - - - 7 - 3' - 7 6 7 - 6 - - - - - - -" ?song.2
. chant@mtkmeli2   voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.7 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="f mf f mf mf" ipa="ʁa _ _ o _ ho ra _ _ _ ri _ ra _ o _ _ _" "4' - - - - - (5')4' 3' 4' - 6' - 5' 4' 3' - 4' - - - 3' 4' 3' 7 7 - - - - - - - 0 0 0 0 0 0 0 0" ?song.3
. chant@modzakhili2 voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.7 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="mf mf mf f" ipa="o _ de la _ o _ ʁa ri ra o _ _ _" "7 - - - - - - - - - - - 7 - - - 4 - - - 7 - - - 4 - 6 - 7 - - - 4' - 3' 7 6 - 7 -" ?song.3
. chant@mtkmeli3   voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.6 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="f mf mf mp p" ipa="ʁa _ _ o _ _ _ o _" "4' - 3' 2' - - - - 1' - - - - - - - 1' - - - - - - - 1' - - - - - - - 1' - - - - - - -" ?song.4
. chant@modzakhili3 voice=men bright=0.8 rubato=0.3 oct=3 grid=8 human=0.6 vib=0.006 breath=0.1 press=0.6 glide=0.15 dyn="mf mf mp p" ipa="a _ e _ _ _" "2 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - - 4 - - - - - - -" ?song.4

*> eq          low=-1 mid=7 high=6
>  space       room size=1.8 wet=0.3
>  speaker     0.5
`,
};
