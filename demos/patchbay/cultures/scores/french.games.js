// Frère Jacques sung as a round by children beside a jeu de paume court: rebuilt from the a cappella canon of
// Renée Caron and the Petits Chanteurs de l'Île-de-France (key, tempo and the children's register measured with refs/analyse.py).
{
  const tune = "1 - 2 - 3 - 1 - 1 - 2 - 3 - 1 - 3 - 4 - 5 - - - 3 - 4 - 5 - - - 5 6 5 4 3 - 1 - 5 6 5 4 3 - 1 - 1 - 5, - 1 - - - 1 - 5, - 1 - - -";
  const words = "fʁɛ ʁə ʒa kə fʁɛ ʁə ʒa kə dɔʁ me vu dɔʁ me vu sɔ ne le ma ti nə sɔ ne le ma ti nə diŋ dɑŋ dɔŋ diŋ dɑŋ dɔŋ";
  // four groups enter two bars apart and each sings the round three times, then they drop out in turn
  const sections = Array.from({ length: 15 }, (_, i) => `r${i + 1}:2bars`).join(" ");
  SCORES["french:games"] = {
    about: "Frère Jacques, the French round about the friar who sleeps through the matins bell, sung in canon by children in four groups while a game of paume goes on",
    heard: "a paved Paris courtyard beside a jeu de paume court, tall walls throwing the sound back: the leather ball cracks off the racket and thumps the wall, spectators chat in the gallery; a ring of children sings the round, each group coming in two bars after the last, their four lines interlocking until the last group sings 'ding, dang, dong' alone and everyone laughs",
    refs: [
      { title: "Frère Jacques (en canon, a cappella)", who: "Renée Caron et les Petits Chanteurs de l'Île-de-France", url: "https://www.youtube.com/watch?v=D89QpVXTQOI" },
    ],
    measured: "Caron record: children's unison voices with an adult lead, tonic F, about 86 crotchets a minute, the canon's entries every two bars, range up to A5, plain straight tone (no vibrato measured), energy 250–2000 Hz with the children's brightness (1.6 kHz), a resonant room. Ours: key F at 86, four groups of child voices two bars apart, each three times through, then a laugh; the courtyard's slap echo; the paume rally under it. Differs: the record has no game around it; the round is first printed about 1780, so it is later than the court of Louis X in the story, though the game lasted into the 1700s and beyond. Render check: tempo 86, brightness 1.6 kHz as the record, bands 1–2 kHz −6 and 2–4 kHz −15 dB (record −2, −6): the synthetic child voices are still duller in the upper presence; our low band is thinner (no adult lead voice)",
    text: `
. clock        86 4/4
. arrange@song ${sections} laugh:2bars
. key          major F

. caption@w1   "Frère Jacques, Frère Jacques, / Dormez-vous ? Dormez-vous ?" ?song.1-2
. caption@w2   "Sonnez les matines, sonnez les matines, / Ding, dang, dong. Ding, dang, dong." ?song.3-4
. drums@paume  kit=flamenco vol=0.5 "......x.........|x...............|................" ?song.1-16
. drums@rally  kit=flamenco vol=0.35 "..........x.....|.....x..........|................" ?song.1-16
. crowd@gallery murmur "a-LE vi-te bo KOU pa-RI la PAU-me" voices=12 vol=1.2 dyn="mp p" ?song.1-16
. chant@enfants1 voice=boy voices=5 oct=4 grid=8 human=0.5 vib=0.004 breath=0.12 dyn="mf" ipa="${words}" "${tune}" ?song.1-12
. chant@enfants2 voice=boy voices=5 oct=4 grid=8 human=0.5 vib=0.004 breath=0.12 dyn="mf" ipa="${words}" "${tune}" ?song.2-13
. chant@enfants3 voice=boy voices=5 oct=4 grid=8 human=0.5 vib=0.004 breath=0.12 dyn="mf" ipa="${words}" "${tune}" ?song.3-14
. chant@enfants4 voice=boy voices=5 oct=4 grid=8 human=0.5 vib=0.004 breath=0.12 dyn="mf" ipa="${words}" "${tune}" ?song.4-15
enfants1,enfants2,enfants3,enfants4> eq@bright mid=5 high=1
. crowd@rire   shout "a-ha-ha-ha" "x-x-x-x-........" voices=16 voice=women pitch=1.4 vol=2 dyn="f mf" ?song.16

*> space       courtyard size=1.2 wet=0.28
>  speaker     0.5
`,
  };
}
