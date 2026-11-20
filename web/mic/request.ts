/** Inject these functions from the isolated userscript world, never the page window. */
export interface WorkerGmResponse {
  status: number;
  statusText?: string;
  responseText: string;
}

export interface WorkerGmRequestDetails {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  data: string;
  anonymous: true;
  responseType: "text";
  redirect: "error";
  timeout: number;
  onload(response: WorkerGmResponse): void;
  onerror(error?: unknown): void;
  ontimeout(error?: unknown): void;
  onabort(error?: unknown): void;
}

export type WorkerGmRequest = (details: WorkerGmRequestDetails) => { abort(): void };

const TIMEOUT_MS = 15_000;
const failed = () => new Error("Worker AI request failed.");

function validate(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input !== "string" && !(input instanceof URL))
    throw new Error("Worker AI request is not allowed.");
  const url = new URL(input.toString());
  const worker = url.origin === "https://otoji.org" && url.pathname === "/signal/mic/polish";
  if (
    !worker ||
    url.username ||
    url.password ||
    url.href.includes("?") ||
    url.href.includes("#") ||
    init?.method?.toUpperCase() !== "POST" ||
    typeof init.body !== "string" ||
    (init.credentials !== undefined && init.credentials !== "omit")
  )
    throw new Error("Worker AI request is not allowed.");
  const source = new Headers(init.headers);
  const auth = "authorization";
  const allowed = new Set(["content-type", auth]);
  for (const [name] of source)
    if (!allowed.has(name)) throw new Error("Worker AI request is not allowed.");
  const credential = source.get(auth) ?? "";
  if (
    source.get("content-type")?.toLowerCase() !== "application/json" ||
    credential.length > 4096 ||
    !/^Bearer lk_[0-9a-f]{64}$/.test(credential)
  )
    throw new Error("Worker AI request is not allowed.");
  return {
    url: url.href,
    data: init.body,
    headers: { "content-type": "application/json", [auth]: credential },
  };
}

/** Narrow fetch-compatible transport: account credentials bypass page fetch, CORS, and service workers. */
export function createWorkerRequest(gmRequest: WorkerGmRequest): typeof fetch {
  return async (input, init) => {
    let request: ReturnType<typeof validate>;
    try {
      request = validate(input, init);
    } catch {
      throw new Error("Worker AI request is not allowed.");
    }
    const signal = init?.signal;
    if (signal?.aborted) throw failed();
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      let handle: ReturnType<WorkerGmRequest> | undefined;
      let abortPending = false;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      };
      const abort = () => {
        abortPending = true;
        try {
          handle?.abort();
        } catch {
          /* A failed abort must not expose manager exception details. */
        }
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        abort();
        reject(failed());
      };
      const timer = setTimeout(cancel, TIMEOUT_MS);
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        handle = gmRequest({
          ...request,
          method: "POST",
          anonymous: true,
          responseType: "text",
          redirect: "error",
          timeout: TIMEOUT_MS,
          onload(response) {
            if (settled) return;
            let result: Response;
            try {
              if (typeof response.responseText !== "string") throw failed();
              result = new Response(
                [204, 205, 304].includes(response.status) ? null : response.responseText,
                { status: response.status, statusText: response.statusText ?? "" },
              );
            } catch {
              cancel();
              return;
            }
            settled = true;
            cleanup();
            resolve(result);
          },
          onerror: cancel,
          ontimeout: cancel,
          onabort: cancel,
        });
        // A synchronous GM callback or abort may run before its handle is returned.
        if (abortPending) abort();
      } catch {
        cancel();
      }
    });
  };
}
