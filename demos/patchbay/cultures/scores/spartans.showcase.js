// Spartan music, reconstructed: a maiden song of Alcman sung by a girls' chorus to the aulos and phorminx, then the army advancing in step to many auloi and the paean cry. The melodies are lost; the setting follows the Dorian harmonia and the aulos as played on reconstructed instruments (Stefan Hagel's Hellenistic aulos).
SCORES["spartans:showcase"] = {
  about: "a partheneion of Alcman: a chorus of girls sings ἔστι τις σιῶν τίσις, there is a vengeance of the gods, in the Dorian harmonia, the aulos holding the mese and following the tune, a phorminx struck between lines; then the phalanx moving slowly in step to many auloi in anapaests, shields knocking, and the paean",
  heard: "first at a festival in the open sanctuary, the girls' chorus dancing in a line before the people; then out on the plain, the army's feet in time, the auloi shrill over the tramp of thousands",
  refs: [
    { title: "Stefan Hagel plays the Hellenistic aulos", who: "European Music Archaeology Project, reconstructed aulos", url: "https://www.youtube.com/watch?v=OcHWvl16mpg" },
  ],
  measured: "Uncertain: no Spartan melody survives; Alcman's words do (Louvre papyrus, lines 36–39 sung here in Doric), and writers describe the instruments, the Dorian harmonia, the slow march to auloi (Thucydides 5.70) and the paean cry. Everything melodic here is a new reconstruction in the diatonic Dorian (E F G A B C D E), resting on E with the aulos holding the mese A. Measured on Hagel's reconstructed aulos: very long sustained notes (up to 8 s) under running figures, steady pitch with no vibrato, a soft 170 ms attack, harmonic and reedy (125 Hz–2 kHz). Ours: girls' chorus at 84 with ~5 c vibrato, aulos and mese drone, 250 Hz–1 kHz; the embaterion in anapaests at 96 with feet and shields, the paean cry ἰὴ παιάν. Still differs: our aulos plays an octave above Hagel's low Hellenistic instrument (the archaic auloi for girls' choruses were higher, but this is a guess) and is one pipe, not two pipes beating together",
  text: `
. clock        84 4/4
. arrange@song partheneion:8bars partheneion2:8bars embaterion:8bars@96
. scale@doristi 1 b2 b3 4 5 b6 b7
. key          doristi E

. caption@alcman "ἔστι τις σιῶν τίσις· ὁ δ' ὄλβιος, ὅστις εὔφρων ἁμέραν διαπλέκει ἄκλαυτος" ?song.1-2
. crowd@people murmur "ka la po te mi no se" voices=16 voice=mixed vol=0.4 dyn="p" ?song.1-2
. chant@girls  voice=women voices=10 oct=4 grid=8 human=0.5 vib=0.02 breath=0.15 bright=0.4 dyn="mf f" ipa="es ti tis si ɔːn ti sis ho dol bi os hos tis eu pʰɾɔːn haː me ɾan di a ple keː a klau tos" "5 - 4 - 5 - 6 - 5 - 4 - 3 - - - 3 - 4 - 5 - 5 - 6 - 5 - 4 - 3 - 4 - 5 - 6 - 7 - 6 - 5 - 4 - - - 5 - 4 - - - 1 - - - - - - - - -" ?song.1-2
. reed@aulos   oct=4 grid=8 human=0.4 vol=0.6 "5 - 4 - 5 - 6 - 5 - 4 - 3 - - - 3 - 4 - 5 - 5 - 6 - 5 - 4 - 3 - 4 - 5 - 6 - 7 - 6 - 5 - 4 - - - 5 - 4 - - - 1 - - - - - - - - -" ?song.2
. reed@aulos-mese oct=4 grid=8 human=0.3 vol=0.25 "4 - - - - - - - - - - - - - - - 4 - - - - - - - - - - - - - - - 4 - - - - - - - - - - - - - - - 4 - - - - - - - - - - - - - - -" ?song.1-2
. pluck@phorminx oct=3 grid=8 human=0.4 vol=1 "1+5 - - - - - - - 0 0 0 0 0 0 0 0 4 - - - - - - - 0 0 0 0 0 0 0 0" ?song.1-2
. reed@auloi   oct=4 grid=8 human=0.4 vol=0.8 dyn="f" "1 1 4 - 1 1 5 - 4 4 5 - 6 5 4 - 1 1 4 - 1 1 5 - 6 5 4 - 1 - - - 1 1 4 - 1 1 5 - 4 4 5 - 6 5 4 - 1 1 4 - 1 1 5 - 6 5 4 - 1 - - -" ?song.3
. reed@auloi-2 oct=4 grid=8 human=0.6 vol=0.6 dyn="f" "1 1 4 - 1 1 5 - 4 4 5 - 6 5 4 - 1 1 4 - 1 1 5 - 6 5 4 - 1 - - - 1 1 4 - 1 1 5 - 4 4 5 - 6 5 4 - 1 1 4 - 1 1 5 - 6 5 4 - 1 - - -" ?song.3
. drums@phalanx kit=celtic vol=0.9 human=0.3 "X...x...X...x...|................|................" ?song.3
. drums@shields kit=clash vol=0.35 "................|X.......X.......|................" ?song.3
. crowd@paean  shout "i-E pai-AN" "................................................................................................................x-x-x---........" voices=40 voice=men vol=1 ?song.3

*> space       field size=1.4 wet=0.15
>  speaker     0.5
`,
};
