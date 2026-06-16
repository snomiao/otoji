import type { SttProvider, SttSegment, SttSession } from "../types";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

export class WebSpeechSttProvider implements SttProvider {
  readonly id = "webspeech";
  readonly name = "Browser Web Speech API";
  isAvailable(): boolean {
    if (typeof window === "undefined") return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  async start(onSegment: (s: SttSegment) => void, onError?: (e: Error) => void): Promise<SttSession> {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        onSegment({ text: r[0].transcript, final: r.isFinal });
      }
    };
    rec.onerror = (e: any) => onError?.(new Error(e.error ?? "webspeech error"));
    rec.start();
    return {
      sendAudio() { /* not used; webspeech captures mic itself */ },
      async stop() { rec.stop(); },
    };
  }
}
