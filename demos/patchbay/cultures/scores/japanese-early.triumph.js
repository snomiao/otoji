// Ryōō (蘭陵王) at the Heian wrestling festival: the Left has won, and its musicians play the dragon-masked prince's dance in the palace garden.
SCORES["japanese-early:triumph"] = {
  about: "Ryōō (蘭陵王), the bugaku dance of the Left that greeted a victory of the Left at the sumai no sechie: a free ranjō prelude on ryūteki over the shō, then the dance tune on hichiriki and ryūteki over shō clusters, kakko rolls, the great drum and the shōko",
  heard: "outdoors in the south garden of the palace on a summer day: the courtiers in their pavilions on either side, the wrestlers of the Left and Right on the sand; the Left's officers cheer once as their side wins, then the musicians of the Left play in the open air and the masked dancer stamps; the drums carry across the gravel and the palace walls answer faintly; the crowd talks low between the phrases",
  refs: [
    { title: "Ranryō-ō (蘭陵王, ichikotsu-chō)", who: "Tokyo Gakuso (gagaku ensemble on traditional instruments)", url: "https://www.youtube.com/watch?v=WGY8wQDCptQ" },
    { title: "Ra-ryō-ō, nyūha (one round) reconstructed from Heian and Kamakura scores", who: "Kyoto City University of Arts, Research Centre for Japanese Traditional Music", url: "https://www.youtube.com/watch?v=75Xt1ExGUQI" },
  ],
  measured: "Tokyo Gakuso (150 s of the dance): the modern gagaku pitch puts ichikotsu (D) about 60 cents low (C#+40), the melody resting on D, its steps D E F(+20) A with the hichiriki bending between them, very little vibrato (~1 cent: the reeds glide instead), about 1.1 onsets a second (long held notes, the drums sparse), bright reed-and-shō band (3.3 kHz brightness, the 1–2 kHz band strongest), a long outdoor-hall tail; the Kyoto reconstruction from the Heian scores: steps of 0 200 370 530 730 870 1000 cents (the third between minor and major, as the hichiriki plays it), 1.5 onsets a second, the same instruments, a little livelier. Ours: D with the third at 370 cents, the tune (written in the style of the ichikotsu-chō dance pieces: Ryōō's own notes are not reproduced) in quarter and half notes on hichiriki with slides into the long notes, ryūteki doubling it an octave up with its own graces, shō aitake clusters changing with the tune, kakko rolls leading into the great drum every two bars, shōko on the cadences. Rendered and measured (the dance section, after the engine's double-reed fix): the third at 320–370 cents and the cadences on D as in the recordings, no vibrato as in gagaku, 2 onsets a second against 1.1 (our kakko rolls are denser), but darker (1.6 kHz against 3.3 kHz: the real hichiriki and shō are much brighter); the great drum was lowered, it was too heavy in the low band. Still differs: the hichiriki's wide enbai glides and the shō's slowly breathed swell are approximated, and the 60-cent low gagaku pitch cannot be set (key takes semitones only)",
  text: `
. clock        66 4/4
. arrange@song ranjo:4bars ha:16bars ha2:16bars ranjo2:4bars
. scale@ichikotsu 1 2 3:370 4 5 6 7
. key          ichikotsu D

. crowd@sachi  shout "O-O" "x-------........................................................................................................................" voices=20 voice=men vol=0.9 ?song.1
. crowd@kugyo  murmur "a na ka shi ko ya o ha su ma i ni na ri" voices=12 vol=0.7 dyn="p p mp p" ?song.1-4
. flute@ryuteki-ranjo oct=5 rubato=0.5 grid=4 human=0.8 dyn="p mp mf mp" "0 (5)6~1' - - 1' - (2')3'~2' - 1' - 6 - 5~6 - - -" ?song.1
. organ@sho-ranjo oct=4 grid=4 vol=0.5 dyn="pp p mp p" "1+2+5+6 - - - - - - - 6,+1+2+5 - - - 1+2+5+6 - - -" ?song.1
. reed@hichiriki oct=4 grid=4 human=0.6 vol=0.55 dyn="mf mf f mf mf f f mf mf mf f mf mf f mf mp" "6,~1 - 1 - 2 - 3 - 2~3 - 1 - 2 - - - 3 - 5 - 6~5 - 5 - 3 - 2 - 3 - - - 5 - 6 - 1' - 6 - 5~6 - 3 - 5 - - - 3 - 2 - 1 - 2 - 6,~1 - 1 - 1 - - -" ?song.2-3
. flute@ryuteki oct=5 grid=8 human=0.7 vol=0.35 dyn="mp mf mf mp mp mf mf mp" "6, - - - 1 - - - 2 - - - (2)3 - - - 2 - - - 1 - - - (1)2 - - - - - - - 3 - - - (3)5 - - - 6 - - - 5 - - - (5)3 - - - 2 - - - 3 - - - - - - - 5 - - - 6 - - - (6)1' - - - 6 - - - 5 - - - (5)3 - - - 5 - - - - - - - (5)3 - - - 2 - - - 1 - - - (1)2 - - - 6, - - - 1 - - - 1 - - - - - - -" ?song.2-3
. organ@sho    oct=4 grid=4 vol=0.4 dyn="mp mf" "6,+2+3+6 - - - 1+2+5+6 - - - 2+3+6+1' - - - 2+5+6+1' - - - 3+5+6+2' - - - 5+6+1'+2' - - - 2+3+6+1' - - - 3+5+6+2' - - - 5+6+1'+2' - - - 1+2+5+6 - - - 5+6+1'+2' - - - 3+5+6+2' - - - 2+3+6+1' - - - 1+2+5+6 - - - 6,+1+2+5 - - - 1+2+5+6 - - -" ?song.2-3
. drums@kakko  kit=taiko vol=0.9 "................................|..............................x.|........x.x.x.xxxxxx............" ?song.2-3
. drums@gakudaiko kit=taiko vol=0.5 "................X...............|................................|................................" ?song.2-3
. bell@shoko   oct=5 grid=4 vol=0.5 "0 0 0 0 0 0 1 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" ?song.2-3
. reed@hichiriki-ranjo oct=4 rubato=0.5 grid=4 human=0.8 vol=0.5 dyn="mp mf mp p" "0 0 6,~1 - - - 2 - (2)3~2 - - 1 - - - -" ?song.4
. flute@ryuteki-ranjo2 oct=5 rubato=0.5 grid=4 human=0.8 vol=0.6 dyn="mp mf mp p" "(5)6~1' - - - 6 - 5 - (5)6 - - 5~3 - - - -" ?song.4
. organ@sho-ranjo2 oct=4 grid=4 vol=0.5 dyn="p mp p pp" "1+2+5+6 - - - - - - - 6,+1+2+5 - - - 1+2+5+6 - - -" ?song.4

*> space       courtyard size=2.2 wet=0.3
>  speaker     0.5
`,
};
