// The Londonderry Air played on the uilleann pipes on a crossing: rebuilt from slow-air playing by pipers
// (Chris McMullan, Tara Howley) and the setting of the air at thesession.org (Petrie's tune), measured with refs/analyse.py.
{
  // the air in degrees, one bar of eighths each; pipers' cuts as grace notes from above
  const air = [
    "0 0 0 0 0 7, 1 2",
    "(5)3 - - 2 3 6 5 3", "2 1 6, - 0 1 3 4", "(6)5 - - 6 5 3 1 3", "2 - - - 0 7, 1 2",
    "(5)3 - - 2 3 6 5 3", "2 1 6, - 0 7, 1 2", "(5)3 - - 4 3 2 1 2", "(2)1 - - - 0 5 6 7",
    "(2')1' - - 7 7 6 5 6", "5 3 1 - 0 5 6 7", "(2')1' - - 7 7 6 5 3", "(3)2 - - - 0 5 5 5",
    "3' - - 2' 2' 1' 6 1'", "5 3 1 - 0 7, 1 2", "3 6 5 3 2 1 6, 7,", "(2)1 - - - - - - -",
  ].join(" ");
  // the fiddle's second time: the same air, plainer, a few notes leaned on
  const fiddle = air.replace(/\(\S+?\)/g, "");
  SCORES["celts:voyage"] = {
    about: "The Londonderry Air, the slow Irish air of farewell, played on the uilleann pipes on a ship as the coast falls behind; the second time a fiddle takes it",
    heard: "on the deck of a crowded ship with whole families aboard, wagons and bundles lashed down: the timbers creak, the sea slaps the hull, a light wind; a piper plays the slow air over his drones while the people go quiet, a few talking low; then a fiddler takes the tune and the piper holds the drones",
    refs: [
      { title: "Danny Boy (Londonderry Air), uilleann pipes", who: "Chris McMullan", url: "https://www.youtube.com/watch?v=c-4aSXb8_9M" },
      { title: "Danny Boy (Londonderry Air), uilleann pipes", who: "Tara Howley", url: "https://www.youtube.com/watch?v=8nxuD66oj4o" },
      { title: "The Derry Air (setting 1, in G)", who: "thesession.org", url: "https://thesession.org/tunes/6867" },
    ],
    measured: "McMullan, chanter above 500 Hz: tonic D (concert D set), plain major scale (200 380 500 700 890 1190 cents, the pipes' just-leaning 3rd and 6th ~10–20 cents flat), long held notes of 2–4 s between quick runs, ~1.4 notes a second, no vibrato (the pipes have none), no steady pulse; the drones sit on D an octave or two below and carry as much energy as the chanter (bands flat from 0 to 4 kHz, brightness ~2.2 kHz on Howley). Ours: the Petrie air in D at a slow 52 with each four-bar phrase easing off at its end, cuts from above before long notes, the chanter over a constant D drone, the space open water. Differs: our rubato is only a tempo arc per phrase; the record's piper bends phrase lengths freely and adds rolls and crans the grace syntax cannot make; the ship, people and fiddle are our setting; the uilleann pipes are 18th-century, far later than any ancient crossing. Render check: tonic D, the air's degrees 380 490 690 880 1080 cents, range A#3–C#5, no pulse (clarity 0.01), held notes 2–4 s as on the record; but the engine's chanter is darker even with an EQ lift (2–4 kHz −9 dB under the peak, the record about −1 dB), and the sea fills the low band the record leaves to the drones",
    text: `
. clock        52 4/4
. arrange@song pick:1bars p1:4bars@52 p2:4bars@~48 p3:4bars@56 p4:4bars@~44 f1:4bars@52 f2:4bars@~48 f3:4bars@56 f4:4bars@~42
. scale@pipes  1 2:200 3:390 4:500 5:700 6:890 7:1090
. key          pipes D

. water@sea    0.22 lap=0.45 splash=0.02
. boat@timbers 0.35 creak=0.35
. wind@deck    0.18 gust=0.06Hz
. crowd@aboard murmur "a ma na DE ri so ga LA mo" voices=10 vol=1.6 dyn="mp p pp" ?song.1-3
. bagpipe@uilleann oct=4 grid=8 human=0.5 rubato=0.6 vol=0.9 dyn="mf mf f mf mp" "${air}" ?song.1-5
uilleann> eq@reed mid=3 high=7
. strings@fiddle oct=4 grid=8 human=0.6 rubato=0.5 vol=0.8 dyn="mp mf f mf p" "${fiddle.split(" ").slice(8).join(" ")}" ?song.6-9
. bagpipe@drones oct=3 vol=0.3 "1 - - - - - - - - - - - - - - -" ?song.6-9

*> space       river size=1.1 wet=0.3
>  speaker     0.5
`,
  };
}
