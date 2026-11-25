// Ganggangsullae (강강술래) on Chuseok night: the women of a south-coast village dance in a ring under the full moon, one sings a line and all answer.
SCORES["koreans:festival"] = {
  about: "Ganggangsullae, the women's moonlit circle dance of the southwest coast: a lead singer calls 'dal tteo-onda' (the moon is rising) and the whole ring answers 'ganggang sullae', first at a walking pace, then faster and faster (jajin ganggangsullae)",
  heard: "the night of the harvest full moon on open ground by the sea in Haenam: dozens of women in a ring holding hands, their feet on the earth, the lead singer in the ring giving each line; children and men watch and chatter at the edge, crickets in the fields, the sea faint below; no instruments, only voices that get louder and quicker as the ring speeds up",
  refs: [
    { title: "Haenam Usuyeong ganggangsullae: jajin ganggangsullae (field recording, 1974)", who: "women of Usuyeong, Haenam, recorded by Kim Yong-eun", url: "https://www.youtube.com/watch?v=amrsoxj9saI" },
    { title: "Haenam Usuyeong ganggangsullae: jung ganggangsullae (field recording, 1974)", who: "women of Usuyeong, Haenam, recorded by Kim Yong-eun", url: "https://www.youtube.com/watch?v=op6C9rTIIC8" },
  ],
  measured: "the 1974 village recordings: women's voices in unison around F#4 within a fourth (E4–A4), the tonic F# shaken with a very wide vibrato (~15 cents average, far more on the held notes), the minor third above (+320 c) and a narrow step (+110 c) on the way back down: the answer 'ganggang sullae' is heard as F# A G F#, the Namdo (yukjabaegi-tori) cadence; 1 in 7 notes slides; the jung (middle) version at about 2 beats ~65 a minute in 12/8, the jajin version at about 100, 3.2–3.3 onsets a second; bright open-air voices (2.2–2.3 kHz), a field recording's noise floor. Ours: scale 1 2(110) 3(320) 4 5 on F#, 12/8, the traditional call lines (달 떠온다 …) and the refrain on F# A G F# with a trembling held tonic (r), a ring of 14 women answering one lead, a section in the middle tempo then the fast one; feet, onlookers, crickets and the sea around them. Rendered and measured (the fast section): tonic F#, range F4–B4 against E4–A4, vibrato 16 cents against 15, 103 a minute against 99, 3.8 onsets a second against 3.2, brightness 1.8 kHz against 2.3 kHz. Voice gestures (pyin): the women slide between notes (median 0.30 s), press their chest voices (H1 6 dB under H2) and shake the held tonic; ours now glides (glide=0.6/0.5: transit 0.11→0.36 s), is pressed (press=0.8/0.7: H1−H2 +9.6→+4.2 dB, still not as pressed as theirs at −6) and widens the held notes (shake=0.4 with a narrower base vibrato). Still differs: the village women's chest voices are rougher still and not quite together (a real unison of dozens spreads in pitch and time more than our ring of 12), and the lead singer improvises new lines each round where ours repeats four",
  text: `
. clock        66 12/8
. arrange@song jung:8bars jung2:8bars jajin:8bars@~100 jajin2:8bars
. scale@yukjabaegi 1 2:110 3:320 4 5
. key          yukjabaegi F#

. caption@c1   "달 떠온다 달 떠온다 (강강술래) / 동해동천 달 떠온다 (강강술래)" ?song.1-4
. chant@meginun voice=women oct=4 grid=8 human=0.6 scoop=60 glide=0.6 shake=0.4 press=0.8 vib=0.035 bright=0.6 breath=0.15 dyn="mf mf mf mf f f f f" ipa="tal tʌ on da tal tʌ on da toŋ he toŋ tɕʰʌn tal tʌ on da tɕʌ da ɾi nwi da ɾin ɡa paŋ ho paŋ ne da ɾi ɾo se" "3 3 1 1 - - 3 3 1 1 - - 0 - - - - - - - - - - - 4 4 3 3 - - 3 3 1 1 - - 0 - - - - - - - - - - - 3 - 3 4 - - 3 3 2 1 - - 0 - - - - - - - - - - - 4 4 3 3 - - 3 3 1 1 - - 0 - - - - - - - - - - -" ?song.1-4
. chant@badnun voice=women voices=12 oct=4 grid=8 human=0.9 glide=0.5 shake=0.4 press=0.7 vib=0.035 bright=0.5 breath=0.25 dyn="mf mf mf f f f f ff" ipa="kaŋ kaŋ sul le kaŋ kaŋ sul le kaŋ kaŋ sul le kaŋ kaŋ sul le" "0 - - - - - - - - - - - 1 - 3 2 - 1r - - - - - - 0 - - - - - - - - - - - 1 - 3 2 - 1r - - - - - - 0 - - - - - - - - - - - 1 - 3 2 - 1r - - - - - - 0 - - - - - - - - - - - 1 - 3 2 - 1r - - - - - -" ?song.1-4
. drums@bal    kit=taiko vol=0.15 "x.....x.....x.....x.....|........................|........................" ?song.1-4
. crowd@gugyeong murmur "eo i gu dal bal da ya a i go jo ta" voices=10 voice=mixed vol=0.6 dyn="p p p mp" ?song.1-4
. insects@deul 0.15 temp=19 count=4
. water@bada   0.15 lap=0.2 splash=0.02

*> space       field size=1.3
>  speaker     0.5
`,
};
