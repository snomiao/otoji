// 九九歌: the Beijing counting rhyme for the nine nines of winter, chanted by children in a hutong courtyard.
// It has no fixed tune: the chant follows the Beijing tones of its words, as children's recitation does.
{
  // Tone to pitch, on G gong: 1st (high level) → 6, 2nd (rising) → 3 sliding up to 6, 3rd (low) → 2, or 1 at a line's end, 4th (falling) → 5 sliding down to 2.
  // One token an eighth, one syllable each, a line to a bar.
  const rhyme = [
    "6 2 5~2 2 5~2 6 1 -",   // 一九二九不出手
    "6 2 5~2 2 6 5~2 1 -",   // 三九四九冰上走
    "2 2 5~2 2 3~6 3~6 5~2 1",   // 五九六九沿河看柳
    "6 2 3~6 6 6 2 5~2 3~6",   // 七九河开 八九雁来
    "2 2 6 6 1 - 0 0",   // 九九加一九
    "6 3~6 5~2 5~2 1 - - -",   // 耕牛遍地走
  ].join(" ");
  const words = "i tɕiou ɤ tɕiou pu tʂʰu ʂou san tɕiou sɨ tɕiou piŋ ʂaŋ tsou u tɕiou liou tɕiou ian xɤ kʰan liou tɕʰi tɕiou xɤ kʰai pa tɕiou ian lai tɕiou tɕiou tɕia i tɕiou kəŋ niou pian ti tsou";
  SCORES["chinese:winter"] = {
    about: "The Nines Song (九九歌), the Beijing children's rhyme for counting the eighty-one days of winter from the solstice, chanted in a hutong courtyard while a hawker cries candied haws in the lane and pigeon whistles pass overhead",
    heard: "a Beijing courtyard house (四合院) in the third nine, the north wind over the roofs: two or three children chant the rhyme, then more join and shout it louder, laughing at the end; outside the gate an old man calls 冰糖葫芦 down the lane, and a flock of pigeons with whistles (鸽哨) on their tails circles the hutong",
    refs: [
      { title: "口述回忆：老北京叫卖原声 2 (street cries sung from memory)", who: "杨德山, a former Beijing street vendor", url: "https://www.youtube.com/watch?v=b1KxZbgCy68" },
    ],
    measured: "no recording of the rhyme as a song exists (it is spoken), so its melody here is built from the Beijing tones of the words, at about three syllables a second as children recite. The old vendor: a man's voice moving D3–D5 with ~12 cents of vibrato, calls that hold their last vowel and slide down, energy mostly 250 Hz–1 kHz (a speaking voice, 1.2 kHz centroid), a dry open lane. The cry of candied haws is written in that range and manner. Pigeon whistles are a soft high flute chord, the nearest the engine has. Render: eighths at ♩ = 92 (about three syllables a second; 1.7 onsets a second measured, with the held line ends), children's voices F#3–E5, energy 250–500 Hz like the vendor's; the synthetic children sound evener and less shouted than real children, and the tones' glides are plain straight slides where speech curves. Voice gestures: the hawker's cry now scoops into its notes, slides from note to note (glide=0.5) and is pressed like a street call (press=0.4, the vendor's harmonics stronger than his fundamental); the children glide lightly between syllables (glide=0.25) as tones do in speech; the hawker is still brighter than the old vendor (2.0 kHz with the wind against 1.2 kHz)",
    text: `
. clock        92 4/4
. arrange@song wind:2bars chant1:6bars lane:3bars chant2:6bars chant3:6bars laugh:1bars
. key          gong G

. caption@c1   "一九二九不出手，三九四九冰上走 / 五九六九，沿河看柳" ?song.2
. caption@c2   "冰糖葫芦——" ?song.3
. caption@c3   "七九河开，八九雁来 / 九九加一九，耕牛遍地走" ?song.4-5
. wind@beifeng    0.3 gust=0.07Hz
. flute@geshao    oct=6 grid=4 vol=0.3 dyn="0 p mp p 0 0 0 0 0 0 0 0 p mp p 0" "3+5 - - - - - - - 2+5 - - - - - - -" ?song.1-6
. chant@kids      rubato=0.2 voice=boy voices=3 oct=4 grid=8 human=0.5 glide=0.25 vib=0.01 breath=0.15 dyn="mf" ipa="${words}" "${rhyme}" ?song.2
. chant@hawker    rubato=0.5 voice=men oct=3 grid=4 human=0.4 vol=0.45 scoop=40 glide=0.5 press=0.4 vib=0.03 breath=0.12 dyn="mp p mp" ipa="piŋ tʰaŋ _ xu lu _ ei _ _ _ _ _" "5 - 6 5 3 - 2~1 - 1 - - -" ?song.3
. chant@kids2     voice=boy voices=7 oct=4 grid=8 human=0.6 glide=0.25 vib=0.01 breath=0.15 dyn="mf mf f f f f" ipa="${words}" "${rhyme}" ?song.4-5
. crowd@laugh     shout "ha ha HA ha" voice=women voices=6 pitch=1.5 vol=1.5 ?song.6

*> space       courtyard size=1.1
>  speaker     0.5
`,
  };
}
