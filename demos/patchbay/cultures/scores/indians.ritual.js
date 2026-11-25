// The opening hymns of the Rig Veda (1.1.1-2, to Agni) recited at the fire altar on the three pitch accents: rebuilt from UNESCO's recording of the living Vedic chant (the three tones measured in cents, the syllable rate and the free time).
SCORES["indians:ritual"] = {
  about: "Agnim īḷe purohitam, the first verses of the Rig Veda, recited by the hotr priest beside the fire on the three accents (low anudātta, middle udātta, the svarita above); the other priests join, and the offering is poured with 'svāhā'",
  heard: "an open sacrificial shed in the early morning: the fire on its brick altar crackling, a little wind; the hotr recites alone, fast and even, the others join for the second verse, and as the ghee goes in the flames flare and all say svāhā",
  refs: [
    { title: "The Tradition of Vedic Chanting (Masterpiece of the Oral and Intangible Heritage)", who: "UNESCO", url: "https://www.youtube.com/watch?v=qPcasmn0cRU" },
  ],
  measured: "UNESCO film of Vedic recitation (mix): the reciter (median 176 Hz, D#3-F#3) uses three pitches about 0, 170 and 310-330 cents over a base just above D# (written E: the three come out near E, F and G), the middle tone carrying most syllables and the high one short; about 3.7 syllables a second with no metric pulse (clarity 0.04), almost no vibrato (~7 cents). Ours: the three accents in those cents mapped onto the accent pattern of RV 1.1.1-2 (anudātta 1, udātta 2, svarita 3, the unaccented run after a svarita on the middle tone), 3.7 syllables a second, rubato; the accent marks follow the usual Śākala reading only roughly, and our chant cannot do the svarita's quick rise-and-fall on one syllable except as a slide; the fire and the svāhā are the rite around it, not in the film's chant excerpts.",
  text: `
. clock        112 4/4
. arrange@song agni:2bars rc:8bars rc2:8bars svaha:2bars
. scale@svara  1 2:170 3:310
. key          svara E

. caption@c1   "अग्निमीळे पुरोहितं यज्ञस्य देवमृत्विजम् । होतारं रत्नधातमम् ॥ / अग्निः पूर्वेभिर्ऋषिभिरीड्यो नूतनैरुत । स देवाँ एह वक्षति ॥" ?song.2-3
. fire@vedi    0.18 crackle=0.45
. chant@hotr   voice=men oct=3 grid=8 rubato=0.4 human=0.5 vib=0.006 breath=0.1 bright=0.4 dyn="mf" ipa="a gnim iː ɭe pu roː ɦi tam jaɟ ɲas ja de vam rit vi dʒam hoː taː ram rat na dʰaː ta mam ag niɦ puːr ve bʰir ri ʂi bʰir iːɖ jo nuː ta nair u ta sa deː vaːn eː ɦa vak ʂa ti" "1 2 3 2 1 2 3 2 1 2 3 1 2 3 2 2 1 2 3 2 2 2 2 1 - - 0 0 0 0 0 0 1 2 3 2 2 1 2 3 2 3 1 2 3 2 2 1 2 3 2 1 2 2 1 - - 0 0 0 0 0 0 0" ?song.2-3
. chant@ritvij voice=men voices=3 oct=3 grid=8 rubato=0.4 human=0.6 vib=0.006 breath=0.12 vol=0.5 dyn="mp" ipa="a gnim iː ɭe pu roː ɦi tam jaɟ ɲas ja de vam rit vi dʒam hoː taː ram rat na dʰaː ta mam ag niɦ puːr ve bʰir ri ʂi bʰir iːɖ jo nuː ta nair u ta sa deː vaːn eː ɦa vak ʂa ti" "1 2 3 2 1 2 3 2 1 2 3 1 2 3 2 2 1 2 3 2 2 2 2 1 - - 0 0 0 0 0 0 1 2 3 2 2 1 2 3 2 3 1 2 3 2 2 1 2 3 2 1 2 2 1 - - 0 0 0 0 0 0 0" ?song.3
. chant@svaha  voice=men voices=5 oct=3 grid=8 human=0.4 vib=0.006 breath=0.12 dyn="f mf" ipa="oːm svaː ɦaː _ svaː ɦaː _ _" "2 - 1 3~2 - - - - 1 3~2 - - - - - -" ?song.4
. fire@ahuti   0.6 crackle=0.9 ?song.4
. wind@prabhata 0.06 gust=0.05Hz

*> space       pavilion size=1.2
>  speaker     0.5
`,
};
