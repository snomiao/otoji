// Greensleeves in an Elizabethan great chamber: the tune as in William Ballet's lute book (c. 1600), played on the
// renaissance lute, sung to the 1584 words, then taken by a small consort of recorder, bass viol and lute; tonic, pace
// and the lute's register measured on lute and consort recordings with refs/analyse.py.
{
  // minor-scale degrees in sixteenths, 6/8 bars of 12 (verse, then the 'Greensleeves' chorus)
  const pick = "0 0 0 0 0 0 0 0 0 0 1 -";
  const verse = [
    "3 - - - 4 - 5 - - 6 5 -", "4 - - - 2 - 7, - - 1 2 -", "3 - - - 1 - 1 - - #7, 1 -", "2 - - - #7, - 5, - - - 1 -",
    "3 - - - 4 - 5 - - 6 5 -", "4 - - - 2 - 7, - - 1 2 -", "3 - - 2 1 - #7, - - #6, #7, -", "1 - - - - - 1 - - - - -"];
  const chorus = [
    "7 - - - - - 7 - - #6 5 -", "4 - - - 2 - 7, - - 1 2 -", "3 - - - 1 - 1 - - #7, 1 -", "2 - - - #7, - 5, - - - - -",
    "7 - - - - - 7 - - #6 5 -", "4 - - - 2 - 7, - - 1 2 -", "3 - - 2 1 - #7, - - #6, #7, -", "1 - - - - - - - - - 1 -"];
  const tune = [...verse, ...chorus].join(" ");
  // the ground under it, a chord every dotted crotchet: Am G Am E / C G Am E
  const Am = "1,+5,+1", G = "7,,+4,+7,", E = "5,,+2,+#7,", C = "3,+7,+3";
  const half = (c) => `${c}/ - - - - -`;
  const prog = [Am, Am, G, G, Am, Am, E, E, Am, Am, G, G, Am, E, Am, Am, C, C, G, G, Am, Am, E, E, C, C, G, G, Am, E, Am, Am];
  const ground = prog.map(half).join(" ");
  // the 1584 words; the last note (the pickup back into the verse) is the lute's alone
  const sing = tune.split(" ").slice(0, -2).concat(["0", "0"]).join(" ");
  const words = "a las mai luv _ ju du mi rɔŋ tu kast mi ɔf dis _ kur tjus li for ai hav lu ved _ ju wel and lɔŋ di lait iŋ in jur kom _ pa ni " +
    "ɡriːn sliːvz waz ɔl mai dʒɔi _ and ɡriːn sliːvz waz mai di lait ɡriːn sliːvz waz mai hart ɔv ɡoːld and huː but mai _ la di ɡriːn _ _ sliːvz _";
  SCORES["house-of-lancaster:showcase"] = {
    about: "Greensleeves, the ballad tune of the 1580s, as an Elizabethan house heard it: a lutenist plays it alone, a singer gives the 1584 words, then recorder and bass viol join the lute in consort",
    heard: "a panelled great chamber in a country house after supper, candles and a wood fire, the household listening: first the lute alone over its own bass, quiet and close; then a man sings 'Alas, my love, you do me wrong' to the lute; then a recorder takes the tune, a bass viol bows the ground and the lute fills between",
    refs: [
      { title: "Greensleeves (William Ballet lute book)", who: "Luthval, renaissance lute", url: "https://www.youtube.com/watch?v=XoAsmw_SraQ" },
      { title: "Greensleeves (II)", who: "The Baltimore Consort", url: "https://www.youtube.com/watch?v=SvTsLWylizM" },
    ],
    measured: "Lute (Ballet's setting): tonic A# (−10 c, a lute at low pitch), the tune on 1 b3 4 5 with the raised 6th and 7th at cadences (0 200 300 500 700 1000 1090 cents), the quaver ~0.37 s (about 160 a minute), lilting 6/8 with long-short pairs, low band busy with the bass courses, energy 125–1000 Hz and almost nothing above 1 kHz (brightness ~690 Hz), notes ring ~0.5 s. Baltimore Consort: tonic F, 3.8 onsets a second, the consort's bass strong (0–125 Hz −5 dB). Ours: key A# minor, 6/8 at 80, the Ballet tune with dotted rhythms on a sixteenth grid over the Am–G–Am–E / C–G–Am–E ground, lute, then voice, then recorder and bass viol; the chamber as a room. Differs: Ballet's lute divides the tune with runs and fuller chords than our plain strummed ground. Render check: tonic A#, the 6/8 lilt, brightness ~1.05 kHz with the gut low-pass (lute record 0.69 kHz), bands 1–2 kHz −17 and 2–4 kHz −21 dB (lute −15, −25), low band thinner than the lute's bass courses (125–250 Hz −10 against 0)",
    text: `
. clock        80 6/8
. arrange@song pick:1bars lute1:8bars lute2:8bars song1:8bars song2:8bars consort1:8bars consort2:8bars
. key          minor A#

. caption@c1   "Alas, my love, you do me wrong, / To cast me off discourteously," ?song.4
. caption@c2   "Greensleeves was all my joy, / And Greensleeves was my delight," ?song.5
. fire@hearth  0.06 crackle=0.12
. crowd@household murmur "ma-ster LU-te ye si-re" voices=6 vol=2 dyn="mf mp" ?song.1
. pluck@lute   oct=4 grid=16 human=0.4 vol=1.4 dyn="mf mp mf" "${pick} ${tune} ${tune} ${tune}" ?song.1-5
. pluck@lute-ground oct=3 grid=16 human=0.4 vol=1 dyn="mp" "${"0 ".repeat(12)}${ground} ${ground} ${ground}" ?song.1-7
lute,lute-ground> filter@gut lp 1500 q=0.5
. chant@singer voice=men oct=3 grid=16 human=0.4 vib=0.015 breath=0.08 dyn="mp mp p mp" ipa="${words}" "${sing}" ?song.4-5
. flute@recorder oct=5 grid=16 human=0.3 vol=0.5 dyn="mf" "${tune}" ?song.6-7
. strings@gamba oct=2 grid=16 human=0.4 vol=0.55 dyn="mf" "${prog.map((c) => c.split("+")[0] + " - - - - -").join(" ")}" ?song.6-7

*> space       room size=1.8 wet=0.28
>  speaker     0.5
`,
  };
}
