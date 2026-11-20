import type { MicConfig } from "./config";
import type { SiteContext } from "./context";

export const MIC_POLISH_URL = "https://otoji.org/signal/mic/polish";
export interface MicPolishBilling {
  charged: number;
  basis: "reported" | "estimated";
  daily: { used: number; max: number };
}
export type MicPolisher = (
  text: string,
  config: MicConfig["polish"],
  context: SiteContext | null,
  signal?: AbortSignal,
  onBilling?: (billing: MicPolishBilling) => void,
) => Promise<string>;
const MAX_CONTEXT_JSON_CHARS = 2000;
const MAX_BODY_BYTES = 32 * 1024;

/** The account API caps the whole JSON context, including keys and escapes. */
export function fitMicPolishContext(context: SiteContext | null): SiteContext | null {
  if (!context) return null;
  const out: SiteContext = { site: context.site, title: "" };
  const fit = (value: string, assign: (text: string) => void) => {
    const points = Array.from(value);
    let low = 0,
      high = Math.min(points.length, MAX_CONTEXT_JSON_CHARS);
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      assign(points.slice(0, mid).join(""));
      if (JSON.stringify(out).length <= MAX_CONTEXT_JSON_CHARS) low = mid;
      else high = mid - 1;
    }
    assign(points.slice(0, low).join(""));
  };
  fit(context.title, (text) => {
    out.title = text;
  });
  for (const key of ["selection", "nearEditor"] as const) {
    if (context[key]) {
      fit(context[key], (text) => {
        if (text) out[key] = text;
        else delete out[key];
      });
    }
  }
  for (const message of context.messages?.slice(0, 8) ?? []) {
    const earlier = out.messages ?? [];
    fit(message, (text) => {
      if (text) out.messages = [...earlier, text];
      else if (earlier.length) out.messages = earlier;
      else delete out.messages;
    });
  }
  return out;
}

export class MicPolishError extends Error {
  constructor(
    public readonly code:
      | "credits"
      | "daily-limit"
      | "rate-limit"
      | "disabled"
      | "model-failed"
      | "too-long"
      | "auth"
      | "unavailable",
  ) {
    super(
      code === "credits"
        ? "Not enough account credits; keeping the recognized text."
        : code === "daily-limit"
          ? "Daily polishing limit reached; keeping the recognized text."
          : code === "rate-limit"
            ? "Polishing rate limit reached; keeping the recognized text."
            : code === "disabled"
              ? "Account polishing is not enabled yet; keeping the recognized text."
              : code === "model-failed"
                ? "Polishing failed and was refunded; keeping the recognized text."
                : code === "too-long"
                  ? "Text is too long for polishing; keeping the recognized text."
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
  onBilling?: (billing: MicPolishBilling) => void,
): Promise<string> {
  if (!config.enabled) return text;
  if (!/^lk_[0-9a-f]{64}$/.test(config.accountToken)) throw new MicPolishError("auth");
  if (text.length > 8000) throw new MicPolishError("too-long");
  let input = {
    transcript: text,
    context: config.useSiteContext ? fitMicPolishContext(context) : null,
  };
  let body = JSON.stringify(input);
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES && input.context) {
    input = { ...input, context: null };
    body = JSON.stringify(input);
  }
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
    throw new MicPolishError("too-long");
  let response: Response;
  try {
    response = await request(MIC_POLISH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${config.accountToken}`,
      },
      body,
      signal,
    });
  } catch {
    throw new MicPolishError("unavailable");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new MicPolishError("auth");
    if (response.status === 402) throw new MicPolishError("credits");
    if (response.status === 404) throw new MicPolishError("disabled");
    if (response.status === 429) {
      const data = await response.json().catch(() => null);
      if (data?.error === "daily-limit") throw new MicPolishError("daily-limit");
      if (data?.error === "rate-limit") throw new MicPolishError("rate-limit");
    }
    if (response.status === 502) {
      const data = await response.json().catch(() => null);
      if (data?.error === "model-failed") throw new MicPolishError("model-failed");
    }
    throw new MicPolishError("unavailable");
  }
  const data = await response.json().catch(() => null);
  const output = data?.text;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (
    typeof output !== "string" ||
    !output.trim() ||
    output.length > Math.max(4096, text.length * 3) ||
    !count(data?.charged) ||
    !count(data?.daily?.used) ||
    !count(data?.daily?.max) ||
    (data?.basis !== "reported" && data?.basis !== "estimated")
  )
    throw new MicPolishError("unavailable");
  onBilling?.({
    charged: data.charged,
    basis: data.basis,
    daily: { used: data.daily.used, max: data.daily.max },
  });
  return output.trim();
}
