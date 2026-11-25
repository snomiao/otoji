// Santo Tomás in Chichicastenango: a cofradía procession with chirimía, tun, bells and firecrackers, the Dance of the Conquest, and a marimba in the plaza, after Folkways field recordings (1945–1973).
SCORES["mayans-late:festival"] = {
  about: "the fiesta of Santo Tomás: the cofradía carries the saint behind a chirimía and the tun, church bells and firecrackers; then a son of the Dance of the Conquest for the masked dancers; then a marimba in the plaza",
  heard: "out of doors in the crowded plaza and on the church steps: copal smoke, the shawm and the slit drum coming through the crowd, bells ringing irregularly from the tower, bombas cracking overhead, people talking and calling, children; the dance son in the open square, the marimba under an awning",
  refs: [
    { title: "Baile de la Conquista: Son de Pedro Portocarrero / Son de Santa…", who: "L. and J. Ajanel, recorded by Henrietta Yurchenco, 1945 (Folkways, Music of the Maya-Quiches of Guatemala)", url: "https://www.youtube.com/watch?v=bwgLFkRS-AE" },
    { title: "Drum and Chirimía", who: "Chuj musicians from San Mateo Ixtatán (Music of Guatemala Vol. 2, Folkways 1973)", url: "https://www.youtube.com/watch?v=_dm56yMuds0" },
    { title: "Small Marimba", who: "Tz'utujil musicians (Music of Guatemala Vol. 1, Folkways 1969)", url: "https://www.youtube.com/watch?v=eh-0We3LiJc" },
  ],
  measured: "Conquista son, 1945 (demucs 'other' stem): the shawm holds A for long notes (up to 2.8 s) and turns on notes about 150/220, 460 and 680 cents above it (the second wavers between the two), 1–2 kHz, about 130–136; the drum stem enters after the first minute in three. Chuj chirimía (1973): B♭ with 570 / 900 / 1200 c, 99. Tz'utujil marimba (1969): 96, thirds at 360 and 430 c. Ours: the procession on the Chuj tune at 99 with the tun's two tongues, irregular bells and bombas; the conquista son rebuilt note by note from the stem at 132 in three (renders 129 with a two-beat drum pulse), its own scale@ in cents; the marimba as in the showcase; dynamics flat (4.8 dB) like the crowded plaza recordings. Still differs: our shawms are smoother than the real ones; the masked dancers' speeches and rattles and the palo volador are not here",
  text: `
. clock        99 3/4
. arrange@song procession:18bars@99 conquista:21bars@132 plaza:16bars@96
. scale@shawm     1 4:570 6:900
. scale@conquista 1 2:150 3:220 4:460 5:680
. scale@tzutujil  1 2:190 3:360 4:430 5:710
. key          shawm A#

. crowd@fiesta murmur "la ki xa ta wa ri ke cha ha ha" voices=24 voice=mixed vol=0.7 dyn="mp"
. crowd@calls  shout "e-YA o-E" "................................................x---............................................................x-x-............" voices=4 voice=mixed vol=0.8
. drums@bombas kit=guns vol=0.5 "................................................................................|................................................................................................x.......................................................X...........................|................" ?song.1-2
. bell@church-bell oct=3 grid=8 human=0.6 vol=0.5 "1 - - - - - 5, - - - - - 1 - - 5, - - 0 - - - - -" ?song.1
. reed@chirimia oct=3 grid=8 human=0.5 rubato=0.2 vol=0.7 dyn="f" "1 - 6, 1 1 1 1 - - 1 1 - 6 6 - 6 - - - 1' 6 6 6 6 - - - - - - - - 6 4 - 6 6 4 6 - 1 1 - - - - 1 1 4 6 6 6 - - 1' 6 6 - - - - - - - - - 4 6 6 6 6 1 4 4 1' - 6 6 6 1' - - - - - - - - - - - - - - - - - - - - - - - - - - - -" ?song.1
. marimba@tun  oct=2 grid=8 human=0.3 vol=1 "1 - 2 - 2 -" ?song.1
. reed@chirimia-son scale=conquista key=A oct=4 grid=8 human=0.5 rubato=0.2 vol=0.7 dyn="f" "4 - 1 1 - 1 - 1 3 3 - 1 1 - - - - - 1 - 1 - - 1 - - - - - 2 4 - - 4 - 1 4 4 - - 4 2 - 2 2 5 - - 4 4 - 4 - - 3 5 3 1 - - - - - 1 - - - 1 - - - - - - - - - - - 4 - 1 - 5 5 4 - 1 - - 5 - - 1 1 - - - - - 1 - - - - - 1 1 - - - 2 4 - 5 - 4 1 - - - - - - - -" ?song.2
. drums@tambor kit=african vol=0.5 human=0.4 "X...x...x...|....X.......|............" ?song.2
. marimba@k-ojom scale=tzutujil key=G# oct=3 grid=8 human=0.4 vol=1.1 "5 1' 4 5, 5, 5, 4 4 5 5 4 5 5 4 5 5 3 4 4 4 3 4 5 4 4 5 1' 1' 1' 1' 1' 1' 1' 1' 1' 1' 1' 4 5 5 5 4 4 4 5 4 5 5" ?song.3
. marimba@k-ojom-bass scale=tzutujil key=G# oct=2 grid=8 human=0.3 vol=0.9 "1 - 5, - 1 - 5, - 4, - 1 - 5, - 1 -" ?song.3

*> space       courtyard size=2.4 wet=0.2
>  speaker     0.5
`,
};
