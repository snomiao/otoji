// Tevaram, Sambandar's first hymn 'Thodudaiya seviyan' (7th century) as the oduvars sing it in pann Nattapadai: rebuilt from Dharmapuram P. Swaminathan's recording (tonic, scale and contour measured on the demucs voice stem).
SCORES["dravidians:ritual"] = {
  about: "Thodudaiya seviyan, the first hymn of the Tevaram, sung by an oduvar to the talam in the pann Nattapadai, between the conch that opens the rite and the bells of the arati",
  heard: "the stone mandapam of a great Chola temple before the sanctum at lamp time: the big bell and the conch, devotees murmuring, the oduvar singing alone over a soft drone with his small cymbals, the stone answering; at the arati the hand bell rings and everyone calls out",
  refs: [
    { title: "Thodudaiya Seviyan (Tevaram, Sambandar)", who: "Dharmapuram P. Swaminathan, oduvar", url: "https://www.youtube.com/watch?v=5ROYiIQ3gmc" },
    { title: "Thirusotruthurai Tevaram (Appar)", who: "Dharmapuram P. Swaminathan, oduvar", url: "https://www.youtube.com/watch?v=xinglLu7yRk" },
  ],
  measured: "Dharmapuram P. Swaminathan, Thodudaiya seviyan (voice stem): Sa about 35 cents under D (written D), and the hymn moves almost only on ga 385, Ma 475 and Pa 685 over Sa, touching the upper Sa: the pentatonic of pann Nattapadai (Gambhira Nattai), with ga and Ma only ~90 cents apart; the contour is ga Ma Pa, Pa Ma Pa Ma Pa, Ma ga, Sa Sa Sa, Ma Ma Ma Pa Ma Pa (long), and each line closes on a long Pa or Sa; voice C#3-C#4 (median 216 Hz), vibrato ~10 cents, about 2.8 syllables a second, the talam pulse near 136. Ours: the same scale and contour on Sambandar's four lines, 3.0 onsets a second, the render's scale comes back within 15 cents (ga 375, Ma 455, Pa 670) and its centroid is close (1.28 against 1.13 kHz). Still different: our drone and voice put more weight in 125-250 Hz where the record peaks at 500-1000; the kampitam (the slow shake on ga and Pa) is now shake=0.4 on the held notes, with a light glide and scoop (pyin on his stem against ours alone: held-note shake ±16 against ±18 cents, scoops 0.51 against 0.43 a second, gliding 27% against 16% of voiced time), and the long ga and Pa now carry the kampitam itself (5g, a slow wide swing; shake lowered to 0.2), which brings gliding to 33% of voiced time against his 27%; his swing is still more irregular than ours; the talam is the daf's jingles, not two small bronze cymbals; the conch, bells and crowd are the temple around him, not on the record.",
  text: `
. clock        68 4/4
. arrange@song sangu:2bars adi1:4bars adi2:4bars adi3:4bars adi4:4bars arati:2bars
. scale@nattapadai 1 3:385 4:475 5:685 7:1100
. key          nattapadai D

. caption@c1   "தோடுடைய செவியன் விடையேறியோர் தூவெண் மதிசூடிக்" ?song.2
. caption@c2   "காடுடைய சுடலைப் பொடிபூசியென் உள்ளங்கவர் கள்வன்" ?song.3
. caption@c3   "ஏடுடைய மலரான் முனைநாட்பணிந் தேத்த அருள்செய்த" ?song.4
. caption@c4   "பீடுடைய பிரமாபுரம் மேவிய பெம்மான் இவனன்றே" ?song.5
. crowd@adiyar murmur voices=10 voice=mixed vol=1.6 dyn="p pp" ?song.1-6
. brass@sangu  oct=3 grid=8 vol=0.8 dyn="mf f" "1~2 - - - - - - 0 1~2 - - - - - - 0" ?song.1
. organ@sruti  oct=3 grid=8 vol=0.12 "1+5 - - - - - - - - - - - - - - -" ?song.2-5
. chant@oduvar bright=0.5 voice=men oct=3 grid=8 human=0.6 vib=0.016 breath=0.12 shake=0.2 glide=0.15 scoop=60 dyn="mf mf f mf" ipa="toː ɖu ɖai ja se vi jan vi ɖai jeː ri joːr tuː veɳ ma di suː ɖik _ kaː ɖu ɖai ja _ su ɖa laip po ɖi puː si jen _ uɭ ɭaŋ ka var kaɭ _ van _ eː ɖu ɖai ja ma la raːn mu nai naːʈ pa ɳin teːt ta a ruɭ sej ta _ piː ɖu ɖai ja _ pi ra maː pu ram meː vi ja _ pem maːn i va nan reː _ _" "3g - - 4 5g - - - 5 4 5 - - 4 5 - 4 - 3 - 1 1 1 - 4 4 4 5 4 5 - - 1 3 4 5 - - - 5 4 5 4 4 - 3 - 1 - 3 3 4 5 5 1' 5 3 3 4 5g - - - - 3g - - 4 5g - - - 5 4 5 - - 4 5 - 4 - 3 - 1 1 1 - 4 4 4 5 4 5 - - 1 3 4 5 - - - 5 4 5 4 4 - 3 - 1 - 3 3 4 5 5 1' 5 3 3 4 5g - - - -" ?song.2-5
. drums@talam  kit=daf vol=1.7 "................|................|X...x...x...x..." ?song.2-5
. bell@ghanta  oct=5 grid=16 vol=0.5 "1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0" ?song.6
. brass@sangu2 oct=3 grid=8 vol=0.8 "1~2 - - - - - - - 1~2 - - - - - - 0" ?song.6
. crowd@hara   shout "HA-ra HA-ra" "x-x-x-x-........" voices=16 voice=mixed vol=1.2 ?song.6
. bell@periya-mani oct=3 grid=4 vol=0.7 "1 - - - 0 0 0 0" ?song.1

*> space       temple size=1.6
>  speaker     0.5
`,
};
