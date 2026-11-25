// 芣苢: the Zhounan song of women picking plantain, from the Book of Songs. Its Zhou tune is lost; the line follows the
// traditional chanted recitation (吟诵) of the poem by Li Zhanming (黎展名), set as a call and answer in the field.
{
  // Yu mode on G (G Bb C D F), as the recitation: lines lean on D and come home to G. One token an eighth, ♩ = 76.
  const callLine = "5 5 1' - 5 - - - 0 0 0 0 0 0 0 0 5 5 1' 5 7 5 - - 0 0 0 0 0 0 0 0";      // 采采芣苢 … 采采芣苢
  const answer   = "0 0 0 0 0 0 0 0 3 4 5 - 1 - - - 0 0 0 0 0 0 0 0 5 3 4 - 1 - - -";      // 薄言采之 … 薄言有之
  const callWords = "tsʰai tsʰai fu i tsʰai tsʰai fu i _";
  const answerWords = "po ian tsʰai tʂɨ po ian iou tʂɨ po ian tuo tʂɨ po ian luo tʂɨ po ian tɕie tʂɨ po ian ɕie tʂɨ";
  const three = (s) => [s, s, s].join(" ");
  SCORES["chinese-early:gather"] = {
    about: "Plantain (芣苢), the Book of Songs work song: women in the summer field pick, gather, strip and carry the plantain seeds, one voice calling 'pick, pick the plantain' and the others answering with what they do next",
    heard: "a field of plantain by the paths of Zhounan in early summer, open air, a light wind in the grass and crickets; a group of women bent over the plants, one starts the line and the others answer while their hands keep working, laughing and chatting between the verses, the second time all of them singing",
    refs: [
      { title: "诗经吟诵《国风·周南·芣苢》", who: "黎展名 Li Zhanming, chanted recitation (吟诵), 黄延平 accompaniment", url: "https://www.youtube.com/watch?v=XXQMRLfLiXQ" },
    ],
    measured: "recitation: comes to rest on G, uses G Bb C D F (yu pentatonic; 12-tone within ~20 cents), most syllables on G and D with the others as passing and ornament notes, ~152 eighths a minute (2.5 onsets a second), E2–F#4, a voice-led spectrum (250–1000 Hz, centroid 1.36 kHz). The Zhou melody is lost and 吟诵 is the literati way of chanting, not a field song: we keep its notes and pace, and turn it into a call and answer as a work song would go; the words are in Mandarin. Render: ~152 eighths a minute as the recitation, home on G, the same notes; brighter (2.3 kHz centroid against 1.36) because women sing it here where a man recites, and the synthetic women's chorus is smoother than a field group would be. Voice gestures: the reciter slides between notes (median 0.18 s); the caller and the women now glide (glide=0.2, 0.21 s) and the women's group is a little pressed (press=0.25) for a rougher field voice; still smoother and brighter than a real field group",
    text: `
. clock        76 4/4
. arrange@song field:2bars sing:12bars sing2:12bars rest:2bars
. key          yu G

. caption@c1   "采采芣苢，薄言采之。采采芣苢，薄言有之。" ?song.2
. caption@c2   "采采芣苢，薄言掇之。采采芣苢，薄言捋之。 / 采采芣苢，薄言袺之。采采芣苢，薄言襭之。" ?song.3
. wind@breeze    0.12 gust=0.05Hz
. reeds@grass    0.2 gust=0.06Hz
. insects@summer 0.12 temp=26 count=3
. crowd@chatter  murmur "a ya ni kan ha la" voice=women voices=6 vol=2 dyn="mp p" ?song.1
. crowd@chatter2 murmur "a ya ha" voice=women voices=4 vol=2 dyn="mp" ?song.4
. chant@caller   voice=women oct=4 grid=8 human=0.6 scoop=30 glide=0.2 vib=0.02 breath=0.15 dyn="mf" ipa="${callWords}" "${three(callLine)}" ?song.2-3
. chant@women    voice=women voices=6 oct=4 grid=8 human=0.6 vol=0.45 glide=0.2 press=0.25 vib=0.015 breath=0.15 dyn="mf mf mf mf mf mf mf mf mf mf mf mf f" ipa="${answerWords}" "${three(answer)}" ?song.2-3
. chant@everyone voice=women voices=8 oct=4 grid=8 human=0.6 glide=0.2 press=0.25 vib=0.015 breath=0.15 dyn="mp" ipa="${callWords}" "${three(callLine)}" ?song.3

*> space       field size=1
>  speaker     0.5
`,
  };
}
