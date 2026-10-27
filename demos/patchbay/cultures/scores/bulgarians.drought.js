// A drought at harvest: a Bulgarian reapers' song (жътварска) in the parched field and the peperuda procession coming from the village, rebuilt from Balkanton field-style recordings (Lyuba Barakova, Slavka Petkova and Tinka Dimitrova, 1961; the Knyazhevo children, 1968), measured with refs/analyse.py.
SCORES["bulgarians:drought"] = {
  about: "the drought: women reaping thin wheat at noon sing a harvest song with its high cry across the fields, another group answers from far off, and the peperuda children come singing 'A cloud is winding, give, God, rain'; no rain comes",
  heard: "open stubble fields in the heat of the day, almost no wind and no echo: the reapers' voices carry far, unaccompanied, a lead singer and two who join her, the long cry thrown up an octave and answered from another field; later the children's two-note rain chant draws near from the village, the women's talk with it; then only the dry wind",
  refs: [
    { title: "Слънцето е на заода (жътварска песен на връщане от нива)", who: "Lyuba Barakova, Slavka Petkova, Tinka Dimitrova; Balkanton 1961 (folk songs from southern Bulgaria)", url: "https://www.youtube.com/watch?v=IGdPRjommtI" },
    { title: "Облак се вие (Пеперуда - обичай за дъжд)", who: "Children's troupe of Knyazhevo, Yambol region, Balkanton 1968", url: "https://www.youtube.com/watch?v=XA5yd6V1wfI" },
  ],
  measured: "harvest song (46 s): tonic E (+30c), lines of about 6 s: the voices rest on the tonic (1 s holds), move in a narrow band (190, 395-420, 500 cents: a major second, a near-major third, a fourth) and twice a line leap to the cry, the second above the octave (1390-1420) falling to the octave (1230), then back down to the tonic; free rhythm (pulse clarity 0.03), voices in heterophony, bright and close (2.3 kHz brightness, strong 1-8 kHz); children's peperuda (Облак се вие): two notes, the final and the whole tone above (170-200), in unison. Ours follows the scale in cents, the line shape (rest, narrow turn, the cry, the fall home), the 6 s lines, the lead with two companions and the answering group, then the two-note chant. The cry, traced with pyin: a leap straight up to the second above the octave (1375-1395), held, then a flick up to the third (about 1590) that falls onto the octave (1205), and a break straight down to the tonic; written now as 2' - (3')1', with press=0.8 for the pressed chest voice and scoop=80 (her notes are reached from below about 0.6 times a second, median 160 cents). Our lead alone against the record: the band profile now matches (500-1000 Hz −3.0 dB against −2.7, 1-2 kHz −6.3 against −6.0, 2-4 kHz −6.7 against −8.9), held notes shake ±10 cents against her ±11, the cry's 2'→1' fall and the octave are there. Her held tonics now carry the catch 5k (pyin shows our dips of about 40 cents every 0.45 s). Still differs: her small glottal flicks go up as well as down and come between notes too (about 1.7 quick pitch excursions a second against our 0.2), and the lines run in eighths at 80 where the women hold freely",
  text: `
. clock        80 4/4
. arrange@song пладне:2bars жетва:2bars дружки:6bars отглас:4bars пеперуда:6bars небе:2bars
. scale@zhetva 1 2:190 3:400 4:500 5:700 6:800 7:1000
. scale@oblak  1 2:185 3:300 4:500 5:700 6:900 7:1000
. key          zhetva E

. caption@c1   "Слънцето е на заода…" ?song.2-3
. caption@c2   "Облак се вие, / дай, Боже, дъжд!" ?song.5
. wind@suhota  level=0.12 gust=0.06Hz
. chant@zhetvarka voice=women voices=1 oct=4 grid=8 human=0.9 vib=0.01 press=0.8 bright=0.4 scoop=80 glide=0.1 breath=0.1 dyn="mf mf f f mf f f f" ipa="ɔj slɤn _ tsɛ _ _ tɔ ɛ _ na _ za _ _ ɔ _ _ da ɔj _ lɛ _ _ ɔj _ _ _ slɤn _ tsɛ _ tɔ ɛ _ na _ _ za _ ɔ _ da" "1k - - - 2 1 2 3 2 1 - 2' - (3')1' - 0 1 - - 2 3 2 1 4 3 2 1k - - - 0 0 2' - - (3')1' - 1 - 2 1 2 4 3 1 - 0 0 1 2 3 2 1 - 2' 1' 1 2 1 7, 1 2 1 1" ?song.2-3
. chant@druzhki voice=women voices=2 oct=4 grid=8 human=0.9 vol=0.6 vib=0.01 press=0.8 bright=0.4 scoop=80 glide=0.1 breath=0.12 ipa="na _ za _ _ ɔ _ _ da ɔj _ lɛ _ _ ɔj _ _ _ slɤn _ tsɛ _ tɔ ɛ _ na _ _ za _ ɔ _ da" "1 - - 2 3 2 1 4 3 2 1 - - - 0 0 2' - - (3')1' - 1 - 2 1 2 4 3 1 - 0 0 1 2 3 2 1 - 2' 1' 1 2 1 7, 1 2 1 1" ?song.3
. chant@otglas voice=women voices=3 oct=4 grid=8 human=0.9 vol=0.3 vib=0.01 press=0.8 bright=0.4 scoop=80 glide=0.1 breath=0.2 ipa="ɔj slɤn _ tsɛ _ _ tɔ ɛ _ na _ za _ _ ɔ _ _ da" "1 - - - 2 1 2 3 2 1 - 2' - (3')1' - 0 1 - - 2 3 2 1 4 3 2 1 - - - 0 0" ?song.4
. crowd@zheni  murmur "e la de mo ma ri ya ne ve ka ko le le na su ho" voices=5 voice=women vol=2 dyn="pp p mp mp" ?song.5
. chant@peperudki voice=boy voices=9 oct=4 grid=8 human=0.9 vib=0.01 breath=0.2 scale=oblak key=F dyn="pp p mp mf f f" ipa="ɔ blak sɛ vi ɛ daj _ bɔ ʒɛ dɤʃt ɔ blak sɛ vi ɛ daj _ bɔ ʒɛ dɤʃt daj bɔ ʒɛ dɤʃt daj bɔ ʒɛ dɤʃt" "1 2 1 2 1 - 2 1 2 2 1 - - - 0 0 1 2 1 2 1 - 2 1 2 2 1 - - - 0 0 2 - 2 1 1 - 2 - 2 1 1 - - - 0 0" ?song.5
. chant@vik    voice=women voices=1 oct=4 grid=8 human=0.9 vol=0.35 press=0.8 bright=0.6 scoop=80 glide=0.1 breath=0.15 ipa="ɔj _ lɛ _ _ ɔj _ _ _" "2' - - (3')1' - 1 - 2 1 2 4 3 1 - 0 0" ?song.6

*> space       field size=1.4 wet=0.2
>  speaker     0.5
`,
};
