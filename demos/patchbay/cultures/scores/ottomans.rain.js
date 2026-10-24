// Üsküdar'a gider iken: rebuilt from Safiye Ayla's 78 rpm record (the singer's phrases, tonic, scale and tempo measured with refs/analyse.py on demucs stems).
SCORES["ottomans:rain"] = {
  about: "Üsküdar'a Gider İken (Kâtibim), the Istanbul türkü that begins 'on the way to Üsküdar a rain caught us', sung in a coffeehouse while it rains",
  heard: "a wooden kahvehane in Üsküdar on a wet evening: rain on the shutters, a few men talking low until the singer starts; ud, kanun and keman play the tune with her, each ornamenting it his own way (heterophony), a def keeps the sofyan usul",
  refs: [{ title: "Üsküdar (Katip), original 78 rpm", who: "Safiye Ayla", url: "https://www.youtube.com/watch?v=7GPnC64bV8Y" }],
  measured: "voice stem: phrases end on D, uses D E F G A Bb C with C# leading back to D (12-tone within ~10 cents), D4–C5, vibrato ~16 cents, 1 note in 5 slides; about 115 eighths a minute; the band carries the tune between verses and rests on A; almost no percussion on the record",
  text: `
. clock        115 4/4
. arrange@song saz:8bars beyit1:4bars beyit2:4bars beyit3:4bars beyit4:4bars
. scale@kurdi  1 2 b3 4 5 b6 b7
. key          kurdi D

. caption@l1   "Üsküdar'a gider iken aldı da bir yağmur," ?song.2
. caption@l2   "Kâtibimin setresi uzun, eteği çamur." ?song.3
. caption@l3   "Kâtip uykudan uyanmış, gözleri mahmur," ?song.4
. caption@l4   "Kâtip benim, ben kâtibin, el ne karışır?" ?song.5
. rain@pencere 0.35 drops=0.3
. crowd@kahve  murmur "ka la bi ye ne mi si de ra chok ha ya" voices=6 vol=0.8 pitch=0.95 dyn="mp p" ?song.1
. chant@safiye voice=women oct=4 grid=8 human=0.6 vib=0.02 breath=0.1 dyn="mf mf mp mf f mf mp mf" ipa="ys ky da ɾa ɟi deɾ i cen al dɯ da biɾ jaː _ muɾ _ cʰaː ti bi min set ɾe _ si _ _ u zun e te ji _ tʃa _ muɾ _ cʰaː tip uj ku dan u jan mɯʃ ɟœz le ɾi mah _ _ muɾ _ cʰaː tip be nim ben cʰaː _ ti _ _ bin el ne _ ka _ ɾɯ _ ʃɯɾ _" "1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - - 1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - -" ?song.2-5
. pluck@ud     oct=3 grid=8 human=0.5 dyn="mf mp" "1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - - 1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - - 1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - -" ?song.1-5
. pluck@kanun  oct=4 grid=8 human=0.4 vol=0.8 dyn="mf p p mp" "1+1' - - 5+5' 5+5' - 5+5' - 6+6' 5+5' 6+6' 7+7' 5+5' - 5+5' - 4+4' - 4+4' 4+4' 3+3' - 4+4' - 5+5' - - - - - - - 1+1' - - 2+2' 3+3' - 4+4' - 5+5' 6+6' 5+5' 4+4' 3+3' 2+2' 1+1' - 4+4' 3+3' 3+3' 2+2' 2+2' 1+1' #7,+#7 2+2' 1+1' - - - - - - - 1+1' - - 5+5' 5+5' - 5+5' - 6+6' 5+5' 6+6' 7+7' 5+5' - 5+5' - 4+4' - 4+4' 4+4' 3+3' - 4+4' - 5+5' - - - - - - - 1+1' - - 2+2' 3+3' - 4+4' - 5+5' 6+6' 5+5' 4+4' 3+3' 2+2' 1+1' - 4+4' 3+3' 3+3' 2+2' 2+2' 1+1' #7,+#7 2+2' 1+1' - - - - - - - 1+1' - - 5+5' 5+5' - 5+5' - 6+6' 5+5' 6+6' 7+7' 5+5' - 5+5' - 4+4' - 4+4' 4+4' 3+3' - 4+4' - 5+5' - - - - - - - 1+1' - - 2+2' 3+3' - 4+4' - 5+5' 6+6' 5+5' 4+4' 3+3' 2+2' 1+1' - 4+4' 3+3' 3+3' 2+2' 2+2' 1+1' #7,+#7 2+2' 1+1' - - - - - - -" ?song.1-5
. strings@keman oct=4 grid=8 human=0.5 vol=0.6 dyn="mf mf p p p p p p mp" "1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - - 1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - - 1 - - 5 5 - 5 - 6 5 6 7 5 - 5 - 4 - 4 4 3 - 4 - 5 - - - - - - - 1 - - 2 3 - 4 - 5 6 5 4 3 2 1 - 4 3 3 2 2 1 #7, 2 1 - - - - - - -" ?song.1-5
. drums@def    kit=darbuka vol=0.35 "x.......x.......|....x.......x...|..x...x...x...x." ?song.1-5

*> space       room size=1.3
>  speaker     0.5
`,
};
