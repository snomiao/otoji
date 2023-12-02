import { PvRecorder } from "@picovoice/pvrecorder-node";
import withDefer from "with-defer-es";
import { createWriteStream } from "fs";
import { stdin } from "process";
const audioFrame = [];

await withDefer(async (defer) => {
  const PV_RECORDER_FRAME_LENGTH = 2048;
  const audioDeviceIndex = -1; // auto
  const recorder = new PvRecorder(PV_RECORDER_FRAME_LENGTH, audioDeviceIndex);
  console.log(`Using device: ${recorder.getSelectedDevice()}`);
  defer(() => recorder.release());

  recorder.start();
  defer(() => recorder.stop());

  const out = createWriteStream("output.pcm");

  stdin.once("data", (data) => {
    if (data.toString().trim() === "q") throw new Error("Exit");
  });
  await new Promise((resolve) => setTimeout(resolve, 10e3));
  while (1) {
    const pcm = await recorder.read();
    out.write(new Uint8Array(pcm));
  }
});
