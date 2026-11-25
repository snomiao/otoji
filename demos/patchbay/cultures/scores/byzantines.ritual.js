// Τῇ ὑπερμάχῳ στρατηγῷ, the kontakion of the Akathist: rebuilt from the Simon Karas choir and the Lycourgos Angelopoulos choir (melody outline, the plagal fourth mode's real intervals and the ison measured with refs/analyse.py and a pitch-track histogram).
SCORES["byzantines:ritual"] = {
  about: "Τῇ ὑπερμάχῳ στρατηγῷ, the kontakion that opens the Akathist hymn, chanted in the plagal fourth mode over a held ison, the people joining at Χαῖρε, Νύμφη ἀνύμφευτε",
  heard: "the Great Church at night after the siege of 626, the whole city standing: the semantron calls outside, the crowd falls quiet, a protopsaltis gives the mode (Νεάγιε) and the right choir chants in unison over the isokrates, under a dome that rings for ten seconds; at the last line everyone sings",
  refs: [
    { title: "Τῇ ὑπερμάχῳ στρατηγῷ (Akathistos)", who: "Simon Karas and the choir of the Society for the Dissemination of National Music", url: "https://www.youtube.com/watch?v=uU92uQprqpY" },
    { title: "Τῇ ὑπερμάχῳ, ἦχος πλ. α΄", who: "Choir of Lycourgos Angelopoulos (Greek Byzantine Choir)", url: "https://www.youtube.com/watch?v=sc83dWEN8v0" },
  ],
  measured: "Karas (78 s): men in unison over an ison on the base (C# +45c); steady-pitch histogram above the base: 0, 220, 400, 540, 710, 890 cents, Zo about 1000 (Angelopoulos: 0, 210, 390, 500-560, 720), so a diatonic on Ni with a low Vou and Ga pulled up toward Di (attraction), not the 12-tone major and not the soft-diatonic echos1 of the profile; range base to Ke (a sixth), one rise to the upper Ni; free rhythm (pulse clarity 0.04), about 1 syllable a second, phrases end with 2-4 s holds on Ni; the ison moves to Di while the melody sits high; 6-8 s of reverberant tail in the recordings. Ours follows the scale in cents, the range, the phrase arches (rise to Ga/Di, cadence on Ni), the syllabic pace and the ison; the notes are written in the style from the measured outline, not transcribed. Still differs: our chant is metric (eighths at 80 bpm) where Karas breathes freely, the formant voices lack the nasal, chest-heavy Greek timbre and the fast ornaments (the quick turns and the 'tremolo' of the old style), and the scale is fixed while the singers bend Vou and Ga by context",
  text: `
. clock        80 4/4
. arrange@song σήμαντρον:2bars νεάγιε:2bars ὑπερμάχῳ:4bars λυτρωθεῖσα:4bars ἀναγράφω:4bars ἀλλ-ὡς:4bars ἐκ-παντοίων:4bars χαῖρε:4bars ἀμήν:2bars@~66
. scale@plagal4 1 2:220 3:400 4:540 5:710 6:890 7:1000
. key          plagal4 C#

. caption@c1   "Τῇ ὑπερμάχῳ στρατηγῷ τὰ νικητήρια," ?song.3
. caption@c2   "ὡς λυτρωθεῖσα τῶν δεινῶν εὐχαριστήρια," ?song.4
. caption@c3   "ἀναγράφω σοι ἡ Πόλις σου, Θεοτόκε·" ?song.5
. caption@c4   "ἀλλ' ὡς ἔχουσα τὸ κράτος ἀπροσμάχητον," ?song.6
. caption@c5   "ἐκ παντοίων με κινδύνων ἐλευθέρωσον," ?song.7
. caption@c6   "ἵνα κράζω σοι· Χαῖρε, Νύμφη ἀνύμφευτε." ?song.8
. drums@semantron kit=temple vol=1.3 "x.x.....x.x.....x.x...x.x.x.xxxx|................|................" ?song.1
. crowd@laos   murmur "pa na yi a ki ri e e le i son so son i mas" voices=14 voice=mixed vol=1.6 dyn="p pp 0" ?song.1-2
. chant@isokrates voice=men voices=4 oct=3 grid=8 vol=0.28 vib=0.004 breath=0.12 dyn="mp" ipa="ne _ _ _ _ _ _ _ _" "0 0 1 - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 5 - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - 1 - - - - - - - - - - - 0 0 0 0" ?song.2-9
. chant@psaltes voice=men voices=6 oct=3 grid=8 human=0.8 vib=0.01 breath=0.1 dyn="mf mf mf mf f mf mf mf f f mf mp" ipa="ne a _ _ ji e ti i peɾ ma _ xo stɾa ti jo _ _ ta ni ci ti ɾi _ a os li tɾo θi sa ton ði non _ _ ef xa ɾi sti _ ɾi _ a _ a na ɣɾa _ fo si i po lis su _ θe o to _ ce al os e _ xu sa to kɾa tos _ a pɾos ma _ xi _ ton ek pan di _ _ on me cin ði _ non e lef θe _ ɾo son i na kɾa _ zo si xe ɾe _ _ nim fi _ a nim _ fef _ te" "1 - - 1 - 2 1 1 - 1 - - - - 0 0 1 - - 1 3 4 - 3 2 - 2 3 4 5 4 3 2 3 4 - 3 2 1 - - - - - - - 0 0 1 2 3 4 - 3 4 5 5 6 5 - 4 3 4 5 4 3 2 2 1 - - - - - - - - - 0 0 5 5 6 5 4 - 5 4 3 - 4 3 2 2 3 2 1 1 - - - - - - - - - - - - 0 0 1 3 4 5 - 5 5 5 6 - 5 4 5 6 5 4 3 4 5 - - - - - - - - - - - 0 0 5 4 5 6 5 4 - 3 4 3 2 2 - 2 3 4 3 2 - 1 - - - - - - - - - - 0 0 1 2 3 4 3 - 2 - 5 - - 4 3 4 5 - 4 3 2 3 4 3 2 1 - - - - - - 0 0" ?song.2-8
. chant@laos-sings voice=women voices=10 oct=4 grid=8 human=0.7 vol=0.5 vib=0.015 breath=0.15 dyn="mp mf f mf" ipa="i na kɾa _ zo si xe ɾe _ _ nim fi _ a nim _ fef _ te" "1 2 3 4 3 - 2 - 5 - - 4 3 4 5 - 4 3 2 3 4 3 2 1 - - - - - - 0 0" ?song.8

*> space       cathedral size=1.4 wet=0.42
>  speaker     0.5
`,
};
