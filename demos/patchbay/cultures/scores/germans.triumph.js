// Nun danket alle Gott at a peace festival after the Thirty Years' War: Crüger's tune (1647; Rinckart's words, both public domain), first blown from the church tower by the town pipers (Stadtpfeifer: cornett and sackbuts, the harmony here written plainly in the style), then sung by the whole town in the square, every bell ringing.
SCORES["germans:triumph"] = {
  about: "Nun danket alle Gott, the hymn sung at the peace of 1648: the bells of the town ring, the town pipers blow the tune from the church tower, then the crowd in the square sings it, men and women in unison, with the tower band and the bells",
  heard: "the market square of a Lutheran town (Augsburg's Hohes Friedensfest of 1650) in summer: a crowd of townspeople and soldiers come home, children with their gifts; the full peal of the church's bells, then from the gallery of the tower a cornett and three sackbuts play the hymn slowly in four parts, the sound coming down over the roofs; the people take up the tune, rough and loud, a little behind the band",
  refs: [
    { title: "85 Jahre Turmblasen, Bad Hersfeld Stadtkirche (tower brass and full peal)", who: "Turmblasen of the Stadtkirche Bad Hersfeld, recorded 4 May 1986", url: "https://www.youtube.com/watch?v=w_Dn2P0hlRw" },
    { title: "Nun danket alle Gott (EG 321), melody", who: "Wikimedia Commons MIDI of the hymnal tune", url: "https://commons.wikimedia.org/wiki/File:Nun_danket_alle_Gott_(EG,_sp%C3%A4tere_Form).mid" },
  ],
  measured: "tune from the hymnal MIDI: 8 lines (6/7/6/7/6/6/6/6 syllables), lines 1–2 repeated, the raised fourth in line 6; the tower record: chorale in F at a slow pulse, range A#2–F5, brightness ~1760 Hz with the energy at 500–2000 Hz, almost no vibrato, an open-air tail of the town around it (rt60 estimated ~9 s, mostly echoes off the houses); the full peal: brightness ~1830 Hz, onsets ~1.3 a second, irregular. Ours: the tune in F at a quarter of ~0.9 s, the tower band in four plain parts (our own harmony, not a period setting), the peal of three bells at three different periods so they never line up, the crowd singing in octaves; it differs in that our brass are cleaner and rounder than real cornetts and sackbuts, and the crowd's singing is too even. Our render measured: brightness 1590 Hz (tower record 1760) with the energy at 250–2000 Hz after an eq lift of the mids, the tune's notes C C C D D C A … where the tracker could follow it through the chords, an outdoor tail of ~6 s",
  text: `
. clock        66 4/4
. arrange@song gelaeut:4bars turm:16bars gemeinde:16bars
. key          major F

. caption@c1   "Nun danket alle Gott / mit Herzen, Mund und Händen, / der große Dinge tut / an uns und allen Enden …" ?song.3
. crowd@markt  murmur "ja-vol se-et do-ro ki-na la-hen fi-de go-tes-dan na-ber" voices=24 voice=mixed vol=0.8 dyn="mf mf mf mf p p p p p p p p p p p p p p p p mp" ?song.1-2
. bell@grosse  oct=2 grid=4 vol=0.7 "1 - - - - -" ?song.1
. bell@mittlere oct=2 grid=4 vol=0.55 "0 5 - - -" ?song.1
. bell@kleine  oct=3 grid=4 vol=0.45 "3 - - 0 1' - -" ?song.1
. bell@grosse2 oct=2 grid=4 vol=0.45 "1 - - - - -" ?song.3
. bell@kleine2 oct=3 grid=4 vol=0.3 "3 - - 0 1' - -" ?song.3
. brass@zink   oct=4 grid=8 human=0.3 vol=1.1 "5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 2 - 2 - 2 - 3 - 3 - 2 - - - - 0 2 - 3 - 5 - 5 - #4 - 5 - - - - 0 5 - 6 - 5 - 4 - 3 - 4 - - - - 0 3 - 2 - 3 - 2 - 2 - 1 - - - - -" ?song.2-3
. brass@altposaune oct=4 grid=8 human=0.3 vol=0.6 "3 - 2 - 3 - 4 - 4 - 3 - - - - 0 1 - 1 - 1 - 7, - 1 - 7, - - - 5, 0 3 - 2 - 3 - 4 - 4 - 3 - - - - 0 1 - 1 - 1 - 7, - 1 - 7, - - - 5, 0 7, - 7, - 7, - 1 - 1 - 7, - - - - 0 7, - 1 - 2 - 3 - 6, - 2 - - - - 0 3 - 4 - 3 - 2 - 1 - 1 - - - - 0 1 - 7, - 1 - 6, - 7, - 5, - - - - -" ?song.2-3
. brass@bassposaune oct=2 grid=8 human=0.3 vol=0.4 "1 - 5 - 1 - 4 - 4 - 1 - - - - 0 1 - 4 - 1 - 5 - 1 - 5 - - - 1 0 1 - 5 - 1 - 4 - 4 - 1 - - - - 0 1 - 4 - 1 - 5 - 1 - 5 - - - 1 0 5 - 5 - 5 - 1 - 1 - 5 - - - - 0 5 - 1 - 5 - 3 - 2 - 5 - - - - 0 1 - 4 - 1 - 5 - 1 - 4 - - - - 0 1 - 5 - 1 - 4 - 5 - 1 - - - - -" ?song.2-3
. chant@maenner voice=men voices=12 oct=3 grid=8 human=0.7 vib=0.01 breath=0.08 dyn="f" ipa="nuːn daŋ kət a lə gɔt mɪt hɛr tsən mʊnt ʊnt hɛn dən deːr groː sə dɪ ŋə tuːt an ʊns ʊnt a lən ɛn dən deːr ʊns fɔn mʊ tɐ laɪp ʊnt kɪn dəs baɪ nən an ʊn tsɛː lɪʃ fiːl tsuː guːt ʊnt nɔx jɛt sʊnt gə taːn" "5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 2 - 2 - 2 - 3 - 3 - 2 - - - - 0 2 - 3 - 5 - 5 - #4 - 5 - - - - 0 5 - 6 - 5 - 4 - 3 - 4 - - - - 0 3 - 2 - 3 - 2 - 2 - 1 - - - - -" ?song.3
. chant@frauen voice=women voices=12 oct=4 grid=8 human=0.7 vib=0.01 breath=0.08 dyn="mf" ipa="nuːn daŋ kət a lə gɔt mɪt hɛr tsən mʊnt ʊnt hɛn dən deːr groː sə dɪ ŋə tuːt an ʊns ʊnt a lən ɛn dən deːr ʊns fɔn mʊ tɐ laɪp ʊnt kɪn dəs baɪ nən an ʊn tsɛː lɪʃ fiːl tsuː guːt ʊnt nɔx jɛt sʊnt gə taːn" "5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 5 - 5 - 5 - 6 - 6 - 5 - - - - 0 3 - 4 - 3 - 2 - 3 - 2 - - - 1 0 2 - 2 - 2 - 3 - 3 - 2 - - - - 0 2 - 3 - 5 - 5 - #4 - 5 - - - - 0 5 - 6 - 5 - 4 - 3 - 4 - - - - 0 3 - 2 - 3 - 2 - 2 - 1 - - - - -" ?song.3

*> space       courtyard size=3 wet=0.4
>  eq          low=-4 mid=2 high=3
>  speaker     0.5
`,
};
