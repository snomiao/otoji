import {
  createLiveTranscriber,
  transcribeMeeting,
  type PcmFrame,
  type Transcribe,
  type MeetingLine,
} from "../dist/index";
export async function consume(
  frames: AsyncIterable<PcmFrame>,
  transcribe: Transcribe,
  signal: AbortSignal,
) {
  const stable: MeetingLine[] = [];
  const live = createLiveTranscriber({
    transcribe,
    onDraft: () => {},
    onStable: (lines) => stable.push(...lines),
  });
  for await (const frame of frames) await live.push(frame);
  await live.flush();
  live.close();
  for await (const line of transcribeMeeting(frames, { transcribe }, signal)) stable.push(line);
  return stable;
}
