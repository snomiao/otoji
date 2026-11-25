// The Ratana Sutta (Jewel Discourse) chanted against an epidemic: rebuilt from a Burmese monastic recitation (its six chanting pitches in cents, syllable rate and cadences measured), set as monks walking a village lane with the families repeating after them.
SCORES["burmese:plague"] = {
  about: "the Ratana Sutta in Pali, chanted by monks walking the village at night in a time of sickness; the families on their porches repeat each verse after them, water is sprinkled, and all answer 'thadu, thadu, thadu' to the kyi zi gong",
  heard: "a lane between wooden houses on stilts at night, crickets loud in the warm air; a few monks chant in unison as they walk, the women and men on the porches with lamps repeat the verse a little behind and not together, water drips from the sprinkling, a triangular kyi zi gong marks the ends",
  refs: [
    { title: "ရတနသုတ် Ratana Sutta (Myanmar recitation)", who: "Burmese monastic chant (Sarko Too)", url: "https://www.youtube.com/watch?v=5-JyKIm7h6w" },
    { title: "Ratana Sutta, Pali and Burmese", who: "Ashin Ariyadhamma", url: "https://www.youtube.com/watch?v=dzwYFmdosZM" },
  ],
  measured: "Burmese recitation of the Ratana Sutta (whole 8 min, mix): the reciting voice C3-A#3 (median 177 Hz) uses six pitches over a final about 20-25 cents above C# (written C#): 0, 190, 380, 530, 670, 870 cents, nearly even steps rather than Indian or Western intervals; verses fall to the final, the 530/670 pair carries the middle of each line; 2.6 syllables a second, no steady pulse (clarity 0.05), vibrato ~12 cents, 14% of notes glide. Ours: the same six pitches (the render gives 180, 370, 520, 660, 860 over C#, i.e. the measured steps but 20-25 cents low overall, since the key cannot take a cents offset), 2.5 syllables a second, the Pali in Burmese pronunciation (s as θ). Pitch motion: the recitation slides between its pitches much of the time (pyin: 53% of voiced time in a glide, over half the note changes slower than 80 ms), so the monks now join notes with glide=0.5 and a light scoop: ours gives 28% gliding and 54% slow joins (the same share as the record). Still different: our chant is still more metrical than the free recitation (pulse clarity 0.44 against 0.05) even with human=0.9, because notes fall on an eighth-note grid; the villagers' echo, the gong, crickets and water are the scene around it, not on the record.",
  text: `
. clock        77 4/4
. arrange@song nya:2bars thanga:8bars ywa:8bars thanga2:8bars thadu:2bars
. scale@ratana 1 2:190 3:380 4:530 5:670 6:870
. key          ratana C#

. caption@c1   "ယာနီဓ ဘူတာနိ သမာဂတာနိ ၊ ဘုမ္မာနိ ဝါ ယာနိဝ အန္တလိက္ခေ" ?song.2-4
. caption@c2   "သာဓု သာဓု သာဓု" ?song.5
. insects@nya  0.25 temp=27 count=4
. bell@kyi-zi  oct=3 grid=8 vol=0.9 "1 - - - - - - - - - - - - - - -" ?song.1
. chant@thanga rubato=0.6 voice=men voices=5 oct=3 grid=8 human=0.9 vib=0.022 breath=0.12 glide=0.5 scoop=50 dyn="mf" ipa="jaː ni da bu taː ni θa ma ga taː ni bun maː ni vaː jaː ni va an ta lei kʰe θa bei va bu taː θu ma naː ba van tu a tʰo pi θa kʰa sa θu nan tu baː θi taŋ" "5 5 4 3 5 2 3 2 1 1 2~1 - - - - 0 6 4 5 6 5 4 3 3 3 4~3 1 - - - - 0 1 2 5 6 6 5 4 3 3 1 1 - - - - 0 1' 5 5 3 4 5 4 4 3 1 2~1 1 - - - 0" ?song.2
. bell@kyi-zi2 oct=3 grid=8 vol=0.6 "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 -" ?song.2
. chant@ywa-thu voice=women voices=8 oct=3 grid=8 human=0.8 vib=0.012 breath=0.18 vol=0.8 dyn="mp" ipa="jaː ni da bu taː ni θa ma ga taː ni bun maː ni vaː jaː ni va an ta lei kʰe θa bei va bu taː θu ma naː ba van tu a tʰo pi θa kʰa sa θu nan tu baː θi taŋ" "5 5 4 3 5 2 3 2 1 1 2~1 - - - - 0 6 4 5 6 5 4 3 3 3 4~3 1 - - - - 0 1 2 5 6 6 5 4 3 3 1 1 - - - - 0 1' 5 5 3 4 5 4 4 3 1 2~1 1 - - - 0" ?song.3
. chant@ywa-tha voice=men voices=4 oct=3 grid=8 human=0.8 vib=0.012 breath=0.18 vol=0.6 dyn="mp" ipa="jaː ni da bu taː ni θa ma ga taː ni bun maː ni vaː jaː ni va an ta lei kʰe θa bei va bu taː θu ma naː ba van tu a tʰo pi θa kʰa sa θu nan tu baː θi taŋ" "5 5 4 3 5 2 3 2 1 1 2~1 - - - - 0 6 4 5 6 5 4 3 3 3 4~3 1 - - - - 0 1 2 5 6 6 5 4 3 3 1 1 - - - - 0 1' 5 5 3 4 5 4 4 3 1 2~1 1 - - - 0" ?song.3
. chant@thanga2 rubato=0.6 voice=men voices=5 oct=3 grid=8 human=0.9 vib=0.022 breath=0.12 glide=0.5 scoop=50 dyn="mf" ipa="jaː ni da bu taː ni θa ma ga taː ni bun maː ni vaː jaː ni va an ta lei kʰe θa bei va bu taː θu ma naː ba van tu a tʰo pi θa kʰa sa θu nan tu baː θi taŋ" "5 5 4 3 5 2 3 2 1 1 2~1 - - - - 0 6 4 5 6 5 4 3 3 3 4~3 1 - - - - 0 1 2 5 6 6 5 4 3 3 1 1 - - - - 0 1' 5 5 3 4 5 4 4 3 1 2~1 1 - - - 0" ?song.4
. chant@ywa-lait voice=women voices=10 oct=3 grid=8 human=0.9 vib=0.01 breath=0.2 vol=0.35 ipa="jaː ni da bu taː ni θa ma ga taː ni bun maː ni vaː jaː ni va an ta lei kʰe θa bei va bu taː θu ma naː ba van tu a tʰo pi θa kʰa sa θu nan tu baː θi taŋ" "5 5 4 3 5 2 3 2 1 1 2~1 - - - - 0 6 4 5 6 5 4 3 3 3 4~3 1 - - - - 0 1 2 5 6 6 5 4 3 3 1 1 - - - - 0 1' 5 5 3 4 5 4 4 3 1 2~1 1 - - - 0" ?song.4
. water@yay    0.1 lap=0.05 splash=0.25 ?song.3-4
. chant@thadu  voice=men voices=8 oct=3 grid=8 human=0.5 vib=0.01 breath=0.12 dyn="f mf" ipa="θaː du θaː du θaː du" "1 - 2 1 - - 1 - 2 1 - - 1 - 2 1" ?song.5
. chant@thadu-mi voice=women voices=8 oct=3 grid=8 human=0.6 vib=0.01 breath=0.15 vol=0.8 ipa="θaː du θaː du θaː du" "1 - 2 1 - - 1 - 2 1 - - 1 - 2 1" ?song.5
. bell@kyi-zi3 oct=3 grid=8 vol=0.9 "1 - - - - - 1 - - - - - 1 - - -" ?song.5

*> space       courtyard size=1.4
>  speaker     0.5
`,
};
