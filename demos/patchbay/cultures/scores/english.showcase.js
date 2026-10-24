// Sumer is icumen in, the summer canon of BL MS Harley 978 (c. 1260): four voices in round over the two-voice pes,
// notes from the transcription on Wikimedia Commons (MIDI), sung at the pitch and pace of the Hilliard Ensemble's recording.
{
  // F-major degrees; the rota is 12 bars of 12/8, each voice enters a bar after the last
  const rota = "1' - 7 6 - 7 1' - 1' 7 6 5 3 - 3 4 - 2 3 - - 0 0 0 1 - 3 2 - 4 3 - 3 2 - 1 3 - 5 6 - 6 5 - - 0 0 0 1' - - 6 - - 1' - - 0 0 0 5 - 3 4 - 2 3 - 5 4 - 3 1 - 3 2 - 7, 1 - - 0 0 0 3 - 3 2 - 4 5 - 5 6 - 7 1' - 7 6 - 7 1' - - 0 0 0 5 - - 6 - - 5 - - 4 - 3 1 - 3 4 - 2 3 - - 4 - 5 3 - 5 2 - 7, 1 - - 0 0 0";
  const words = "su mer is i ku men in hlu de siŋ _ kuk _ ku ɡro weθ seːd and blo weθ meːd and spriŋθ θe wu de nu siŋ kuk ku a we ble teθ af tər lɔmb hluːθ af tər kal və kuː bul luk ster teθ buk ke ver teθ mu rie siŋ kuk ku kuk ku kuk ku wel siŋ ɡes θu kuk ku ne swik θu na ver nu _";
  // the pes, two lower voices exchanging 'Sing cuccu nu, sing cuccu' every two bars
  const pes1 = "1,, - - 2,, - - 1,, - - 2,, - 4,, 5,, - - 4,, - - 5,, - - 0 0 0", pes2 = "5,, - - 4,, - - 5,, - - 0 0 0 1,, - - 2,, - - 1,, - - 2,, - 3,,";
  const pesWords = "siŋ kuk ku nu siŋ kuk ku _";
  SCORES["english:showcase"] = {
    about: "Sumer is icumen in, the 13th-century English round: four men in canon over a two-voice ground, 'Sing cuccu nu', as it was copied at Reading Abbey",
    heard: "a cloister garth in early summer, the sun on the stone walks: two men begin the pes, 'sing cuccu nu', over and over; a third starts the round and the others come in one bar apart until six voices interlock; a real cuckoo calls from the trees beyond the wall, and the round winds down voice by voice over the pes",
    refs: [
      { title: "Sumer is icumen in", who: "The Hilliard Ensemble", url: "https://www.youtube.com/watch?v=sMCA9nYnLWo" },
      { title: "Sumer is icumen in (round), MIDI transcription of BL Harley 978 f. 11v", who: "Wikimedia Commons", url: "https://commons.wikimedia.org/wiki/File:Sumer_is_icumen_in_(round).mid" },
    ],
    measured: "Hilliard: men's voices only, F2–F#4, tonic F# (−20 c), a lilting compound-time pulse (~108 on the tracker, clarity 0.42) with the pes steady in the low band, ~3.2 onsets a second, little vibrato (~5 c), bright for men (1.6 kHz, strong 1–4 kHz), a long church tail. Ours: the Commons transcription's notes exactly (rota 73 notes, pes 8 notes a cycle), 12/8 at 100 (3.3 eighths a second), key F#, four rota voices entering a bar apart over the two pes voices, the Middle English words, a cloister courtyard. Differs: the Hilliard sing one voice to a part, ours are small groups; the cuckoo and the cloister are our staging. Render check: tonic F#, tempo ~99, range F2–D4 (Hilliard F2–F#4), brightness 1.7 kHz (Hilliard 1.6) after raising the voices' ring; bands 500–1000 −9, 1–2 kHz −15, 2–4 kHz −13 dB (Hilliard −3, −7, −7): the synthetic men are still hollow in the low mids",
    text: `
. clock        100 12/8
. arrange@song pes:2bars r1:1bars r2:1bars r3:1bars full:21bars out1:1bars out2:1bars out3:1bars end:2bars
. key          major F#

. caption@c1   "Sing cuccu nu. Sing cuccu." ?song.1-2
. caption@c2   "Sumer is icumen in, / Lhude sing cuccu! / Groweþ sed and bloweþ med / and springþ þe wde nu. Sing cuccu!" ?song.3-5
. caption@c3   "Awe bleteþ after lomb, / lhouþ after calue cu, / Bulluc sterteþ, bucke uerteþ, / murie sing cuccu!" ?song.6-7
. caption@c4   "Cuccu, cuccu, wel singes þu cuccu; / ne swik þu nauer nu." ?song.8-9
. flute@cuckoo oct=5 grid=8 vol=0.25 "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 3 - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.1-9
. chant@pes1   voice=men voices=2 oct=4 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.06 dyn="mf" ipa="${pesWords}" "${pes1}" ?song.1-9
. chant@pes2   voice=men voices=2 oct=4 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.06 dyn="mf" ipa="${pesWords}" "${pes2}" ?song.1-9
. chant@rota1  voice=men voices=2 oct=3 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.05 dyn="mf" ipa="${words}" "${rota}" ?song.2-5
. chant@rota2  voice=men voices=2 oct=3 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.05 dyn="mf" ipa="${words}" "${rota}" ?song.3-6
. chant@rota3  voice=men voices=2 oct=3 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.05 dyn="mf" ipa="${words}" "${rota}" ?song.4-7
. chant@rota4  voice=men voices=2 oct=3 grid=8 human=0.3 bright=0.7 vib=0.01 breath=0.05 dyn="mf" ipa="${words}" "${rota}" ?song.5-8
pes1,pes2,rota1,rota2,rota3,rota4> eq@ring mid=6 high=4

*> space       courtyard size=1.6 wet=0.3
>  speaker     0.5
`,
  };
}
