import type { TtsProvider } from "../types";

export class SpeechSynthesisTtsProvider implements TtsProvider {
  readonly id = "speechsynthesis";
  readonly name = "Browser SpeechSynthesis";
  isAvailable(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }
  async synthesize(text: string): Promise<{ played: true }> {
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
    await new Promise<void>((res) => { u.onend = () => res(); u.onerror = () => res(); });
    return { played: true };
  }
}
