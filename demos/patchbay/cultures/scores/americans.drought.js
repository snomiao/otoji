// Black Sunday, 14 April 1935: the dust storm and a ballad of it sung to the guitar, in the minor mode and two-beat of the songs the Dust Bowl migrants made, after the Todd–Sonkin field recordings (1940). Guthrie's own song is still in copyright and is not reproduced; the words here are new.
SCORES["americans:drought"] = {
  about: "the black blizzard: wind and dust roaring against the farmhouse, then a man sings a ballad of that day to his guitar in the Aeolian mode, boom-chick, like the songs sung in the migrant camps",
  heard: "inside a shut farmhouse on the plains at noon gone dark: the dust storm howling and hissing at the windows stuffed with wet rags, the family close together; the singer quiet and plain, the guitar beside him",
  refs: [
    { title: "Sunny Cal (Firebaugh FSA Camp, 17 August 1940)", who: "Jack Bryant, voice and guitar; recorded by Charles Todd and Robert Sonkin (Library of Congress, Voices from the Dust Bowl)", url: "https://www.youtube.com/watch?v=EmK6dAl3F0M" },
  ],
  measured: "Sunny Cal (a migrant's own song, Firebaugh camp 1940): 123 in two, boom-chick guitar, a man's plain voice A2–D4 with little vibrato (~6 c), in the minor mode on B (0, 320, 780, 1010 c: Aeolian), 125 Hz–4 kHz. Ours: rendered 123 in two, voice G♯2–F♯4, B Aeolian, guitar bass on 1 and 3 and chords between; the tune and words are new (the camp song and Guthrie's are not copied), sung inside the house as the dust storm roars. Still differs: the wind is a generic gale, not the hiss and rattle of grit on glass; the singer is formant-synthesized and steadier than the real voice",
  text: `
. clock        123 4/4
. arrange@song storm:4bars ballad:9bars ballad2:9bars
. scale@aeolian 1 2 b3 4 5 b6 b7
. key          aeolian B

. caption@words "The sky turned black at Sunday noon, / the wind come down the plain" ?song.2-3
. wind@dust    0.6 gust=0.2Hz
. wind@hiss    0.25 gust=0.5Hz
. crowd@family murmur "sa nau ma ma" voices=3 voice=mixed vol=0.5 dyn="p" ?song.1
. chant@singer voice=men oct=3 grid=8 human=0.5 rubato=0.15 vib=0.012 breath=0.15 bright=0.45 ipa="ðə skaɪ tɜɹnd blæk ət sʌn deɪ nuːn ðə wɪnd kʌm daʊn ðə pleɪn wi hʌŋ wɛt ɹæɡz ə kɹɔs ðə dɔɹ ænd pɹeɪd ə ɡɛn fɔɹ ɹeɪn" "0 0 0 0 0 0 5, - 1 - 1 - b3 - 4 - 5 - 4 - b3 - 1 - b7, - 1 - b3 - 1 - 5, - - - 0 0 5, - 1 - b3 - 4 - 5 - b7 - 5 - 4 - b3 - 4 - b3 - 1 - b7, - 1 - - - 0 0 0 0" ?song.2-3
. pluck@guitar-bass oct=3 grid=8 human=0.4 vol=0.9 "1 - 0 - 5, - 0 - 1 - 0 - 5, - 0 - 1 - 0 - 5, - 0 - b7,, - 0 - 4, - 0 - b7,, - 0 - 4, - 0 - 1 - 0 - 5, - 0 - b7,, - 0 - 4, - 0 - b7,, - 0 - 4, - 0 - 1 - 0 - 5, - 0 -" ?song.2-3
. pluck@guitar oct=4 grid=8 human=0.5 vol=0.9 "0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 b7,+2+4 0 1+b3+5 0 1+b3+5 0 1+b3+5 0 1+b3+5" ?song.2-3

*> space       room size=0.7 wet=0.15
>  speaker     0.5
`,
};
