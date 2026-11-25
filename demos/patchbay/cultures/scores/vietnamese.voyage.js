// Around the fire on a new Mekong settlement: a song in the southern Oán mode (the mode of hoài lang and vọng cổ) with đàn kìm, đàn tranh, đàn cò and the song lang clapper, written in the style of Cô Chín Lịch's 1920s đờn ca tài tử record (scale in cents, tempo and ornament measured); our own words and melody.
SCORES["vietnamese:voyage"] = {
  about: "a homesick song in the Oán mode, sung by the fire by settlers of the delta: the đàn tranh and đàn kìm prelude freely, then four lines of longing for the old village, the song lang clapper closing each cycle",
  heard: "night on cleared land in the Mekong delta: a cooking fire in front of a thatched hut, crickets and the canal water, a few families sitting close; a man plays the moon lute, another the zither and the two-string fiddle, a woman sings, and the clapper under someone's foot marks the end of each line",
  refs: [
    { title: "Hoài lang, Hành vân (record of the 1920s)", who: "Cô Chín Lịch, đờn ca tài tử", url: "https://www.youtube.com/watch?v=OjcWJPJ1tFo" },
  ],
  measured: "Cô Chín Lịch's 1920s record (mix): the voice rests on a Sa about 20 cents under E (written E) far more than on any other note, the other pitches are about 350 (the vibrated xự, a neutral third), 510, 680 and 850 cents: the southern Oán mode; voice F#3-E5 (median 332 Hz), no steady pulse in the mix (clarity 0.13), vibrato ~7 cents with wider shakes on xự, long held Sa of 2-3 s closing phrases. Ours: the same five pitches (the render returns 350, 510, 670, 840), four lines that each come home to a long Sa, a shake (f) on xự, a free prelude (rubato) on đàn tranh and đàn kìm, the song lang at the end of each two-bar cycle. Still different: our singer still sits higher (more time on Pa and cống: median 481 Hz against 332), our lines are composed in the style rather than taken from the record (Dạ cổ hoài lang is still in copyright), the đàn kìm has no fretted bends of a full step, and the fire, crickets and canal are the scene.",
  text: `
. clock        56 4/4
. arrange@song lua:2bars rao:2bars cau:8bars ket:2bars
. scale@oan    1 3:350 4:510 5:680 6:850
. key          oan E

. caption@c1   "Từ ngày xa quê, lìa xa đồng xưa / Nhớ bóng mẹ già bên mái tranh nghèo" ?song.3
. fire@bep-lua 0.1 crackle=0.35
. insects@ruong 0.3 temp=28 count=5
. water@kinh   0.15 lap=0.08 splash=0.04
. pluck@dan-tranh rubato=0.6 oct=4 grid=8 human=0.6 vol=1.6 dyn="mp" "5 - 6 - 1' - 6 5 4 - 3~4 - 1 - - -" ?song.1
. pluck@nguyet-kim rubato=0.6 oct=3 grid=8 human=0.6 vol=2 dyn="mf" "1 - 1 4 - 5 - 6, 1 - - - 4 5 4~3 1" ?song.2
. chant@ca-si  voice=women oct=4 grid=8 human=0.6 rubato=0.3 bright=0.5 vib=0.025 breath=0.12 dyn="mf mf f mf mf mf mp p" ipa="tɨ ŋaj sa kwe li sa doŋ sɨə ɲɤ boŋ me za ben maj tʃaɲ ŋɛw _ dem naj ben bep lɨə ŋe tiəŋ dɤn buən _ aj ve kwe ku ɲan zum kəw tʰɨəŋ _" "1 - 4 5 - 6, 1 - - - 4 3~1 1 - - - 5 5 6 5 4 - 3f 4 3~1 1 - - - - - - 1' 6 5 - 4 5 6 5 4 3~4 - 5 - - - - 5 4 3 - 1 6, 1 - - 4 3~1 1 - - - -" ?song.3
. pluck@nguyet-kim2 oct=3 grid=8 human=0.6 vol=1.6 "1 - 4 5 - 6, 1 - - - 4 3~1 1 - - - 5 5 6 5 4 - 3 4 3~1 1 - - - - - - 1' 6 5 - 4 5 6 5 4 3~4 - 5 - - - - 5 4 3 - 1 6, 1 - - 4 3~1 1 - - - -" ?song.3
. strings@dan-co body=huqin oct=4 grid=8 human=0.6 vol=0.3 dyn="mp" "1 - 4 5 - 6, 1 - - - 4 3~1 1 - - - 5 5 6 5 4 - 3 4 3~1 1 - - - - - - 1' 6 5 - 4 5 6 5 4 3~4 - 5 - - - - 5 4 3 - 1 6, 1 - - 4 3~1 1 - - - -" ?song.3
. pluck@dan-tranh2 oct=4 grid=16 human=0.5 vol=1.2 "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5 6 1' 6 5 4 5 -" ?song.3
. drums@song-lang kit=temple vol=2 "................................|................................|............................x..." ?song.3
. pluck@ket-kim rubato=0.4 oct=3 grid=8 human=0.6 vol=1.0 dyn="mf p" "5 4 3~1 - 1 - - - - - - - - - - -" ?song.4
. pluck@ket-tranh rubato=0.4 oct=4 grid=8 human=0.6 vol=1.2 dyn="mp p" "0 0 0 0 1+5 - - - - - - - - - - -" ?song.4

*> space       field size=0.9
>  speaker     0.5
`,
};
