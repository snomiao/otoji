// A midnight serenade to the Virgin of Guadalupe (11–12 December) by an old-style mariachi of violins, vihuela, guitarra de golpe, guitarrón and harp, in the manner of the early Jalisco mariachi records (Mariachi Tapatío, 1920s–30s). Las Mañanitas itself is not reproduced; this is a serenade in its style.
SCORES["mexicans:ritual"] = {
  about: "midnight at the Basilica of Guadalupe: the bells ring, pilgrims crowd the atrium and concheros drum outside, then a mariachi sings a serenade to the Virgin in two voices a third apart, violins answering",
  heard: "in the packed atrium of the basilica at night: thousands of pilgrims talking, praying and singing along, church bells at midnight, the concheros' drum and ayoyote rattles from the plaza, the mariachi close by, voices bright and full in the chest",
  refs: [
    { title: "Mañanitas Tapatías (Victor 75271-A)", who: "Mariachi Tapatío, 78 rpm (UCLA Frontera Collection)", url: "https://www.youtube.com/watch?v=9pSJSoJfrWU" },
  ],
  measured: "Mañanitas Tapatías (78 rpm): 108 in three with a sesquiáltera feel (low band X.xxX.X.X.X., the vihuela strumming every 8th), resting on A (the transfer reads G♯+10 c), violins, guitars, harp and voices filling 125 Hz–2 kHz evenly, little dynamic change (11 dB). Ours: rendered 107.7 in three, resting on A; two voices a third apart, then the violins on the same tune, vihuela strums, guitarrón on the bass, harp arpeggios; the tune and the Spanish words are newly written in the style (Las Mañanitas is not reproduced). Still differs: no trumpets (right for the early mariachi) but our violins are smoother than the 78's scratchy, wide-vibrato fiddles; the vocal stem (demucs, pyin) puts the two singers at G♯3–E4 (A3–C♯4 most of the time), so ours, first written an octave higher (A4–F♯5), now sing at oct=3 (A3–F♯4); they scoop a little (22% of attacks by more than 40 c, quick slides of a median 23 ms) in a bright chest voice (250 Hz–2 kHz within 4 dB): ours with scoop=30 glide=0.08 press=0.3 measure 22%, 35 ms, and 500 Hz–1 kHz −2, 1–2 kHz −4, 2–4 kHz −2 dB under the 250–500 Hz peak (stem 0, −1, −6 under its 500 Hz–1 kHz peak), a little thin in the middle and bright on top. No falsetto break or grito was found on this 78 (no register jumps in the pitch track), so none is written; the crowd singing along is only murmur",
  text: `
. clock        108 3/4
. arrange@song midnight:4bars serenata:16bars violines:16bars
. key          major A

. caption@c    "Ya llegan los peregrinos, Madre, / a cantarte en tu santo altar" ?song.2
. crowd@pilgrims murmur "ma dre sa ki ta lu pe a ve ma ri a" voices=30 voice=mixed vol=0.7 dyn="mf mp p p"
. bell@basilica oct=3 grid=4 human=0.3 vol=0.5 "1 - - 5, - - 1 - - 5, - -" ?song.1
. drums@concheros kit=aztec vol=0.5 "X.....x.X...|..x...x...x.|x.x.x.x.x.x." ?song.1
. chant@primera oct=3 scoop=30 glide=0.08 press=0.3 voice=men grid=8 human=0.4 rubato=0.2 vib=0.03 breath=0.08 bright=0.6 dyn="f" ipa="ja ʎe ɣan los pe ɾe ɣɾi nos ma dɾe a kan taɾ te en tu san to al taɾ kon flo ɾes i kon kan ta ɾes ma dɾe te be ni mos a sa lu daɾ ai ai" "5, - 1 - 2 - 3 - - - 3 4 5 - 4 - 3 - 2 - - - 0 0 5, - 7, - 2 - 4 - - - 4 5 4 - 3 - 2 - 1 - - - 0 0 3 - 4 - 5 - 6 - - - 6 5 6 - 5 - 4 - 3 - - - 0 0 2 - 3 - 4 - 5 - - - 4 3 2 - 7, - 2 - 1 - - - 0 0" ?song.2
. chant@segunda oct=3 scoop=30 glide=0.08 press=0.3 voice=men grid=8 human=0.4 rubato=0.2 vib=0.03 breath=0.08 bright=0.6 vol=0.55 ipa="ja ʎe ɣan los pe ɾe ɣɾi nos ma dɾe a kan taɾ te en tu san to al taɾ kon flo ɾes i kon kan ta ɾes ma dɾe te be ni mos a sa lu daɾ ai ai" "3, - 6, - 7, - 1 - - - 1 2 3 - 2 - 1 - 7, - - - 0 0 3, - 5, - 7, - 2 - - - 2 3 2 - 1 - 7, - 6, - - - 0 0 1 - 2 - 3 - 4 - - - 4 3 4 - 3 - 2 - 1 - - - 0 0 7, - 1 - 2 - 3 - - - 2 1 7, - 5, - 7, - 6, - - - 0 0" ?song.2
. strings@violin oct=5 grid=8 human=0.5 vol=0.7 dyn="mf" "5, - 1 - 2 - 3 - - - 3 4 5 - 4 - 3 - 2 - - - 0 0 5, - 7, - 2 - 4 - - - 4 5 4 - 3 - 2 - 1 - - - 0 0 3 - 4 - 5 - 6 - - - 6 5 6 - 5 - 4 - 3 - - - 0 0 2 - 3 - 4 - 5 - - - 4 3 2 - 7, - 2 - 1 - - - 0 0" ?song.3
. strings@violin-2 oct=5 grid=8 human=0.5 vol=0.55 dyn="mf" "3, - 6, - 7, - 1 - - - 1 2 3 - 2 - 1 - 7, - - - 0 0 3, - 5, - 7, - 2 - - - 2 3 2 - 1 - 7, - 6, - - - 0 0 1 - 2 - 3 - 4 - - - 4 3 4 - 3 - 2 - 1 - - - 0 0 7, - 1 - 2 - 3 - - - 2 1 7, - 5, - 7, - 6, - - - 0 0" ?song.3
. pluck@vihuela oct=4 grid=8 human=0.5 vol=0.6 "1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+4/ - 7,+2+4/ - 7,+2+4/ - 7,+2+4/ - 7,+2+4/ - 7,+2+4/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 1+4+6/ - 1+4+6/ - 1+4+6/ - 1+4+6/ - 1+4+6/ - 1+4+6/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ - 7,+2+5/ - 7,+2+5/ - 7,+2+5/ - 1+3+5/ - 1+3+5/ - 1+3+5/ -" ?song.2-3
. pluck@guitarron oct=2 grid=8 human=0.4 vol=0.9 "1 - - - 5, - 1 - - - 5, - 1 - - - 5, - 5, - - - 2 - 5, - - - 2 - 5, - - - 7,, - 5, - - - 7,, - 1 - - - 5, - 1 - - - 5, - 4, - - - 1 - 4, - - - 1 - 1 - - - 5, - 5, - - - 2 - 1 - - - 5, - 5, - - - 2 - 1 - - - 5, -" ?song.2-3
. pluck@arpa oct=4 grid=8 human=0.4 vol=0.5 "1 3 5 1' 5 3 1 3 5 1' 5 3 1 3 5 1' 5 3 7, 2 5 7 5 2 7, 2 5 7 5 2 7, 2 4 5 4 2 7, 2 4 5 4 2 1 3 5 1' 5 3 1 3 5 1' 5 3 1 4 6 1' 6 4 1 4 6 1' 6 4 1 3 5 1' 5 3 7, 2 5 7 5 2 1 3 5 1' 5 3 7, 2 5 7 5 2 1 3 5 1' 5 3" ?song.2-3

*> space       courtyard size=2.4 wet=0.2
>  speaker     0.5
`,
};
