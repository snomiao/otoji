// The keen at an Irish wake: rebuilt from Kitty Gallagher's (Cití Ní Ghallchóir's) keening song recorded by Alan Lomax
// in Gweedore in 1951, its tonic, gapped scale, glides and phrase shape measured with refs/analyse.py; the words are the
// opening of Eibhlín Dubh Ní Chonaill's keen for Art Ó Laoghaire (1773), sung to that keening shape.
{
  const R = (n) => Array(n).fill("0").join(" ");
  // a keened line: up to the fifth, a slide, falling to a long tonic (3 bars of eighths)
  const line = "4~5 5 - 5~6 5~4 - - - 2 4~5 5 - 4~2 1 - - - - - - 0 0 0 0";
  // the women's answer, 'ochón agus ochón ó': from the high seventh down to the tonic
  const answer = "7~6 - 6 5 6~5 - 5 - 4 5 - - 4~2 2~1 1 - - - - - - - 0 0";
  const keener = Array(5).fill(`${line} ${R(24)}`).join(" ");
  const women = Array(5).fill(`${R(24)} ${answer}`).join(" ");
  const words = "mo ɣraː _ ɡo daŋ _ ən tuː _ laː _ daː _ va kə _ hu _ eɡ kʲaun _ tʲiː ən _ va ɾəɡ _ hʊɡ mə huːl _ a ɾə _ ɣɪtʲ _ hʊɡ mə xɾiː _ taːtʲ nəv _ dɪtʲ _";
  SCORES["celts:death"] = {
    about: "The caoineadh, the keen for the dead: a woman raises the lament over the body, line by line, and the women of the wake answer 'ochón'",
    heard: "a cottage at night during the wake (tórramh): the corpse laid out with candles, a turf fire, clay pipes and talk, men telling stories in low voices; then the talk stops, the widow stands and keens, rocking, each line rising and sliding down to a long held note, and the other women take up the wail after each line; when it ends the murmur comes back",
    refs: [
      { title: "Keening song, Gweedore, Co. Donegal (1951)", who: "Cití Ní Ghallchóir (Kitty Gallagher), recorded by Alan Lomax", url: "https://www.youtube.com/watch?v=mY5qkW5C3SY" },
      { title: "Keening: six authentic recordings from Ireland and Scotland (1955–1965)", who: "The Folk Revival Project (compilation)", url: "https://www.youtube.com/watch?v=vgts7_b1JWY" },
    ],
    measured: "Gallagher 1951: one woman alone, tonic E (+40 c), range E4–D5, a gapped scale 0 180 510 700 870 1000 cents (a low second, no third, a high fourth, a low sixth), every line climbing to the fifth or sixth, holding it 1.5–2 s, then falling 4 2 1 to a tonic held up to 4 s; 42% of notes glide into the next, vibrato ~21 c, no pulse (clarity 0.21), ~2.6 notes a second in the runs, energy 500–1000 Hz. Ours: that scale and shape on E+40, a slow 72 with rubato, slides on the falls, the keener's vibrato wide, the women's answer from the seventh down, and the wake around it. Differs: Gallagher sings without words we can follow here; we set the 1773 words to her shape, and the answering women are the wake custom described in the sources, not on her record. Render check: range E4–D5 as the record, 39% of notes gliding (record 42%), vibrato ~15 c (record 21), no pulse (0.18); bands 500–1000 −5, 1–2 kHz −12 dB (record 0, −4.5): the synthetic voice was darker than her open Donegal tone. Ornament pass (pyin): she reaches her notes from below (attacks from a consonant scooped by a median 55 c) and slides through most transitions (median 46 ms); her held notes shade 20 c then 17 c (no widening, so no shake= is written). The keener now has scoop=55 glide=0.15 press=0.4 (a harder, brighter chest voice), the women's answer scoop=55 glide=0.2: our keener's few attacks scoop by 15–20 c, slides 52 ms, held notes 22 c then 19 c; bands under the peak 250–500 0, 500–1000 −4, 1–2 kHz −1, 2–4 kHz −9 (record −6, 0, −6, −17): no longer dark above 1 kHz, but our fundamental is still too strong and 2–4 kHz too bright, her open vowel's formant near 800 Hz is not reached",
    text: `
. clock        72 4/4
. arrange@song wake:4bars k1:6bars k2:6bars k3:6bars k4:6bars k5:6bars after:4bars
. scale@keen   1:40 2:220 3:380 4:550 5:740 6:910 7:1040
. key          keen E

. caption@c1   "Mo ghrá go daingean tu!" ?song.2
. caption@c2   "Lá dá bhfaca thu" ?song.3
. caption@c3   "ag ceann tí an mhargaidh," ?song.4
. caption@c4   "thug mo shúil aire dhuit," ?song.5
. caption@c5   "thug mo chroí taitneamh duit." ?song.6
. fire@turf    0.1 crackle=0.15
. crowd@wake   murmur "a-ta SE mai go LEOR a-nois DIA lei" voices=12 vol=2 dyn="mf mp" ?song.1
. crowd@wake2  murmur "SEAN-a dui-ne mai DIA" voices=10 vol=2 dyn="p mp mf" ?song.7
. chant@bean scoop=55 glide=0.15 press=0.4 bright=0.5 voice=women oct=4 grid=8 human=0.7 rubato=0.6 vib=0.02 breath=0.2 dyn="f mf f f mf f mf f f mf f mf f f mf f mf f f mf f mf f f mf f mf f f mf" ipa="${words}" "${keener}" ?song.2-6
. chant@mna scoop=55 glide=0.2 voice=women voices=6 oct=4 grid=8 human=0.8 rubato=0.5 vib=0.014 breath=0.3 vol=0.8 dyn="mf" ipa="ɔ xoːn _ a ɡəs ɔ xoːn _ oː _" "${women}" ?song.2-6

*> space       room size=1.2 wet=0.2
>  speaker     0.5
`,
  };
}
