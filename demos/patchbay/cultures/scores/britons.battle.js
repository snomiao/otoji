// Y Gododdin declaimed in the mead hall: the music of Aneirin's time is lost, so this follows the nearest surviving
// source, the medieval Welsh harp music of the Robert ap Huw manuscript (c. 1613), played on the buzzing bray harp
// (Bill Taylor, Paul Dooley), with the bard reciting a stanza over its two alternating chords; measured with refs/analyse.py.
{
  // the harp's 'cwlwm': a measure of 1s and 0s, 1 = the home chord (cyweirdant), 0 = the chord a tone below (tyniad)
  const cwlwm = "1 1 0 1 0 0 1 0 1 1 0 1 0 1 0 0";
  const fig = { 1: "1, 5, 1 5,", 0: "7,, 4, 7, 4," };
  const harp = cwlwm.split(" ").map((c) => fig[c]).join(" ");
  // the bard: a line recited on the home note, lifted to the fourth and falling back (2 bars), then the harp alone (2 bars)
  const recite = (n) => { const t = Array(n).fill("1"); t[n - 4] = "2"; t[n - 3] = "4"; t[n - 2] = "2"; return [...t, "-", "-", ...Array(16 - n - 2).fill("0")].join(" "); };
  const R = Array(16).fill("0").join(" ");
  const lens = [9, 9, 9, 9];
  const bard = lens.map((n) => `${recite(n)} ${R}`).join(" ");
  const words = "ˈɡuːɨr a ˈaiθ ˈɡa traiθ ˈɔið ˈfraiθ əi ˈhliː ˈɡlas veːð əi ˈhan kʊɨn a ˈɡwɛn wɨn ˈviː ˈtri xant ˈtruɨ ˈbəi rjant ən ka ˈta i a ˈɡwɛ di ˈɛl ʊx ta ˈwɛl ʊx ˈviː"; // ˈ the Welsh word stress (the penult), the line-end word stressed
  SCORES["britons:battle"] = {
    about: "Y Gododdin, the elegy for the three hundred who rode to Catraeth: a bard declaims a stanza in the mead hall over the bray harp's ground, as Welsh bards sang to the harp",
    heard: "the long timber hall of Din Eidyn at night, the hearth fire down the middle, the war band at the mead benches falling quiet; the harper plays the old two-chord measure on a harp whose bray pins buzz against the strings, and the bard chants the stanza on one note with a lift at each line's end, the hall answering with a low growl of assent at the end",
    refs: [
      { title: "Music from the Robert ap Huw manuscript", who: "Paul Dooley, wire-strung harp", url: "https://www.youtube.com/watch?v=eidm1c8xQ8s" },
      { title: "Y ddigan y droell (Robert ap Huw MS)", who: "Bill Taylor, bray harp (Ardival Harps)", url: "https://www.youtube.com/watch?v=69dVp11p5NI" },
    ],
    measured: "Dooley (ap Huw pieces): tonic C, a gapped scale 0 190 500 700 1000 cents (no third: the two chords are the tonic and the chord a tone below), ~2.6 onsets a second, no pulse, energy 250–2000 Hz. Taylor's bray harp: tonic G, a two-beat pulse at ~89, the bray buzz making it bright (2.3 kHz, strong to 8 kHz). Ours: key G at 88, the harp alternating home and tyniad chords by a 16-step cwlwm in eighths, a drive for the bray pins, the bard reciting on G with a lift to the fourth, the hall as a hall space with fire. Differs: the music of c. 600 is lost; the ap Huw measures are written down a thousand years later, and the recitation formula is our reconstruction, not a source. Render check: phrases end on G, a steady two-beat pulse (clarity high) with the eighth-note figures, range B1–C4; but even with a drive and an EQ lift for the bray pins the harp is far duller than Taylor's (brightness 1.2 kHz against 2.3, 2–4 kHz −18 dB against −9): the engine has no real bray buzz. The bard's words now carry the Welsh word stress (ˈ on the penult, the line-end word stressed), so the recitation leans on its stressed syllables as speech-rhythm chant does; there is no recording of the voice to measure that against",
    text: `
. clock        88 4/4
. arrange@song neuadd:4bars l1:4bars l2:4bars l3:4bars l4:4bars marwnad:4bars
. key          mixolydian G

. caption@c1   "Gwŷr a aeth Gatraeth oedd ffraeth eu llu," ?song.2
. caption@c2   "Glasfedd eu hancwyn, a gwenwyn fu." ?song.3
. caption@c3   "Trichant trwy beiriant yn catäu," ?song.4
. caption@c4   "A gwedi elwch tawelwch fu." ?song.5
. fire@aelwyd  0.08 crackle=0.3
. crowd@gosgordd murmur "ma-ed GWIN a-ur LLU med" voices=16 voice=men vol=2 dyn="mf mp" ?song.1
. crowd@growl  shout "o-OO" "x-------........" voices=20 voice=men vol=2 dyn="0 0 f f" ?song.5
. pluck@telyn-rawn oct=4 grid=8 human=0.35 vol=0.9 dyn="mf" "${harp}" ?song.1-6
telyn-rawn> drive@bray 0.35 wet=0.6
> eq@pins high=7 mid=2
. chant@bardd  voice=men oct=3 grid=8 human=0.5 rubato=0.3 vib=0.01 breath=0.1 bright=0.5 dyn="f" ipa="${words}" "${bard}" ?song.2-5

*> space       hall size=0.8 wet=0.3
>  speaker     0.5
`,
  };
}
