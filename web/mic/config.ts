export type RecognitionMode = "device" | "webrtc" | "server";
export type WidgetMode = "dictation";

/** Private userscript configuration. Never attach this object to the page window. */
export interface MicConfig {
  version: 1;
  recognition: {
    mode: RecognitionMode;
    language: string;
    peerId: string;
    room: string;
    modelId: string;
    remoteAudioConsent: boolean;
    signalingUrl: string;
    serverUrl: string;
  };
  voiceprint: {
    enabled: boolean;
    device: string;
    threshold: number;
    profiles: { id: string; label: string; createdAt: number; sampleCount: number }[];
  };
  polish: {
    enabled: boolean;
    accountToken: string;
    useSiteContext: boolean;
  };
  sites: Record<string, { contextEnabled: boolean }>;
  widget: { x: number; y: number; mode: WidgetMode; enabled: boolean };
}

export type MicConfigPatch = {
  [K in keyof Omit<MicConfig, "version">]?: Partial<MicConfig[K]>;
};

export function defaultMicConfig(): MicConfig {
  return {
    version: 1,
    recognition: {
      mode: "device",
      language: "",
      peerId: "",
      room: "",
      modelId: "",
      remoteAudioConsent: false,
      signalingUrl: "https://otoji.org/signal",
      serverUrl: "",
    },
    voiceprint: { enabled: false, device: "", threshold: 0.75, profiles: [] },
    polish: { enabled: false, accountToken: "", useSiteContext: false },
    sites: {},
    widget: { x: 24, y: 24, mode: "dictation", enabled: false },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown, fallback = "", limit = 4096): string {
  return typeof value === "string" && value.length <= limit ? value : fallback;
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function endpoint(value: unknown): string {
  const text = string(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const allowed = ["wss:", "https:"];
    if (local) allowed.push("http:", "ws:");
    return allowed.includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

/** Whitelist every field so malformed data and unknown page-provided keys cannot survive a load. */
export function normalizeMicConfig(value: unknown): MicConfig {
  const defaults = defaultMicConfig();
  const input = record(value);
  if (input.version !== undefined && input.version !== 1) return defaults;
  const recognition = record(input.recognition);
  const voiceprint = record(input.voiceprint);
  const polish = record(input.polish);
  const widget = record(input.widget);
  const sites: MicConfig["sites"] = {};
  for (const [origin, setting] of Object.entries(record(input.sites)).slice(0, 1000)) {
    try {
      const url = new URL(origin);
      if (["https:", "http:"].includes(url.protocol) && url.origin === origin) {
        sites[origin] = { contextEnabled: record(setting).contextEnabled === true };
      }
    } catch {
      /* Ignore invalid origins. */
    }
  }
  const profiles = Array.isArray(voiceprint.profiles) ? voiceprint.profiles : [];
  return {
    version: 1,
    recognition: {
      mode:
        recognition.mode === "webrtc" || recognition.mode === "server"
          ? recognition.mode
          : "device",
      language: string(recognition.language, "", 100),
      peerId: string(recognition.peerId, "", 512),
      room: string(recognition.room, "", 512),
      modelId: string(recognition.modelId, "", 512),
      remoteAudioConsent: recognition.remoteAudioConsent === true,
      signalingUrl:
        recognition.signalingUrl === undefined
          ? defaults.recognition.signalingUrl
          : endpoint(recognition.signalingUrl),
      serverUrl: endpoint(recognition.serverUrl),
    },
    voiceprint: {
      enabled: voiceprint.enabled === true,
      device: string(voiceprint.device, "", 64),
      threshold: number(voiceprint.threshold, defaults.voiceprint.threshold, 0, 1),
      profiles: profiles.slice(0, 100).flatMap((raw) => {
        const profile = record(raw);
        const id = string(profile.id, "", 200);
        if (!id) return [];
        return [
          {
            id,
            label: string(profile.label, "", 200),
            createdAt: number(profile.createdAt, 0, 0, Number.MAX_SAFE_INTEGER),
            sampleCount: Math.floor(number(profile.sampleCount, 0, 0, 100_000)),
          },
        ];
      }),
    },
    polish: {
      // Legacy direct-provider consent never enables account-billed Worker AI.
      enabled: polish.enabled === true && !("provider" in polish),
      accountToken: string(polish.accountToken),
      useSiteContext: polish.useSiteContext === true,
    },
    sites,
    widget: {
      x: number(widget.x, defaults.widget.x, 0, 100_000),
      y: number(widget.y, defaults.widget.y, 0, 100_000),
      mode: "dictation",
      enabled: widget.enabled === true,
    },
  };
}

export function patchMicConfig(config: MicConfig, patch: MicConfigPatch): MicConfig {
  return normalizeMicConfig({
    ...config,
    recognition: { ...config.recognition, ...patch.recognition },
    voiceprint: { ...config.voiceprint, ...patch.voiceprint },
    polish: { ...config.polish, ...patch.polish },
    sites: { ...config.sites, ...patch.sites },
    widget: { ...config.widget, ...patch.widget },
  });
}
