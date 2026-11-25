// 溱洧: the spring song of Zheng from the Book of Songs, young people on the banks of the Zhen and Wei. Its Zhou tune is lost;
// the line follows the chanted recitation (吟诵) of the poem in Zong Jiuqi's (宗九奇) tune, measured with refs/analyse.py.
{
  // On D# with a neutral third (3 at 350 cents, as the reciter's wavers between 310 and 400). One token an eighth, ♩ = 60.
  const L = [
    ["2 3 1 - - - - -", "tʂən y wei"],                 // 溱與洧
    ["1 2 4 3~1 - - - -", "faŋ xuan xuan ɕi"],        // 方渙渙兮
    ["6, 1 2 - - - - -", "ʂɨ y ny"],                    // 士與女
    ["2 3 2 1~6, - - - -", "faŋ piŋ tɕian ɕi"],        // 方秉蕑兮
    ["3 4 5 4~3 - - - -", "ny ye kuan xu"],             // 女曰觀乎 (she)
    ["2 1 6, 1 - - - -", "ʂɨ ye tɕi tɕʰie"],           // 士曰既且 (he)
    ["3 4 5 4~3 - - - -", "tɕʰie waŋ kuan xu"],         // 且往觀乎 (she)
    ["2 3 1 - - - - -", "wei tʂɨ wai"],                 // 洧之外
    ["1 2 4 3~1 - - - -", "ɕyn ɕy tɕʰie lɤ"],          // 洵訏且樂
    ["6, 1 2 3 - - - -", "wei ʂɨ y ny"],                // 維士與女
    ["3 2 1 6, - - - -", "i tɕʰi ɕiaŋ ɕye"],           // 伊其相謔
    ["1 2 3 2 1 - - -", "tsəŋ tʂɨ i ʂuo yao"],         // 贈之以勺藥
  ];
  const rest = "0 0 0 0 0 0 0 0";
  const part = (who) => L.map(([m], i) => (who.includes(i) ? m : rest)).join(" ");
  const said = (who) => L.filter((_, i) => who.includes(i)).map(([, w]) => w).join(" ");
  const all = [0, 1, 2, 3, 7, 8, 9, 10, 11], she = [4, 6], he = [5];
  const tune = L.map(([m]) => m).join(" ");
  SCORES["chinese-early:festival"] = {
    about: "The Zhen and the Wei (溱洧): on the spring festival by the swollen rivers of Zheng, the young people sing of the girl who asks 'shall we go and look?', the boy who says he has been, and her 'let's go again', and of the peonies they give each other",
    heard: "the river banks in spring with the snowmelt running high: crowds of young men and women out with orchids, talking and laughing by the water; a group sings the song together, a girl and a boy taking the lines of the dialogue, someone keeps time by clapping and a bamboo flute plays along",
    refs: [
      { title: "詩經吟誦: 國風·鄭風全篇, 95. 溱洧 (at 23:33), in 宗九奇先生吟誦調", who: "王傳聞, chanted recitation (吟诵)", url: "https://www.youtube.com/watch?v=1WlKkP5hFK4" },
    ],
    measured: "recitation: comes to rest on one tone (~D#, 30 cents flat) with the minor third below as its lower neighbour; the third above wavers between ~310 and ~400 cents (we use 350), with 2, 4 and 5; C3–D4, vibrato ~16 cents, one note in seven slides, ~1.9 syllables a second, free in time (pulse clarity 0.06), a man's voice (1.7 kHz centroid). We keep the rest tone, the neutral third, the contours of rising to the 4th or 5th and falling home, the slides on line ends, set in eighths at ♩ = 60; the Zhou tune is lost and 吟诵 is a scholar's chanting, here given to a festival crowd; Mandarin words. Render: rests on D#, the neutral third at 350 measured back, D3–G#4, ~1.7 onsets a second against 1.9; darker than the reciter (1.1 kHz centroid against 1.7, so the men's ring is raised) and steadier in time",
    text: `
. clock        60 4/4
. arrange@song bank:2bars song:12bars song2:12bars
. scale@zong   1 2 3:350 4 5 6
. key          zong D#

. caption@c1   "溱與洧，方渙渙兮。士與女，方秉蕑兮。女曰觀乎？士曰既且。 / 且往觀乎！洧之外，洵訏且樂。維士與女，伊其相謔，贈之以勺藥。" ?song.2-3
. water@river   0.5 lap=0.3 splash=0.08
. crowd@youths  murmur "ha ya kan a la ni" voice=mixed voices=24 vol=2 dyn="mf mp" ?song.1
. crowd@youths2 murmur "ha a ya" voice=mixed voices=12 vol=1.6 dyn="p" ?song.2-3
. chant@men     voice=men voices=6 oct=3 grid=8 human=0.5 rubato=0.15 bright=0.5 vib=0.02 breath=0.12 dyn="mf" ipa="${said(all)}" "${part(all)}" ?song.2-3
. chant@women   voice=women voices=6 oct=4 grid=8 human=0.5 rubato=0.15 vib=0.02 breath=0.12 dyn="mf" ipa="${said(all)}" "${part(all)}" ?song.3
. chant@she     voice=women oct=4 grid=8 human=0.4 vib=0.02 bright=0.5 dyn="f" ipa="${said(she)}" "${part(she)}" ?song.2-3
. chant@he      voice=men oct=3 grid=8 human=0.4 vib=0.02 dyn="mf" ipa="${said(he)}" "${part(he)}" ?song.2-3
. flute@di      oct=5 grid=8 vol=0.3 dyn="mp" "${tune}" ?song.3
. drums@clap    kit=flamenco vol=1.2 "................|................|x...x...x...x..." ?song.3

*> space       river size=1.2
>  speaker      0.5
`,
  };
}
