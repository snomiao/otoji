/** Account authentication, atomic daily limits and usage settlement live in the
 * account service. This narrow proxy never runs anonymous or unmetered AI. */
const ACCOUNT_ENDPOINT = "https://lianki.com/api/mic/polish";
const MAX_BYTES = 32 * 1024;
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const error = (
  name: string,
  status: number,
  extra: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
) => Response.json({ error: name, ...extra }, { status, headers: { ...headers, ...extraHeaders } });
const count = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const dailyOf = (value: unknown): { used: number; max: number } | null => {
  const daily = value as { used?: unknown; max?: unknown } | null;
  return count(daily?.used) && count(daily?.max) ? { used: daily.used, max: daily.max } : null;
};

async function boundedBody(req: Request): Promise<string | null> {
  const length = req.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) return null;
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(all);
}

export async function handleMicPolish(
  req: Request,
  request: typeof fetch = fetch,
): Promise<Response> {
  if (req.method !== "POST") return error("method", 405);
  const url = new URL(req.url);
  if (url.search || url.hash) return error("bad-request", 400);
  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer lk_[0-9a-f]{64}$/.test(authorization)) return error("auth", 401);
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return error("content-type", 415);
  let body: string | null;
  try {
    body = await boundedBody(req);
  } catch {
    return error("bad-request", 400);
  }
  if (body === null) return error("too-long", 400, { field: "body" });
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return error("bad-request", 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return error("bad-request", 400);
  const input = data as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "transcript" && key !== "context"))
    return error("unknown-field", 400);
  if (
    typeof input.transcript !== "string" ||
    !input.transcript.trim() ||
    (input.context != null && (typeof input.context !== "object" || Array.isArray(input.context)))
  )
    return error("bad-request", 400);
  if (input.transcript.trim().length > 8000) return error("too-long", 400, { field: "transcript" });
  if (input.context != null && JSON.stringify(input.context).length > 2000)
    return error("too-long", 400, { field: "context" });
  let upstream: Response;
  try {
    upstream = await request(ACCOUNT_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ transcript: input.transcript, context: input.context ?? null }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return error("unavailable", 503);
  }
  // Do not copy cookies, cache headers, redirects, account identifiers or raw
  // exceptions back to arbitrary sites. Only this endpoint's public contract.
  if (upstream.status === 401 || upstream.status === 403) return error("auth", upstream.status);
  if (upstream.status === 402) return error("no-credits", 402);
  if (upstream.status === 404) return error("not-found", 404);
  if (upstream.status === 429) {
    const result = (await upstream.json().catch(() => null)) as {
      error?: unknown;
      daily?: unknown;
      resetAt?: unknown;
    } | null;
    if (result?.error === "daily-limit") {
      const daily = dailyOf(result.daily);
      const resetAt =
        typeof result.resetAt === "string" &&
        /^\d{4}-\d\d-\d\dT00:00:00\.000Z$/.test(result.resetAt) &&
        Number.isFinite(Date.parse(result.resetAt))
          ? result.resetAt
          : null;
      return error("daily-limit", 429, {
        ...(daily ? { daily } : {}),
        ...(resetAt ? { resetAt } : {}),
      });
    }
    const retry = upstream.headers.get("retry-after") ?? "";
    return error(
      "rate-limit",
      429,
      {},
      /^\d{1,5}$/.test(retry) && Number(retry) > 0 && Number(retry) <= 86400
        ? { "Retry-After": retry }
        : {},
    );
  }
  if (upstream.status === 502) {
    const result = (await upstream.json().catch(() => null)) as { error?: unknown } | null;
    return result?.error === "model-failed"
      ? error("model-failed", 502)
      : error("unavailable", 503);
  }
  if (!upstream.ok) return error("unavailable", 503);
  const result = (await upstream.json().catch(() => null)) as {
    text?: unknown;
    charged?: unknown;
    basis?: unknown;
    daily?: { used?: unknown; max?: unknown };
  } | null;
  if (
    typeof result?.text !== "string" ||
    !result.text.trim() ||
    result.text.length > Math.max(4096, input.transcript.length * 3) ||
    !count(result.charged) ||
    (result.basis !== "reported" && result.basis !== "estimated") ||
    !count(result.daily?.used) ||
    !count(result.daily?.max)
  )
    return error("unavailable", 503);
  return Response.json(
    {
      text: result.text,
      charged: result.charged,
      basis: result.basis,
      daily: { used: result.daily!.used, max: result.daily!.max },
    },
    { headers },
  );
}
