import { describe, expect, it, vi } from "vitest";
import type { MicConfig } from "../../mic/config";
import { fitMicPolishContext, MIC_POLISH_URL, MicPolishError, polishText } from "../../mic/polish";

const token = `lk_${"a".repeat(64)}`;
const config = (patch: Partial<MicConfig["polish"]> = {}): MicConfig["polish"] => ({
  enabled: true,
  accountToken: token,
  useSiteContext: false,
  ...patch,
});
const context = { site: "github" as const, title: "Visible issue", messages: ["Relevant context"] };
const requestFor = (data: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify(
        data && typeof data === "object"
          ? { charged: 1, basis: "reported", daily: { used: 1, max: 300 }, ...data }
          : data,
      ),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    ),
  );

describe("account-billed Worker AI polishing", () => {
  it("makes no request when disabled and requires an account token when enabled", async () => {
    const request = vi.fn<typeof fetch>();
    expect(
      await polishText(
        " raw ",
        config({ enabled: false, accountToken: "" }),
        context,
        undefined,
        request,
      ),
    ).toBe(" raw ");
    await expect(
      polishText("raw", config({ accountToken: "provider-key" }), null, undefined, request),
    ).rejects.toMatchObject({ code: "auth" });
    expect(request).not.toHaveBeenCalled();
  });
  it("only sends transcript/context to otoji.org, with an account token in the header", async () => {
    const request = requestFor({ text: " clean ", charged: 1 });
    const signal = new AbortController().signal;
    expect(await polishText("raw", config(), context, signal, request)).toBe("clean");
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(MIC_POLISH_URL);
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({ transcript: "raw", context: null });
    expect(String(init?.body)).not.toMatch(/model|price|userId|apiKey/);
  });
  it("only includes page context with an explicit opt-in", async () => {
    const request = requestFor({ text: "clean" });
    await polishText("raw", config({ useSiteContext: true }), context, undefined, request);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).context).toEqual(context);
  });
  it.each(["reported", "estimated"] as const)(
    "delivers validated %s billing metadata to the private UI",
    async (basis) => {
      const billing = vi.fn();
      await polishText(
        "raw",
        config(),
        null,
        undefined,
        requestFor({ text: "clean", basis, charged: 2, daily: { used: 4, max: 300 } }),
        billing,
      );
      expect(billing).toHaveBeenCalledWith({ charged: 2, basis, daily: { used: 4, max: 300 } });
    },
  );
  it.each([
    { basis: undefined },
    { basis: "unknown" },
    { charged: -1 },
    { daily: { used: "private", max: 300 } },
  ])("rejects incomplete billing metadata without notifying the UI", async (invalid) => {
    const billing = vi.fn();
    await expect(
      polishText(
        "raw",
        config(),
        null,
        undefined,
        requestFor({ text: "clean", ...invalid }),
        billing,
      ),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(billing).not.toHaveBeenCalled();
  });
  it("fits the complete context JSON, including escaped characters and Unicode", async () => {
    for (const value of ['"\\\n'.repeat(900), "😀".repeat(1200)]) {
      const large = { ...context, title: value, selection: value, messages: [value, value] };
      const fitted = fitMicPolishContext(large)!;
      expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(2000);
      expect(value.startsWith(fitted.title)).toBe(true);
      const request = requestFor({ text: "clean" });
      await polishText("raw", config({ useSiteContext: true }), large, undefined, request);
      expect(
        JSON.stringify(JSON.parse(String(request.mock.calls[0][1]?.body)).context).length,
      ).toBeLessThanOrEqual(2000);
    }
  });
  it("keeps an 8000-character CJK transcript intact within the UTF-8 body cap", async () => {
    const text = "字".repeat(8000);
    const request = requestFor({ text });
    expect(await polishText(text, config(), null, undefined, request)).toBe(text);
    const body = String(request.mock.calls[0][1]?.body);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32768);
    expect(JSON.parse(body).transcript).toBe(text);
  });
  it("drops optional context before refusing an oversized body, never truncating dictated text", async () => {
    const text = "\u0000".repeat(5400);
    const request = requestFor({ text: "clean" });
    await polishText(
      text,
      config({ useSiteContext: true }),
      { ...context, title: "x".repeat(1800) },
      undefined,
      request,
    );
    const body = String(request.mock.calls[0][1]?.body);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32768);
    expect(JSON.parse(body)).toEqual({ transcript: text, context: null });
    request.mockClear();
    for (const large of ["x".repeat(8001), "\u0000".repeat(8000)]) {
      await expect(polishText(large, config(), null, undefined, request)).rejects.toMatchObject({
        code: "too-long",
      });
    }
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    [401, {}, "auth"],
    [403, {}, "auth"],
    [402, {}, "credits"],
    [429, { error: "daily-limit" }, "daily-limit"],
    [429, { error: "rate" }, "unavailable"],
    [429, { error: "rate-limit" }, "rate-limit"],
    [404, { error: "not-found" }, "disabled"],
    [502, { error: "model-failed" }, "model-failed"],
    [500, { error: "private upstream details" }, "unavailable"],
  ] as const)("reports bounded actionable failure for status %s", async (status, data, code) => {
    const result = polishText("raw", config(), null, undefined, requestFor(data, status));
    await expect(result).rejects.toMatchObject({ code });
    await expect(result).rejects.toThrow(/keeping the recognized text/);
  });
  it.each([null, {}, { text: 2 }, { text: "" }, { text: " " }, { text: "x".repeat(4097) }])(
    "rejects malformed or excessive output",
    async (data) => {
      await expect(
        polishText("raw", config(), null, undefined, requestFor(data)),
      ).rejects.toBeInstanceOf(MicPolishError);
    },
  );
  it("masks transport and JSON exceptions containing credentials", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error(token));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing unavailable; keeping the recognized text\.$/,
    );
    request.mockResolvedValue(new Response("private invalid JSON"));
    await expect(polishText("raw", config(), null, undefined, request)).rejects.toThrow(
      /^Polishing unavailable; keeping the recognized text\.$/,
    );
  });
});
