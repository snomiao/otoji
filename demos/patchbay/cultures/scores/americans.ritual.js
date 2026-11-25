// Amazing Grace to the tune New Britain, as the Sacred Harp singers sing it: after the 1922 Original Sacred Harp Choir record, the first recording of the hymn.
SCORES["americans:ritual"] = {
  about: "Amazing Grace (John Newton, 1779) to the shape-note tune New Britain (Sacred Harp 45t): keyed, sung once through on the shapes fa-sol-la, then two verses in four parts, full voice",
  heard: "a plain wooden country church in the South on a Sunday singing: the class sits in a hollow square facing the leader in the middle, who beats time; a keyer sounds the notes, everyone sings the shapes first, then the words, loud, nasal and unhurried, the tenor carrying the tune with men and women together an octave apart",
  refs: [
    { title: "New Britain (Amazing Grace), 1922", who: "Original Sacred Harp Choir, led by J. S. James, 78 rpm (the earliest recording of the hymn)", url: "https://www.youtube.com/watch?v=rznMFf1Ljz8" },
  ],
  measured: "1922 record (and its demucs vocal stem): three verses of about 35 s with a breath of ~1 s between, i.e. 16 bars of 3/4 at about 84 to the quarter; phrases rest on F (the transfer runs ~40 cents sharp), the tune pentatonic (1 2 3 5 6); voices fill 250 Hz–2 kHz, sustained notes up to 3 s, vibrato ~5 cents, 34 dB of dynamics on the stem (loud verses, silent breaths). Ours: tonic F, 84 in three, vibrato ~5 cents, the same 250 Hz–1 kHz peak. Still differs: the 78's bottom is gone below 250 Hz (the medium, not copied, so our bass is 20 dB fuller); the real class slides between notes and swells each long note, and its nasal edge is sharper than the formant voices; the harmony here is written in the open fifths-and-sixths style, not copied note for note from the book's 45t",
  text: `
. clock        84 3/4
. arrange@song keying:2bars verse1:16bars verse2:16bars verse3:16bars
. key          major F

. caption@shapes "fa sol la · New Britain" ?song.2
. caption@v2     "Amazing grace! how sweet the sound / That saved a wretch like me!" ?song.3
. caption@v3     "'Twas grace that taught my heart to fear, / And grace my fears relieved" ?song.4

. crowd@class  murmur "na fo ti fai wel le se ti" voices=8 voice=mixed vol=0.6 dyn="mp p" ?song.1
. chant@keyer  voice=men oct=3 grid=8 human=0.3 vib=0.01 breath=0.1 ipa="fɑ lɑ sol fɑ" "1 - 3 - 5 - 1 - - - - -" ?song.1
. chant@tenor  voice=men voices=8 oct=3 grid=8 human=0.5 vib=0.02 breath=0.12 bright=0.6 dyn="f" ipa="sol fɑ lɑ fɑ lɑ sol fɑ lɑ sol sol fɑ lɑ fɑ lɑ sol sol lɑ sol lɑ sol lɑ fɑ sol lɑ fɑ sol fɑ lɑ fɑ lɑ sol fɑ ə meɪ zɪŋ _ ɡɹeɪs haʊ swiːt ðə saʊnd ðæt seɪvd ə _ ɹɛtʃ laɪk miː aɪ wʌns wəz _ lɒst bʌt naʊ æm faʊnd wəz blaɪnd bʌt _ naʊ aɪ siː tweɪz ɡɹeɪs ðæt _ tɔːt maɪ hɑɹt tə fɪəɹ ænd ɡɹeɪs maɪ _ fɪəɹz ɹɪ liːvd haʊ pɹɛ ʃəs _ dɪd ðæt ɡɹeɪs ə pɪəɹ ðə aʊəɹ aɪ _ fɜɹst bɪ liːvd" "0 0 0 0 5, - 1 - - - 3 1 3 - - - 2 - 1 - - - 6, - 5, - - - 5, - 1 - - - 3 1 3 - - - 2 - 5 - - - - - - - - - 3 - 5 - - - 3 5 3 - - - 1 - 5, - - - 6, - 1 - - - 5, - 1 - - - 3 1 3 - - - 2 - 1 - - - - -" ?song.2-4
. chant@tenor-women voice=women voices=6 oct=4 grid=8 human=0.5 vib=0.02 breath=0.12 bright=0.6 vol=0.75 ipa="sol fɑ lɑ fɑ lɑ sol fɑ lɑ sol sol fɑ lɑ fɑ lɑ sol sol lɑ sol lɑ sol lɑ fɑ sol lɑ fɑ sol fɑ lɑ fɑ lɑ sol fɑ ə meɪ zɪŋ _ ɡɹeɪs haʊ swiːt ðə saʊnd ðæt seɪvd ə _ ɹɛtʃ laɪk miː aɪ wʌns wəz _ lɒst bʌt naʊ æm faʊnd wəz blaɪnd bʌt _ naʊ aɪ siː tweɪz ɡɹeɪs ðæt _ tɔːt maɪ hɑɹt tə fɪəɹ ænd ɡɹeɪs maɪ _ fɪəɹz ɹɪ liːvd haʊ pɹɛ ʃəs _ dɪd ðæt ɡɹeɪs ə pɪəɹ ðə aʊəɹ aɪ _ fɜɹst bɪ liːvd" "0 0 0 0 5, - 1 - - - 3 1 3 - - - 2 - 1 - - - 6, - 5, - - - 5, - 1 - - - 3 1 3 - - - 2 - 5 - - - - - - - - - 3 - 5 - - - 3 5 3 - - - 1 - 5, - - - 6, - 1 - - - 5, - 1 - - - 3 1 3 - - - 2 - 1 - - - - -" ?song.2-4
. chant@treble voice=women voices=6 oct=3 grid=8 human=0.5 vib=0.02 breath=0.12 bright=0.6 vol=0.7 ipa="lɑ sol sol sol sol lɑ sol lɑ lɑ lɑ sol sol sol sol lɑ fɑ sol fɑ sol fɑ sol sol lɑ lɑ sol lɑ sol sol sol sol lɑ sol ə meɪ zɪŋ _ ɡɹeɪs haʊ swiːt ðə saʊnd ðæt seɪvd ə _ ɹɛtʃ laɪk miː aɪ wʌns wəz _ lɒst bʌt naʊ æm faʊnd wəz blaɪnd bʌt _ naʊ aɪ siː tweɪz ɡɹeɪs ðæt _ tɔːt maɪ hɑɹt tə fɪəɹ ænd ɡɹeɪs maɪ _ fɪəɹz ɹɪ liːvd haʊ pɹɛ ʃəs _ dɪd ðæt ɡɹeɪs ə pɪəɹ ðə aʊəɹ aɪ _ fɜɹst bɪ liːvd" "0 0 0 0 3 - 5 - - - 5 5 5 - - - 6 - 5 - - - 3 - 3 - - - 3 - 5 - - - 5 5 5 - - - 6 - 1' - - - - - - - - - 5 - 1' - - - 5 1' 5 - - - 5 - 3 - - - 3 - 5 - - - 3 - 5 - - - 5 5 5 - - - 6 - 5 - - - - -" ?song.2-4
. chant@bass   voice=men voices=6 oct=2 grid=8 human=0.5 vib=0.015 breath=0.1 vol=0.6 ipa="fɑ fɑ fɑ fɑ fɑ sol fɑ fɑ fɑ sol fɑ fɑ fɑ fɑ sol sol fɑ fɑ fɑ fɑ fɑ fɑ sol fɑ fɑ sol fɑ fɑ fɑ fɑ sol fɑ ə meɪ zɪŋ _ ɡɹeɪs haʊ swiːt ðə saʊnd ðæt seɪvd ə _ ɹɛtʃ laɪk miː aɪ wʌns wəz _ lɒst bʌt naʊ æm faʊnd wəz blaɪnd bʌt _ naʊ aɪ siː tweɪz ɡɹeɪs ðæt _ tɔːt maɪ hɑɹt tə fɪəɹ ænd ɡɹeɪs maɪ _ fɪəɹz ɹɪ liːvd haʊ pɹɛ ʃəs _ dɪd ðæt ɡɹeɪs ə pɪəɹ ðə aʊəɹ aɪ _ fɜɹst bɪ liːvd" "0 0 0 0 1 - 1 - - - 1 1 1 - - - 5 - 1 - - - 4 - 1 - - - 5 - 1 - - - 1 1 1 - - - 5 - 5 - - - - - - - - - 1 - 1 - - - 1 1 1 - - - 1 - 5 - - - 4 - 1 - - - 5 - 1 - - - 1 1 1 - - - 5 - 1 - - - - -" ?song.2-4

*> space       hall size=0.7 wet=0.22
>  speaker     0.5
`,
};
