// Dies irae at a brother-knight's Requiem: the sequence as the Benedictines of Solesmes sing it, the melody from the Liber Usualis (public domain), sung alternatim by two half-choirs in a vaulted brick church, a knell outside.
SCORES["teutons:death"] = {
  about: "Dies irae, the sequence of the Requiem Mass, sung in unison by the brethren in two alternating half-choirs, a death knell tolling before it",
  heard: "the castle church at Marienburg during a Requiem for a Grand Master: the brethren in their choir stalls facing each other, one side singing a stanza and the other answering; no organ (it kept silent at Masses for the dead), only men's voices in a long brick vault and, before the Mass, the great bell tolling the knell",
  refs: [
    { title: "Sequence: Dies irae (mode 1)", who: "Monks of l'Abbaye Saint-Pierre de Solesmes", url: "https://www.youtube.com/watch?v=vUgye2KNReM" },
    { title: "Séquence Dies irae", who: "Chœur des moines de l'Abbaye Notre-Dame de Fontgombault", url: "https://www.youtube.com/watch?v=7zHmh8mhGv8" },
  ],
  measured: "Solesmes, first 90 s: men in unison, range about E3–D#4, the final pitched about F (+20 c, i.e. the written D sung a minor third up), the mode-1 steps D E F G A C at 12-tone within ~20 c, vibrato under 7 c and almost no glides; free rhythm at about 3 syllables a second (0.25–0.35 s a note), phrase ends held 0.7–1.2 s with a breath after; energy sits at 125–1000 Hz, nothing above 4 kHz; the church tail is very long (rt60 measured ~8 s, probably an overestimate). The melody (three lines, each ending on the final) follows the Liber Usualis; the half-choirs alternate a stanza each, as the record does. Ours: the same steps, register and pace on an eighth-note grid loosened with rubato toward the singers' free rhythm (word accents are still not lengthened), and the synthetic voices are cleaner than a choir of thirty. Our render measured: the same steps and final, tempo ~100 eighths/min, brightness 1190 Hz against the record's 955 (after an eq cut of the highs: the formant voices hiss above 4 kHz), the 500–1000 Hz vowel band 4 dB weaker than the monks'",
  text: `
. clock        100 4/4
. arrange@song knell:3bars stanza1:5bars stanza2:5bars
. scale@protus 1 2 b3 4 5 6 b7
. key          protus F

. caption@c1   "Dies irae, dies illa, / solvet saeclum in favilla: / teste David cum Sibylla." ?song.2
. caption@c2   "Quantus tremor est futurus, / quando judex est venturus, / cuncta stricte discussurus!" ?song.3
. bell@glocke  oct=2 grid=4 vol=0.7 dyn="mf mf mf mp p pp" "1 - - - - - 1 - - - - -" ?song.1-2
. chant@chorus1 rubato=0.4 voice=men voices=10 oct=3 grid=8 human=0.5 vib=0.006 breath=0.05 dyn="mf mf f mf mp" ipa="di es i re di es il la sol vet _ sɛ _ klum _ in fa vil la tes te _ da vid _ kum si bil la" "3 2 3 1 2 7, 1 1 - - 0 3 3 4 3 2 1 7, 2 3 2 1 - - 0 5, 7, 1 1 1 7, 2 3 2 1 - - - 0" ?song.2
. chant@chorus2 rubato=0.4 voice=men voices=10 oct=3 grid=8 human=0.5 vib=0.006 breath=0.05 dyn="mf mf f mf mp" ipa="kvan tus tre mor est fu tu rus kvan do _ ju _ deks _ est ven tu rus kunk ta _ strik te _ dis kus su rus" "3 2 3 1 2 7, 1 1 - - 0 3 3 4 3 2 1 7, 2 3 2 1 - - 0 5, 7, 1 1 1 7, 2 3 2 1 - - - 0" ?song.3

*> space       church size=1.8 wet=0.5
>  eq          low=1 mid=0 high=-14
>  speaker     0.5
`,
};
