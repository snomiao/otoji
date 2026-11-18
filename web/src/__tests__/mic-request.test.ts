import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderRequest, type ProviderGmRequestDetails } from "../../mic/request";

const DEEPSEEK = "https://api.deepseek.com/chat/completions";
const GEMINI =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent";
function options(signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer private-test-key" },
    body: '{"transcript":"private text"}',
    signal,
  };
}
function transport() {
  let details!: ProviderGmRequestDetails;
  const abort = vi.fn();
  const gm = vi.fn((value: ProviderGmRequestDetails) => {
    details = value;
    return { abort };
  });
  return { request: createProviderRequest(gm), gm, abort, details: () => details };
}
afterEach(() => {
  vi.useRealTimers();
});

describe("isolated provider request transport", () => {
  it("uses the anonymous GM transport and maps status and text to a Response", async () => {
    const value = transport();
    const pending = value.request(new URL(DEEPSEEK), options());
    const details = value.details();
    expect(details).toMatchObject({
      method: "POST",
      url: DEEPSEEK,
      anonymous: true,
      responseType: "text",
      redirect: "error",
      timeout: 15000,
    });
    expect(details.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer private-test-key",
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

  it("allows the Gemini endpoint only with its provider-specific key header", async () => {
    const value = transport();
    const pending = value.request(GEMINI, {
      ...options(),
      headers: new Headers({
        "content-type": "application/json",
        "x-goog-api-key": "private-google-key",
      }),
    });
    expect(value.details().headers).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": "private-google-key",
    });
    value.details().onload({ status: 200, responseText: "text" });
    expect(await (await pending).text()).toBe("text");
  });

  it.each([
    "http://api.deepseek.com/chat/completions",
    "https://evil.example/chat/completions",
    "https://api.deepseek.com.evil.example/chat/completions",
    "https://api.deepseek.com:444/chat/completions",
    "https://user:private-test-key@api.deepseek.com/chat/completions",
    `${DEEPSEEK}?key=private-test-key`,
    `${DEEPSEEK}?`,
    `${DEEPSEEK}#fragment`,
    `${DEEPSEEK}#`,
    "https://api.deepseek.com/other",
    "https://generativelanguage.googleapis.com/v1beta/models/other/path:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/model%2Fevil:generateContent",
    "https://generativelanguage.googleapis.com/v1beta/models/model:otherMethod",
  ])("rejects an unapproved URL without making a request: %s", async (url) => {
    const value = transport();
    await expect(value.request(url, options())).rejects.toThrow(
      /^Provider request is not allowed\.$/,
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
    await expect(value.request(DEEPSEEK, { ...options(), ...patch })).rejects.toThrow(
      /^Provider request is not allowed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("rejects Request objects instead of inheriting uncontrolled request options", async () => {
    const value = transport();
    await expect(value.request(new Request(DEEPSEEK, options()))).rejects.toThrow(
      /^Provider request is not allowed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("preserves non-success HTTP statuses without converting private bodies into errors", async () => {
    const value = transport();
    const pending = value.request(DEEPSEEK, options());
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
      const pending = value.request(DEEPSEEK, options());
      value.details()[callback]({ responseText: "private text", error: "private-test-key" });
      await expect(pending).rejects.toThrow(/^Provider request failed\.$/);
      expect(value.abort).toHaveBeenCalledTimes(1);
    },
  );

  it("does not initiate a request for an already-aborted signal", async () => {
    const value = transport();
    const controller = new AbortController();
    controller.abort();
    await expect(value.request(DEEPSEEK, options(controller.signal))).rejects.toThrow(
      /^Provider request failed\.$/,
    );
    expect(value.gm).not.toHaveBeenCalled();
  });

  it("aborts an active GM request and ignores late callbacks", async () => {
    const value = transport();
    const controller = new AbortController();
    const pending = value.request(DEEPSEEK, options(controller.signal));
    controller.abort();
    await expect(pending).rejects.toThrow(/^Provider request failed\.$/);
    value.details().onload({ status: 200, responseText: "late" });
    value.details().onerror("late failure");
    expect(value.abort).toHaveBeenCalledTimes(1);
  });

  it("enforces a fifteen-second fallback timeout and removes the abort listener", async () => {
    vi.useFakeTimers();
    const value = transport();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = value.request(DEEPSEEK, options(controller.signal));
    const rejected = expect(pending).rejects.toThrow(/^Provider request failed\.$/);
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
    const pending = value.request(DEEPSEEK, options(controller.signal));
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
    const request = createProviderRequest(() => {
      controller.abort();
      return { abort };
    });
    await expect(request(DEEPSEEK, options(controller.signal))).rejects.toThrow(
      /^Provider request failed\.$/,
    );
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it("masks synchronous manager errors and malformed HTTP responses", async () => {
    const request = createProviderRequest(() => {
      throw new Error("manager leaked private-test-key");
    });
    await expect(request(DEEPSEEK, options())).rejects.toThrow(/^Provider request failed\.$/);
    const value = transport();
    const pending = value.request(DEEPSEEK, options());
    value.details().onload({ status: 0, responseText: "private invalid result" });
    await expect(pending).rejects.toThrow(/^Provider request failed\.$/);
  });
});
