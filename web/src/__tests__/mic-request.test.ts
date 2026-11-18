import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerRequest, type WorkerGmRequestDetails } from "../../mic/request";

const WORKER = "https://otoji.org/signal/mic/polish";
const token = `lk_${"a".repeat(64)}`;
function options(signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: '{"transcript":"private text"}',
    signal,
  };
}
function transport() {
  let details!: WorkerGmRequestDetails;
  const abort = vi.fn();
  const gm = vi.fn((value: WorkerGmRequestDetails) => {
    details = value;
    return { abort };
  });
  return { request: createWorkerRequest(gm), gm, abort, details: () => details };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("isolated Worker AI request transport", () => {
  it("uses the anonymous GM transport and maps status and text to a Response", async () => {
    const value = transport();
    const pending = value.request(new URL(WORKER), options());
    const details = value.details();
    expect(details).toMatchObject({
      method: "POST",
      url: WORKER,
      anonymous: true,
      responseType: "text",
      redirect: "error",
      timeout: 15000,
    });
    expect(details.headers).toEqual({
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    });
    expect(details.data).toBe('{"transcript":"private text"}');
    expect(details.url).not.toMatch(/private-test-key|private text/);
    details.onload({ status: 201, statusText: "Created", responseText: '{"ok":true}' });
    const response = await pending;
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(await response.json()).toEqual({ ok: true });
    expect(value.abort).not.toHaveBeenCalled();
  });

  it.each([
    "https://api.deepseek.com/chat/completions",
    "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    "http://otoji.org/signal/mic/polish",
    "https://otoji.org.evil.example/signal/mic/polish",
    "https://otoji.org:444/signal/mic/polish",
    "https://user:secret@otoji.org/signal/mic/polish",
    `${WORKER}?key=secret`, `${WORKER}?`, `${WORKER}#fragment`, `${WORKER}#`,
    "https://otoji.org/other", "https://lianki.com/api/mic/polish",
  ])("rejects an unapproved URL without making a request: %s", async (url) => {
    const value = transport();
    await expect(value.request(url, options())).rejects.toThrow(
      /^Worker AI request is not allowed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it.each([
    { method: "GET" },
    { body: undefined },
    { body: new URLSearchParams("x=1") },
    { credentials: "include" },
    {
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer key",
        Cookie: "private",
      },
    },
    { headers: { "content-type": "text/plain", Authorization: "Bearer key" } },
    { headers: { "content-type": "application/json" } },
    { headers: { "content-type": "application/json", "x-goog-api-key": "cross-provider" } },
  ] as RequestInit[])("rejects unsupported method/body/credentials/headers %j", async (patch) => {
    const value = transport();
    await expect(value.request(WORKER, { ...options(), ...patch })).rejects.toThrow(
      /^Worker AI request is not allowed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("rejects Request objects instead of inheriting uncontrolled request options", async () => {
    const value = transport();
    await expect(value.request(new Request(WORKER, options()))).rejects.toThrow(
      /^Worker AI request is not allowed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("preserves non-success HTTP statuses without converting private bodies into errors", async () => {
    const value = transport();
    const pending = value.request(WORKER, options());
    value
      .details()
      .onload({
        status: 429,
        statusText: "Too Many Requests",
        responseText: "private provider error",
      });
    const response = await pending;
    expect(response.ok).toBe(false);
    expect(response.status).toBe(429);
  });

  it.each(["onerror", "ontimeout", "onabort"] as const)(
    "masks %s payloads and cancels the underlying request",
    async (callback) => {
      const value = transport();
      const pending = value.request(WORKER, options());
      value.details()[callback]({ responseText: "private text", error: "private-test-key" });
      await expect(pending).rejects.toThrow(/^Worker AI request failed\.$/);
      expect(value.abort).toHaveBeenCalledTimes(1);
    },
  );

  it("does not initiate a request for an already-aborted signal", async () => {
    const value = transport();
    const controller = new AbortController();
    controller.abort();
    await expect(value.request(WORKER, options(controller.signal))).rejects.toThrow(
      /^Worker AI request failed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("aborts an active GM request and ignores late callbacks", async () => {
    const value = transport();
    const controller = new AbortController();
    const pending = value.request(WORKER, options(controller.signal));
    controller.abort();
    await expect(pending).rejects.toThrow(/^Worker AI request failed\.$/);
    value.details().onload({ status: 200, responseText: "late" });
    value.details().onerror("late failure");
    expect(value.abort).toHaveBeenCalledTimes(1);
  });

  it("enforces a fifteen-second fallback timeout and removes the abort listener", async () => {
    vi.useFakeTimers();
    const value = transport();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = value.request(WORKER, options(controller.signal));
    const rejected = expect(pending).rejects.toThrow(/^Worker AI request failed\.$/);
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
    expect(value.abort).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans timers and listeners after successful completion", async () => {
    vi.useFakeTimers();
    const value = transport();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = value.request(WORKER, options(controller.signal));
    value.details().onload({ status: 204, responseText: "" });
    expect((await pending).status).toBe(204);
    controller.abort();
    await vi.advanceTimersByTimeAsync(15000);
    expect(value.abort).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("cancels a handle returned after a synchronous abort", async () => {
    const controller = new AbortController();
    const abort = vi.fn();
    const request = createWorkerRequest(() => {
      controller.abort();
      return { abort };
    });
    await expect(request(WORKER, options(controller.signal))).rejects.toThrow(
      /^Worker AI request failed\.$/,
    );
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("masks synchronous manager errors and malformed HTTP responses", async () => {
    const request = createWorkerRequest(() => {
      throw new Error("manager leaked private-test-key");
    });
    await expect(request(WORKER, options())).rejects.toThrow(/^Worker AI request failed\.$/);
    const value = transport();
    const pending = value.request(WORKER, options());
    value.details().onload({ status: 0, responseText: "private invalid result" });
    await expect(pending).rejects.toThrow(/^Worker AI request failed\.$/);
  });
});
