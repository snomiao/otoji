// windows: choco update sox.portable
import mic from "mic";
import fs from "fs";
const instance = mic({
  rate: "16000",
  channels: 1,
  debug: false,
  bitwidth: 16,
  exitOnSilence: 6,
})
instance.getAudioStream().pipe(fs.createWriteStream("output.wav"));
instance.start();
await new Promise((resolve) => setTimeout(resolve, 5e3));
instance.stop()