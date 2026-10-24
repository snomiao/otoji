// Zari ზარი: rebuilt from a Svan village group's performance (National Folklore Fund of Georgia), its chord path,
// voicing and tuning measured with refs/analyse.py and a multi-pitch view of the recording.
SCORES["georgians:death"] = {
  about: "Zari ზარი, the Svan funeral chant: three groups of men move together in slow chords of fifth and octave, crying vai and ah over the dead",
  heard: "a mountain village in Svaneti: the men stand by the body and sing the zari as it is carried out, the slopes answering; the women sit close and keen the dead one's name between the chords",
  refs: [
    { title: "Zari", who: "folk group of Ipari, Upper Svaneti (National Folklore Fund of Georgia)", url: "https://www.youtube.com/watch?v=I79eCMWmSRI" },
    { title: "Zär, polyphonic group laments from Svaneti (field recordings 2016, with analysis)", who: "Frank Scherbaum, Nana Mzhavanadze et al.", url: "https://www.youtube.com/watch?v=FzICkmPylnM" },
  ],
  measured: "no beat at all (pulse clarity 0.04); three voices in block chords of root, fifth (about 690–710 cents) and octave, moving together and held 2 to 20 s each, about 25 chord changes in three minutes, the first chord held about 20 s; roots move by small steps on a near-equal Svan grid (above the final A: about 160, 310, 460, 630, 780, 950 and 1050–1150 cents, not 12-tone), wandering below the final and climbing to it for the last half minute; the voices sit A2–A4, almost no vibrato (≈5 cents), slow 160 ms onsets, a bright open tone (spectrum peak 500–1000 Hz). Our three lines keep that chord path and voicing exactly: the bass on the Svan grid, the middle a pure fifth above it (the same degrees from E), the top an octave above with a grace from the chord before (the glide of the voices). What differs: the real singers glide much more between chords and their timbre is harsher; the women's keening is our addition from the story. Our render: the same band profile up to 2 kHz (125–250 Hz −18 dB against −17, 500–1000 Hz peak), and with bright=0.8 (the singer's ring near 3 kHz) also 2–4 kHz (−11.5 dB against −10; brightness 1770 Hz against 1620); still the voices are smoother than the singers' hard edge",
  text: `
. clock        50 4/4
. arrange@song zari:34bars
. scale@zari   1 2:160 3:310 4:460 5:630 6:780 7:950

. caption@title "ზარი · Zari" ?song.1
. wind@mta     0.12 gust=0.05Hz
. chant@kvemo  zari A voice=men bright=0.8 voices=5 oct=2 grid=4 vol=0.8 human=0.4 vib=0.004 breath=0.15 dyn="mf f mf f f mf mp" ipa="vaj _ a _ o vaj a _ o _ vaj _ a o _ vaj _ a vaj o _ a vaj _ o vaj _" "7 - - - 7 - - - 7 - - - 7 - - - 7 - 6 - - - - 7 - - 5 - - 4 - - 6 - - 5 - - - - 6 - - - 6 - - - 6 - #7 - - - #7 - - - #7 - - - 5 - - 4 - - 6 - - - 7 - - - 7 - - - 7 - - - 5 - - #7 - - - - 4 - #7 - 5 - 7 6 - - - 7 - - - 1' - - - 1' - - - 1' - 6 - 3 - 2' - - 1' - - - 1' - - - 1' - 0 0" ?song.1
. chant@shua   zari E voice=men bright=0.8 voices=4 oct=3 grid=4 vol=0.7 human=0.4 vib=0.004 breath=0.15 dyn="mf f mf f f mf mp" ipa="vaj _ a _ o vaj a _ o _ vaj _ a o _ vaj _ a vaj o _ a vaj _ o vaj _" "7 - - - 7 - - - 7 - - - 7 - - - 7 - 6 - - - - 7 - - 5 - - 4 - - 6 - - 5 - - - - 6 - - - 6 - - - 6 - #7 - - - #7 - - - #7 - - - 5 - - 4 - - 6 - - - 7 - - - 7 - - - 7 - - - 5 - - #7 - - - - 4 - #7 - 5 - 7 6 - - - 7 - - - 1' - - - 1' - - - 1' - 6 - 3 - 2' - - 1' - - - 1' - - - 1' - 0 0" ?song.1
. chant@zemo   zari A voice=men bright=0.8 voices=3 oct=3 grid=4 human=0.5 vib=0.006 breath=0.12 vol=0.5 dyn="mf f mf f f mf mp" ipa="vaj _ a _ o vaj a _ o _ vaj _ a o _ vaj _ a vaj o _ a vaj _ o vaj _" "7 - - - 7 - - - 7 - - - 7 - - - 7 - (7)6 - - - - (6)7 - - (7)5 - - (5)4 - - (4)6 - - (6)5 - - - - (5)6 - - - 6 - - - 6 - (6)#7 - - - #7 - - - #7 - - - (#7)5 - - (5)4 - - (4)6 - - - (6)7 - - - 7 - - - 7 - - - (7)5 - - (5)#7 - - - - (#7)4 - (4)#7 - (#7)5 - (5)7 (7)6 - - - (6)7 - - - (7)1' - - - 1' - - - 1' - (1')6 - (6)3 - (3)2' - - (2')1' - - - 1' - - - 1' - 0 0" ?song.1
. chant@motkmili zari A voice=women oct=4 grid=8 human=0.8 vib=0.03 breath=0.25 vol=0.35 dyn="p mp p p mp p" ipa="va _ _ i _ va _ _ i _ _" "0 0 0 0 0 0 0 0 5' - (6')5' 4' - 3' - - 2' - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4' - (5')4' 3' 2' - 1' - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.1

*> eq          low=-1 mid=6 high=4
>  space       valley size=0.8 wet=0.25
>  speaker     0.5
`,
};
