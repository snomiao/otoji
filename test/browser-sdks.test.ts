import { expect, test } from "bun:test";
import * as meeting from "../packages/meeting-transcript/src/index";
import * as voiceprint from "../packages/voiceprint-web/src/index";
import * as glossary from "../packages/transcript-glossary/src/index";
import * as recordings from "../packages/private-word-audio/src/index";
import { computeFbank as legacyFbank } from "../web/src/lib/fbank";
import { computeFbank } from "../packages/voiceprint-web/src/fbank";

test("one checkout exposes all browser SDKs and the existing app feature extractor", () => {
  expect(meeting.SAMPLE_RATE).toBe(16000);
  expect(voiceprint.SAMPLE_RATE).toBe(meeting.SAMPLE_RATE);
  expect(typeof meeting.createLiveTranscriber).toBe("function");
  expect(typeof meeting.transcribeMeeting).toBe("function");
  expect(typeof voiceprint.createVoiceprintExtractor).toBe("function");
  expect(typeof voiceprint.createVoiceprintWorkerClient).toBe("function");
  expect(typeof glossary.rankGlossary).toBe("function");
  expect(typeof glossary.withGlossaryPrompt).toBe("function");
  expect(typeof recordings.parseNativeManifest).toBe("function");
  expect(typeof recordings.nativeWordIndex).toBe("function");
  expect(legacyFbank).toBe(computeFbank);
});

test("all four source entrypoints still bundle for a browser consumer", async () => {
  for (const name of [
    "meeting-transcript",
    "voiceprint-web",
    "transcript-glossary",
    "private-word-audio",
  ]) {
    const result = await Bun.build({
      entrypoints: [new URL(`../packages/${name}/src/index.ts`, import.meta.url).pathname],
      target: "browser",
      format: "esm",
      write: false,
      // The host supplies its verified, explicitly configured ORT/WASM assets.
      external: ["onnxruntime-web/wasm"],
    });
    expect(result.success).toBe(true);
    expect(result.outputs.length).toBeGreaterThan(0);
  }
});
