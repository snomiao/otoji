// Nos Galan at a Christmas gathering in a Welsh hall: rebuilt from triple-harp playing of the tune (Robin Huw Bowen, Llio Rhydderch)
// and harp-accompanied singing (canu penillion, Osian Ellis); tempo, tonic and the harp's register measured with refs/analyse.py.
{
  const A = "5 - - 4 3 - 2 - 1 - 2 - 3 - 1 - 2 3 4 2 3 - - 2 1 - 7, - 1 - - -";
  const B = "2 - - 3 4 - 2 - 3 - - 4 5 - 2 - 3 4 5 - 6 7 1' - 7 - 6 - 5 - - -";
  const C = "5 - - 4 3 - 2 - 1 - 2 - 3 - 1 - 6 6 6 6 5 - - 4 3 - 2 - 1 - - -";
  const tune = [A, A, B, C].join(" ");
  const rest2 = Array(16).fill("0").join(" ");
  const half = (p, first) => { const t = p.split(" "); return (first ? [...t.slice(0, 16), ...rest2.split(" ")] : [...rest2.split(" "), ...t.slice(16)]).join(" "); };
  const lines = [A, A, B, C].map((p) => half(p, true)).join(" ");   // the singer: the first two bars of each line
  const falala = [A, A, B, C].map((p) => half(p, false)).join(" "); // the hall: the fa-la-la answer
  // harp bass and chords, one bar each: I, V, IV
  const bI = "1 - 5, - 1' - 5, -", bV = "5, - 2 - 5 - 2 -", bIV = "4, - 1 - 4 - 1 -";
  const bass = [bI, bI, bV, bI, bI, bI, bV, bI, bV, bI, bI, bV, bI, bI, bIV, "5, - - - 1 - - -"].join(" ");
  const cI = "0 0 3+5 0 0 0 3+5 0", cV = "0 0 2+5 0 0 0 2+4 0", cIV = "0 0 4+6 0 0 0 4+6 0";
  const chords = [cI, cI, cV, cI, cI, cI, cV, cI, cV, cI, cI, cV, cI, cI, cIV, cV].join(" ");
  SCORES["britons:festival"] = {
    about: "Nos Galan, the Welsh dance-carol of the turn of the year: a harper plays it, a bard sings the lines and the whole hall answers fa-la-la",
    heard: "a castle hall at Christmas with a log fire, tables and talk; the harper (telynor) plays the tune with a bass of plain chords, a singer gives each line and everyone sings the fa-la-la back; then crwth, pibgorn and tabwrdd join for a dance and the hall cheers",
    refs: [
      { title: "Moel yr Wyddfa / Nos Galan", who: "Robin Huw Bowen, Welsh triple harp (telyn deires)", url: "https://www.youtube.com/watch?v=jech9K_yxxU" },
      { title: "Nos Galan", who: "Llio Rhydderch, Welsh triple harp", url: "https://www.youtube.com/watch?v=MK8Pv6EAXA0" },
      { title: "Canu Penillion", who: "Osian Ellis, voice and harp", url: "https://www.youtube.com/watch?v=R3A3uTDoOaU" },
    ],
    measured: "Bowen's Nos Galan (95–175 s): tonic G, a clear two-beat pulse at about 150 a minute, low band busy on the eighths (bass and chords) with the tune above; harp energy centred 250–500 Hz (brightness ~630 Hz), attack ~70 ms, notes ring ~0.5–0.6 s, little vibrato or glide; the harp alone fills the texture. Penillion: voice and harp only, harp in the middle register under the voice. Ours follows tonic, tempo, the I/V/IV left hand and the register. Differs: the crowd singing along and the crwth/pibgorn/tabwrdd dance are our staging (a 12th-century hall), not on the records; the triple harp itself is 17th-century, the harp of 1176 was single-strung. Render check: tempo 144, tonic G, two-beat pulse with busy eighths in the low band like the record; harp bands 1–2 kHz −19 dB and 2–4 kHz −27 dB under the peak (record −21 and −26) after a low-pass for gut strings; overall brightness still about twice the record (voices, fire and the CD-vs-hall medium)",
    text: `
. clock        148 4/4
. arrange@song telyn1:4bars telyn2:4bars telyn3:4bars telyn4:4bars canu1:4bars canu2:4bars canu3:4bars canu4:4bars dawns1:4bars dawns2:4bars dawns3:4bars dawns4:4bars
. key          major G

. caption@l1   "Oer yw'r gŵr sy'n methu caru," ?song.5
. caption@l2   "Hen fynyddoedd annwyl Cymru," ?song.6
. caption@l3   "Iddo ef a'u câr gynhesaf," ?song.7
. caption@l4   "Gwyliau llawen flwyddyn nesaf." ?song.8
. fire@aelwyd  0.12 crackle=0.3
. crowd@neuadd murmur "SI wa ma li DA hen la VO na da" voices=16 vol=0.6 dyn="mf mp" ?song.1-4
. crowd@neuadd2 murmur "bu li NE wi DI ol" voices=10 vol=0.35 ?song.5-12
. pluck@telyn  oct=4 grid=8 human=0.4 dyn="mf" "${tune}" ?song.1-12
. pluck@telyn-bas oct=2 grid=8 human=0.4 vol=0.7 "${bass}" ?song.1-12
. pluck@telyn-cord oct=3 grid=8 human=0.4 vol=0.45 "${chords}" ?song.1-12
telyn,telyn-bas,telyn-cord> filter@gut lp 1600 q=0.5
. chant@bardd  voice=men oct=3 grid=8 human=0.4 vib=0.015 breath=0.08 dyn="f" ipa="ɔɨr ɨur ɡuːr sɨn mɛ θɨ ka rɨ heːn və nɨð ɔɨð a nʊɨl kəm rɨ i ðo eːv aɨ kaːr ɡən hɛ sav ɡʊɨl jaɨ hlaʊ ɛn vlʊɨð ɨn neː sav" "${lines}" ?song.5-8
. chant@gwyr   voice=men voices=8 oct=3 grid=8 human=0.7 vib=0.01 breath=0.15 dyn="mf f" ipa="fa la la la la _ la la la" "${falala}" ?song.5-12
. chant@merched voice=women voices=6 oct=4 grid=8 human=0.7 vib=0.015 breath=0.15 vol=0.7 dyn="mf" ipa="fa la la la la _ la la la" "${falala}" ?song.5-12
. strings@crwth oct=3 grid=8 human=0.5 vol=0.55 dyn="mp mf" "${tune}" ?song.9-12
. strings@crwth-bordwn oct=2 grid=8 vol=0.25 "1+5 - - - - - - - - - - - - - - -" ?song.9-12
. reed@pibgorn oct=5 grid=8 human=0.4 vol=0.4 "${[A, B, C].join(" ")}" ?song.10-12
. drums@tabwrdd kit=celtic vol=0.5 "x.......x.......|....x.......x...|..x...x...x...x." ?song.9-12
. crowd@llon   shout "hu-REI" "x-------........" voices=24 voice=mixed vol=0.5 dyn="0 0 0 f" ?song.12

*> space       hall size=0.9 wet=0.32
>  speaker     0.5
`,
  };
}
