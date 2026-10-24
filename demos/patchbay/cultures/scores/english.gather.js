// Scarborough Fair sung at a Harvest Home supper: rebuilt from Ewan MacColl's 1957 unaccompanied recording
// (the Teesdale tune he had from Mark Anderson), tonic, range, scale and pace measured with refs/analyse.py.
{
  const bar = (...b) => b.join(" ");
  const L1 = bar("1 - - - 1 -", "5 - 5 - 5 -", "2 - - 3 2 -", "1 - - - - -");   // Are you going to Scarborough Fair
  const L2 = bar("0 0 5 - 7 -", "1' - - - 7 -", "5 - 6 - 4 -", "5 - - - - -"); // Parsley, sage, rosemary and thyme
  const L3 = bar("0 0 1' - 1' -", "1' - 7 - 5 -", "5 - 4 - 3 -", "2 - - - - -"); // Remember me to one who lives there
  const L4 = bar("1 - - - 5 -", "4 - 3 - 2 -", "1 - - - 7, -", "1 - - - - -");   // She once was a true love of mine
  const R = (n) => Array(6 * n).fill("0").join(" ");
  const verse = bar(L1, L2, L3, L4), refrain = bar(R(4), L2, R(8));
  const solo = bar(verse, verse), company = bar(refrain, refrain);
  SCORES["english:gather"] = {
    about: "Scarborough Fair, the riddle ballad of the herb refrain, sung unaccompanied at the Harvest Home supper while the whole table joins the refrain",
    heard: "a farm barn after the last load: the hock cart comes in with the reapers shouting 'Harvest home!', then master and labourers sit to beef and ale by the fire; one man sings the old ballad alone, in the free, plain north-country way, and everyone comes in on 'parsley, sage, rosemary and thyme'",
    refs: [
      { title: "Scarborough Fair (Child 2), 1957", who: "Ewan MacColl, unaccompanied (the tune of Mark Anderson, Middleton-in-Teesdale)", url: "https://www.youtube.com/watch?v=0RAyU22l93g" },
    ],
    measured: "MacColl 1957: one unaccompanied baritone, tonic between B and C (C −40 cents), range about B1–B3, the tune moves on 1 4 5 b7 with 2 and b3 passing (Dorian), phrases end on the tonic; no steady beat (pulse clarity 0.07) but about 132 crotchets a minute in three, ~2 notes a second, little vibrato (~5 c), a dry close room (energy 125–2000 Hz flat, falls off above 2 kHz). Ours: the Dorian tune in 3/4 at 132 with each line easing off at its end (the arranged tempo dips), the singer at C3 with little vibrato, the company only on the refrain line. Differs: the record has no listeners; the barn, fire, shouts and the joining-in are the Harvest Home of Tusser's day; the engine's rubato is only a per-line tempo dip, not the singer's free holding of the long notes. Render check: tonic C, Dorian degrees 0 200 300 500 700 900 1000, range B2–C4, ~2.4 notes a second, weak pulse (clarity 0.12, the record 0.07); with a chest-voice EQ the 1–2 kHz band is −9 dB under the peak where MacColl's nasal ring puts it at the top, and 4–8 kHz is 10 dB too strong (fire and breath)",
    text: `
. clock        132 3/4
. arrange@song cart:4bars v1a:4bars v1b:4bars@~124 v1c:4bars@132 v1d:4bars@~118 v2a:4bars@132 v2b:4bars@~124 v2c:4bars@132 v2d:4bars@~116 toast:4bars@132
. key          dorian C

. caption@c1   "Are you going to Scarborough Fair? / Parsley, sage, rosemary and thyme," ?song.2-3
. caption@c2   "Remember me to one who lives there, / She once was a true love of mine." ?song.4-5
. caption@c3   "Tell her to make me a cambric shirt, / Parsley, sage, rosemary and thyme," ?song.6-7
. caption@c4   "Without no seams nor needlework, / Then she'll be a true love of mine." ?song.8-9
. fire@hearth  0.12 crackle=0.2
. crowd@reapers shout "HAR-ves HOM" "x-x-x-----......" voices=20 voice=men vol=0.8 dyn="f ff f mf" ?song.1
. crowd@table  murmur "a-ye BE ra-de GOO-de MA-sa TA-ne a-le" voices=14 vol=1 dyn="mf mp" ?song.1
. crowd@table2 murmur "ma-sa GOO-de ye" voices=8 vol=0.45 ?song.2-9
. crowd@toast  shout "a-WAS-sai" "x-x-x---........" voices=24 voice=mixed vol=0.7 dyn="0 f ff mf" ?song.10
. chant@singer voice=men oct=3 grid=8 human=0.7 rubato=0.5 bright=0.6 vib=0.012 breath=0.12 dyn="mf" ipa="ɑː juː ɡoː ɪŋ tə skɑː bʌ rə feːr pɑːs liː seːdʒ roːz mə riː ənd taɪm rɪ mɛm bər miː tə wʊn huː lɪvz ðeːr ʃiː wʊns wɒz ə truː lʊv ɒv maɪn tɛl ər tə meːk miː ə kæm brɪk ʃɜːt pɑːs liː seːdʒ roːz mə riː ənd taɪm wɪð aʊt noː siːmz nɔːr niː dəl wɜːk _ ðɛn ʃiːl biː ə truː lʊv ɒv maɪn" "${solo}" ?song.2-9
singer> eq@chest low=-2 mid=6 high=-2
. chant@company voice=men voices=9 oct=3 grid=8 human=0.8 vib=0.01 breath=0.2 vol=0.8 dyn="mf" ipa="pɑːs liː seːdʒ roːz mə riː ənd taɪm" "${company}" ?song.2-9
. chant@wives  voice=women voices=5 oct=4 grid=8 human=0.8 vib=0.015 breath=0.2 vol=0.55 dyn="mf" ipa="pɑːs liː seːdʒ roːz mə riː ənd taɪm" "${company}" ?song.2-9

*> space       room size=2.2 wet=0.28
>  speaker     0.5
`,
  };
}
