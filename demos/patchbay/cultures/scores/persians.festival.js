// Chaharshanbe Suri, the fire night before Nowruz: the crowd's fire-jumping rhyme, and a Haji Firuz street singer with his
// dayereh passing down the alley, after a street performance in Shiraz's Vakil bazaar (pulse, the frame drum's groove,
// the voice's mode, vibrato and slides measured with refs/analyse.py on demucs stems).
SCORES["persians:festival"] = {
  about: "the last Wednesday night before Nowruz: bonfires in the alley, people jumping them chanting 'my yellow to you, your red to me', and Haji Firuz in his red clothes singing the herald's song of the new year to his dayereh",
  heard: "a lane in an old quarter after dark: small fires of brushwood in a row, families laughing and jumping over them with the rhyme, firecrackers somewhere far off, children banging spoons; then the Haji Firuz singer comes through with his tambourine and everybody claps",
  refs: [{ title: "Haji Firuz (street performance, Shiraz)", who: "a Haji Firuz street singer with dayereh", url: "https://www.youtube.com/watch?v=uMHgxcjXtco" }],
  measured: "the street recording: a pulse of 0.50 s (120 a minute) in 2/4 with the dayereh's dum on 1 and 2 and its jingles between (low groove X . x X X x x x); the singer's voice low (F3–D4), tonic C a little flat, the tune inside the tetrachord above the tonic with the 7th below, a minor 3rd (300) and a 2nd near 205 cents, wide vibrato (≈19 cents) and one note in four slid, a rough open-air spectrum (brightness 2400–2700 Hz with the street's noise). The tune is the traditional Haji Firuz song in that style; the rhyme is chanted, not sung, as the story says; the fires, crowd and firecrackers are the night around it. Our render: the 0.50 s pulse in twos, tonic C with the 2nd at 220 and minor 3rd at 330 cents, brightness 2340 Hz (the street's 2440–2680); our vibrato is narrower (8 against 19 cents) and the drum and the fire put more below 125 Hz than the street recording has; the chant of the rhyme is a synthesized crowd",
  text: `
. clock        120 2/4
. arrange@song atash:4bars haji:20bars
. scale@shur   1 2:205 3:300 4:500 5:700 6:880 7:1020
. key          shur C tune=-40

. caption@l1   "زردی من از تو، سرخی تو از من" ?song.1
. caption@l2   "حاجی فیروزه، سالی یه روزه" ?song.2
. fire@kuche   0.2 crackle=0.6
. crowd@mardom chant "ZAR-di-ye man az TO SORKH-i-ye to az MAN" pattern="x-x-x-x-x-x---..x-x-x-x-x-x-----" voices=16 voice=mixed vol=1.8 dyn="f mf" ?song.1-2
. crowd@khande murmur "ha ha ja so ne ka ri ba ma" voices=14 voice=mixed vol=0.6 dyn="mp" ?song.1-2
. drums@tarqe  kit=guns vol=0.15 "........................................x.......................|................................................................|................................................................" ?song.1-2
. chant@haji   voice=men oct=4 grid=16 human=0.6 rubato=0.15 bright=0.6 vib=0.045 breath=0.15 dyn="f f mf f" ipa="ħaː dʒi fi ruː ze saː li je ruː ze ha me mi du nan man am mi du nam ʔej de now ruː ze saː li je ruː ze ʔar baːb e xo dam sa lam ʔa lej kom ʔar baːb e xo dam sar to bo lan kon" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 2 2 3 - 2 - 1 - 2 2 1 - - - 3 3 4 4 5 - 4 - 3 - 2 2 3 - - - 1 1 2 2 3 - 2 - 1 - 2 2 1 - - - 4 4 3 3 2 - 1 - 7, - 1 2 1 - - - 4 4 3 3 2 - 1 - 7, - 1 7, 1 - - - 1 1 2 2 3 - 2 - 1 - 2 2 1 - - - 3 3 4 4 5 - 4 - 3 - 2 2 3 - - - 1 1 2 2 3 - 2 - 1 - 2 2 1 - - - 4 4 3 3 2 - 1 - 7, - 1 2 1 - - - 4 4 3 3 2 - 1 - 7, - 1 7, 1 - - -" ?song.1-2
. drums@dayere kit=daf vol=0.5 human=0.4 "X..xX.x.|..x...x.|x.xxx.xx" ?song.2

*> space       courtyard size=1.3 wet=0.2
>  speaker     0.5
`,
};
