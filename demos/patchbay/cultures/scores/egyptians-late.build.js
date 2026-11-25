// Building the Khedivial Opera House in Cairo (1869): carpenters and plasterers working by lamplight to a hauling call, and then the hall's first music, the Grand March from Verdi's Aida (1871), as an Italian band of the time played it (Vessella's Italian Band, Victor 1912).
SCORES["egyptians-late:build"] = {
  about: "the opera house goes up in six months: hammers, chisels and hauling to the workers' call hela, hela, then in the finished hall the Grand March from Aida, the trumpets' tune on the dominant over a band in two",
  heard: "first the building site at night, open to the sky, lamps on the scaffolding, men calling as they haul beams and the knock of many hammers; then inside the new wooden hall with its gilded tiers, a band playing the march, full and resonant",
  refs: [
    { title: "Verdi: Aida, Grand March (Victor 35265, 1912)", who: "Vessella's Italian Band, 78 rpm", url: "https://www.youtube.com/watch?v=CSdQnkpPOJo" },
  ],
  measured: "Vessella's band (1912): 123 in two, bass drum and cymbal on the beats, the melody in the brass resting on E♭ (the 78 runs about 20 c flat; Verdi's march sits in A♭ with the trumpets' tune in B; the band plays it in its own key), the tune holding the dominant in long repeated notes before climbing through the supertonic to the upper fifth and sixth (5 … 2' 1' … 5' 6' 5' 4'), 500 Hz–1 kHz, a steady loud band (dynamics 25 dB over the whole side, mostly f). Ours: the trumpet line rebuilt from that note sequence and its durations at 123, clarinets doubling an octave up, horns on the off-beats, tuba, drums; rendered 123 in two, resting on E♭, trumpets measured on 0/200/700/900 c. Still differs: the harmony under the tune is simplified to I–V, not Verdi's; the synth brass is smoother than the band's; the building site's work call (hela, hela) and hammers are scene sound, not from a recording Revision: the brass now take their forte from dyn= (the bite grows with it): trumpets f, rising to ff for the climb to the upper fifth and sixth (bars 14–17), horns mf on the off-beats (round), tuba f. Render: in the ff bars the 2–4 kHz band becomes the strongest (brightness ~3.4 kHz against ~2.9 kHz at f); the 78's own top is cut off by the medium, so the record cannot show how brassy the band was, and the crescendo at the climb is our reading of the score, not measured.",
  text: `
. clock        123 4/4
. arrange@song building:8bars march:19bars
. key          major D#

. caption@aida "Aida · Marcia trionfale" ?song.2
. crowd@haulers chant "HE-la HE-la he-LA" "x-x-x---x-x-x---" voices=12 voice=men vol=0.9 ?song.1
. drums@site   kit=work vol=0.7 human=0.6 "x..x....x.x.....|....x.......x...|X...............X..............." ?song.1
. crowd@workers murmur "ja al la ya ha bi bi ja rab" voices=10 voice=men vol=0.6 dyn="mp" ?song.1
. brass@trumpets oct=4 grid=8 human=0.3 vol=1.1 dyn="f f f f f f f f f f f f f ff ff ff ff f f" "5 - 5 - - - - - - 5 - - - 5 - - 5 - - - - - 5 - - - - - - 5 - - 5 - - 5 - - 5 - - - - - - - - - - - - - - 2' 2' 5 - - - - - - - - - 5 2' 5 - - - - - 5 - - - - 1' - - - - - 2' 2' - - - - - - 2' 1' - - 1' - - 2' 2' 2' 5, - 2' 2' - 2' 5' - - - 5' - - - 6' - - 6' - - 5' - - 5' - - - 4' - 4 4 - 1 1 4 - - 4 - 4 - - 2' 1' - 1' - - 5 -" ?song.2
. reed@clarinets oct=5 grid=8 human=0.4 vol=0.22 "5 - 5 - - - - - - 5 - - - 5 - - 5 - - - - - 5 - - - - - - 5 - - 5 - - 5 - - 5 - - - - - - - - - - - - - - 2' 2' 5 - - - - - - - - - 5 2' 5 - - - - - 5 - - - - 1' - - - - - 2' 2' - - - - - - 2' 1' - - 1' - - 2' 2' 2' 5, - 2' 2' - 2' 5' - - - 5' - - - 6' - - 6' - - 5' - - 5' - - - 4' - 4 4 - 1 1 4 - - 4 - 4 - - 2' 1' - 1' - - 5 -" ?song.2
. brass@horns oct=3 grid=4 human=0.3 vol=0.55 dyn="mf" "0 1+3+5 0 1+3+5 0 7,+2+5 0 1+3+5" ?song.2
. brass@tuba   oct=2 grid=4 human=0.3 vol=0.35 dyn="f" "1 5, 1 5, 5, 2 1 5," ?song.2
. drums@band-drums kit=orch vol=0.25 human=0.3 "X.......X.......|....x.......x...|X.......X......." ?song.2

*> space       hall size=1.1 wet=0.28
>  speaker     0.5
`,
};
