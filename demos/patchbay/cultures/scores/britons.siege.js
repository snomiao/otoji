// Men of Harlech in the besieged castle: the tune as first printed by Edward Jones (1794), in the plain setting at
// thesession.org, played on the harp as Robin Huw Bowen plays it and sung by the garrison to Talhaiarn's Welsh words;
// tonic and pace measured on Bowen's triple harp and a Welsh male choir with refs/analyse.py.
{
  const A = ["1 - - 7, 6, - 7, -", "1 - 2 - 3 - 1 -", "4 - 3 - 2 - 1 -", "7, - 6, - 7, - 5, -",
    "1 - - 7, 6, - 7, -", "1 - 2 - 3 - 5 -", "3 - - 4 2 - - 1", "1 - - - - - - -"].join(" ");
  const B = ["2 - - 1 7, - - 1", "2 - 2 - 0 0 0 0", "5 - - 4 3 - - 4", "5 - 5 - 0 0 0 0",
    "5 - - 4 3 - - 4", "5 - - 4 3 - - 4", "5 - - 4 3 - - 4", "5 - 5 - 0 0 3 -",
    "4 - - 6 5 - - 5", "4 - - 4 3 - - 3", "2 - - 4 2 - 1 -", "7, - 6, - 7, - 5, -",
    "1 - - 7, 6, - 7, -", "1 - 2 - 3 - 5 -", "3 - - 4 2 - - 1", "1 - - - - - - -"].join(" ");
  // the harp's left hand: tonic and dominant on the beats, a march bass
  const bI = "1, - 5, - 1, - 5, -", bV = "5,, - 2, - 5,, - 2, -", bIV = "4,, - 1, - 4,, - 1, -";
  const bassA = [bI, bI, bIV, bV, bI, bI, bV, bI].join(" ");
  const bassB = [bV, bV, bV, bV, bV, bV, bV, bV, bIV, bI, bV, bV, bI, bI, bV, bI].join(" ");
  const words = "we le ɡɔil kɛrθ wɛn ən vlam jɔ a θa vɔd aɨ taːn ən blɔɨð jɔ ar iːr dɛʊr jɔn ðoːd i da rɔ iːn waiθ ɛ tɔn iːn";
  SCORES["britons:siege"] = {
    about: "Men of Harlech (Rhyfelgyrch Gwŷr Harlech), the march of the castle that would not open its gate: the harper plays it, the thin garrison sings it on the walls, a drum and the besiegers' guns below",
    heard: "Harlech on its rock above the sea in a hard winter of the siege: wind off the bay, waves at the foot of the cliff, now and then a bombard thudding from the camp below; in the inner ward the harper plays the march and the men on the walls take it up in Welsh, stamping, a tabor keeping the step, and shout at the end",
    refs: [
      { title: "The March of the Men of Harlech", who: "Robin Huw Bowen, Welsh triple harp", url: "https://www.youtube.com/watch?v=cLCRoC6RjH4" },
      { title: "Men of Harlech", who: "Treorchy Male Choir", url: "https://www.youtube.com/watch?v=uzFEzWtwFBM" },
      { title: "Rhyfelgyrch Gwŷr Harlech (setting 3)", who: "thesession.org", url: "https://thesession.org/tunes/13597" },
    ],
    measured: "Bowen: tonic C, a march in two at ~129 crotchets a minute with the tune in quavers (4.8 onsets a second), bass on the beats, energy 250–500 Hz with little above 1 kHz (brightness ~820 Hz), notes ring ~0.6 s; Treorchy: tonic C, men's voices B1–C#4 in harmony, energy 500–1000 Hz. Ours: the 1794 tune in C at 124, the harp with a tonic–dominant bass, the garrison singing the first strain in unison (an octave below the harp), a tabor, the courtyard of the castle with sea and wind. Differs: the four-part male-choir harmony of the recordings is 19th–20th century, so our soldiers sing in unison; Talhaiarn's words are from the 1860s, the tune itself from the 18th century, not the 1460s. Render check: tonic C, a clear two-beat march (pulse clarity 0.58) at 123, harp and voices 1–2 kHz −16 dB under the peak (Bowen −18), but the wind, sea and guns fill the low band (0–125 Hz −5 dB where the harp record has −28)",
    text: `
. clock        124 4/4
. arrange@song siege:2bars harp:8bars s1:2bars s2:2bars s3:2bars s4:2bars march:16bars t1:2bars t2:2bars t3:2bars t4:2bars cheer:2bars
. key          major C

. caption@c1   "Wele goelcerth wen yn fflamio," ?song.3
. caption@c2   "A thafodau tân yn bloeddio," ?song.4
. caption@c3   "Ar i'r dewrion ddod i daro" ?song.5
. caption@c4   "Unwaith eto'n un." ?song.6
. wind@bay     0.25 gust=0.1Hz
. water@cliff  0.2 lap=0.7 splash=0.06
. drums@bombard kit=guns vol=0.45 "x...............|................|................" ?song.1
. drums@bombard2 kit=guns vol=0.3 "........x.......|................|................" ?song.7
. pluck@telyn  oct=4 grid=8 human=0.35 dyn="mf" "${A} ${A} ${B} ${A}" ?song.2-11
. pluck@telyn-bas oct=3 grid=8 human=0.35 vol=0.6 "${bassA} ${bassA} ${bassB} ${bassA}" ?song.2-11
telyn,telyn-bas> filter@gut lp 1800 q=0.5
. chant@garrison voice=men voices=12 oct=3 grid=8 human=0.6 vib=0.012 breath=0.15 dyn="f" ipa="${words}" "${A}" ?song.3-6
. chant@garrison2 voice=men voices=12 oct=3 grid=8 human=0.6 vib=0.012 breath=0.15 dyn="ff" ipa="${words}" "${A}" ?song.8-11
. drums@tabwrdd kit=celtic vol=0.5 "x...x...x...x...|................|..x...x...x...x." ?song.3-11
. crowd@walls  shout "HAR-lech" "x-x-----x-x-----" voices=30 voice=men vol=2 dyn="ff f" ?song.12

*> space       courtyard size=1.4 wet=0.25
>  speaker     0.5
`,
  };
}
