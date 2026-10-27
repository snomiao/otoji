// A jump-rope rhyme of the 1918 influenza, chanted by girls in an emptied street, after the voices and rhythm of children's game songs in the Library of Congress field recordings (Christine and Katherine Shipp, 1939). The rhyme's own tune is not recorded; it is chanted here on the playground's falling third.
SCORES["americans:plague"] = {
  about: "autumn 1918: schools are shut, and a few girls skip rope in the street chanting I had a little bird, its name was Enza; I opened the window, and in-flu-enza, the rope slapping the pavement; between rounds a church bell tolls for a funeral",
  heard: "a quiet city street of row houses in the open air, few people about, a horse cart passing; the girls close by, the rope hitting the ground on the beat, their feet hopping; far off a single church bell",
  refs: [
    { title: "Sea Lion Woman (1939)", who: "Christine and Katherine Shipp, girls' game song recorded in Byhalia, Mississippi by Herbert Halpert (Library of Congress)", url: "https://www.youtube.com/watch?v=XFwktuQt6DQ" },
  ],
  measured: "Sea Lion Woman (two girls, 1939): about 103 to the beat, quick syllables of 0.16–0.4 s, a narrow range G♯3–F4 sung around A♯3–D♯4, wide vibrato (~19 c) and much sliding between notes (glide ratio 0.37), 250 Hz–2 kHz. Ours: rendered 103.4 in two, the rhyme on a falling-third playground chant (sol, mi, la) set in the same register (A♯3–D♯4), the rope slapping on every beat; between rounds a funeral bell. Uncertain: the 1918 rhyme survives as words only; the chant tune is the common one for such rhymes, not documented for this one. The record's girls scoop into 30% of their attacks by more than 40 c and slide between notes in a median 46 ms (29% slower than 60 ms); with scoop=75 glide=0.2 ours measure 27–30% and 46–70 ms (28–55% slower than 60 ms, it varies with the rubato from take to take), where before they jumped from note to note. Still differs: the girls' voices are synthesized (boy voices, oct 3); no street sounds beyond a passing cart",
  text: `
. clock        104 4/4
. arrange@song street:2bars rope:8bars toll:3bars rope2:8bars
. key          major F#

. caption@rhyme "I had a little bird, its name was Enza; / I opened the window, and in-flu-enza." ?song.2
. wind@autumn  0.06 gust=0.05Hz
. drums@cart   kit=horses vol=0.25 "x.....x.x.....x.|................|................" ?song.1
. bell@church-bell oct=3 grid=4 human=0.2 vol=0.5 "1 - - - - - 1 - - - - -" ?song.3
. drums@rope   kit=flamenco vol=1.4 "................|x...x...x...x...|................" ?song.2
. drums@feet   kit=celtic vol=0.4 "..x...x...x...x.|................|................" ?song.2
. chant@girls scoop=75 glide=0.2 voice=boy voices=3 oct=3 grid=8 human=0.5 rubato=0.15 vib=0.05 breath=0.2 bright=0.4 ipa="aɪ hæd ə lɪ təl bɜɹd ɪts neɪm wəz ɛn zə aɪ oʊ pənd ðə wɪn doʊ ænd ɪn flu ɛn zə" "5 5 3 6 5 - 3 - 5 5 3 - 6 - 5 - 5 5 3 3 6 - 5 - 3 5 6 - 5 - 3 -" ?song.2
. drums@rope-2 kit=flamenco vol=1.4 "................|x...x...x...x...|................" ?song.4
. drums@feet-2 kit=celtic vol=0.4 "..x...x...x...x.|................|................" ?song.4
. chant@girls-2 scoop=75 glide=0.2 voice=boy voices=4 oct=3 grid=8 human=0.5 rubato=0.15 vib=0.05 breath=0.2 bright=0.4 ipa="aɪ hæd ə lɪ təl bɜɹd ɪts neɪm wəz ɛn zə aɪ oʊ pənd ðə wɪn doʊ ænd ɪn flu ɛn zə" "5 5 3 6 5 - 3 - 5 5 3 - 6 - 5 - 5 5 3 3 6 - 5 - 3 5 6 - 5 - 3 -" ?song.4

*> space       courtyard size=1.2 wet=0.15
>  speaker     0.5
`,
};
