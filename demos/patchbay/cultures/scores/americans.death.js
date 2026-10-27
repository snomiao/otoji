// A New Orleans jazz funeral: a hymn dirge to the grave, then "When the Saints" for the second line, after Eureka Brass Band (1951) and Bunk Johnson's Brass Band (1945).
SCORES["americans:death"] = {
  about: "a jazz funeral: the brass band walks to the cemetery playing the hymn Nearer, My God, to Thee as a dirge, the snare rolls the body away, and the band and the second line come back dancing to When the Saints Go Marching In",
  heard: "out in a narrow New Orleans street between wooden houses: mourners walk slowly behind the band, murmuring; after the burial the bass drum kicks off, umbrellas go up, the second line claps on 2 and 4, sings the chorus with the horns and shouts",
  refs: [
    { title: "When the Saints Go Marching In (1945)", who: "Bunk Johnson's Brass Band, New Orleans, American Music label", url: "https://www.youtube.com/watch?v=I1qFMZQrGbs" },
    { title: "Just a Closer Walk with Thee (dirge, 1951)", who: "Eureka Brass Band, recorded in New Orleans by Folkways", url: "https://www.youtube.com/watch?v=aMnhdaWafIY" },
  ],
  measured: "Bunk's Saints: 117 beats a minute in two (bass drum on every beat, 8th-note snare), major, the band filling 250 Hz–4 kHz, only 5 dB of dynamics (a street band never lets up); the 78 transfer sits a quarter-tone sharp of A♭, so A♭. Eureka's dirge: no pulse the tracker can lock to, so the bass drum's slow four at about 58 is used; long swelling notes (0.5–2.5 s, ~6 cents vibrato), 22 dB of dynamics, nothing above 4 kHz. Our render: Saints at 117.5 in two, 4.7 dB range, spectrum peaking 500 Hz–1 kHz; the dirge in a slow four with an 8 dB swell. With the lip-buzz brass (the hot chorus ff, the Saints at f; each bell from its name: cornet and trumpets trumpet, alto and peck horns horn, trombone, tuba and sousaphone tuba) the eq lift is down from +7 to +4 and the 2–4 kHz band sits 3 dB under our 0.5–2 kHz peak (13 dB before); centroid 2.6–2.7 kHz against the 78's 2.57 kHz, whose loudest band is 2–4 kHz (with its hiss). Still differs: our 125–500 Hz is 4–7 dB thinner than the 78's bass drum and tuba, and there is no growl, rip or shake on the trumpet. The hymn is Nearer, My God, to Thee (Bethany, Lowell Mason 1856), a dirge the bands also play, since Closer Walk's printed arrangement is newer",
  text: `
. clock        58 4/4
. arrange@song dirge:12bars@58 roll:4bars@117 saints:16bars sing:16bars hot:16bars
. key          major Ab

. caption@hymn   "Nearer, my God, to Thee, nearer to Thee" ?song.1
. caption@chorus "Oh when the saints go marching in" ?song.4

. crowd@mourners murmur "o lor yes lor ha mer si um hum" voices=10 voice=mixed vol=1.3 pitch=0.9 dyn="mp p mp" ?song.1
. brass@cornet  key=Eb oct=4 vol=1.4 grid=8 human=0.5 dyn="p mf f mp p mf ff p mp f mf pp" "3 - - 2 1 - - 1 6, - - - 5, - - - 5, - - 1 3 - - - 2 - - - - - - - 3 - - 2 1 - - 1 6, - - - 5, - - - 5, - - 1 2 - - - 1 - - - - - - - 3 - - 2 1 - - 1 6, - - - 5, - - - 5, - - 1 2 - - - 1 - - - - - - - 0 - - - - - - - 0 - - - - - - - 0 - - - - - - - 0 - - - - - - -" ?song.1
. reed@clarinet key=Eb oct=5 grid=8 human=0.4 vol=0.45 dyn="p" "5 - - - 6 - 5 - 6 - - - 5 - - - 5 - - - 6 - 5 - 5 - - - 4 - - - 5 - - - 6 - 5 - 6 - - - 5 - - - 5 - 6 - 5 - 4 - 3 - - - - - - - 5 - - - 6 - 5 - 6 - - - 5 - - - 5 - 6 - 5 - 4 - 3 - - - - - - - 0 - - - - - - - 0 - - - - - - - 0 - - - - - - - 0 - - - - - - -" ?song.1
. brass@alto-horns key=Eb oct=3 grid=4 human=0.4 vol=0.55 dyn="p mp mf mp p mp mf p" "1+3+5 - - - 1+4+6 - 1+3+5 - 1+3+5 - - - 7,+2+5 - - - 1+3+5 - - - 1+4+6 - 1+3+5 - 1+3+5 - 7,+2+4 - 1+3+5 - - - 1+3+5 - - - 1+4+6 - 1+3+5 - 1+3+5 - 7,+2+4 - 1+3+5 - - - 0 - - - 0 - - - 0 - - - 0 - - -" ?song.1
. brass@tuba    key=Eb oct=2 grid=4 human=0.3 vol=0.4 "1 - 5, - 4, - 1 - 1 - 5, - 5, - 2 - 1 - 5, - 4, - 1 - 1 - 5, - 1 - 5, - 1 - 5, - 4, - 1 - 1 - 5, - 1 - 5, - 0 - - - 0 - - - 0 - - - 0 - - -" ?song.1
. drums@dirge-drums kit=orch vol=0.3 human=0.3 "X.......X.......|....x.x.....x.x.|................" ?song.1
. drums@roll    kit=orch vol=0.7 "x...............................................X...X...X.X.X...|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx....X...X.X.X.X.|................................................................" ?song.2
. crowd@cheer   shout "o-YE" "........................................................x---...." voices=16 voice=mixed vol=0.6 ?song.2
. brass@trumpet oct=4 grid=4 human=0.5 vol=1.5 dyn="f" "0 1 3 4 5 - - - 0 1 3 4 5 - - - 0 1 3 4 5 - 3 - 1 - 3 - 2 - - - 0 3 3 2 1 - - 1 3 5 - 5 4 4 3 4 5 - 3 - 1 - 2 - 1 - - - - - - -" ?song.3-4
. brass@trumpet-hot oct=4 grid=8 human=0.6 vol=1.5 dyn="ff" "0 - 1 - 3 - 4 - 5' - - 4' 5' - 6' 5' 0 - 1 - 3 - 4 - 5 - 6 5 1' - - - 0 - 1 - 3 - 4 - 5 - - - 3 - 1' - 1 - - 2 3 - 5 - 2 - - - (3)2 - 1 - 0 - 3 - 3 - 2 - 1 - - - 5 - 1' - 3 - 5 - - - 5 - 4 - 4 - 3 - 4 - 5' - - - 3' - - - 1' - - - 2' - - - 1' - - - - - - - 5 - 6 - 1' - 3' -" ?song.5
. reed@clarinet-obbligato oct=4 grid=8 human=0.6 vol=0.4 dyn="mf" "1' - 3' 5' - 3' 1' 5 6 1' 3' - 2' 1' 6 5 5 - 1' 3' 5' 3' 2' 1' 1' - 3' 5' - 3' 1' 5 6 1' 3' - 2' 1' 6 5 5 - 1' 3' 5' 3' 2' 1' 1' - 3' 5' - 3' 1' 5 7 2' 5' - 4' 2' 7 5 5 - 1' 3' 5' 3' 2' 1' b7 1' 3' 5' b7' - 5' 3' 6 1' 3' - 2' 1' 6 5 6 1' 4' - 6' 4' 1' 6 1' - 3' 5' - 3' 1' 5 7 2' 5' - 4' 2' 7 5 5 - 1' 3' 5' 3' 2' 1' 1' - 3' 5' - 3' 1' 5" ?song.3-5
. brass@trombone oct=3 grid=8 human=0.6 vol=0.75 dyn="mf" "1 - - - 5,~1 - - - 3 - 2 - 1 - 5, - 1 - - - 5,~1 - - - 3 - 2 - 1 - 5, - 1 - - - 5,~1 - - - 3 - 2 - 1 - 5, - 1 - - - 5,~1 - - - 5, - - 2 - - 5,~7, - 1 - - - 5,~1 - - - b7, - - 1 3 - 5, - 1 - - - 5,~1 - - - 4, - - 6, 1 - 4,~6, - 1 - - - 5,~1 - - - 5, - - 2 - - 5,~7, - 1 - - - 5,~1 - - - 3 - 2 - 1 - 5, -" ?song.3-5
. brass@peck-horns oct=4 grid=4 human=0.5 vol=0.4 "0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5 0 7,+2+5 0 7,+2+5 0 1+3+5 0 1+3+5 0 b7,+3+5 0 b7,+3+5 0 1+3+5 0 1+3+5 0 1+4+6 0 1+4+6 0 1+3+5 0 1+3+5 0 7,+2+5 0 7,+2+5 0 1+3+5 0 1+3+5 0 1+3+5 0 1+3+5" ?song.3-5
. brass@sousaphone oct=2 grid=4 human=0.4 vol=0.4 "1 - 5, - 1 - 3 - 1 - 5, - 1 - 3 - 1 - 5, - 1 - 3 - 1 - 5, - 5, - 7, - 1 - 5, - 1 - b7, - 1 - 5, - 4, - 6, - 1 - 5, - 5, - 7, - 1 - 5, - 1 - 3 -" ?song.3-5
. drums@street-beat kit=orch vol=0.35 human=0.4 "X.....x.X.......|..x.x..xx.x.x.xx|....x.......x..." ?song.3-5
. drums@clapping kit=flamenco vol=0.5 human=0.6 "................|................|....x.......x..." ?song.4-5
. chant@second-line voice=women voices=8 oct=4 grid=4 human=0.6 vol=0.7 vib=0.02 breath=0.15 ipa="oʊ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn oʊ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn oʊ lɔɹd aɪ wɑnt tə bi ɪn ðæt nʌm bəɹ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn" "0 1 3 4 5 - - - 0 1 3 4 5 - - - 0 1 3 4 5 - 3 - 1 - 3 - 2 - - - 0 3 3 2 1 - - 1 3 5 - 5 4 4 3 4 5 - 3 - 1 - 2 - 1 - - - - - - -" ?song.4-5
. chant@second-line-men voice=men voices=6 oct=3 grid=4 human=0.6 vol=0.6 breath=0.15 ipa="oʊ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn oʊ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn oʊ lɔɹd aɪ wɑnt tə bi ɪn ðæt nʌm bəɹ wɛn ðə seɪnts goʊ mɑɹ tʃɪŋ ɪn" "0 1 3 4 5 - - - 0 1 3 4 5 - - - 0 1 3 4 5 - 3 - 1 - 3 - 2 - - - 0 3 3 2 1 - - 1 3 5 - 5 4 4 3 4 5 - 3 - 1 - 2 - 1 - - - - - - -" ?song.4-5
. crowd@street  murmur "hei ya ye go on nau bei bi" voices=14 voice=mixed vol=0.45 ?song.3-5
. crowd@shouts  shout "YE o-YE" "x-..............................................x---............" voices=14 voice=mixed vol=1.2 ?song.5

*> space       courtyard size=1.6 wet=0.25
>  eq          low=0 mid=0 high=4
>  speaker     0.5
`,
};
