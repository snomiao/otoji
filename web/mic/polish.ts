import type { MicConfig } from "./config";
import type { SiteContext } from "./context";

export const MIC_POLISH_URL = "https://otoji.org/signal/mic/polish";

export class MicPolishError extends Error {
  constructor(public readonly code: "credits" | "daily-limit" | "auth" | "unavailable") {
    super(
      code === "credits"
        ? "Not enough account credits; keeping the recognized text."
        : code === "daily-limit"
          ? "Daily polishing limit reached; keeping the recognized text."
          : code === "auth"
            ? "Check your account token and microphone permission; keeping the recognized text."
            : "Polishing unavailable; keeping the recognized text.",
    );
  }
}

/** Only opted-in text goes to the account-billed Otoji Worker endpoint. */
export async function polishText(
  text: string,
  config: MicConfig["polish"],
  context: SiteContext | null,
  signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!config.enabled) return text;
  if (!/^lk_[0-9a-f]{64}$/.test(config.accountToken)) throw new MicPolishError("auth");
  let response: Response;
  try {
    response = await request(MIC_POLISH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${config.accountToken}`,
      },
      body: JSON.stringify({ transcript: text, context: config.useSiteContext ? context : null }),
      signal,
    });
  } catch {
    throw new MicPolishError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new MicPolishError("auth");
    if (response.status === 402) throw new MicPolishError("credits");
    if (response.status === 429) {
      const data = await response.json().catch(() => null);
      if (data?.error === "daily-limit") throw new MicPolishError("daily-limit");
    }
    throw new MicPolishError("unavailable");
  }
  const data = await response.json().catch(() => null);
  const output = data?.text;
  if (
    typeof output !== "string" ||
    !output.trim() ||
    output.length > Math.max(4096, text.length * 3)
  )
    throw new MicPolishError("unavailable");
  return output.trim();
}
