// Lammā badā yatathannā: rebuilt from Sayed el-Safty's 1917 record (tonic, maqam in cents, tempo and the takht's
// heterophony measured with refs/analyse.py on demucs stems; the tune is the traditional muwashshah).
SCORES["abbasids:showcase"] = {
  about: "Lammā badā yatathannā لما بدا يتثنى, the best-known muwashshah, in maqam nahawand and the 10/8 samāʿī thaqīl, sung by a tenor with the takht and the chorus answering",
  heard: "an evening salon of listeners in Cairo or Aleppo: the takht (oud, qanun, violin and riq) plays the tune together, each ornamenting it his own way, the singer takes the verse, the chorus repeats it, and the listeners call out 'Allah!' at the turns",
  refs: [{ title: "Lammā badā yatathannā (1917 record)", who: "Sayed el-Safty and takht", url: "https://www.youtube.com/watch?v=LEa1uRDwPIM" }],
  measured: "tonic B♭ (the record runs about 20 cents flat), the voice Bb3–F5 with ≈9 cents vibrato and slides on one note in nine; maqam nahawand measured on the voice stem: 0, about 210, 300, 510, 700, 790 and a high leading tone near 1120–1150 cents; an eighth note of about 0.31 s (≈195 a minute), so the 10/8 cycle lasts about 3.1 s (we play samāʿī thaqīl, dum . . tek . dum dum tek . ., at that rate); the instruments stem plays the tune in heterophony with the voice and rests on the tonic between lines; dark 78 rpm spectrum (peak 500–1000 Hz, nothing above 4 kHz). Our render: tonic B♭ and the same degrees (210, 290, 500, 690, 780, 1120), the 0.31 s eighth (191 a minute) and a 500–1000 Hz peak like the record; it is brighter above 2 kHz (−15 dB against −31, the record's acoustic horn cuts it) and its pulse is much clearer (0.6 against 0.1): the 1917 takht breathes and drags where our riq keeps strict time. The melody is the traditional tune as written in our FAMOUS entry, fitted to the 10/8, not transcribed from this record",
  text: `
. clock        97 5/4
. arrange@song lazima:4bars dawr:8bars lazima2:4bars dawr2:8bars
. scale@nahawand 1 2:210 3:300 4:510 5:700 6:790 7:1120
. key          nahawand Bb tune=-20

. caption@l1   "لمّا بدا يتثنّى · حبّي جمالُه فتنّا" ?song.2
. caption@l2   "أومى بلحظِه أسرنا · غصنٌ ثنى حين مالا" ?song.4
. crowd@majlis murmur "ja sa la ma ha bi ba na" voices=8 vol=0.6 dyn="p pp" ?song.1
. crowd@sammia shout "al-LAH" pattern="..............................................................x-x--............." voices=5 vol=0.5 ?song.3-4
. chant@safty  voice=men bright=0.5 oct=3 grid=8 human=0.5 vib=0.025 breath=0.08 dyn="mf f mf f" ipa="lam ma ba da _ ja ta _ θan _ na _ ħub bi dʒa ma _ luh fa _ tan _ na _ aw ma bi _ laħ _ zih a _ sar _ na _ ɣus nun θa na _ ħiː _ na maː laː _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1' - - 2' 1' 7 - - 1' 7 6 - 5 6 5 6 7 5 - - 6 5 4 - - 5 - 3 - - 2 2 1 1 7, 1 - - - -" ?song.1-4
. chant@bitana voice=men voices=6 oct=3 grid=8 human=0.5 vib=0.02 breath=0.1 vol=0.6 dyn="mf" ipa="lam ma ba da _ ja ta _ θan _ na _ ħub bi dʒa ma _ luh fa _ tan _ na _ aw ma bi _ laħ _ zih a _ sar _ na _ ɣus nun θa na _ ħiː _ na maː laː _" "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1' - - 2' 1' 7 - - 1' 7 6 - 5 6 5 6 7 5 - - 6 5 4 - - 5 - 3 - - 2 2 1 1 7, 1 - - - -" ?song.1-4
. pluck@oud    oct=3 grid=8 human=0.5 dyn="mf mp" "1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1' - - 2' 1' 7 - - 1' 7 6 - 5 6 5 6 7 5 - - 6 5 4 - - 5 - 3 - - 2 2 1 1 7, 1 - - - -" ?song.1-4
. pluck@qanun  oct=3 grid=8 human=0.4 vol=1.3 dyn="mf p" "1+1' - - - 2+2' 3+3' 4+4' - 3+3' - 3+3' 2+2' 2+2' 1+1' 1+1' 7,+7 1+1' - - - 1+1' - - 2+2' 3+3' 4+4' - - 5+5' - 3+3' - 2+2' 2+2' 1+1' 1+1' 7,+7 1+1' - - 1+1' - - - 2+2' 3+3' 4+4' - 3+3' - 3+3' 2+2' 2+2' 1+1' 1+1' 7,+7 1+1' - - - 1+1' - - 2+2' 3+3' 4+4' - - 5+5' - 3+3' - 2+2' 2+2' 1+1' 1+1' 7,+7 1+1' - - 1'+1'' - - 2'+2'' 1'+1'' 7+7' - - 1'+1'' 7+7' 6+6' - 5+5' 6+6' 5+5' 6+6' 7+7' 5+5' - - 6+6' 5+5' 4+4' - - 5+5' - 3+3' - - 2+2' 2+2' 1+1' 1+1' 7,+7 1+1' - - - -" ?song.1-4
. strings@kamanja oct=4 grid=8 human=0.5 vol=0.35 dyn="mf p" "1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1 - - - 2 3 4 - 3 - 3 2 2 1 1 7, 1 - - - 1 - - 2 3 4 - - 5 - 3 - 2 2 1 1 7, 1 - - 1' - - 2' 1' 7 - - 1' 7 6 - 5 6 5 6 7 5 - - 6 5 4 - - 5 - 3 - - 2 2 1 1 7, 1 - - - -" ?song.1-4
. drums@riq    kit=daf vol=0.3 human=0.5 "X.........x.x.......|......x.......x.....|..x.x...x.x...x.x.x." ?song.1-4

*> eq          low=-6 high=-6
>  space       room size=1.4 wet=0.25
>  speaker     0.5
`,
};
