// Rome burning, July 64 CE, and the rumour that Nero sang the Sack of Troy to the kithara. His song is lost; here a kitharode sings Homer's own lines on the fall of Troy (Odyssey 8.514–515, the song of Demodocus) in the reconstructed manner of Homeric singing: a reciting tone, rising on the accents, in the long and short syllables of the hexameter.
SCORES["romans:fire"] = {
  about: "the Great Fire of Rome: the roar of the burning city, crowds fleeing, roofs falling; on a high stage a singer in a kitharode's robe plays an anabole on the kithara and sings of Troy's fall in Greek hexameters",
  heard: "high above the city at night, the fire's roar coming up from the streets below with shouting and the crash of timber; the singer's voice and the kithara close and clear against it, in the open air",
  refs: [
    { title: "Ancient Phorminx — Homer's Odyssey sung", who: "Nikos Xanthoulis, reconstructed phorminx and voice", url: "https://www.youtube.com/watch?v=B35cNiud7No" },
    { title: "The Epitaph of Seikilos performed with an ancient Greek kithara", who: "Michael Levy, reconstructed kithara", url: "https://www.youtube.com/watch?v=LyhdXPVEafA" },
  ],
  measured: "Uncertain: Nero's Halosis Ilii is lost (Suetonius and Dio tell the story, Tacitus calls it a rumour); the sung lines are Homer's, not Nero's, and the way of singing follows modern reconstructions of Homeric performance, not evidence from Nero's stage. Measured in Xanthoulis' sung Odyssey: a reciting tone (C over a final A) most of the time, rising a step or a third on accented syllables (D, E), long syllables about three times the short ones (0.86 vs 0.3 s), ~5 c vibrato, 250–500 Hz, the phorminx struck between phrases. Ours: scale@kitharodic on A with C as the reciting tone, each syllable's length from the hexameter's quantities (long = two 8ths, short = one) at 100, rising to E on the accents; rendered, most used note C with D and E above, ~6 c vibrato, 250–500 Hz peak, as in the reference. Still differs: the kithara is the engine's harp string (no big wooden box's boom); the fire's roar is constant, without the bursts and wind of a real firestorm",
  text: `
. clock        100 4/4
. arrange@song fire:4bars anabole:4bars song:7bars song2:7bars
. scale@kitharodic 1 b3:290 4:500 5:700 b6:770 7:1190
. key          kitharodic A

. caption@homer "ἤειδεν δ' ὡς ἄστυ διέπραθον υἷες Ἀχαιῶν / ἱππόθεν ἐκχύμενοι, κοῖλον λόχον ἐκπρολιπόντες" ?song.3-4
. fire@rome    0.35 crackle=0.6
. wind@updraft 0.2 gust=0.1Hz
. crowd@fleeing shout "a-A o-E" "x---........x-x-................................x---............" voices=30 voice=mixed vol=1.3 dyn="mf mp p p" ?song.1-2
. drums@collapse kit=work vol=0.5 human=0.6 "................................|................................|X...............................x..............................." ?song.1-4
. pluck@kithara oct=3 grid=8 human=0.4 rubato=0.2 vol=1.4 "1 - 5 - 1' - - - 5 4 3 - 1 - - - 3 - 4 - 5 - 4 3 1 - - - 0 0 0 0" ?song.2
. pluck@kithara-strikes oct=3 grid=8 human=0.4 vol=1.2 "1+5 - - - - - - - 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0" ?song.3-4
. chant@kitharode voice=men oct=3 grid=8 human=0.4 rubato=0.25 vib=0.015 breath=0.12 bright=0.5 dyn="f" ipa="ɛː ei den dɔːs as ty di e pra tʰon hyi es a kʰai ɔːn hip po tʰen ek kʰy me noi koi lon lo kʰon ek pro li pon tes" "5 - 3 4 5 - 5 - 3 - 4 5 3 - 4 5 3 - 3 - 3 - 1 - 0 0 0 0 3 - 5 3 3 - 5 - 3 - 4 5 3 - 5 3 3 - 3 4 5 - 1 - 0 0 0 0" ?song.3-4

*> space       field size=1.6 wet=0.15
>  speaker     0.5
`,
};
