/** Account authentication, atomic daily limits and usage settlement live in the
 * account service. This narrow proxy never runs anonymous or unmetered AI. */
const ACCOUNT_ENDPOINT = "https://lianki.com/api/mic/polish";
const MAX_BYTES = 32 * 1024;
const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const error = (name: string, status: number) => Response.json({ error: name }, { status, headers });

async function boundedBody(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length")) > MAX_BYTES) return null;
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
  if (body === null) return error("too-large", 413);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return error("bad-request", 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return error("bad-request", 400);
  const input = data as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => key !== "transcript" && key !== "context") ||
    typeof input.transcript !== "string" ||
    !input.transcript.trim() ||
    input.transcript.length > 8000 ||
    (input.context != null && (typeof input.context !== "object" || Array.isArray(input.context)))
  )
    return error("bad-request", 400);
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
  if (upstream.status === 429) {
    const result = (await upstream.json().catch(() => null)) as { error?: unknown } | null;
    return error(result?.error === "daily-limit" ? "daily-limit" : "rate", 429);
  }
  if (!upstream.ok) return error("unavailable", 503);
  const result = (await upstream.json().catch(() => null)) as {
    text?: unknown;
    charged?: unknown;
    daily?: { used?: unknown; max?: unknown };
  } | null;
  const count = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  if (
    typeof result?.text !== "string" ||
    !result.text.trim() ||
    result.text.length > Math.max(4096, input.transcript.length * 3) ||
    !count(result.charged) ||
    !count(result.daily?.used) ||
    !count(result.daily?.max)
  )
    return error("unavailable", 503);
  return Response.json(
    {
      text: result.text,
      charged: result.charged,
      daily: { used: result.daily!.used, max: result.daily!.max },
    },
    { headers },
  );
}
